console.log("✅ main.js is running!");

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/* -------------------- asset config -------------------- */
const ASSETS = { MODEL: "public/models/cyberpunk_station.glb" };

/* -------------------- Loading UI -------------------- */
const loadingOverlay   = document.getElementById('loading-overlay');
const loadingBarFill   = document.getElementById('loading-bar-fill');
const loadingPercentEl = document.getElementById('loading-percent');

let lastShownPct = 0;
function setProgress(pct) {
  const p = Math.max(0, Math.min(100, pct|0));
  if (p < lastShownPct) return;
  lastShownPct = p;
  if (loadingBarFill)   loadingBarFill.style.width   = p + '%';
  if (loadingPercentEl) loadingPercentEl.textContent  = p + '%';
}
function hideLoading() {
  if (!loadingOverlay) return;
  setProgress(100);
  loadingOverlay.classList.add('hidden');
  setTimeout(() => { loadingOverlay.style.display = 'none'; }, 400);
}

/* -------------------- Scene -------------------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
window.__scene = scene; // exposed for console debugging

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 10);

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("three-canvas"),
  antialias: false,
  powerPreference: "high-performance",
});

const isMobile = /Mobi|Android/i.test(navigator.userAgent);
renderer.setPixelRatio(isMobile ? 1.25 : 1.5);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

setTimeout(() => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}, 2000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping    = true;
controls.dampingFactor    = 0.05;
controls.maxPolarAngle    = Math.PI / 2.2;
controls.minPolarAngle    = Math.PI / 3;
controls.enableZoom       = true;
controls.enablePan        = true;
controls.touchZoomSpeed   = 0.5;
controls.touchRotateSpeed = 1.0;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambientLight);
const spotlight = new THREE.SpotLight(0xffffff, 1.2);
spotlight.position.set(0, 5, 5);
spotlight.angle   = Math.PI / 6;
spotlight.penumbra = 0.5;
scene.add(spotlight);

/* -------------------- Audio -------------------- */
const listener     = new THREE.AudioListener();
camera.add(listener);
const audioLoader   = new THREE.AudioLoader();
const ambienceSound = new THREE.Audio(listener);
const clickSound    = new THREE.Audio(listener);
const wooshSound    = new THREE.Audio(listener);

function loadSoundOnce(path, target, { loop = false, volume = 0.5 } = {}) {
  return new Promise((resolve, reject) => {
    if (target.isAudio && target.buffer) return resolve();
    audioLoader.load(path, (buffer) => {
      target.setBuffer(buffer);
      target.setLoop(loop);
      target.setVolume(volume);
      resolve();
    }, undefined, reject);
  });
}

function setupAmbienceOnFirstGesture() {
  const start = async () => {
    try {
      await loadSoundOnce('public/sounds/ambience.wav', ambienceSound, { loop: true, volume: 0.3 });
      if (!ambienceSound.isPlaying) ambienceSound.play();
    } catch {}
    window.removeEventListener('pointerdown', start, { capture: true });
  };
  window.addEventListener('pointerdown', start, { capture: true, passive: true });
}
setupAmbienceOnFirstGesture();

/* -------------------- Water reflector -------------------- */
const waterGeometry = new THREE.PlaneGeometry(100, 100);
const texW = Math.floor(window.innerWidth  * window.devicePixelRatio * 0.5);
const texH = Math.floor(window.innerHeight * window.devicePixelRatio * 0.5);

const waterReflector = new Reflector(waterGeometry, {
  clipBias: 0.003, textureWidth: texW, textureHeight: texH,
  color: 0x5555ff, recursion: 0
});
waterReflector.rotation.x = -Math.PI / 2;
waterReflector.position.y = -0.5;

waterReflector.material.onBeforeCompile = (shader) => {
  shader.uniforms.clickPosition = { value: new THREE.Vector2(-1, -1) };
  shader.uniforms.rippleTime    = { value: 0 };
  shader.fragmentShader = shader.fragmentShader.replace(
    `gl_FragColor = vec4( base, 1.0 );`,
    `float dist   = length(vUv - clickPosition);
     float ripple = 0.0;
     if (rippleTime > 0.0) {
       ripple = sin(dist * 30.0 - rippleTime * 5.0) * exp(-dist * 20.0) * 0.03;
     }
     vec2 rippleUV    = vUv + ripple;
     vec4 rippleColor = texture2D(tDiffuse, rippleUV);
     gl_FragColor     = mix(vec4(base.rgb, 1.0), rippleColor, 0.85);`
  );
  waterReflector.userData.shader = shader;
};
scene.add(waterReflector);

