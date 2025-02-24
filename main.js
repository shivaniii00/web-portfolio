import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";

const canvas = document.getElementById("three-canvas");

if (!canvas) {
  console.error("Canvas element not found! Check your HTML.");
} else {
  console.log("Canvas found:", canvas);
}
