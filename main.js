console.log("✅ main.js is running!");

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 10);

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("three-canvas"),
  antialias: false, // ✅ Disable antialiasing for performance
  powerPreference: "high-performance", // ✅ Force high-performance GPU usage
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // ✅ Limit pixel density
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2.2;
controls.minPolarAngle = Math.PI / 3;
// Keep zoom & pan enabled per your existing setup
controls.enableZoom = true;
controls.enablePan = true;
controls.touchZoomSpeed = 0.5;
controls.touchRotateSpeed = 1.0;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.2); // Lower ambient for better glow effect
scene.add(ambientLight);

// Spotlight for contrast
const spotlight = new THREE.SpotLight(0xffffff, 1.2);
spotlight.position.set(0, 5, 5);
spotlight.angle = Math.PI / 6;
spotlight.penumbra = 0.5;
scene.add(spotlight);

// 🎵 Audio setup
const listener = new THREE.AudioListener();
camera.add(listener);

const audioLoader = new THREE.AudioLoader();

// ✅ Ambient Sound (Plays in loop)
const ambienceSound = new THREE.Audio(listener);
audioLoader.load('public/sounds/ambience.wav', (buffer) => {
  ambienceSound.setBuffer(buffer);
  ambienceSound.setLoop(true);
  ambienceSound.setVolume(0.3);
  // Will start on first interaction automatically in most browsers, but we call play() where allowed
  ambienceSound.play();
});

// ✅ Click Sound (Plays on interaction)
const clickSound = new THREE.Audio(listener);
audioLoader.load('public/sounds/beep.mp3', (buffer) => {
  clickSound.setBuffer(buffer);
  clickSound.setLoop(false);
  clickSound.setVolume(0.5);
});

// ✅ Woosh Sound (Plays when a pop-up opens)
const wooshSound = new THREE.Audio(listener);
audioLoader.load('public/sounds/woosh.wav', (buffer) => {
  wooshSound.setBuffer(buffer);
  wooshSound.setLoop(false);
  wooshSound.setVolume(0.7);
});

// Interactive reflective water surface with ripples
const waterGeometry = new THREE.PlaneGeometry(100, 100);
const waterReflector = new Reflector(waterGeometry, {
  clipBias: 0.003,
  textureWidth: window.innerWidth * window.devicePixelRatio,
  textureHeight: window.innerHeight * window.devicePixelRatio,
  color: 0x5555ff,
  recursion: 1
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

const clock = new THREE.Clock();

// Variables for clickable objects
const loader = new GLTFLoader();
let clickableScreens = {};
let resumeScreen = null;
const walls = []; // Walls will be stored here

const screenVideos = {
  "screen_3dcompositing": "public/videos/Showreel_Personal.mp4",
  "screen_2dcompositing": "public/videos/Showreel_Professional.mp4",
  "screen_photogrammetry": "public/videos/Photogrammetry.mp4"
};

const screenImages = {
  // renamed per your update: this mesh opens the gallery
  "photography_portfolio": "__OPEN_GALLERY__"
};

const resumeURL = "Shivani_Resume_2025.pdf";

// ✅ Your Custom Bounding Box Names from Blender
const boundingBoxNames = ["bounding_box_l", "bounding_box_b", "bounding_box_t"];

// ✅ Load the 3D Model
loader.load('public/models/cyberpunk_station.glb', function (gltf) {
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

      // ✅ Assign Layers
      if (screenVideos[child.name]) {
        clickableScreens[child.name] = child;
        child.layers.set(0); // Interactive elements in Layer 0
      } else if (screenImages[child.name]) { // images/special actions
        clickableScreens[child.name] = child;
        child.layers.set(0);
      } else if (child.name === "resume_screen") {
        resumeScreen = child;
        child.layers.set(0);
      } else if (boundingBoxNames.includes(child.name)) {
        child.layers.set(1); // Bounding Boxes assigned to Layer 1 (walls)
        walls.push(child);
      }
    }
  });
}, undefined, function (error) {
  console.error('Error loading model:', error);
});

