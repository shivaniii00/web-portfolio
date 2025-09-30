console.log("✅ main.js is running!");

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/* -------------------- quick asset config -------------------- */
const ASSETS = {
  MODEL: "public/models/cyberpunk_station.glb", // <-- ensure this file exists at this path
  // If you actually have bus-station.glb, put that path here instead.
  // MODEL: "public/models/bus-station.glb",
};

/* -------------------- Three.js scene -------------------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 10);

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("three-canvas"),
  antialias: false,
  powerPreference: "high-performance",
});

const isMobile = /Mobi|Android/i.test(navigator.userAgent);
const startDPR = isMobile ? 1.25 : 1.5;
renderer.setPixelRatio(startDPR);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

setTimeout(() => {
  const bump = isMobile ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, bump));
  renderer.setSize(window.innerWidth, window.innerHeight);
}, 2000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2.2;
controls.minPolarAngle = Math.PI / 3;
controls.enableZoom = true;
controls.enablePan = true;
controls.touchZoomSpeed = 0.5;
controls.touchRotateSpeed = 1.0;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambientLight);

const spotlight = new THREE.SpotLight(0xffffff, 1.2);
spotlight.position.set(0, 5, 5);
spotlight.angle = Math.PI / 6;
spotlight.penumbra = 0.5;
scene.add(spotlight);

/* -------------------- Audio (lazy) -------------------- */
const listener = new THREE.AudioListener();
camera.add(listener);
const audioLoader = new THREE.AudioLoader();

const ambienceSound = new THREE.Audio(listener);
const clickSound = new THREE.Audio(listener);
const wooshSound = new THREE.Audio(listener);

function loadSoundOnce(path, target, { loop=false, volume=0.5 } = {}) {
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
      await loadSoundOnce('public/sounds/ambience.wav', ambienceSound, { loop:true, volume:0.3 });
      if (!ambienceSound.isPlaying) ambienceSound.play();
    } catch {}
    window.removeEventListener('pointerdown', start, { capture: true });
  };
  window.addEventListener('pointerdown', start, { capture: true, passive: true });
}
setupAmbienceOnFirstGesture();

/* -------------------- Reflective water (reduced cost) -------------------- */
const waterGeometry = new THREE.PlaneGeometry(100, 100);
const scale = 0.5;
const texW = Math.floor(window.innerWidth * window.devicePixelRatio * scale);
const texH = Math.floor(window.innerHeight * window.devicePixelRatio * scale);

const waterReflector = new Reflector(waterGeometry, {
  clipBias: 0.003,
  textureWidth: texW,
  textureHeight: texH,
  color: 0x5555ff,
  recursion: 0
});
waterReflector.rotation.x = -Math.PI / 2;
waterReflector.position.y = -0.5;

waterReflector.material.onBeforeCompile = (shader) => {
  shader.uniforms.clickPosition = { value: new THREE.Vector2(-1, -1) };
  shader.uniforms.rippleTime = { value: 0 };
  shader.fragmentShader = shader.fragmentShader.replace(
    `gl_FragColor = vec4( base, 1.0 );`,
    `
    float dist = length(vUv - clickPosition);
    float ripple = 0.0;
    if (rippleTime > 0.0) {
      ripple = sin(dist * 30.0 - rippleTime * 5.0) * exp(-dist * 20.0) * 0.03;
    }
    vec2 rippleUV = vUv + ripple;
    vec4 rippleColor = texture2D(tDiffuse, rippleUV);
    gl_FragColor = mix(vec4(base.rgb, 1.0), rippleColor, 0.85);
    `
  );
  waterReflector.userData.shader = shader;
};

scene.add(waterReflector);

/* -------------------- Model & interactions -------------------- */
const loader = new GLTFLoader();
let clickableScreens = {};
let resumeScreen = null;
const walls = [];