/* -------------------- GLTF Loader -------------------- */
const manager = new THREE.LoadingManager();
manager.onStart    = () => setProgress(5);
manager.onProgress = (url, loaded, total) => setProgress(Math.max(Math.round((loaded / Math.max(total, 1)) * 90), lastShownPct));
manager.onError    = (url) => console.warn('Failed to load:', url);

const loader = new GLTFLoader(manager);
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
dracoLoader.preload();
loader.setDRACOLoader(dracoLoader);
loader.setMeshoptDecoder(MeshoptDecoder);

/* -------------------- Scene state -------------------- */
let clickableScreens = {};
let resumeScreen     = null;
let contactHitBox    = null;   // ← declared here so raycaster can always see it
const walls          = [];

const screenVideos = {
  "screen_3dcompositing": "public/videos/Showreel_Personal.mp4",
  "screen_2dcompositing": "public/videos/Showreel_Professional.mp4",
  "screen_photogrammetry": "public/videos/Photogrammetry.mp4"
};
const screenImages      = { "photography_portfolio": "__OPEN_GALLERY__" };
const boundingBoxNames  = ["bounding_box_l", "bounding_box_b", "bounding_box_t"];

/* -------------------- Load model -------------------- */
requestAnimationFrame(() => {
  loader.load(
    ASSETS.MODEL,
    (gltf) => {
      setProgress(95);
      const model = gltf.scene;
      scene.add(model);

      let contactTextMesh = null;

      model.traverse((child) => {
        // Grab the contact text on ANY object type (Group or Mesh)
        if (child.name === "Contact" || child.name === "Text") {
          contactTextMesh = child;
          console.log("✅ Found contact object:", child.name, child.type);
        }

        if (child.isMesh) {
          if (!(child.material instanceof THREE.MeshStandardMaterial)) {
            child.material = new THREE.MeshStandardMaterial({ color: child.material.color });
          }
          child.material.metalness        = 0.8;
          child.material.roughness        = 0.2;
          child.material.envMapIntensity  = 1.2;
          child.material.needsUpdate      = true;

          if (child.material.map)         child.material.map.encoding         = THREE.sRGBEncoding;
          if (child.material.emissiveMap) child.material.emissiveMap.encoding = THREE.sRGBEncoding;

          if (screenVideos[child.name]) {
            clickableScreens[child.name] = child; child.layers.set(0);
          } else if (screenImages[child.name]) {
            clickableScreens[child.name] = child; child.layers.set(0);
          } else if (child.name === "resume_screen") {
            resumeScreen = child; child.layers.set(0);
          } else if (boundingBoxNames.includes(child.name)) {
            child.layers.set(1); walls.push(child);
          }
        }
      });

      // Build invisible hit box over the contact text now world matrices are ready
      if (contactTextMesh) {
        contactTextMesh.updateWorldMatrix(true, true);

        const bbox   = new THREE.Box3().setFromObject(contactTextMesh);
        const size   = new THREE.Vector3();
        const center = new THREE.Vector3();
        bbox.getSize(size);
        bbox.getCenter(center);

        const hitGeo = new THREE.BoxGeometry(
          Math.max(size.x * 1.4, 0.5),
          Math.max(size.y * 2.0, 0.3),
          Math.max(size.z, 0.3)
        );
        const hitMat  = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
        contactHitBox = new THREE.Mesh(hitGeo, hitMat);
        contactHitBox.position.copy(center);
        contactHitBox.layers.set(0);
        scene.add(contactHitBox);
        console.log("✅ contactHitBox created at", contactHitBox.position, "| size:", size);
      } else {
        console.warn("⚠️ Contact/Text mesh not found — check the object name in Blender");
      }

      hideLoading();
    },
    (xhr) => {
      if (xhr && xhr.lengthComputable) {
        setProgress(Math.max(Math.min(95, Math.round((xhr.loaded / xhr.total) * 90)), lastShownPct));
      } else {
        setProgress(Math.min(90, lastShownPct + 1));
      }
    },
    (error) => {
      console.error('Error loading model:', error);
      if (loadingPercentEl) loadingPercentEl.textContent = 'Load failed';
    }
  );
});

/* -------------------- Raycaster & interactions -------------------- */
const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();