// ✅ Raycaster setup
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Unified interaction handler (mouse + touch)
function onUserInteraction(event) {
  event.preventDefault();

  let point = event.touches ? event.touches[0] : event;
  mouse.x = (point.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(point.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Step 1: Intersect clickable objects
  raycaster.layers.set(0); // clickable layer
  const clickableIntersects = raycaster.intersectObjects(
    [...Object.values(clickableScreens), resumeScreen].filter(Boolean)
  );

  if (clickableIntersects.length === 0) return;

  const hit = clickableIntersects[0];
  const clickedObject = hit.object;

  // Play beep sound on click
  if (!clickSound.isPlaying) clickSound.play();

  // Step 2: Check walls in front
  raycaster.layers.set(1); // walls layer
  const wallIntersects = raycaster.intersectObjects(walls, true);

  if (wallIntersects.length > 0 && wallIntersects[0].distance < hit.distance) {
    console.log("❌ Click Blocked by Wall:", wallIntersects[0].object.name);
    return;
  }

  console.log("✅ Clicked:", clickedObject.name);

  // Route to action based on name maps
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

// ✅ Add event listeners for BOTH clicks and touches
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
    if (progress < 1) {
      requestAnimationFrame(animateCamera);
    } else if (callback) {
      setTimeout(callback, 500);
    }
  }
  requestAnimationFrame(animateCamera);
}

function openVideoPopup(videoPath) {
  if (!wooshSound.isPlaying) wooshSound.play(); // Play woosh sound
  document.getElementById("video-source").src = videoPath;
  document.getElementById("video-player").load();
  document.getElementById("video-popup").style.display = "block";

  // Pause ambient music when video is playing
  if (ambienceSound.isPlaying) ambienceSound.pause();
}

function openResumePopup() {
  if (!wooshSound.isPlaying) wooshSound.play(); // Play woosh sound
  document.getElementById("resume-popup").style.display = "block";
}

function openImageOverlay(imagePath) {
  if (!wooshSound.isPlaying) wooshSound.play(); // Play woosh sound

  const overlay = document.getElementById("image-overlay");
  const imageElement = document.getElementById("overlay-image");

  if (!overlay || !imageElement) {
    console.error("❌ ERROR: Overlay elements not found in DOM");
    return;
  }

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

// ✅ Function to close popups
function closePopup(event) {
  event.preventDefault(); // ✅ Prevents unwanted extra touch events on mobile
  if (event.target.id === "close-popup") {
    document.getElementById("video-popup").style.display = "none";
    if (!ambienceSound.isPlaying) ambienceSound.play();
  } else if (event.target.id === "close-resume-popup") {
    document.getElementById("resume-popup").style.display = "none";
  } else if (event.target.id === "close-overlay") {
    document.getElementById("image-overlay").style.display = "none";
  }
}

// ✅ Function to safely add event listeners
function addCloseEventListener(buttonId) {
  const button = document.getElementById(buttonId);
  if (button) {
    button.addEventListener("click", closePopup);
    button.addEventListener("touchstart", closePopup, { passive: false });
  } else {
    console.error(`❌ Close button not found: ${buttonId}`);
  }
}

// ✅ Attach event listeners for closing popups
addCloseEventListener("close-popup");
addCloseEventListener("close-resume-popup");
addCloseEventListener("close-overlay");

/* ===== Postprocessing ===== */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.3, 0.85);
bloomPass.threshold = 0.3;
bloomPass.strength = 1.2;
bloomPass.radius = 0.8;
composer.addPass(bloomPass);

animate();

/* ================================
   📸 PHOTOGRAPHY GALLERY MODULE
   - Grid fills viewport and scrolls
   - Lightbox overlays grid (back + prev/next)
   ================================ */
/* ================================
   📸 PHOTOGRAPHY GALLERY MODULE
   - Grid fills viewport and scrolls
   - Lightbox overlays grid (back + prev/next)
   - Back arrow closes ONLY the overlay
   - Fully null-safe bindings so scene never breaks
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
let galleryImages = []; // resolved URLs

// Try to resolve a URL by testing extensions in order
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

// Build URLs 1..N with extension fallback
async function buildGalleryList() {
  const tasks = Array.from({ length: GALLERY_COUNT }, (_, k) => resolveUrl(String(k + 1)));
  const results = await Promise.allSettled(tasks);
  galleryImages = results
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter(Boolean);
}

// Build grid thumbnails once we have URLs
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

// Open/close UI
function openGallery() {
  if (typeof controls !== 'undefined' && controls) controls.enabled = false; // pause 3D interactions
  if (!galleryOverlay || !gridView) return;
  galleryOverlay.classList.add('pg-open');
  gridView.classList.add('pg-show');     // grid visible
  if (lightbox) lightbox.classList.remove('pg-show');  // lightbox hidden until chosen
  galleryOverlay.setAttribute('aria-hidden', 'false');
}

function closeGallery() {
  if (!galleryOverlay) return;
  galleryOverlay.classList.remove('pg-open');
  galleryOverlay.classList.remove('pg-image-open'); // reset overlay state
  if (gridView) gridView.classList.remove('pg-show');
  if (lightbox) lightbox.classList.remove('pg-show');
  galleryOverlay.setAttribute('aria-hidden', 'true');
  if (typeof controls !== 'undefined' && controls) controls.enabled = true;
}

// Lightbox helpers (overlay on top of grid)
function openLightbox(i) {
  currentIndex = i;
  setLightboxImage();
  if (galleryOverlay) galleryOverlay.classList.add('pg-image-open'); // mark overlay state (hides ×)
  if (lightbox) {
    lightbox.classList.add('pg-show');
    lightbox.setAttribute('aria-hidden','false');
  }
}

// ✅ Close ONLY the overlay, keep the grid open
function backToGrid() {
  if (lightbox) {
    lightbox.classList.remove('pg-show');
    lightbox.setAttribute('aria-hidden','true');
  }
  if (galleryOverlay) {
    galleryOverlay.classList.remove('pg-image-open'); // re-show × on grid
  }
}

function setLightboxImage() {
  if (!lightboxImg) return;
  lightboxImg.src = galleryImages[currentIndex];
  lightboxImg.alt = `Photo ${currentIndex + 1}`;
}
function prev() { currentIndex = (currentIndex - 1 + galleryImages.length) % galleryImages.length; setLightboxImage(); }
function next() { currentIndex = (currentIndex + 1) % galleryImages.length; setLightboxImage(); }

// Events (all null-safe)
if (closeGridBtn) closeGridBtn.addEventListener('click', closeGallery);
if (prevBtn) prevBtn.addEventListener('click', prev);
if (nextBtn) nextBtn.addEventListener('click', next);

// Direct binding (if present now)
if (backBtn) backBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); backToGrid(); });

// Global delegated fallback (works even if button appears later or click lands on a child)
document.addEventListener('click', (e) => {
  const t = e.target;
  // Ensure we have an Element (not Text node)
  if (!t || t.nodeType !== 1) return;
  const backEl = t.closest && t.closest('#pg-backToGrid');
  if (backEl) {
    e.preventDefault();
    e.stopPropagation();
    backToGrid();
  }
});

// Optional: click on scrim closes overlay too (only if you added .pg-lightbox-scrim in HTML)
if (galleryOverlay) {
  galleryOverlay.addEventListener('click', (e) => {
    const el = e.target;
    if (el && el.classList && el.classList.contains('pg-lightbox-scrim')) {
      e.preventDefault();
      e.stopPropagation();
      backToGrid();
    }
  });
}


// Delegated fallback on the overlay root
if (galleryOverlay) {
  galleryOverlay.addEventListener('click', (e) => {
    const target = e.target && e.target.nodeType === 1 ? e.target : null;
    if (!target) return;

    // Back arrow click?
    if (target.closest && target.closest('#pg-backToGrid')) {
      backToGrid();
    }

    // Optional: click on scrim closes overlay too (if you have .pg-lightbox-scrim)
    if (target.classList && target.classList.contains('pg-lightbox-scrim')) {
      backToGrid();
    }
  });
} else {
  console.warn('⚠️ #photo-gallery not in DOM; skipping delegated back handler.');
}

// Keyboard
window.addEventListener('keydown', (e) => {
  if (!galleryOverlay || !galleryOverlay.classList.contains('pg-open')) return;
  if (e.key === 'Escape') {
    // If overlay is open, close only overlay; otherwise close whole gallery
    if (lightbox && lightbox.classList.contains('pg-show')) {
      backToGrid();
    } else {
      closeGallery();
    }
  } else if (e.key === 'ArrowLeft' && lightbox && lightbox.classList.contains('pg-show')) {
    prev();
  } else if (e.key === 'ArrowRight' && lightbox && lightbox.classList.contains('pg-show')) {
    next();
  }
});

// Touch swipe on lightbox
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

// Init gallery list then grid
(async function initGallery(){
  try {
    await buildGalleryList();
    buildGrid();
  } catch (err) {
    console.error('Gallery init failed:', err);
  }
})();
/* --- End Photography Gallery --- */