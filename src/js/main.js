import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

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
 // Cyan neon light
const neonLight1 = new THREE.PointLight(0x00ffff, 3.0, 20);
neonLight1.position.set(2, 3, 2);
scene.add(neonLight1);

// Magenta neon light
const neonLight2 = new THREE.PointLight(0xff00ff, 1.2, 10);
neonLight2.position.set(-2, 3, -2);
scene.add(neonLight2);

// Purple neon glow from below
const neonLight3 = new THREE.PointLight(0xaa00ff, 1.0, 8);
neonLight3.position.set(0, -2, 0);
scene.add(neonLight3);

// Spotlight for contrast
const spotlight = new THREE.SpotLight(0xffffff, 1.2);
spotlight.position.set(0, 5, 5);
spotlight.angle = Math.PI / 6;
spotlight.penumbra = 0.5;
scene.add(spotlight);


// Audio setup
const listener = new THREE.AudioListener();
camera.add(listener);
const sound = new THREE.Audio(listener);
const audioLoader = new THREE.AudioLoader();
audioLoader.load('/sounds/water-splash.mp3', (buffer) => {
  sound.setBuffer(buffer);
  sound.setLoop(false);
  sound.setVolume(0.5);
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
  const x = (event.clientX / window.innerWidth) * 2 - 1;
  const y = -(event.clientY / window.innerHeight) * 2 + 1;
  if (waterReflector.userData.shader) {
    waterReflector.userData.shader.uniforms.clickPosition.value.set(x * 0.5 + 0.5, y * 0.5 + 0.5);
    waterReflector.userData.shader.uniforms.rippleTime.value = 0.1;
    if (!sound.isPlaying) sound.play(); // Play sound on click
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

const resumeURL = "/documents/resume.pdf";

// ✅ Your Custom Bounding Box Names from Blender
const boundingBoxNames = ["bounding_box_l", "bounding_box_b", "bounding_box_t"];

// ✅ Load the 3D Model
loader.load('/models/cyberpunk_station.glb', function (gltf) {
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
    document.getElementById("video-source").src = videoPath;
    document.getElementById("video-player").load();
    document.getElementById("video-popup").style.display = "block";
}

function openResumePopup() {
    document.getElementById("resume-popup").style.display = "block";
}

document.getElementById("close-popup").addEventListener("click", () => {
    document.getElementById("video-popup").style.display = "none";
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