async function onUserInteraction(event) {
  event.preventDefault();
  try {
    await loadSoundOnce('public/sounds/beep.mp3', clickSound, { volume: 0.5 });
    if (!clickSound.isPlaying) clickSound.play();
  } catch {}

  const point = event.touches ? event.touches[0] : event;
  mouse.x = ( point.clientX / window.innerWidth)  *  2 - 1;
  mouse.y = -(point.clientY / window.innerHeight) *  2 + 1;

  raycaster.setFromCamera(mouse, camera);

  raycaster.layers.set(0);
  const targets = [...Object.values(clickableScreens), resumeScreen, contactHitBox].filter(Boolean);
  const clickableIntersects = raycaster.intersectObjects(targets);
  if (clickableIntersects.length === 0) return;

  const hit          = clickableIntersects[0];
  const clickedObject = hit.object;

  raycaster.layers.set(1);
  const wallIntersects = raycaster.intersectObjects(walls, true);
  if (wallIntersects.length > 0 && wallIntersects[0].distance < hit.distance) {
    console.log("❌ Click blocked by wall:", wallIntersects[0].object.name);
    return;
  }

  console.log("✅ Clicked:", clickedObject.name || "(contactHitBox)");

  if (screenVideos[clickedObject.name]) {
    panToScreen(clickedObject, () => openVideoPopup(screenVideos[clickedObject.name]));
  } else if (clickedObject === resumeScreen) {
    panToScreen(resumeScreen, openResumePopup);
  } else if (clickedObject === contactHitBox) {
    openContactPopup();
  } else if (screenImages[clickedObject.name]) {
    if (screenImages[clickedObject.name] === "__OPEN_GALLERY__") {
      panToScreen(clickedObject, openGallery);
    } else {
      panToScreen(clickedObject, () => openImageOverlay(screenImages[clickedObject.name]));
    }
  }
}

window.addEventListener("click",      onUserInteraction);
window.addEventListener("touchstart", onUserInteraction, { passive: false });

/* -------------------- Camera pan -------------------- */
function panToScreen(target, callback) {
  const duration    = 1000;
  const startPos    = camera.position.clone();
  const targetPos   = new THREE.Vector3(0, 0, 10);
  const targetLookAt = new THREE.Vector3(0, 0, 0);
  let startTime     = null;

  function animateCamera(time) {
    if (!startTime) startTime = time;
    const progress = Math.min((time - startTime) / duration, 1);
    camera.position.lerpVectors(startPos, targetPos, progress);
    controls.target.lerpVectors(controls.target, targetLookAt, progress);
    controls.update();
    if (progress < 1) requestAnimationFrame(animateCamera);
    else if (callback) setTimeout(callback, 500);
  }
  requestAnimationFrame(animateCamera);
}

/* -------------------- Popups -------------------- */
async function openVideoPopup(videoPath) {
  try {
    await loadSoundOnce('public/sounds/woosh.wav', wooshSound, { volume: 0.7 });
    if (!wooshSound.isPlaying) wooshSound.play();
  } catch {}
  document.getElementById("video-source").src = videoPath;
  document.getElementById("video-player").load();
  document.getElementById("video-popup").style.display = "block";
  if (ambienceSound.isPlaying) ambienceSound.pause();
}

function openContactPopup() {
  (async () => {
    try {
      await loadSoundOnce('public/sounds/woosh.wav', wooshSound, { volume: 0.7 });
      if (!wooshSound.isPlaying) wooshSound.play();
    } catch {}
  })();
  const popup = document.getElementById("contact-popup");
  if (popup) popup.style.display = "block";
  controls.enabled = false;
}

function closeContactPopup() {
  const popup = document.getElementById("contact-popup");
  if (popup) popup.style.display = "none";
  controls.enabled = true;
}

function openResumePopup() {
  (async () => {
    try {
      await loadSoundOnce('public/sounds/woosh.wav', wooshSound, { volume: 0.7 });
      if (!wooshSound.isPlaying) wooshSound.play();
    } catch {}
  })();
  document.getElementById("resume-popup").style.display = "block";
}

