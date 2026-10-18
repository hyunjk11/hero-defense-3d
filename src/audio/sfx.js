import { Snd } from './audio.js';
import * as THREE from 'three';
import { camera } from '../render/scene.js';

// ================= 사운드 =================
const SFX = { init() { Snd.unlock(); }, tone(f, d, type, v, slide) { Snd.beep(f, d, type, v, slide); } };
const sndProj = new THREE.Vector3(); Snd.project = p => sndProj.set(p.x, p.y || 0, p.z).project(camera).x;

export { SFX };
