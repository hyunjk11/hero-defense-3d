import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { $, rnd } from '../core/util.js';
import { G } from '../core/state.js';

// ================= 렌더러/씬 =================
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
$('app').appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xcfeaff, 80, 170);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, .5, 600);
const cam = { theta: .22, phi: .9, r: 58, target: new THREE.Vector3(0, 0, 1) };
function updateCam() {
  const t = cam.target, sx = G.shake > 0 ? rnd(-1, 1) * G.shake : 0, sy = G.shake > 0 ? rnd(-1, 1) * G.shake : 0;
  camera.position.set(t.x + cam.r * Math.sin(cam.phi) * Math.sin(cam.theta) + sx, t.y + cam.r * Math.cos(cam.phi) + sy, t.z + cam.r * Math.sin(cam.phi) * Math.cos(cam.theta));
  camera.lookAt(t.x + sx * .3, t.y, t.z);
}
const DAY = { top: new THREE.Color(0x3d9cff), bot: new THREE.Color(0xd6efff), fog: new THREE.Color(0xcfeaff) };
const NIGHT = { top: new THREE.Color(0x05071c), bot: new THREE.Color(0x2c1d55), fog: new THREE.Color(0x1a1438) };
const skyU = { top: { value: DAY.top.clone() }, bot: { value: DAY.bot.clone() } };
scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix*vec4(position,1.)).xyz; gl_Position = projectionMatrix*viewMatrix*vec4(vP,1.); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y*1.8+.08,0.,1.); gl_FragColor = vec4(mix(bot,top,h),1.); }',
})));
const hemi = new THREE.HemisphereLight(0xe6f4ff, 0x5a4a3a, 1.35); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 2.6); sun.position.set(-22, 42, 26); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 30, bottom: -30, near: 5, far: 120 }); sun.shadow.bias = -.0005; sun.shadow.normalBias = .03; scene.add(sun);
const moon = new THREE.DirectionalLight(0x7a8aff, 0); moon.position.set(20, 30, -20); scene.add(moon);
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .35, .45, .95); composer.addPass(bloom); composer.addPass(new OutputPass());
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

export { renderer, scene, camera, cam, updateCam, DAY, NIGHT, skyU, hemi, sun, moon, composer, bloom };