function openImageOverlay(imagePath) {
  (async () => {
    try {
      await loadSoundOnce('public/sounds/woosh.wav', wooshSound, { volume: 0.7 });
      if (!wooshSound.isPlaying) wooshSound.play();
    } catch {}
  })();
  const overlay      = document.getElementById("image-overlay");
  const imageElement = document.getElementById("overlay-image");
  if (!overlay || !imageElement) { console.error("❌ Overlay elements not found"); return; }
  imageElement.src              = imagePath;
  overlay.style.display         = "flex";
  overlay.style.position        = "fixed";
  overlay.style.top             = "0";
  overlay.style.left            = "0";
  overlay.style.width           = "100vw";
  overlay.style.height          = "100vh";
  overlay.style.background      = "rgba(0,0,0,0.8)";
  overlay.style.justifyContent  = "center";
  overlay.style.alignItems      = "center";
  overlay.style.flexDirection   = "column";
  overlay.style.zIndex          = "9999";
}

function closePopup(event) {
  event.preventDefault();
  const id = event.target.id;
  if (id === "close-popup") {
    document.getElementById("video-popup").style.display = "none";
    if (!ambienceSound.isPlaying) ambienceSound.play();
  } else if (id === "close-resume-popup") {
    document.getElementById("resume-popup").style.display = "none";
  } else if (id === "close-overlay") {
    document.getElementById("image-overlay").style.display = "none";
  } else if (id === "close-contact-popup") {
    closeContactPopup();
  }
}

function addCloseEventListener(buttonId) {
  const button = document.getElementById(buttonId);
  if (button) {
    button.addEventListener("click",      closePopup);
    button.addEventListener("touchstart", closePopup, { passive: false });
  } else {
    console.error(`❌ Close button not found: ${buttonId}`);
  }
}
addCloseEventListener("close-popup");
addCloseEventListener("close-resume-popup");
addCloseEventListener("close-overlay");
addCloseEventListener("close-contact-popup");

/* -------------------- Postprocessing -------------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

let bloomPass = null;
requestAnimationFrame(() => {
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.3, 0.85);
  bloomPass.threshold = 0.3;
  bloomPass.strength  = 1.0;
  bloomPass.radius    = 0.6;
  composer.addPass(bloomPass);
});

function animate() {
  requestAnimationFrame(animate);
  if (waterReflector.userData.shader) {
    const rt = waterReflector.userData.shader.uniforms.rippleTime;
    if (rt.value > 0) {
      rt.value += 0.05;
      if (rt.value > 3) rt.value = 0;
    }
  }
  controls.update();
  composer.render();
}
animate();

/* ================================
   📸 PHOTOGRAPHY GALLERY
   ================================ */
const GALLERY_COUNT = 36;
const FULL_DIR  = 'public/photography/full/';
const THUMB_DIR = 'public/photography/thumbs/';
const FULL_EXT  = '.jpg';
const THUMB_EXT = '.jpg';

const galleryOverlay = document.getElementById("photo-gallery");
const gridView       = galleryOverlay?.querySelector(".pg-gridView") || null;
const grid           = document.getElementById("pg-grid")           || null;
const closeGridBtn   = document.getElementById("pg-closeGrid")      || null;
const lightbox       = document.getElementById("pg-lightbox")       || null;
const lightboxImg    = document.getElementById("pg-lightboxImg")    || null;
const backBtn        = document.getElementById("pg-backToGrid")     || null;
const prevBtn        = document.getElementById("pg-prev")           || null;
const nextBtn        = document.getElementById("pg-next")           || null;

let currentIndex = 0;
let galleryReady = false;

const getThumb = (i) => `${THUMB_DIR}${i}${THUMB_EXT}`;
const getFull  = (i) => `${FULL_DIR}${i}${FULL_EXT}`;

function buildGrid() {
  if (!grid) return;
  const frag = document.createDocumentFragment();
  for (let i = 1; i <= GALLERY_COUNT; i++) {
    const img = document.createElement('img');
    img.alt           = `Photo ${i}`;
    img.loading       = 'lazy';
    img.decoding      = 'async';
    img.fetchPriority = 'low';
    img.setAttribute('data-lazy', '');
    img.dataset.index = i;
    img.dataset.full  = getFull(i);
    img.src           = getThumb(i);
    img.addEventListener('load',  () => { img.setAttribute('data-loaded', '1'); img.removeAttribute('data-lazy'); });
    img.addEventListener('error', () => { img.src = img.dataset.full; });
    img.addEventListener('click', () => openLightbox(i));
    frag.appendChild(img);
  }
  grid.replaceChildren(frag);
  hydrateLazyImages();
}

