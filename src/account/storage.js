// 📦 창고 (2026-10-24, docs/STORAGE_2026-10-24.md) — 계정 공용 장비 보관. 순수 로직 (DOM·네트워크 없음 → node 테스트 가능)
// 저장: save.stor = [장비] (가방과 같은 모양, 서버로 보낼 때만 packSave 로 압축) · save.storX = 확장 단계 0..STOR_STEPS (0이면 키 없음)
// 정리·병합·고유·도감·상자 처리는 account/equip.js (cleanEquip·mergeEquip·ownsUnique·allItems) — 한 장비는 가방/창고 중 한 곳에만.
import * as E from './equip.js';
import { packItem } from './storpack.js';
export const STOR = { base: 60, step: 10, steps: E.STOR_STEPS }; // 60칸 → 단계마다 +10 → 최대 100칸
// 확장 비용: 단계마다 강철 또는 영혼석 중 하나로 (강철 교환 비율 10:30 기준 영혼석이 약간 비쌈)
export const STOR_COST = [{ steel: 120, souls: 500 }, { steel: 200, souls: 900 }, { steel: 320, souls: 1500 }, { steel: 480, souls: 2400 }];
const fin = (v, lo, hi) => { v = Math.floor(+v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; };
export const storX = s => fin(s && s.storX, 0, STOR.steps);
export const storCap = s => STOR.base + STOR.step * storX(s);
export const storMax = () => STOR.base + STOR.step * STOR.steps;
export const storUsed = s => ((s && s.stor) || []).length;
export const storFree = s => Math.max(0, storCap(s) - storUsed(s));
export const bagFree = s => Math.max(0, E.CAP - ((s && s.inv) || []).length);
export const nextCost = s => STOR_COST[storX(s)] || null; // null = 최대
// 필터·정렬 (UI 공용): slot 'all'|'weapon'|'armor'|'acc', grade 'all'|0..4|'uq'
export const GRADE_F = ['all', 0, 1, 2, 3, 4, 'uq'];
export const SORTS = { grade: '등급순', power: '전투력순', enh: '강화순', slot: '종류순', recent: '최근 넣은 순' };
export function matches(it, f = {}) { const sl = f.slot || 'all', g = f.grade == null ? 'all' : f.grade;
  if (sl !== 'all' && it.s !== sl) return false; if (g === 'all') return true; if (g === 'uq') return !!it.uq; return !it.uq && it.g === +g; }
const SL_ORD = { weapon: 0, armor: 1, acc: 2 };
export function sortItems(list, mode = 'grade') { const L = [...list], byG = (a, b) => (!!b.uq - !!a.uq) || b.g - a.g || b.e - a.e || E.power(b) - E.power(a);
  if (mode === 'recent') return L.reverse(); if (mode === 'power') return L.sort((a, b) => E.power(b) - E.power(a) || byG(a, b));
  if (mode === 'enh') return L.sort((a, b) => b.e - a.e || byG(a, b)); if (mode === 'slot') return L.sort((a, b) => SL_ORD[a.s] - SL_ORD[b.s] || String(a.h || '').localeCompare(String(b.h || '')) || byG(a, b));
  return L.sort(byG); }
// 가방에서 창고로 옮길 수 있는 장비 = 장착 안 한 가방 장비
export const storable = s => (s.inv || []).filter(x => !E.isEquipped(s, x.id));
// 보관: ids 순서대로 빈칸만큼. 장착 중·없는 id 는 건너뜀. 반환 [save, { moved, full(칸 부족으로 남김), eq(장착 중이라 건너뜀) }]
export function store(save, ids) { if (!Array.isArray(save.stor)) save.stor = []; const want = [...new Set(Array.isArray(ids) ? ids : [ids])]; let moved = 0, full = 0, eq = 0;
  for (const id of want) { const i = save.inv.findIndex(x => x.id === id); if (i < 0) continue; if (E.isEquipped(save, id)) { eq++; continue; }
    if (save.stor.some(x => x.id === id)) { save.inv.splice(i, 1); continue; } // 이미 창고에 같은 장비(망가진 세이브) → 가방 쪽만 정리 (중복 없음)
    if (storUsed(save) >= storCap(save)) { full++; continue; } save.stor.push(save.inv.splice(i, 1)[0]); moved++; }
  return [save, { moved, full, eq }]; }
// 꺼내기: 가방 빈칸만큼 (고유는 상자 개봉과 같게 가방이 가득 차도 꺼낼 수 있음). 반환 [save, { moved, full }]
export function take(save, ids) { if (!Array.isArray(save.stor)) save.stor = []; const want = [...new Set(Array.isArray(ids) ? ids : [ids])]; let moved = 0, full = 0;
  for (const id of want) { const i = save.stor.findIndex(x => x.id === id); if (i < 0) continue; const it = save.stor[i];
    if (save.inv.some(x => x.id === id)) { save.stor.splice(i, 1); continue; }
    if (!it.uq && save.inv.length >= E.CAP) { full++; continue; } save.inv.push(save.stor.splice(i, 1)[0]); moved++; }
  return [save, { moved, full }]; }
// 일괄: 필터에 맞는 것 전부 (보관 = 장착 제외, 정렬 순서대로 빈칸만큼)
export const storeAll = (save, f, sort) => store(save, sortItems(storable(save).filter(x => matches(x, f)), sort).map(x => x.id));
export const takeAll = (save, f, sort) => take(save, sortItems((save.stor || []).filter(x => matches(x, f)), sort).map(x => x.id));
// 확장: pay 'steel' | 'souls'. 반환 [save, 'ok'|'max'|'poor'|'none']
export function expand(save, pay) { const c = nextCost(save); if (!c) return [save, 'max']; if (pay !== 'steel' && pay !== 'souls') return [save, 'none'];
  if (pay === 'steel') { if ((save.mat.steel || 0) < c.steel) return [save, 'poor']; save.mat.steel -= c.steel; } else { if ((save.souls || 0) < c.souls) return [save, 'poor']; save.souls -= c.souls; }
  save.storX = storX(save) + 1; return [save, 'ok']; }
// ---------- 클라우드 ----------
// 서버로 보낼 세이브: 창고만 압축 문자열로 (다른 키는 그대로 — 같은 객체를 바꾸지 않음)
export function packSave(d) { if (!d || typeof d !== 'object' || !Array.isArray(d.stor)) return d; return { ...d, stor: d.stor.map(x => (typeof x === 'string' ? x : packItem(x))).filter(Boolean) }; }
// 옛 클라이언트(창고를 모르는 캐시된 JS)가 저장한 서버 행에는 'stor' 키가 없음 → 그 기기는 창고를 건드릴 수 없었으므로 이 기기의 창고를 그대로 이어 붙임 (잃지 않음).
// 새 클라이언트는 항상 stor 를 저장(빈 배열 포함)하므로, 키가 있으면 서버 값이 기준 (꺼내기·분해가 되살아나지 않음 = 복제 없음). 가방·상자와 겹치는 id 는 cleanEquip 이 정리.
export function healStor(cloud, local) { if (!cloud || typeof cloud !== 'object' || Array.isArray(cloud.stor) || !local || !Array.isArray(local.stor) || (!local.stor.length && !local.storX)) return cloud;
  return { ...cloud, stor: local.stor, storX: Math.max(storX(cloud), storX(local)) }; }