const screenVideos = {
  "screen_3dcompositing": "public/videos/Showreel_Personal.mp4",
  "screen_2dcompositing": "public/videos/Showreel_Professional.mp4",
  "screen_photogrammetry": "public/videos/Photogrammetry.mp4"
};

const screenImages = {
  "photography_portfolio": "__OPEN_GALLERY__"
};

const resumeURL = "Shivani_Resume_2025.pdf";
const boundingBoxNames = ["bounding_box_l", "bounding_box_b", "bounding_box_t"];

// Delay heavy GLTF by one frame
requestAnimationFrame(() => {
  loader.load(ASSETS.MODEL, (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    model.traverse((child) => {
      if (child.isMesh) {
        if (!(child.material instanceof THREE.MeshStandardMaterial)) {
          child.material = new THREE.MeshStandardMaterial({ color: child.material.color });
        }
        child.material.metalness = 0.8;
        child.material.roughness = 0.2;
        child.material.envMapIntensity = 1.2;
        child.material.needsUpdate = true;

        if (child.material.map) child.material.map.encoding = THREE.sRGBEncoding;
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

    const loading = document.getElementById('loading-overlay');
    if (loading) loading.style.display = 'none';
  }, undefined, (error) => {
    console.error('Error loading model:', error);
    const loading = document.getElementById('loading-overlay');
    if (loading) loading.textContent = 'Failed to load. Please refresh.';
  });
});

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

async function onUserInteraction(event) {
  event.preventDefault();
  try { await loadSoundOnce('public/sounds/beep.mp3', clickSound, { volume: 0.5 }); if (!clickSound.isPlaying) clickSound.play(); } catch {}

  let point = event.touches ? event.touches[0] : event;
  mouse.x = (point.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(point.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  raycaster.layers.set(0);
  const clickableIntersects = raycaster.intersectObjects(
    [...Object.values(clickableScreens), resumeScreen].filter(Boolean)
  );
  if (clickableIntersects.length === 0) return;

  const hit = clickableIntersects[0];
  const clickedObject = hit.object;

  raycaster.layers.set(1);
  const wallIntersects = raycaster.intersectObjects(walls, true);
  if (wallIntersects.length > 0 && wallIntersects[0].distance < hit.distance) {
    console.log("❌ Click Blocked by Wall:", wallIntersects[0].object.name);
    return;
  }

  console.log("✅ Clicked:", clickedObject.name);

  if (screenVideos[clickedObject.name]) {
    panToScreen(clickedObject, () => openVideoPopup(screenVideos[clickedObject.name]));
  } else if (clickedObject === resumeScreen) {
    panToScreen(resumeScreen, openResumePopup);
  } else if (screenImages[clickedObject.name]) {
    if (screenImages[clickedObject.name] === "__OPEN_GALLERY__") {
      panToScreen(clickedObject, openGallery);
    } else {
      panToScreen(clickedObject, () => openImageOverlay(screenImages[clickedObject.name]));
    }
  }
}

window.addEventListener("click", onUserInteraction);
window.addEventListener("touchstart", onUserInteraction, { passive: false });

function animate() {
  requestAnimationFrame(animate);

  if (waterReflector.userData.shader) {
    if (waterReflector.userData.shader.uniforms.rippleTime.value > 0) {
      waterReflector.userData.shader.uniforms.rippleTime.value += 0.05;
      if (waterReflector.userData.shader.uniforms.rippleTime.value > 3) {
        waterReflector.userData.shader.uniforms.rippleTime.value = 0;
      }
    }
  }

  controls.update();
  composer.render();
}

/* -------------------- Camera pan -------------------- */
function panToScreen(target, callback) {
  const duration = 1000;
  const startPos = camera.position.clone();
  const targetPos = new THREE.Vector3(0, 0, 10);
  const targetLookAt = new THREE.Vector3(0, 0, 0);
  let startTime = null;
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
  try { await loadSoundOnce('public/sounds/woosh.wav', wooshSound, { volume: 0.7 }); if (!wooshSound.isPlaying) wooshSound.play(); } catch {}
  document.getElementById("video-source").src = videoPath;
  document.getElementById("video-player").load();
  document.getElementById("video-popup").style.display = "block";
  if (ambienceSound.isPlaying) ambienceSound.pause();
}

function openResumePopup() {
  (async ()=>{ try { await loadSoundOnce('public/sounds/woosh.wav', wooshSound, { volume: 0.7 }); if (!wooshSound.isPlaying) wooshSound.play(); } catch {} })();
  document.getElementById("resume-popup").style.display = "block";
}

function openImageOverlay(imagePath) {
  (async ()=>{ try { await loadSoundOnce('public/sounds/woosh.wav', wooshSound, { volume: 0.7 }); if (!wooshSound.isPlaying) wooshSound.play(); } catch {} })();

  const overlay = document.getElementById("image-overlay");
  const imageElement = document.getElementById("overlay-image");
  if (!overlay || !imageElement) { console.error("❌ Overlay elements not found"); return; }

  imageElement.src = imagePath;
  overlay.style.display = "flex";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  overlay.style.background = "rgba(0, 0, 0, 0.8)";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.flexDirection = "column";
  overlay.style.zIndex = "9999";
}

function closePopup(event) {
  event.preventDefault();
  if (event.target.id === "close-popup") {
    document.getElementById("video-popup").style.display = "none";
    if (!ambienceSound.isPlaying) ambienceSound.play();
  } else if (event.target.id === "close-resume-popup") {
    document.getElementById("resume-popup").style.display = "none";
  } else if (event.target.id === "close-overlay") {
    document.getElementById("image-overlay").style.display = "none";
  }
}

function addCloseEventListener(buttonId) {
  const button = document.getElementById(buttonId);
  if (button) {
    button.addEventListener("click", closePopup);
    button.addEventListener("touchstart", closePopup, { passive: false });
  } else {
    console.error(`❌ Close button not found: ${buttonId}`);
  }
}
addCloseEventListener("close-popup");
addCloseEventListener("close-resume-popup");
addCloseEventListener("close-overlay");

/* -------------------- Postprocessing -------------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

let bloomPass = null;
requestAnimationFrame(() => {
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.3, 0.85);
  bloomPass.threshold = 0.3;
  bloomPass.strength = 1.0;
  bloomPass.radius = 0.6;
  composer.addPass(bloomPass);
});

animate();

/* ================================
   📸 PHOTOGRAPHY GALLERY MODULE (lazy)
   ================================ */
const GALLERY_COUNT = 36;
const GALLERY_DIR = 'public/photography/';
const EXT_CANDIDATES = ['.jpg', '.jpeg', '.png', '.webp'];

const galleryOverlay = document.getElementById("photo-gallery");
const gridView = galleryOverlay?.querySelector(".pg-gridView") || null;
const grid = document.getElementById("pg-grid") || null;
const closeGridBtn = document.getElementById("pg-closeGrid") || null;

const lightbox = document.getElementById("pg-lightbox") || null;
const lightboxImg = document.getElementById("pg-lightboxImg") || null;
const backBtn = document.getElementById("pg-backToGrid") || null;
const prevBtn = document.getElementById("pg-prev") || null;
const nextBtn = document.getElementById("pg-next") || null;

let currentIndex = 0;
let galleryImages = [];
let galleryReady = false;

function resolveUrl(base) {
  return new Promise((resolve, reject) => {
    let i = 0;
    function tryNext() {
      if (i >= EXT_CANDIDATES.length) return reject(new Error('No ext found'));
      const url = `${GALLERY_DIR}${base}${EXT_CANDIDATES[i++]}`;
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = tryNext;
      img.src = url;
    }
    tryNext();
  });
}

async function buildGalleryList() {
  const tasks = Array.from({ length: GALLERY_COUNT }, (_, k) => resolveUrl(String(k + 1)));
  const results = await Promise.allSettled(tasks);
  galleryImages = results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
}

function buildGrid() {
  if (!grid) return;
  const frag = document.createDocumentFragment();
  galleryImages.forEach((src, i) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = `Photo ${i + 1}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('click', () => openLightbox(i));
    frag.appendChild(img);
  });
  grid.replaceChildren(frag);
}

async function ensureGallery() {
  if (galleryReady) return;
  await buildGalleryList();
  buildGrid();
  galleryReady = true;
}

async function openGallery() {
  if (typeof controls !== 'undefined' && controls) controls.enabled = false;
  if (!galleryOverlay || !gridView) return;

  await ensureGallery();

  galleryOverlay.classList.add('pg-open');
  gridView.classList.add('pg-show');
  if (lightbox) lightbox.classList.remove('pg-show');
  galleryOverlay.setAttribute('aria-hidden', 'false');
}

function closeGallery() {
  if (!galleryOverlay) return;
  galleryOverlay.classList.remove('pg-open');
  galleryOverlay.classList.remove('pg-image-open');
  if (gridView) gridView.classList.remove('pg-show');
  if (lightbox) lightbox.classList.remove('pg-show');
  galleryOverlay.setAttribute('aria-hidden', 'true');
  if (typeof controls !== 'undefined' && controls) controls.enabled = true;
}

function openLightbox(i) {
  currentIndex = i;
  setLightboxImage();
  if (galleryOverlay) galleryOverlay.classList.add('pg-image-open');
  if (lightbox) {
    lightbox.classList.add('pg-show');
    lightbox.setAttribute('aria-hidden','false');
  }
}

function backToGrid() {
  if (lightbox) {
    lightbox.classList.remove('pg-show');
    lightbox.setAttribute('aria-hidden','true');
  }
  if (galleryOverlay) {
    galleryOverlay.classList.remove('pg-image-open');
  }
}

function setLightboxImage() {
  if (!lightboxImg) return;
  lightboxImg.src = galleryImages[currentIndex];
  lightboxImg.alt = `Photo ${currentIndex + 1}`;
}
function prev() { currentIndex = (currentIndex - 1 + galleryImages.length) % galleryImages.length; setLightboxImage(); }
function next() { currentIndex = (currentIndex + 1) % galleryImages.length; setLightboxImage(); }

if (closeGridBtn) closeGridBtn.addEventListener('click', closeGallery);
if (prevBtn) prevBtn.addEventListener('click', prev);
if (nextBtn) nextBtn.addEventListener('click', next);

if (backBtn) {
  backBtn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); backToGrid(); });
}
document.addEventListener('click', (e) => {
  const t = e.target;
  if (!t || t.nodeType !== 1) return;
  const backEl = t.closest && t.closest('#pg-backToGrid');
  if (backEl) {
    e.preventDefault(); e.stopPropagation();
    backToGrid();
  }
});
if (galleryOverlay) {
  galleryOverlay.addEventListener('click', (e) => {
    const el = e.target;
    if (el && el.classList && el.classList.contains('pg-lightbox-scrim')) {
      e.preventDefault(); e.stopPropagation();
      backToGrid();
    }
  });
}

window.addEventListener('keydown', (e) => {
  if (!galleryOverlay || !galleryOverlay.classList.contains('pg-open')) return;
  if (e.key === 'Escape') {
    if (lightbox && lightbox.classList.contains('pg-show')) backToGrid();
    else closeGallery();
  } else if (e.key === 'ArrowLeft' && lightbox && lightbox.classList.contains('pg-show')) {
    prev();
  } else if (e.key === 'ArrowRight' && lightbox && lightbox.classList.contains('pg-show')) {
    next();
  }
});

let sx = 0, sy = 0;
if (lightbox) {
  lightbox.addEventListener('touchstart', (e)=>{ const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, {passive:true});
  lightbox.addEventListener('touchend', (e)=>{
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) { dx > 0 ? prev() : next(); }
  }, {passive:true});
}
