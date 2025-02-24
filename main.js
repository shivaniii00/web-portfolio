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

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('three-canvas'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2.2;
controls.minPolarAngle = Math.PI / 3;
controls.enableZoom = true;

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
audioLoader.load('./sounds/ambience.wav', (buffer) => {
  ambienceSound.setBuffer(buffer);
  ambienceSound.setLoop(true);
  ambienceSound.setVolume(0.3);
  ambienceSound.play(); // Start playing immediately
});

// ✅ Click Sound (Plays on interaction)
const clickSound = new THREE.Audio(listener);
audioLoader.load('/sounds/beep.mp3', (buffer) => {
  clickSound.setBuffer(buffer);
  clickSound.setLoop(false);
  clickSound.setVolume(0.5);
});

// ✅ Woosh Sound (Plays when a pop-up opens)
const wooshSound = new THREE.Audio(listener);
audioLoader.load('/sounds/woosh.wav', (buffer) => {
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

window.addEventListener('click', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  raycaster.layers.set(0); // Check Layer 0 (clickable objects)
  const clickableIntersects = raycaster.intersectObjects([...Object.values(clickableScreens), resumeScreen].filter(Boolean));

  if (clickableIntersects.length > 0) {
      const clickedObject = clickableIntersects[0].object;

      // Play beep sound on click
      if (!clickSound.isPlaying) clickSound.play();

      raycaster.layers.set(1); // Check walls
      const wallIntersects = raycaster.intersectObjects(walls, true);

      if (wallIntersects.length > 0 && wallIntersects[0].distance < clickableIntersects[0].distance) {
          console.log("❌ Click Blocked by Wall:", wallIntersects[0].object.name);
          return;
      }

      console.log("✅ Clicked:", clickedObject.name);
      if (screenVideos[clickedObject.name]) {
          panToScreen(clickedObject, () => openVideoPopup(screenVideos[clickedObject.name]));
      } else if (clickedObject === resumeScreen) {
          panToScreen(resumeScreen, openResumePopup);
      } else if (screenImages[clickedObject.name]) {
          panToScreen(clickedObject, () => openImageOverlay(screenImages[clickedObject.name]));
      }
  }
});


function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
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

// Variables for clickable objects
const loader = new GLTFLoader();
let clickableScreens = {};
let resumeScreen = null;
const walls = []; // Walls will be stored here


const screenVideos = {
    "screen_3dcompositing": "/videos/3D_Compositing.mp4",
    "screen_2dcompositing": "/videos/2D_Compositing.mp4",
    "screen_photogrammetry": "/videos/Photogrammetry.mp4"
    
};

const screenImages = {
  "access_screen": "/images/intro_2.png" // Add access_screen mapped to an image
};

const resumeURL = "resume.pdf";

// ✅ Your Custom Bounding Box Names from Blender
const boundingBoxNames = ["bounding_box_l", "bounding_box_b", "bounding_box_t"];

// ✅ Load the 3D Model
loader.load('./models/cyberpunk_station.glb', function (gltf) {
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

            // ✅ Assign Layers
            if (screenVideos[child.name]) {
                clickableScreens[child.name] = child;
                child.layers.set(0); // Interactive elements in Layer 0
            } else if (screenImages[child.name]) { // ✅ Add access_screen support
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

// ✅ Corrected Raycaster to Block Clicks Only If a Wall is In Front
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);

    // ✅ Step 1: Check for clickable objects first
    raycaster.layers.set(0); // Check Layer 0 (clickable objects)
    const clickableIntersects = raycaster.intersectObjects([...Object.values(clickableScreens), resumeScreen].filter(Boolean));

    if (clickableIntersects.length > 0) {
        const clickedObject = clickableIntersects[0].object;

        // ✅ Step 2: Check if a wall is in front of the clicked object
        raycaster.layers.set(1); // Now check Layer 1 (walls)
        const wallIntersects = raycaster.intersectObjects(walls, true);

        if (wallIntersects.length > 0 && wallIntersects[0].distance < clickableIntersects[0].distance) {
            console.log("❌ Click Blocked by Wall:", wallIntersects[0].object.name);
            return; // Stop click if a wall is in front
        }

        // ✅ If no wall is blocking, allow the click
        console.log("✅ Clicked:", clickedObject.name);
        if (screenVideos[clickedObject.name]) {
            panToScreen(clickedObject, () => openVideoPopup(screenVideos[clickedObject.name]));
          } else if (clickedObject === resumeScreen) {
            panToScreen(resumeScreen, openResumePopup);
          } else if (screenImages[clickedObject.name]) { // ✅ New feature for access_screen
            panToScreen(clickedObject, () => openImageOverlay(screenImages[clickedObject.name]));
        }
    }
});

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

  console.log("🔍 Attempting to Open Image Overlay:", imagePath);

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



// Close overlay when clicking the button
document.getElementById("close-overlay").addEventListener("click", () => {
  document.getElementById("image-overlay").style.display = "none";
});

document.getElementById("close-popup").addEventListener("click", () => {
  document.getElementById("video-popup").style.display = "none";

  // Resume ambient music when the video popup is closed
  if (!ambienceSound.isPlaying) ambienceSound.play();
});


document.getElementById("close-resume-popup").addEventListener("click", () => {
    document.getElementById("resume-popup").style.display = "none";
});




const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.3, 0.85);
bloomPass.threshold = 0.3;
bloomPass.strength = 1.2;
bloomPass.radius = 0.8;
composer.addPass(bloomPass);

animate();
