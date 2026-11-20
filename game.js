import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loading = document.querySelector('#loading');
const startScreen = document.querySelector('#start-screen');
const startButton = document.querySelector('#start');
const questStatus = document.querySelector('#quest-status');
const message = document.querySelector('#message');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9baab0);
scene.fog = new THREE.Fog(0x9baab0, 65, 260);

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.querySelector('#game').prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xdce9f1, 0x51483d, 1.8));
const sun = new THREE.DirectionalLight(0xffdfb4, 2.4);
sun.position.set(-45, 75, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.left = -85;
sun.shadow.camera.right = 85;
sun.shadow.camera.top = 85;
sun.shadow.camera.bottom = -85;
scene.add(sun);

const loader = new GLTFLoader();
const clock = new THREE.Clock();
const keys = Object.create(null);
const world = new THREE.Group();
scene.add(world);

const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x59664c, roughness: 1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.08;
ground.receiveShadow = true;
world.add(ground);

// Low rolling terrain keeps the horizon varied while the main structures are real GLB assets.
for (let i = 0; i < 30; i++) {
  const hill = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshStandardMaterial({ color: i % 2 ? 0x68745a : 0x59684f, roughness: 1 })
  );
  hill.scale.set(THREE.MathUtils.randFloat(12, 25), THREE.MathUtils.randFloat(3, 8), THREE.MathUtils.randFloat(12, 25));
  hill.position.set(THREE.MathUtils.randFloatSpread(330), -3.2, THREE.MathUtils.randFloatSpread(330));
  hill.receiveShadow = true;
  world.add(hill);
}

// Forest dressing around the playable valley.
const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x49382b, roughness: 1 });
const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x263d2d, roughness: 1 });
for (let i = 0; i < 105; i++) {
  const x = THREE.MathUtils.randFloatSpread(250);
  const z = THREE.MathUtils.randFloatSpread(250);
  if (Math.abs(x) < 19 && z > -72 && z < 35) continue;
  const h = THREE.MathUtils.randFloat(3.5, 6.5);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.27, h * 0.48, 7), trunkMaterial);
  trunk.position.set(x, h * 0.24, z);
  trunk.castShadow = true;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(h * 0.42, h * 0.9, 8), leafMaterial);
  crown.position.set(x, h * 0.82, z);
  crown.castShadow = true;
  world.add(trunk, crown);
}

// Asset sources: CC0 models. The large castle and medieval cottage are loaded as actual GLB meshes.
const ASSETS = {
  castle: 'https://files.innerscene.com/library/castle-with-keep-1a75a9e1/be0d9411a3e3b580b2b5/castle-with-keep.glb',
  house: 'https://files.innerscene.com/library/low-poly-medieval-house-cb233936/3601fdf8b7bd0b54f13b/low-poly-medieval-house.glb',
  character: 'https://grab3d.com/dl/medieval-villager-rigged/medieval-villager-rigged.glb'
};

function prepareModel(root, targetHeight = null) {
  root.updateMatrixWorld(true);
  let bounds = new THREE.Box3().setFromObject(root);
  let size = bounds.getSize(new THREE.Vector3());

  // GLB assets use the glTF standard: Y is up. Do not infer orientation
  // from bounding-box proportions; doing so tipped the large castle onto its side.
  if (targetHeight && size.y > 0) {
    root.scale.multiplyScalar(targetHeight / size.y);
    root.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(root);
  }

  const center = bounds.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= bounds.min.y;
  root.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      if (node.material) {
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((m) => { if ('envMapIntensity' in m) m.envMapIntensity = 0.7; });
      }
    }
  });
  return root;
}

let castleReady = false;
let characterMixer = null;
let idleAction = null;
let walkAction = null;
let currentAction = null;
let playerMoving = false;
let loadedCount = 0;
const totalAssets = 3;

function assetProgress(label) {
  loadedCount++;
  loading.textContent = `Loading ${label} · ${loadedCount}/${totalAssets}`;
  if (loadedCount >= totalAssets) loading.style.display = 'none';
}

function loadAsset(url, label) {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf), undefined, reject);
  });
}

const castlePromise = loadAsset(ASSETS.castle, 'castle').then((gltf) => {
  const castle = prepareModel(gltf.scene);
  const box = new THREE.Box3().setFromObject(castle);
  const size = box.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.z);
  if (largest > 0) castle.scale.multiplyScalar(58 / largest);
  castle.updateMatrixWorld(true);
  const finalBox = new THREE.Box3().setFromObject(castle);
  const center = finalBox.getCenter(new THREE.Vector3());
  castle.position.set(-center.x, -finalBox.min.y, -62 - center.z);
  world.add(castle);
  castleReady = true;
  assetProgress('castle');
}).catch((error) => {
  console.error('Castle model could not be loaded:', error);
  questStatus.textContent = 'Castle asset failed to load. Check your connection and refresh.';
  assetProgress('castle unavailable');
});

