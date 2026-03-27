import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/controls/OrbitControls.js";

const statusEl = document.getElementById("status");
function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

const BOARD_SIZE = 8;
const canvas = document.getElementById("app");

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (err) {
  setStatus("WebGL init failed. Check browser WebGL support.");
  throw err;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x08131d, 18, 42);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(11, 12, 14);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 9;
controls.maxDistance = 28;
controls.maxPolarAngle = Math.PI * 0.9;
controls.minPolarAngle = Math.PI * 0.1;

const ambient = new THREE.AmbientLight(0xa8d4ff, 0.55);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xc0e2ff, 0.8);
keyLight.position.set(14, 18, 10);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0x5599ff, 0.7, 80);
fillLight.position.set(-10, 6, -8);
scene.add(fillLight);

const boardGroup = new THREE.Group();
scene.add(boardGroup);

const boardExtent = BOARD_SIZE;
const boardMin = -boardExtent / 2;

function boardToWorld(x, y, z) {
  return new THREE.Vector3(
    boardMin + 0.5 + x,
    boardMin + 0.5 + y,
    boardMin + 0.5 + z
  );
}

function createCubeShell() {
  const shellGeo = new THREE.BoxGeometry(boardExtent, boardExtent, boardExtent);
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0x6dc2ff,
    transparent: true,
    opacity: 0.05,
    transmission: 0.45,
    roughness: 0.2,
    metalness: 0.05,
  });
  const shell = new THREE.Mesh(shellGeo, shellMat);

  const edges = new THREE.EdgesGeometry(shellGeo);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.48 });
  const edgeLines = new THREE.LineSegments(edges, edgeMat);
  shell.add(edgeLines);

  return shell;
}

function createGridLines() {
  const lineMat = new THREE.LineBasicMaterial({ color: 0x72a8cf, transparent: true, opacity: 0.18 });
  const points = [];
  const min = -boardExtent / 2;
  const max = boardExtent / 2;

  for (let i = 1; i < BOARD_SIZE; i += 1) {
    const v = min + i;

    points.push(new THREE.Vector3(min, v, min), new THREE.Vector3(max, v, min));
    points.push(new THREE.Vector3(min, v, max), new THREE.Vector3(max, v, max));
    points.push(new THREE.Vector3(min, min, v), new THREE.Vector3(max, min, v));
    points.push(new THREE.Vector3(min, max, v), new THREE.Vector3(max, max, v));

    points.push(new THREE.Vector3(v, min, min), new THREE.Vector3(v, max, min));
    points.push(new THREE.Vector3(v, min, max), new THREE.Vector3(v, max, max));
    points.push(new THREE.Vector3(min, min, v), new THREE.Vector3(min, max, v));
    points.push(new THREE.Vector3(max, min, v), new THREE.Vector3(max, max, v));

    points.push(new THREE.Vector3(v, min, min), new THREE.Vector3(v, min, max));
    points.push(new THREE.Vector3(v, max, min), new THREE.Vector3(v, max, max));
    points.push(new THREE.Vector3(min, v, min), new THREE.Vector3(min, v, max));
    points.push(new THREE.Vector3(max, v, min), new THREE.Vector3(max, v, max));
  }

  const geo = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineSegments(geo, lineMat);
}

function inwardStep(v) {
  return v === 0 ? 1 : -1;
}

function makeOffset(corner, dx, dy, dz) {
  return {
    x: corner.x + inwardStep(corner.x) * dx,
    y: corner.y + inwardStep(corner.y) * dy,
    z: corner.z + inwardStep(corner.z) * dz,
  };
}

function createStartingPieces() {
  const corners = {
    Yellow: { x: 0, y: 7, z: 0, color: 0xffce3a },
    Red: { x: 7, y: 0, z: 7, color: 0xff5858 },
    Purple: { x: 7, y: 7, z: 7, color: 0xb578ff },
    Blue: { x: 0, y: 0, z: 0, color: 0x48a7ff },
  };

  const layout = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ];

  const group = new THREE.Group();

  for (const key of Object.keys(corners)) {
    const corner = corners[key];
    for (let i = 0; i < layout.length; i += 1) {
      const [dx, dy, dz] = layout[i];
      const c = makeOffset(corner, dx, dy, dz);
      const pos = boardToWorld(c.x, c.y, c.z);

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(i === 0 ? 0.36 : 0.3, 24, 24),
        new THREE.MeshBasicMaterial({
          color: corner.color,
          transparent: true,
          opacity: 0.98,
        })
      );
      core.position.copy(pos);

      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(i === 0 ? 0.56 : 0.48, 20, 20),
        new THREE.MeshBasicMaterial({
          color: corner.color,
          transparent: true,
          opacity: i === 0 ? 0.26 : 0.2,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo.position.copy(pos);

      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(i === 0 ? 0.12 : 0.1, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
      );
      spark.position.copy(pos);
      spark.position.x += 0.06;
      spark.position.y += 0.06;

      group.add(core);
      group.add(halo);
      group.add(spark);
    }
  }

  return group;
}

boardGroup.add(createCubeShell());
boardGroup.add(createGridLines());
boardGroup.add(createStartingPieces());

const centerGlow = new THREE.Mesh(
  new THREE.SphereGeometry(0.9, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0x58b8ff, transparent: true, opacity: 0.13 })
);
scene.add(centerGlow);

function animate(time) {
  const t = time * 0.001;
  centerGlow.scale.setScalar(1 + Math.sin(t * 1.7) * 0.08);
  // Keep board orientation stable for layout readability.

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", onResize);
setStatus("Viewer loaded");
requestAnimationFrame(animate);










