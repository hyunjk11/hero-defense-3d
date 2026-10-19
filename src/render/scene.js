import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { $, rnd } from '../core/util.js';
import { G } from '../core/state.js';
import { STAGE } from '../core/grid.js';

// ================= 렌더러/씬 =================
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const COARSE = matchMedia('(pointer: coarse)').matches; // 태블릿: 고해상도 화면에서 GPU 부담 줄이기
renderer.setPixelRatio(Math.min(devicePixelRatio, COARSE ? 1.5 : 1.75)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
// 설원(2장): 거의 흰 눈이 강한 햇빛·노출·블룸에서 하얗게 날아가 판이 안 보였음 → 노출·조명 낮추고 블룸은 진짜 발광체만 (LIGHT 는 main.js updLighting 에서 곱함)
const SNOW = !!(STAGE && STAGE.ch === 2), LIGHT = SNOW ? { sun: .8, hemi: .78, bloomTh: 1.35 } : { sun: 1, hemi: 1, bloomTh: .95 }; if (SNOW) renderer.toneMappingExposure = .9;
$('app').appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xcfeaff, 80, 170); if (STAGE && STAGE.ch === 2) { scene.fog.near = 95; scene.fog.far = 200; } // 설원 안개는 판 바깥 가장자리에만
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, .5, 600);
const cam = { theta: .22, phi: .9, r: 58, target: new THREE.Vector3(0, 0, 1) };
function updateCam() {
  const t = cam.target, sx = G.shake > 0 ? rnd(-1, 1) * G.shake : 0, sy = G.shake > 0 ? rnd(-1, 1) * G.shake : 0;
  camera.position.set(t.x + cam.r * Math.sin(cam.phi) * Math.sin(cam.theta) + sx, t.y + cam.r * Math.cos(cam.phi) + sy, t.z + cam.r * Math.sin(cam.phi) * Math.cos(cam.theta));
  camera.lookAt(t.x + sx * .3, t.y, t.z);
}
const DAY = SNOW ? { top: new THREE.Color(0x5a8ac8), bot: new THREE.Color(0xb4c6da), fog: new THREE.Color(0xa8bcd2) } : { top: new THREE.Color(0x3d9cff), bot: new THREE.Color(0xd6efff), fog: new THREE.Color(0xcfeaff) };
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
// 후처리(블룸) 경로는 기본 렌더 타깃에 MSAA가 없어 antialias:true가 무시됨 → 잔 돌길 모서리가 카메라 이동 시 지글지글 끓어 보임. 멀티샘플 타깃으로 해결
// (소프트웨어 렌더러(SwiftShader 등)에서는 너무 느려 끔, ?msaa=1/0 으로 강제)
const _soft = (() => { try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return /swiftshader|llvmpipe|software/i.test(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''); } catch (e) { return false; } })();
const _qm = new URLSearchParams(location.search).get('msaa'), MSAA = _qm ? (_qm === '1' ? 4 : 0) : _soft ? 0 : Math.min(4, renderer.capabilities.maxSamples || 0);
const _pr = renderer.getPixelRatio(), _rt = new THREE.WebGLRenderTarget(innerWidth * _pr, innerHeight * _pr, { type: THREE.HalfFloatType, samples: MSAA });
const composer = new EffectComposer(renderer, _rt); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .35, .45, LIGHT.bloomTh); // NaN/Inf 방어: 한 픽셀이라도 NaN이면 블룸 블러가 그것을 화면 전체로 번져 검은 화면이 됨(보스 처치 후 검은 화면 버그). 블룸 입력에서 비정상 값을 0으로
bloom.materialHighPassFilter.fragmentShader = bloom.materialHighPassFilter.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );',
  'vec4 texel = texture2D( tDiffuse, vUv ); if ( !all( lessThan( abs( texel ), vec4( 6.0e4 ) ) ) ) texel = vec4( 0.0 );'); bloom.materialHighPassFilter.needsUpdate = true;
composer.addPass(bloom); composer.addPass(new OutputPass());
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

export { renderer, scene, camera, cam, updateCam, DAY, NIGHT, skyU, hemi, sun, moon, composer, bloom, LIGHT, SNOW };