function hydrateLazyImages() {
  if (!('IntersectionObserver' in window) || !gridView) {
    grid.querySelectorAll('img[data-lazy]').forEach(img => img.removeAttribute('data-lazy'));
    return;
  }
  const io = new IntersectionObserver((entries, obs) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.removeAttribute('data-lazy');
      obs.unobserve(entry.target);
    }
  }, { root: gridView, rootMargin: '200px 0px', threshold: 0.01 });
  grid.querySelectorAll('img[data-lazy]').forEach(img => io.observe(img));
}

function ensureGallery() { if (!galleryReady) { buildGrid(); galleryReady = true; } }

function openGallery() {
  if (controls) controls.enabled = false;
  if (!galleryOverlay || !gridView) return;
  ensureGallery();
  galleryOverlay.classList.add('pg-open');
  gridView.classList.add('pg-show');
  if (lightbox) lightbox.classList.remove('pg-show');
  galleryOverlay.setAttribute('aria-hidden', 'false');
}

function closeGallery() {
  if (!galleryOverlay) return;
  galleryOverlay.classList.remove('pg-open', 'pg-image-open');
  gridView  && gridView.classList.remove('pg-show');
  lightbox  && lightbox.classList.remove('pg-show');
  galleryOverlay.setAttribute('aria-hidden', 'true');
  if (controls) controls.enabled = true;
}

function openLightbox(i) {
  currentIndex = i;
  setLightboxImage(true);
  galleryOverlay && galleryOverlay.classList.add('pg-image-open');
  if (lightbox) { lightbox.classList.add('pg-show'); lightbox.setAttribute('aria-hidden', 'false'); }
  prefetchNeighbors();
}

function backToGrid() {
  if (lightbox) { lightbox.classList.remove('pg-show'); lightbox.setAttribute('aria-hidden', 'true'); }
  galleryOverlay && galleryOverlay.classList.remove('pg-image-open');
}

function setLightboxImage(priority = false) {
  if (!lightboxImg) return;
  const idx     = currentIndex;
  lightboxImg.src = getThumb(idx);
  lightboxImg.alt = `Photo ${idx}`;
  if (priority) lightboxImg.fetchPriority = 'high';
  const hi    = new Image();
  hi.decoding = 'async';
  hi.loading  = 'eager';
  hi.src      = getFull(idx);
  hi.onload   = () => { if (currentIndex === idx) lightboxImg.src = getFull(idx); };
}

function prefetchNeighbors() {
  const prevIdx = (currentIndex - 1 + GALLERY_COUNT) % GALLERY_COUNT || GALLERY_COUNT;
  const nextIdx = (currentIndex % GALLERY_COUNT) + 1;
  [prevIdx, nextIdx].forEach(idx => {
    const link  = document.createElement('link');
    link.rel    = 'preload';
    link.as     = 'image';
    link.href   = getFull(idx);
    document.head.appendChild(link);
    setTimeout(() => link.remove(), 5000);
  });
}

function prev() { currentIndex = (currentIndex - 2 + GALLERY_COUNT) % GALLERY_COUNT + 1; setLightboxImage(); prefetchNeighbors(); }
function next() { currentIndex = (currentIndex % GALLERY_COUNT) + 1;                      setLightboxImage(); prefetchNeighbors(); }

closeGridBtn && closeGridBtn.addEventListener('click', closeGallery);
prevBtn      && prevBtn.addEventListener('click', prev);
nextBtn      && nextBtn.addEventListener('click', next);
backBtn      && backBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); backToGrid(); });

document.addEventListener('click', (e) => {
  if (e.target?.closest?.('#pg-backToGrid')) { e.preventDefault(); e.stopPropagation(); backToGrid(); }
});

if (galleryOverlay) {
  galleryOverlay.addEventListener('click', (e) => {
    if (e.target?.classList?.contains('pg-lightbox-scrim')) { e.preventDefault(); e.stopPropagation(); backToGrid(); }
  });
}

window.addEventListener('keydown', (e) => {
  if (!galleryOverlay?.classList.contains('pg-open')) return;
  if (e.key === 'Escape')      { lightbox?.classList.contains('pg-show') ? backToGrid() : closeGallery(); }
  else if (e.key === 'ArrowLeft'  && lightbox?.classList.contains('pg-show')) prev();
  else if (e.key === 'ArrowRight' && lightbox?.classList.contains('pg-show')) next();
});

let sx = 0, sy = 0;
if (lightbox) {
  lightbox.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  lightbox.addEventListener('touchend',   (e) => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) dx > 0 ? prev() : next();
  }, { passive: true });
}