const housePromise = loadAsset(ASSETS.house, 'village').then((gltf) => {
  const template = prepareModel(gltf.scene, 5.2);
  const places = [
    [-14, -22, 0.1], [13, -18, -0.3], [-17, 0, 0.2],
    [16, 5, -0.15], [-12, 19, 0.1], [12, 24, 0.25]
  ];
  for (const [x, z, rotation] of places) {
    const house = template.clone(true);
    house.position.set(x, 0, z);
    house.rotation.y = rotation;
    world.add(house);
  }
  assetProgress('village');
}).catch((error) => {
  console.error('Village model could not be loaded:', error);
  assetProgress('village unavailable');
});

const player = new THREE.Group();
player.position.set(0, 0, 28);
world.add(player);

const characterPromise = loadAsset(ASSETS.character, 'traveller').then((gltf) => {
  const character = prepareModel(gltf.scene, 1.8);
  player.add(character);
  if (gltf.animations?.length) {
    characterMixer = new THREE.AnimationMixer(character);
    const idleClip = gltf.animations.find((clip) => /idle/i.test(clip.name)) || gltf.animations[0];
    const walkClip = gltf.animations.find((clip) => /walk/i.test(clip.name)) || idleClip;
    idleAction = characterMixer.clipAction(idleClip);
    walkAction = characterMixer.clipAction(walkClip);
    idleAction.play();
    currentAction = idleAction;
  }
  assetProgress('character');
}).catch((error) => {
  console.error('Character model could not be loaded:', error);
  const fallback = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 4, 8), new THREE.MeshStandardMaterial({ color: 0x435143 }));
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), new THREE.MeshStandardMaterial({ color: 0xc69b7b }));
  head.position.y = 1.55;
  fallback.add(body, head);
  player.add(fallback);
  assetProgress('character fallback');
});

let yaw = 0;
let pitch = -0.08;
let locked = false;
let started = false;
let walkTime = 0;

function updateCamera() {
  const target = new THREE.Vector3(player.position.x, player.position.y + 1.35, player.position.z);
  const offset = new THREE.Vector3(Math.sin(yaw) * 7.4, 2.8 + pitch * 4, Math.cos(yaw) * 7.4);
  camera.position.copy(target).add(offset);
  camera.lookAt(target.x, target.y + 0.12, target.z);
}
updateCamera();

function setCharacterMoving(moving) {
  if (!characterMixer || moving === playerMoving) return;
  playerMoving = moving;
  const next = moving ? walkAction : idleAction;
  if (!next || next === currentAction) return;
  next.reset().fadeIn(0.18).play();
  currentAction?.fadeOut(0.18);
  currentAction = next;
}

startButton.addEventListener('click', () => {
  started = true;
  startScreen.style.display = 'none';
  renderer.domElement.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
});
document.addEventListener('mousemove', (event) => {
  if (!locked) return;
  yaw -= event.movementX * 0.0024;
  pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0015, -0.32, 0.3);
});
document.addEventListener('keydown', (event) => { keys[event.code] = true; });
document.addEventListener('keyup', (event) => { keys[event.code] = false; });
renderer.domElement.addEventListener('click', () => {
  if (started && !locked) renderer.domElement.requestPointerLock?.();
});
document.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') document.exitPointerLock?.();
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.04);

  if (started) {
    const forward = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const strafe = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    const moving = Boolean(forward || strafe);
    const speed = (keys.ShiftLeft || keys.ShiftRight ? 8.2 : 4.4) * dt;

    if (moving) {
      const direction = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      player.position.addScaledVector(direction, -forward * speed);
      player.position.addScaledVector(right, strafe * speed);
      player.position.x = THREE.MathUtils.clamp(player.position.x, -145, 145);
      player.position.z = THREE.MathUtils.clamp(player.position.z, -175, 150);
      player.rotation.y = yaw + Math.PI;
      walkTime += dt * 8;
    }
    setCharacterMoving(moving);
    characterMixer?.update(dt);
    updateCamera();

    if (castleReady && player.position.z < -30) {
      questStatus.textContent = 'The stone walls rise ahead. Explore the valley.';
      if (player.position.z < -43) message.classList.add('show');
    }
  }

  renderer.render(scene, camera);
}
animate();

Promise.allSettled([castlePromise, housePromise, characterPromise]).then(() => {
  loading.style.display = 'none';
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
});
