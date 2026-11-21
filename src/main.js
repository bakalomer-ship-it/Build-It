// Web prototype. Level 1: build a 2x2 klaf on its drawing, drive the stakes,
// raise it by the guy lines, anchor it, and pass the push test.
// Level 2: the same for two klafim, then join them into a cube with side
// poles and spatial Xs, take the inner guy lines down, and test the cube.
//
// Most of the code works on "the current klaf" (G.build, G.sim, poleMeshes
// ...): useKlaf(i) points all of them at klaf i.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SLOTS, JOINTS, STAKE_JOINTS, LEG_STAKES, GUYS, LASHINGS, LASHING_ORDER, GUY_LASHING_ORDER, LEVEL, setPlan, resetPlan, legS, legU, legFootU, legTopU, legTopV } from './level1.js';
import { FREE_LEVEL, GRID, POLE_MIN, POLE_MAX, layPole, onSheet, idFor, slotFor, crossings, markLoad, freeCfg, freeRows, freeJoinPlan } from './free.js';
import { SIZES } from './blueprints.js';
import { KlafSim, TUNING, jointReachable, guyAnchor, slotById, slotParam, slotPoint, klafToWorld } from './klafSim.js';
import { CubeSim, cubeSlotPoint, cubeSlotParam, cubeJointReachable } from './cubeSim.js';
import { LEVELS, CUBE_LEVEL, CUBE4_LEVEL } from './levels.js';
import { loadSketch } from './sketch.js';
import { CAR, SEAT, SEAT_C, MAST, MAST_JOINTS, HANG_ROPES, PIVOT, CarouselSim, CAR_TUNING, mastReaches, mastTopY, seatY, cornerAt, KLAF_XS } from './carousel.js';
import { WH, WHEEL, GOND, RIG, SEAT_ROPES, WheelSim, WH_TUNING, AXLE_Y, WHEEL_DROP, SEAT_DROP, SEAT_C as WSEAT_C, SEAT_Y as WSEAT_Y, ropeTop, ropeFoot, rigReachable, WHEEL_Z, TRI90 } from './wheel.js';
import { TRI, TRI_SLOTS, TRI_JOINTS, LEG_IDS, BRACES, BRACE_JOINTS, TRI_STAKES, TRI_STAKE_JOINTS, TRI_STAKE_HITS, TRI_TUNING, TripodSim, startFeet, planFeet, standing, braceReaches, fitsPlan, setLashFor, TRI_SPEC } from './tripod.js';
import { World } from './physics.js';
import {
  R, makeRenderer, makeWorld, makeBlueprintMesh, drawBlueprint, BP, makePoleMesh, placeCylinder, makeSideSheet, drawSideSheet, makeTopSheet, drawTopSheet, POLE_LOOK,
  makeLashing, placeLashing, placeParallelLashing, RopeViz, makeStake, makeDriver, makeFreeGrid, makeTripodSheet, drawTripodFolder,
  BP_BASE, setBlueprintSize, redrawBlueprint, makeSeatSheet,
} from './scene.js';
import { sfx, buzz } from './sound.js';
import { makeDecor } from './decor.js';
import { makeFun } from './fun.js';
import { makeBalance, BALANCE } from './balance.js';
import { SPEED, FIX, cubeMedals, FIX_PENALTY, rng, medalOf, MEDAL_HE, MEDAL_ICON, bestOf, recordChallenge } from './challenges.js';
import { Actor, makeCrew, freeActors, CREW } from './crew.js';

const $ = id => document.getElementById(id);
// An error on a player's phone shows on screen, so a screenshot tells us what broke
function reportError(e) {
  try {
    let el = document.getElementById('err-box');
    if (!el) { el = document.createElement('div'); el.id = 'err-box'; el.style.cssText = 'position:fixed;left:8px;bottom:56px;z-index:99;max-width:60vw;padding:6px 10px;border-radius:8px;background:rgba(120,20,10,.9);color:#fff;font:12px/1.3 monospace;direction:ltr;text-align:left;pointer-events:none;white-space:pre-wrap'; document.body.appendChild(el); }
    const msg = (e && (e.stack || e.message)) || String(e);
    el.textContent = ('error: ' + msg).slice(0, 400);
  } catch { /* nothing more to do */ }
}
window.addEventListener('error', ev => reportError(ev.error || ev.message));
window.addEventListener('unhandledrejection', ev => reportError(ev.reason));
// poles that cross are drawn side by side, just touching (at their drawn thickness)
const GAP = 2 * R * POLE_LOOK;
// the level being played (?level=2 in the address opens level 2 directly)
let LV = LEVELS[0];
try { const n = +new URLSearchParams(location.search).get('level'); if (n >= 1 && n <= LEVELS.length) LV = LEVELS[n - 1]; } catch { /* no address here */ }
const KLAF_STAGES = [['build', 'בניית הקלף'], ['stakes', 'בז״נטים'], ['raise', 'הרמה'], ['anchor', 'עיגון']];
// a tripod in free build, beside the klafim (Omer, 2026-11-20): built on the ground with them, stood up in its turn
const TRI_STAGES = [['build', 'הרגליים וכפיתת החצובה'], ['spread', 'הקמה ופישוק'], ['brace', 'חיזוקים ובז״נטים']];
const stagesOf = k => k.kind === 'tripod' ? TRI_STAGES : KLAF_STAGES;
function stageList() {
  const L = [];
  if (LV.tripod) return [
    { key: 'build', id: 'build', k: 0, he: 'הרגליים וכפיתת החצובה' },
    { key: 'spread', id: 'spread', k: null, he: 'הקמה ופישוק הרגליים' },
    { key: 'brace', id: 'brace', k: null, he: 'חיזוקים ובז״נטים' },
    { key: 'check', id: 'check', k: null, he: 'מסדר' },
  ];
  // Omer (2026-11-15): first every klaf is built on the ground, then they are raised
  // one by one (stakes, raise, anchor), and only then joined
  const st = ([id, he], k, i) => L.push({ key: LV.klafim.length > 1 ? `${id}:${i}` : id, id, k: i, he: LV.klafim.length > 1 ? `${he}, ${k.he}` : he });
  LV.klafim.forEach((k, i) => st(stagesOf(k)[0], k, i));
  LV.klafim.forEach((k, i) => stagesOf(k).slice(1).forEach(s => st(s, k, i)));
  // free build: klafim standing one behind the other can be joined (Omer, 2026-11-21)
  if (LV.free && freeRows(LV.klafim).length) L.push({ key: 'cube', id: 'cube', k: null, he: 'חיבור הקלפים' });
  if (LV.cube && !LV.free) {
    L.push({ key: 'cube', id: 'cube', k: null, he: 'חיבור הקלפים לקובייה' });
    L.push({ key: 'unguy', id: 'unguy', k: null, he: 'הורדת היתרים הפנימיים' });
  }
  if (LV.wheel) {
    L.push({ key: 'wheel', id: 'wheel', k: null, he: 'בניית הגלגל' });
    L.push({ key: 'wlift', id: 'wlift', k: null, he: 'הרמת הגלגל אל ראשי החצובות' });
    L.push({ key: 'gond', id: 'gond', k: null, he: 'המושב' });
  }
  if (LV.carousel) {
    L.push({ key: 'seat', id: 'seat', k: null, he: 'בניית המושב' });
    L.push({ key: 'hang', id: 'hang', k: null, he: 'תליית הקרוסלה' });
  }
  L.push({ key: 'check', id: 'check', k: null, he: 'מסדר' });
  return L;
}
let STAGES = stageList();
const cubeStage = id => id === 'cube' || id === 'unguy' || id === 'seat' || id === 'hang' || wheelStage(id) || (id === 'check' && !!LV.cube && (!LV.free || (!!G?.cube?.sim && !G.joinDone)));
const seatStage = id => id === 'seat' || id === 'hang';
// the giant wheel's stages after the towers are joined; poles are placed in two of them
const wheelStage = id => id === 'wheel' || id === 'wlift' || id === 'gond';
const rigStage = id => !!LV.wheel && (id === 'wheel' || id === 'gond');
const LEG_STAKE_HITS = 4, ANCHOR_HITS = 3;
const LEG_STAKE_LEN = 1.0, ANCHOR_LEN = 0.6;

// ---------------- state ----------------
let G;
function freshKlaf(cfg) {
  return {
    cfg,
    build: { poles: {}, joints: {}, stakes: {}, guyTop: {}, anchors: {}, stakeJoints: {}, guyTies: {}, guyOff: {}, crew: {} },
    sim: null, raisedOnce: false, uprightFor: 0, carrying: {},
    // the tripod once it leaves the ground: how far up it is (0 lying … 1 standing), where its
    // feet stand, and what has been added to it
    tri: LV.tripod || cfg.kind === 'tripod' ? freshTri() : null,
    // free build: this klaf's own design (a tripod's is the tripod's plan)
    plan: cfg.kind === 'tripod' ? (cfg.plan || { slots: TRI_SLOTS, joints: TRI_JOINTS }) : { slots: [], joints: [] },
  };
}
function freshState() {
  const s = {
    stage: 'build', stageKey: STAGES[0].key,
    ki: 0, klafim: LV.klafim.map(freshKlaf),
    cube: LV.cube || LV.free ? { build: { poles: {}, joints: {} }, sim: null, carrying: {} } : null,
    height: LV.cube || LV.free ? freshHeight() : null, // work at height (עבודה בגובה)
    // the carousel's seat: built on the ground (build), lifted (lift 0 … 1), and hung from the mast
    seat: LV.carousel ? freshSeat() : null,
    // the giant wheel and its seat: built, lifted (0 … 1), hung on their ropes
    wheel: LV.wheel ? freshWheel() : null,
    tying: null,
    selected: null,
    falling: null,
    check: null,
    result: null,
    startedAt: null, endedAt: null,
    lastLength: 2.0,
    hintsUsed: 0, hinted: [],
  };
  // the current klaf's state, read and written through G as before
  for (const key of ['build', 'sim', 'raisedOnce', 'uprightFor', 'carrying', 'tri'])
    Object.defineProperty(s, key, { get() { return this.klafim[this.ki][key]; }, set(v) { this.klafim[this.ki][key] = v; } });
  return s;
}
function freshWheel() {
  return { build: { poles: {}, joints: {} }, lift: 0, lifting: false, seatLift: 0, seatLifting: false, ropes: {}, sim: null, forks: null };
}
function freshSeat() {
  return { build: { poles: {}, joints: {} }, lift: 0, lifting: false, mast: null, pivot: false, mastJoints: {}, ropes: {}, sim: null };
}
G = freshState();
const K = () => G.klafim[G.ki];
const z0 = () => K().cfg.z0;
// Free build (Omer, 2026-11-21): a structure can be dragged anywhere on the plaza. Its work
// is still computed as if it stood on the middle line; its meshes, the helpers of the current
// structure and the crew are drawn shifted sideways by x0, and screen picking follows.
const X0 = () => LV.free ? (K()?.cfg.x0 || 0) : 0;
const curGroup = new THREE.Group();
// the current structure is a tripod: the tripod station, or a tripod of free build
const freeTri = () => !!LV.free && K()?.cfg.kind === 'tripod';
// the giant wheel's two 90° tripods are worked on in their own stages, like klafim
const wheelTri = () => !!LV.wheel && K()?.cfg.kind === 'tripod' && !wheelStage(G?.stage) && G?.stage !== 'check';
const triOn = () => !!LV.tripod || freeTri() || wheelTri();
// drawn as a tripod (standing once it is up), whatever stage the level is in
const triShape = () => triOn() || (!!LV.wheel && K()?.cfg.kind === 'tripod');
// the current tripod's drawing (station 3's, or the giant wheel's 90° tripod)
const triSpec = () => K()?.cfg.tri || TRI_SPEC;
const triPlanFeet = () => triSpec().planFeet(triCentre(), K()?.cfg.out);
// the distances between the feet, in words
function apartText(sp = triSpec()) {
  if (sp.ninety) return `${sp.apart[0].toFixed(2)} מ׳ מהרגל הזקופה לכל רגל נוטה, ו־${sp.apart[2].toFixed(1)} מ׳ בין שתי הנוטות`;
  return `${sp.apart[0].toFixed(1)} מ׳ בין כל שתי רגליים`;
}
// a klaf of free build (designed on the grid)
const freeKlaf = () => !!LV.free && !freeTri();
// no drawing to follow: the feet go anywhere
const triLoose = () => !!(LV.sandbox || LV.free);

// ---------------- three.js setup ----------------
const canvas = $('scene');
const renderer = makeRenderer(canvas);
const scene = new THREE.Scene();
makeWorld(scene);
// sounds, shakes, sparkles and confetti (fun.js): only shows what happened, never changes it
const fun = makeFun(scene);
const camera = new THREE.PerspectiveCamera(22, 1, 0.2, 400) // narrow lens: almost isometric, like the reference;
const controls = new OrbitControls(camera, canvas);
// the plaza's decoration, earned with stars (see decor.js); made once the home screen code is ready
let decor = null;
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 1.2;
controls.maxDistance = 55;
controls.target.set(0, 1, 0.4);
controls.enabled = false;

// each klaf has its own set of meshes; useKlaf(i) points these names at klaf i's set
let blueprint, poleMeshes, lashMeshes, stakeMeshes, guyRopes;
const MAX_KLAFIM = Math.max(4, ...LEVELS.map(l => l.klafim.length));
const KM = [];
for (let k = 0; k < MAX_KLAFIM; k++) {
  const m = { poles: {}, lash: {}, stakes: {}, ropes: {} };
  m.blueprint = makeBlueprintMesh(JOINTS);
  m.blueprint.material.transparent = true;
  scene.add(m.blueprint);
  // poles: two meshes per slot (diagonals can bow at their centre)
  SLOTS.forEach((s, i) => {
    const a = makePoleMesh(((i + k) % 3) / 2), b = makePoleMesh(((i + k) % 3) / 2);
    b.material = a.material;
    scene.add(a, b); a.visible = b.visible = false;
    m.poles[s.id] = [a, b];
  });
  KM.push(m);
}
// levels whose klafim have plans of their own (the carousel): meshes for their extra poles
for (const m of KM) {
  let i = 0;
  for (const L of LEVELS) for (const kc of L.klafim) for (const s of kc.plan?.slots || []) {
    if (m.poles[s.id]) continue;
    const a = makePoleMesh((i++ % 3) / 2), b = makePoleMesh(0);
    b.material = a.material; scene.add(a, b); a.visible = b.visible = false;
    m.poles[s.id] = [a, b];
  }
}
// free build: the player's own poles get meshes from this pool (ids as free.js gives them)
for (const m of KM) {
  let i = 0;
  for (const pre of ['h', 'v', 'diag']) for (let n = 1; n <= 14; n++) {
    const a = makePoleMesh((i++ % 3) / 2), b = makePoleMesh(0);
    b.material = a.material; scene.add(a, b); a.visible = b.visible = false;
    m.poles[pre + n] = [a, b];
  }
}
const freeGrid = makeFreeGrid(GRID);
freeGrid.userData.z = freeGrid.position.z;
scene.add(curGroup);
curGroup.add(freeGrid);
// the tripod's legs and braces, its stakes, and the sheet its legs are laid on
for (const m of KM) {
  for (const id of [...LEG_IDS, 't4', ...BRACES.map(b => b.id)]) {
    const a = makePoleMesh(0.5), b = makePoleMesh(0);
    b.material = a.material; scene.add(a, b); a.visible = b.visible = false;
    m.poles[id] = [a, b];
  }
  m.triStakes = TRI_STAKES.map(() => { const s = makeStake(TRI.stakeLength); s.visible = false; scene.add(s); return s; });
  // the tripod's guy lines, one on each leg, and their stakes (רבזים)
  m.triGuyRopes = [0, 1, 2, 3].map(() => { const r = new RopeViz(scene); r.show(false); return r; });
  m.triAnchors = [0, 1, 2, 3].map(() => { const s = makeStake(ANCHOR_LEN); s.visible = false; scene.add(s); return s; });
}
const triSheets = [makeTripodSheet({ slots: TRI_SLOTS, lashV: TRI_JOINTS[0].at[1], legLength: TRI.legLength }), makeTripodSheet({ slots: TRI90.slots, lashV: TRI90.lashV, legLength: Math.max(...TRI90.legLengths) })];
triSheets.forEach(m => curGroup.add(m));
// guide lines for spreading the tripod: where each foot goes, and the distance between every two feet
const triGuide = (() => {
  const g = new THREE.Group(); g.visible = false;
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x2f63b0, transparent: true, opacity: 0.85, depthWrite: false });
  g.userData.edges = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.07), lineMat); m.rotation.x = -Math.PI / 2; g.add(m); return m; });
  g.userData.rings = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.34, 40), new THREE.MeshBasicMaterial({ color: 0x2f63b0, transparent: true, opacity: 0.9, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; g.add(m); return m;
  });
  // the length on each side of the triangle
  const texs = {};
  g.userData.texFor = text => {
    if (texs[text]) return texs[text];
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
    const cx = cv.getContext('2d'); cx.fillStyle = 'rgba(246,234,208,.92)'; cx.fillRect(8, 8, 240, 80);
    cx.fillStyle = '#2f63b0'; cx.font = 'bold 54px Rubik, Arial, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(text, 128, 50);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    return (texs[text] = tex);
  };
  g.userData.labels = [0, 1, 2].map(() => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.userData.texFor(`${TRI.footApart.toFixed(1)} מ׳`), depthTest: false })); m.scale.set(1.0, 0.38, 1); m.renderOrder = 5; g.add(m); return m; });
  g.renderOrder = 2;
  scene.add(g);
  return g;
})();
function drawTriGuide() {
  const on = (!!LV.tripod && !LV.sandbox || wheelTri()) && G.stage === 'spread' && G.tri?.up >= 1 && !G.check && !G.falling;
  triGuide.visible = on; if (!on) return;
  const spots = triPlanFeet(), feet = G.tri.feet, ok = feetOnPlan(), sp = triSpec();
  const { edges, rings, labels } = triGuide.userData, y = 0.03;
  spots.forEach((p, i) => {
    const q = spots[(i + 1) % 3], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz);
    const e = edges[i]; e.position.set((p[0] + q[0]) / 2, y, (p[1] + q[1]) / 2); e.scale.x = L - 0.68; e.rotation.z = -Math.atan2(dz, dx);
    const c = triCentre(), mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, o = norm2(mx - c[0], mz - c[1]);
    labels[i].position.set(mx + o[0] * 0.35, 0.2, mz + o[2] * 0.35);
    const tx = triGuide.userData.texFor(`${(Math.round(sp.apart[i] * 100) / 100).toFixed(sp.ninety ? 2 : 1)} מ׳`); if (labels[i].material.map !== tx) { labels[i].material.map = tx; labels[i].material.needsUpdate = true; }
    const on = Math.hypot(feet[i][0] - p[0], feet[i][1] - p[1]) < 0.05;
    rings[i].position.set(p[0], y, p[1]);
    rings[i].material.color.setHex(on ? 0x3f8a2e : 0xe0a93b);
  });
  edges[0].material.color.setHex(ok ? 0x3f8a2e : 0x2f63b0);
}
// a lashing's coils (made the first time a joint needs them: free build has joints of its own)
function lashMesh(id) {
  if (!lashMeshes[id]) { const g = makeLashing(); g.visible = false; KM[G.ki].group.add(g); lashMeshes[id] = g; }
  return lashMeshes[id];
}
function useKlaf(i) {
  G.ki = i;
  { const x = LV.free ? (G.klafim[i].cfg.x0 || 0) : 0; curGroup.position.x = x; if (KM[i].group) KM[i].group.position.x = x; }
  // free build: every klaf is its own design, and the shared plan follows the current klaf
  if (LV.free) { const pl = G.klafim[i].plan; setPlan(pl.slots, pl.joints); }
  // a level whose klafim differ (the carousel's gate and back klaf): the plan follows too
  else if (LV.klafim[i]?.plan) { const pl = LV.klafim[i].plan; if (SLOTS[0] !== pl.slots[0] || SLOTS.length !== pl.slots.length || JOINTS[JOINTS.length - 1] !== pl.joints[pl.joints.length - 1]) setPlan(pl.slots, pl.joints); }
  ({ blueprint, poles: poleMeshes, lash: lashMeshes, stakes: stakeMeshes, ropes: guyRopes } = KM[i]);
}
// run fn for each klaf that is on the plaza, as the current klaf
function eachKlaf(fn) {
  const keep = G.ki;
  G.klafim.forEach((k, i) => { useKlaf(i); fn(k, i); });
  useKlaf(keep);
}
// the cube's side poles, lashings and side drawings
const CM = { poles: {}, lash: {}, sheets: {} };
const ghost = makePoleMesh(0);
ghost.material = ghost.material.map(m => { const c = m.clone(); c.transparent = true; c.opacity = 0.55; return c; });
ghost.castShadow = false; ghost.visible = false; curGroup.add(ghost);
const slotGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.16), new THREE.MeshBasicMaterial({ color: 0xe0a93b, transparent: true, opacity: 0.45, depthWrite: false }));
slotGlow.rotation.x = -Math.PI / 2; slotGlow.visible = false; curGroup.add(slotGlow);

for (const m of KM) {
  for (const j of [...JOINTS, ...STAKE_JOINTS]) { const g = makeLashing(); g.visible = false; scene.add(g); m.lash[j.id] = g; }
  for (const st of LEG_STAKES) { const s = makeStake(LEG_STAKE_LEN); s.visible = false; scene.add(s); m.stakes[st.id] = s; }
  for (const g of GUYS) { const s = makeStake(ANCHOR_LEN); s.visible = false; scene.add(s); m.stakes['A' + g.id] = s; }
  for (const g of GUYS) { m.ropes[g.id] = new RopeViz(scene); m.ropes[g.id].show(false); }
}
// each klaf's meshes in a group of their own, so a free-build structure can stand anywhere
for (const m of KM) {
  m.group = new THREE.Group(); scene.add(m.group);
  const objs = [...Object.values(m.poles).flat(), ...Object.values(m.lash), ...Object.values(m.stakes), ...(m.triStakes || []), ...Object.values(m.ropes).flatMap(r => r.segs)];
  for (const o of objs) m.group.add(o);
}
// (in a group: free build's joined klafim stand wherever the player put them)
const cubeGroup = new THREE.Group(); scene.add(cubeGroup);
let cubeMeshN = 0;
// meshes for every side pole and lashing of a cube plan (ids repeat between levels)
function ensureCubeMeshes(plan) {
  for (const s of plan.slots) if (!CM.poles[s.id]) { const a = makePoleMesh((cubeMeshN++ % 3) / 2); a.visible = false; cubeGroup.add(a); CM.poles[s.id] = [a]; }
  for (const j of plan.joints) if (!CM.lash[j.id]) { const g = makeLashing(); g.visible = false; cubeGroup.add(g); CM.lash[j.id] = g; }
}
// free build: the suggested joining poles, as see-through lines
const joinGhosts = [];
{
  for (const L of [...LEVELS.filter(l => l.cube), CUBE_LEVEL, CUBE4_LEVEL]) ensureCubeMeshes(L.cube);
  for (const side of [-1, 1]) { const m = makeSideSheet(); m.visible = false; scene.add(m); CM.sheets[side] = m; }
  { const m = makeTopSheet(); m.visible = false; scene.add(m); CM.sheets[0] = m; }
}
// the carousel's seat, mast, hanging ropes and the seat's drawing
const SM = { poles: {}, lash: {}, ropes: {}, ring: null, sheet: null };
{
  let i = 0;
  for (const sl of [...SEAT.slots, MAST]) { const a = makePoleMesh((i++ % 3) / 2); a.visible = false; scene.add(a); SM.poles[sl.id] = [a]; }
  for (const j of [...SEAT.joints, ...MAST_JOINTS]) { const g = makeLashing(); g.visible = false; scene.add(g); SM.lash[j.id] = g; }
  for (const h of HANG_ROPES) { SM.ropes[h.id] = new RopeViz(scene); SM.ropes[h.id].show(false); }
  SM.ring = new RopeViz(scene); SM.ring.show(false);
  SM.sheet = makeSeatSheet(SEAT, SEAT_C); scene.add(SM.sheet);
  // where the mast goes: a red line from the ground up through the # to the roof X's centre
  SM.guide = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 10), new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.45, depthWrite: false }));
  SM.guide.visible = false; scene.add(SM.guide);
}
useKlaf(0);

// raise roles: each walks to its post when needed and walks off after
const people = {};
['baseL', 'baseR', 'lift1', 'lift2', 'tier', ...GUYS.map(g => 'guy' + g.id)].forEach((k, i) => { people[k] = new Actor(scene, i); });
// the work crew: carries poles and drives stakes
const crew = makeCrew(scene, 8);
const allActors = [...Object.values(people), ...crew];
for (const a of allActors) curGroup.add(a.mesh); // the crew works on the current structure
window.CREW = CREW;

// the מדריך who runs the inspection (מסדר): a scout leader in a wide-brimmed hat
const inspector = new Actor(scene, 3, { noCap: true });
{
  const mat = new THREE.MeshStandardMaterial({ color: 0x5b4a2c, roughness: 0.9 });
  const hat = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.025, 18), mat);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.16, 14), mat); crown.position.y = 0.075;
  hat.add(brim, crown); hat.position.y = 1.06;
  inspector.mesh.userData.torso.add(hat);
  allActors.push(inspector); curGroup.add(inspector.mesh);
}
// the inspection's buckets of water, one per klaf
const buckets = [0, 1, 2].map(() => {
  const g = new THREE.Group();
  const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.24, 14), new THREE.MeshStandardMaterial({ color: 0x5f86b8, roughness: 0.5, metalness: 0.3 }));
  pail.position.y = -0.5; pail.castShadow = true;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.38, 5), new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 1 }));
  rope.position.y = -0.19;
  g.add(pail, rope); g.visible = false; curGroup.add(g);
  return g;
});
const pushArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.8, 0xe2593f, 0.25, 0.16);
pushArrow.visible = false; curGroup.add(pushArrow);

// markers are drawn as camera-facing rings; taps pick the nearest one on screen
function ringTexture(color, glyph) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 16; g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = color; g.lineWidth = 10; g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2); g.stroke();
  g.fillStyle = color; g.font = '700 46px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (glyph) g.fillText(glyph, 64, 66); else { g.beginPath(); g.arc(64, 64, 9, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const markerTex = {
  lash: ringTexture('#ffc046'),
  stake: ringTexture('#ff7a45', '▼'),
  guy: ringTexture('#7fd0ff', '∞'),
  foot: ringTexture('#7fd0ff', '↔'),
  off: ringTexture('#ff8d8d', '✕'),
  climb: ringTexture('#7fd0ff', '▲'),
  harness: ringTexture('#ffc046', '⚲'),
};
const markerPool = [];
function markerSprite(i) {
  if (!markerPool[i]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTex.lash, depthTest: false, transparent: true, sizeAttenuation: false }));
    s.renderOrder = 10; curGroup.add(s); markerPool[i] = s;
  }
  return markerPool[i];
}

// ---------------- geometry helpers ----------------
const add3 = (a, n, k) => [a[0] + n[0] * k, a[1] + n[1] * k, a[2] + n[2] * k];
// the current klaf's plane -> world
function kw(u, v, a = 0) { const p = klafToWorld(u, v, a); p[2] += z0(); return p; }
const layerOff = slot => (slot.layer + 1) * GAP;
function visNormal() {
  const n = G.sim?.normal;
  return n ? [-n[0], -n[1], -n[2]] : [0, 1, 0];
}
function poleSegs(sid) {
  if (triShape() && G.tri.up > 0) return triLegSegs(sid);
  const slot = slotById(sid);
  const off = layerOff(slot);
  if (G.sim) {
    const P = G.sim.poleParticles[sid]; if (!P) return null;
    const n = visNormal();
    const f = q => add3(G.sim.pos(q.id), n, off);
    if (sid.startsWith('diag')) { const c = P.find(q => Math.abs(q.s) < 1e-6); return [[f(P[0]), f(c)], [f(c), f(P[P.length - 1])]]; }
    return [[f(P[0]), f(P[P.length - 1])]];
  }
  const pole = G.build.poles[sid]; if (!pole) return null;
  const a = slotPoint(slot, -pole.length / 2), b = slotPoint(slot, pole.length / 2);
  return [[add3(kw(a[0], a[1]), [0, 1, 0], off), add3(kw(b[0], b[1]), [0, 1, 0], off)]];
}
function poleDir(sid) {
  const s = poleSegs(sid); if (!s) return [0, 1, 0];
  const a = s[0][0], b = s[s.length - 1][1];
  return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
}
function jointPos(j) {
  if (triShape() && G.tri.up > 0) return triApex();
  const off = (layerOff(slotById(j.a)) + layerOff(slotById(j.b))) / 2;
  if (G.sim) {
    const id = G.sim.findParticle(j.a, slotParam(slotById(j.a), j.at));
    if (id == null) return null;
    return add3(G.sim.pos(id), visNormal(), off);
  }
  return add3(kw(j.at[0], j.at[1]), [0, 1, 0], off);
}
function legPoint(leg, v) {
  const slot = slotById(leg);
  if (G.sim) {
    const id = G.sim.findParticle(leg, legS(slot, v)); if (id == null) return null;
    return add3(G.sim.pos(id), visNormal(), layerOff(slot));
  }
  return add3(kw(legU(slot, v), v), [0, 1, 0], layerOff(slot));
}
function legTop(leg) {
  const pole = G.build.poles[leg]; if (!pole) return null;
  return legPoint(leg, legTopV(slotById(leg), pole.length));
}
const stakeZ = () => z0() - GAP; // leg stakes stand beside the raised legs
function stakeTopPos(st) {
  const hits = G.build.stakes[st.id] || 0;
  return [st.u, LEG_STAKE_LEN - 0.3 * Math.min(hits, LEG_STAKE_HITS) / LEG_STAKE_HITS, stakeZ()];
}
// where a guy line's stake stands, for the current klaf
function anchorPos(g) {
  return guyAnchor(K().cfg, g);
}
// inner guy lines stand inside the cube: +1 the back ones, −1 the front ones, 'both' for a middle klaf
const innerSide = (cfg, g) => cfg.inner === 'both' || (cfg.inner !== 0 && Math.sign(g.side) === cfg.inner);
const isInnerGuy = g => innerSide(K().cfg, g);

// ---------------- UI: stage chips ----------------
const stagesEl = $('stages');
function makeChips() {
  stagesEl.innerHTML = '';
  STAGES.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.stage = s.key;
    b.innerHTML = `<span class="n">${i + 1}</span>`;
    b.title = s.he; b.setAttribute('aria-label', s.he);
    b.addEventListener('click', () => goStage(s.key));
    stagesEl.appendChild(b);
  });
  $('level-name').textContent = LV.name;
  $('level-no').textContent = LV.sketch ? 'לפי שרטוט' : LV.free ? 'ארגז חול' : LV.challenge ? 'אתגר' : `שלב ${LV.number}`;
  $('btn-folder').hidden = !!LV.free && !LV.sketch;
}
makeChips();
// stageDone('anchor') asks about the current klaf; a key like 'anchor:1' names the klaf
function stageDone(key) {
  const st = STAGES.find(s => s.key === key);
  if (st && st.k != null && st.k !== G.ki) { const keep = G.ki; useKlaf(st.k); const d = stageDone(st.id); useKlaf(keep); return d; }
  const id = st ? st.id : key;
  if (id === 'cube') return !!G.cube && !!LV.cube && (LV.cube.free ? countTrue(G.cube.build.joints) > 0 : cubeComplete());
  if (id === 'seat') return !!G.seat && seatPolesIn() && SEAT.joints.every(j => G.seat.build.joints[j.id]);
  if (id === 'hang') return !!G.seat && hangReady();
  if (id === 'wheel') return !!G.wheel && rigDone('wheel');
  if (id === 'wlift') return !!G.wheel && G.wheel.lift >= 1;
  if (id === 'gond') return !!G.wheel && rigDone('seat') && G.wheel.seatLift >= 1 && SEAT_ROPES.every(h => G.wheel.ropes[h.id]);
  if (id === 'unguy') return !!G.cube && G.klafim.every((k, i) => GUYS.every(g => !innerSide(k.cfg, g) || k.build.guyOff[g.id]));
  if (id === 'spread') return !!G.tri && G.tri.up >= 1 && feetOnPlan() && triGuysFixed();
  if (id === 'brace') return !!G.tri && G.tri.up >= 1 && BRACES.every(q => G.tri.braces[q.id]) && BRACE_JOINTS.every(q => G.tri.joints[q.id])
    && TRI_STAKES.every(q => (G.tri.stakes[q.id] || 0) >= TRI_STAKE_HITS) && TRI_STAKE_JOINTS.every(q => G.tri.stakeJoints[q.id]);
  const b = G.build;
  // a free klaf is ready for the raise once it has its two legs; the rest is the player's call
  if (id === 'build' && freeKlaf()) return !!(b.poles.legL && b.poles.legR);
  if (id === 'build') return SLOTS.every(s => b.poles[s.id]) && JOINTS.every(j => b.joints[j.id]);
  if (id === 'stakes') return LEG_STAKES.every(s => (b.stakes[s.id] || 0) >= LEG_STAKE_HITS);
  if (id === 'raise') return G.raisedOnce;
  if (id === 'anchor') return G.sim && GUYS.every(g => b.guyTies[g.id]) && STAKE_JOINTS.every(s => b.stakeJoints[s.id]);
  if (id === 'check') return !!G.result;
  return false;
}
function refreshChips() {
  for (const el of stagesEl.children) {
    el.classList.toggle('on', el.dataset.stage === G.stageKey);
    el.classList.toggle('done', stageDone(el.dataset.stage));
  }
}

// ---------------- stage changes ----------------
// key: a stage key ('raise:1', 'cube'), or a stage id meaning the current klaf's stage ('anchor')
function goStage(key) {
  if (G.falling) return;
  const st = STAGES.find(s => s.key === key) || STAGES.find(s => s.id === key && (s.k == null || s.k === G.ki));
  if (!st) return;
  const id = st.id;
  if (G.challenge?.kind === 'fix' && id !== 'build') return flashHint('בתיקון המחנה עובדים על הקלפים שעל הקרקע. כשמסיימים מזמינים את המדריך');
  if (st.k != null) {
    if (st.k !== G.ki) { clearJobs(); selectPole(null); camMode = null; }
    leaveCube();
    useKlaf(st.k);
  }
  if (triOn() && (LV.tripod || st.k != null) || LV.wheel && st.k != null) {
    if (id === 'build') {
      if (G.tri.up > 0 || G.tri.raising) return confirmCard('להשכיב את החצובה?', 'כדי לשנות את הרגליים או את כפיתת החצובה צריך להשכיב אותה חזרה על הקרקע. החיזוקים והבז״נטים יורדים.', 'להשכיב', () => { layTripod(); goStage(st.key); });
    } else {
      if (!stageDone(st.k != null ? STAGES.find(s => s.id === 'build' && s.k === st.k).key : 'build')) { infoCard('קודם כופתים את החצובה על הקרקע', 'מניחים שלוש רגליים זו לצד זו וכופתים אותן יחד ליד הראש. רק אז אפשר להקים.'); return; }
      if (id !== 'spread' && G.tri.up < 1) { infoCard('קודם מקימים את החצובה', 'חיזוקים ובז״נטים מוסיפים לחצובה שכבר עומדת, כשהרגליים שלה במקומן.'); return; }
      if (id !== 'spread' && feetOnPlan() && !triGuysFixed()) { infoCard('קודם מקבעים את היתרים', 'כל יתר נכפת לרבז שלו בקיבוע, כמו בקלף. הקישו על כל רבז.'); return; }
      if (id !== 'spread' && !feetOnPlan()) { infoCard('קודם מעמידים את הרגליים במקומן', `בשרטוט יש ${apartText()}. גוררים כל רגל אל העיגול שלה על הקרקע.`); return; }
      selectPole(null); G.tri.sim = null;
    }
  } else if (st.k != null) {
    if (id === 'build' && G.sim && G.sim.angle() > 12 && !G.falling) {
      return confirmCard('להוריד את הקלף לקרקע?', 'כדי לשנות סנדות צריך להשכיב את הקלף חזרה על השרטוט. הבז״נטים נשארים במקומם.', 'להוריד', () => { lowerKlaf(); goStage(st.key); });
    }
    if (id === 'build' && G.sim) lowerKlaf();
    if (id !== 'build') { selectPole(null); if (!G.sim) startSim(); }
  } else if (LV.free && id === 'cube') {
    if (!enterFreeJoin()) return;
  } else if (LV.cube || LV.wheel) {
    if (LV.wheel && wheelStage(id) && !G.klafim.every((k, i) => stageDone(STAGES.find(q => q.id === 'brace' && q.k === i).key) && k.tri.up >= 1)) {
      infoCard('קודם מקימים את שתי החצובות', 'הגלגל נח על ראשי שתי החצובות. קודם מקימים כל חצובה, מעמידים את הרגליים שלה במקומן, ומוסיפים חיזוקים ובז״נטים.'); return;
    }
    if (LV.wheel && id === 'wheel' && G.wheel.lift > 0 && !G.check) {
      return confirmCard('להוריד את הגלגל?', 'כדי לשנות את הגלגל מורידים אותו מראשי החצובות חזרה לקרקע. המושב יורד ממנו, והחבלים שלו מותרים.', 'להוריד', () => { lowerWheel(); goStage('wheel'); });
    }
    if (LV.wheel && id === 'gond' && G.wheel.lift < 1) { infoCard('קודם מרימים את הגלגל', 'המושב נבנה על הקרקע מתחת לגלגל, ונתלה על סנדת הפינה התחתונה שלו. קודם בונים את הגלגל ומרימים אותו אל ראשי החצובות.'); return; }
    if (LV.carousel && id === 'seat' && G.seat.lift > 0 && !G.check) {
      return confirmCard('להוריד את המושב?', 'כדי לשנות את המושב מורידים אותו חזרה לקרקע. התורן, החבלים והכפיתות שלו יורדים, והסנדה חוזרת לערימה.', 'להוריד', () => { lowerSeat(); goStage('seat'); });
    }
    if (LV.cube && !enterCube()) return;
    if (id !== 'cube') selectPole(null);
  } else {
    selectPole(null); if (!G.sim && !triOn()) startSim();
  }
  G.stage = id; G.stageKey = st.key; G.armed = null; hideRaiseIcon();
  closePicker();
  $('tray').hidden = id !== 'build' && id !== 'cube' && id !== 'brace' && !seatStage(id) && !rigStage(id);
  $('rope-panel').hidden = id !== 'raise';
  $('crew-panel').hidden = id !== 'raise' && !heightPanelOn();
  if (id !== 'build' && id !== 'cube' && !seatStage(id) && !rigStage(id)) $('length-panel').hidden = true;
  // close enough to tap the small parts in stages with fine work, far and high otherwise
  setCameraMode(triOn() && id !== 'build' ? (id === 'brace' ? 'triWork' : 'triView') : id === 'build' ? 'buildView' : (id === 'stakes' || id === 'anchor' || id === 'unguy') ? 'workView' : id === 'seat' ? 'seatView' : id === 'gond' ? 'gondView' : (id === 'wheel' || id === 'wlift') ? 'wheelView' : (id === 'cube' || id === 'hang') ? 'cubeView' : 'orbit');
  refreshChips(); refreshActions(); refreshHint(); renderPile();
}
const nextStage = () => STAGES[STAGES.findIndex(s => s.key === G.stageKey) + 1];
// ---- the cube (level 2) ----
// joining the klafim needs both of them raised and anchored; the cube's
// simulation is rebuilt from the builds each time it is needed
function enterCube() {
  const ready = G.klafim.every((k, i) => k.raisedOnce && stageDone(STAGES.find(s => s.id === 'anchor' && s.k === i).key));
  if (!ready) { infoCard(LV.klafim.length > 2 ? 'קודם מרימים ומעגנים את כל הקלפים' : 'קודם מרימים ומעגנים את שני הקלפים', 'את הקובייה מחברים בין קלפים שכבר עומדים, כשהיתרים שלהם מקובעים לבז״נטים והרגליים כפותות לבז״נטים.'); return false; }
  if (!G.cube.sim) {
    clearJobs();
    G.cube.sim = new CubeSim(G.klafim.map(k => ({ build: k.build, cfg: k.cfg })), LV.cube, G.cube.build);
    G.klafim.forEach((k, i) => { k.sim = G.cube.sim.klafim[i]; });
    rec.length = 0;
  }
  return true;
}
// back to a klaf stage: each raised klaf stands again on its own
function leaveCube() {
  if (!G.cube?.sim) return;
  G.cube.sim = null;
  // (each with its own plan: free-build klafim differ)
  const keep = G.ki;
  G.klafim.forEach((k, i) => { if (k.raisedOnce && !k.tri) { useKlaf(i); k.sim = new KlafSim(k.build, k.cfg); k.sim.standUp(); } });
  useKlaf(keep);
  rec.length = 0;
}
function rebuildCube() { if (G.cube?.sim) { G.cube.sim = null; if (LV.free) enterFreeJoin(); else enterCube(); } }
// Free build: the klafim of the longest row are joined (Omer, 2026-11-21). The plan is made
// from where they stand and from their legs, every time the joining starts, and the
// poles already put in that still fit it stay.
function enterFreeJoin() {
  const row = freeRows(LV.klafim)[0];
  if (!row) { infoCard('אין קלפים לחבר', 'מחברים קלפים שעומדים זה מאחורי זה באותו קו. גוררים קלף אל מאחורי קלף אחר עד שהוא נצמד לקו שלו.'); return false; }
  const ready = row.every(i => G.klafim[i].raisedOnce && stageDone(STAGES.find(s => s.id === 'anchor' && s.k === i).key));
  if (!ready) { infoCard('קודם מרימים ומעגנים את הקלפים', 'מחברים קלפים שכבר עומדים, כשהיתרים שלהם מקובעים לבז״נטים.'); return false; }
  if (!G.cube.sim) {
    clearJobs();
    const plan = freeJoinPlan(row.map(i => { const sl = G.klafim[i].plan.slots; return { z0: LV.klafim[i].z0, legL: sl.find(q => q.id === 'legL'), legR: sl.find(q => q.id === 'legR') }; }), LEVEL.poleRadius);
    plan.members = row; plan.x0 = LV.klafim[row[0]].x0 || 0;
    if (LV.cube?.free) for (const id in G.cube.build.poles) if (!plan.slots.some(q => q.id === id)) delete G.cube.build.poles[id];
    if (LV.cube?.free) for (const id in G.cube.build.joints) if (!plan.joints.some(q => q.id === id)) delete G.cube.build.joints[id];
    LV.cube = plan; spotCache = null;
    ensureCubeMeshes(plan);
    // the legs need a point at every height a side pole is lashed to them; each klaf's sim is built with its own plan
    row.forEach((i, n) => { LV.klafim[i].extraLegV = plan.legV[n]; });
    const ks = row.map(i => ({ build: G.klafim[i].build, cfg: G.klafim[i].cfg, i }));
    const keep = G.ki;
    G.cube.sim = new CubeSim(ks.map(k => ({ build: k.build, cfg: k.cfg, prep: () => useKlaf(k.i) })), plan, G.cube.build);
    useKlaf(keep);
    row.forEach((i, n) => { G.klafim[i].sim = G.cube.sim.klafim[n]; });
    rec.length = 0;
  }
  useKlaf(LV.cube.members[0]);
  cubeGroup.position.x = LV.cube.x0;
  return true;
}
function cubeSides() {
  const b = G.cube.build;
  const done = side => LV.cube.slots.filter(s => s.side === side).every(s => b.poles[s.id]) && LV.cube.joints.filter(j => j.side === side).every(j => b.joints[j.id]);
  return { [-1]: done(-1), [1]: done(1), 0: done(0) };
}
function cubeComplete() { const d = cubeSides(); return d[-1] && d[1] && d[0]; }
// Every איקס מרחבי the plan calls for (Omer, 2026-11-15): one on each side face of
// every cube, one flat in the top of every cube, and in the base one more at the
// 2 m level where the cubes meet. Each is listed with whether it is complete:
// both diagonals in place and every lashing on them tied.
function cubeXs() {
  const b = G.cube.build, c = LV.cube, bays = c.bays ?? 1, out = [];
  const one = (ids, where, side) => {
    const js = c.joints.filter(j => ids.includes(j.a) || (j.b && ids.includes(j.b) && ids.includes(j.a)));
    const missingPoles = ids.filter(id => !b.poles[id]);
    const missingJoints = js.filter(j => !b.joints[j.id] || !cubeJointReachable(j, c, b.poles)).map(j => j.id);
    out.push({ ids, where, side, ok: !missingPoles.length && !missingJoints.length, missingPoles, missingJoints, ends: js.map(j => j.id) });
  };
  if (c.xs) { for (const x of c.xs) one(x.ids, x.where, x.side); return out; }
  const bayOf = bay => bays > 1 ? (bay ? ' של הקובייה האחורית' : ' של הקובייה הקדמית') : '';
  for (let bay = 0; bay < bays; bay++) {
    const S = bay ? String(bay + 1) : '';
    for (const side of [-1, 1]) one([`C.dA${side > 0 ? 'L' : 'R'}${S}`, `C.dB${side > 0 ? 'L' : 'R'}${S}`], `${side > 0 ? 'בצד השמאלי' : 'בצד הימני'}${bayOf(bay)}`, side);
    one([`C.xAT${S}`, `C.xBT${S}`], `בחלק העליון${bayOf(bay)}`, 0);
    if (bay < bays - 1) one([`C.xAK${bay ? bay + 1 : ''}`, `C.xBK${bay ? bay + 1 : ''}`], 'בגובה 2 מ׳, בחיבור בין הקוביות', 0);
  }
  return out;
}
function startSim() {
  G.sim = new KlafSim(G.build, K().cfg);
  G.uprightFor = 0;
}
function lowerKlaf() {
  clearJobs(); rec.length = 0;
  G.sim = null; G.raisedOnce = false; G.check = null; G.result = null;
  G.build.stakeJoints = {}; G.build.guyTies = {};
  pushArrow.visible = false;
}

// ---------------- camera ----------------
// Everything happens in 3D on the plaza. Each stage has a starting view;
// the player can always orbit, pan and zoom.
let camMode = null, camTween = null, closeup = null;
function stagePose(mode) {
  const aspect = window.innerWidth / window.innerHeight;
  // narrower screens step back a little; free build's sheet is bigger than a 2×2 klaf
  // (the carousel's 5 m cube is seen from further away, aimed higher)
  const S = LV.camScale ?? 1;
  const far = (aspect < 1.6 ? 1.25 : 1) * S * (freeKlaf() ? (mode === 'buildView' ? 1.55 : Math.max(1, LEVEL.height / 2 * 1.1)) : 1);
  // Omer's reference: a fixed high three-quarter view (about 50 to 60 degrees up),
  // turned about 45 degrees so the structure is seen corner-on, through a narrow lens
  const at = (target, dist, elev, azim) => (target.x += X0(), { target, pos: target.clone().add(new THREE.Vector3(Math.sin(azim) * Math.cos(elev), Math.sin(elev), -Math.cos(azim) * Math.cos(elev)).multiplyScalar(dist * far)) });
  const z = LV.cube && cubeStage(G.stage) ? (LV.cube.zA ?? 0) + (LV.cube.span ?? LV.cube.depth) / 2 : z0();
  if (triOn()) {
    const c = triCentre();
    if (mode === 'buildView') return at(new THREE.Vector3(0, 0, z + 2.3), 23, 1.08, 0.5);
    if (mode === 'triWork') return at(new THREE.Vector3(c[0], 0.6, c[1]), 17, 0.85, 0.72);
    return at(new THREE.Vector3(c[0], 1.6, c[1]), 25, 0.8, 0.72);
  }
  if (mode === 'seatView') return at(new THREE.Vector3(SEAT_C[0], 0.2, SEAT_C[1]), 6.5, 1.12, 0.6);
  if (mode === 'wheelView') return at(new THREE.Vector3(0, 1.6, WHEEL_Z), 17, 0.6, 0.42);
  if (mode === 'gondView') return at(new THREE.Vector3(WSEAT_C[0], 1.3, WSEAT_C[1]), 17, 0.62, 0.45);
  if (mode === 'buildView') return at(new THREE.Vector3(0, 0, z + (LV.free ? 2.5 : 1.0 * S)), 16.5, 1.08, 0.5);
  if (mode === 'workView') return at(new THREE.Vector3(0, 0.6 * S, z + 0.2), 15, 0.95, 0.72);
  if (mode === 'cubeView') return at(new THREE.Vector3(0, 0.9 * S, z), 17 + 4 * ((LV.cube?.bays ?? 1) - 1) + (LV.cube?.free ? 2.5 * Math.max(0, LV.cube.span - 2) : 0), 0.92, 0.78);
  return at(new THREE.Vector3(0, 0.7 * S, z + 0.4), 26, 0.98, 0.78);
}
function setCameraMode(mode) {
  // a stage change during a lashing close-up: finish the tie at once and leave the close-up
  const wasClose = !!closeup;
  if (closeup) {
    if (closeup.phase === 'in' && camTween?.onDone) { const done = camTween.onDone; camTween = null; done(); }
    closeup = null;
  }
  if (mode === camMode && camTween == null && !wasClose) return;
  const p = stagePose(mode);
  camMode = mode;
  camTween = { t: 0, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos: p.pos, toTarget: p.target, dur: 0.45 };
  controls.enabled = false;
}
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
function updateCamera(dt) {
  const tw = camTween;
  if (tw) {
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    const k = ease(tw.t);
    camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
    controls.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
    camera.up.set(0, 1, 0);
    camera.lookAt(controls.target);
    if (tw.t >= 1) {
      camTween = null;
      if (tw.onDone) tw.onDone();
      else { controls.enabled = true; controls.update(); }
    }
    return;
  }
  if (closeup) return;
  controls.update();
}
// short close-up of a lashing being tied, then back to where the player was
function lashCloseup(pos, onTied, hold = 420, withTier = true) {
  const P = new THREE.Vector3(...pos);
  const back = { pos: camera.position.clone(), target: controls.target.clone() };
  // come in low and from the side, so both the coils and the scout tying them are in view
  const dir = camera.position.clone().sub(P); dir.y = 0;
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
  dir.normalize();
  // a short, pulled-back look from above: the coils and the scout both in view
  const near = P.clone().addScaledVector(dir, withTier ? 4.6 : 2.8).add(new THREE.Vector3(0, withTier ? 6.0 : 3.7, 0));
  const look = withTier ? P.clone().add(new THREE.Vector3(0, 0.5, 0)).addScaledVector(dir, -0.15) : P;
  const mine = closeup = { phase: 'in', tier: withTier ? pos : null };
  camTween = {
    t: 0, dur: 0.22, fromPos: back.pos.clone(), fromTarget: back.target.clone(), toPos: near, toTarget: look,
    onDone: () => {
      closeup.phase = 'tie';
      onTied();
      setTimeout(() => {
        if (closeup !== mine) return; // the stage changed meanwhile: its camera move wins
        camTween = { t: 0, dur: 0.22, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos: back.pos, toTarget: back.target,
          onDone: () => { closeup = null; controls.enabled = true; controls.update(); } };
      }, hold);
    },
  };
  controls.enabled = false;
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
{ const p = stagePose('buildView'); camera.position.copy(p.pos); controls.target.copy(p.target); camera.lookAt(p.target); }

// ---------------- screen picking ----------------
// toScreen and groundAt work in the current structure's own frame (shifted by x0 in free build)
function toScreen(p) {
  const v = new THREE.Vector3(p[0] + X0(), p[1], p[2]).project(camera);
  if (v.z > 1) return null;
  return [(v.x + 1) / 2 * window.innerWidth, (1 - v.y) / 2 * window.innerHeight];
}
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundAt(x, y) {
  const out = groundWorld(x, y); if (out) out.x -= X0();
  return out;
}
function groundWorld(x, y) {
  const ndc = new THREE.Vector2(x / window.innerWidth * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const out = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, out) ? out : null;
}

// the list of things that can be tapped right now
let targets = [];
function collectTargets() {
  const T = [];
  const st = G.stage, sim = G.sim, b = G.build;
  const busy = G.falling || G.check?.running;
  if (!busy && triOn() && st !== 'build') collectTriTargets(T);
  else if (!busy && LV.cube && cubeStage(st)) collectCubeTargets(T);
  else if (LV.wheel && (wheelStage(st) || st === 'check')) { if (!busy && wheelStage(st)) collectWheelTargets(T); }
  else if (!busy) {
    // klaf lashings: tie (ring) or change (on the coil)
    // lashings on the klaf can only be tied or changed while it lies on the ground
    const klafDown = !sim || sim.angle() < 8;
    for (const j of JOINTS) {
      if (!klafDown || G.carrying[j.a] || G.carrying[j.b]) continue;
      if (!jointReachable(j, b.poles)) continue;
      if (j.all && !j.all.every(id => jointReachable({ a: id, b: id, at: j.at }, b.poles))) continue; // one lashing round several poles
      const p = jointPos(j); if (!p) continue;
      // fixing the broken camp: every joint gets a ring, so a ring alone does not give a fault away
      T.push({ kind: b.joints[j.id] ? 'lashed' : 'joint', id: j.id, pos: p, show: !b.joints[j.id] || G.challenge?.kind === 'fix' });
    }
    // leg stakes
    if (st !== 'build') for (const s of LEG_STAKES) {
      if ((b.stakes[s.id] || 0) >= LEG_STAKE_HITS) continue;
      if (sim && sim.angle() > 8) continue;
      T.push({ kind: 'stake', id: s.id, pos: [s.u, 0.12, stakeZ()], show: true });
    }
    if (sim && st === 'raise' && sim.angle() < 8) for (const g of GUYS) {
      if (b.guyTop[g.id]) continue;
      const p = legTop(g.leg); if (!p) continue;
      T.push({ kind: 'guyTop', id: g.id, pos: add3(p, [0, 0, 1], g.side * 0.12), show: true });
    }
    if (sim && (st === 'anchor' || st === 'check' || st === 'raise')) for (const g of GUYS) {
      const a = anchorPos(g);
      if ((b.anchors[g.id] || 0) < ANCHOR_HITS) {
        if (st !== 'raise') T.push({ kind: 'anchor', id: g.id, pos: [a[0], 0.12, a[2]], show: true });
      } else if (b.guyTop[g.id] && !sim.guys[g.id]?.tied && sim.angle() > 70) {
        T.push({ kind: 'guyTie', id: g.id, pos: [a[0], 0.4, a[2]], show: true });
      }
    }
    if (sim && sim.angle() > 70 && st !== 'build') for (const sj of STAKE_JOINTS) {
      const stake = LEG_STAKES.find(s => s.leg === sj.leg);
      if ((b.stakes[stake.id] || 0) < LEG_STAKE_HITS || !b.poles[sj.leg]) continue;
      const p = legPoint(sj.leg, sj.v); if (!p) continue;
      const mid = [(p[0] + stake.u) / 2, p[1], (p[2] + stakeZ()) / 2];
      T.push({ kind: b.stakeJoints[sj.id] ? 'stakeLashed' : 'stakeJoint', id: sj.id, pos: mid, show: !b.stakeJoints[sj.id] });
    }
  }
  targets = T;
  // draw rings
  let k = 0;
  for (const t of T) {
    if (!t.show) continue;
    const s = markerSprite(k++);
    s.visible = true;
    s.position.set(...t.pos);
    s.material.map = t.kind === 'hspot' ? markerTex.climb : t.kind === 'harness' ? markerTex.harness : t.kind === 'stake' || t.kind === 'anchor' || t.kind === 'tstake' || t.kind === 'tanchor' ? markerTex.stake : t.kind === 'foot' ? markerTex.foot : t.kind === 'guyOff' ? markerTex.off : (t.kind === 'guyTop' || t.kind === 'guyTie' || t.kind === 'tguyTop' || t.kind === 'tguyTie' || t.kind === 'pivot' || t.kind === 'hrope' || t.kind === 'wrope') ? markerTex.guy : markerTex.lash;
    const pulse = 1 + 0.12 * Math.sin(performance.now() / 260);
    const base = 0.05;
    s.scale.setScalar(base * pulse);
    if (picker.target && picker.target.id === t.id) s.scale.setScalar(base * 1.5);
  }
  for (let i = k; i < markerPool.length; i++) markerPool[i].visible = false;
}
// level 2: lashings of the side poles, and the inner guy lines to take down
function collectCubeTargets(T) {
  const cb = G.cube.build;
  if (G.stage === 'cube') for (const j of LV.cube.joints) {
    if (G.cube.carrying[j.a] || (j.b && G.cube.carrying[j.b])) continue;
    if (!cubeJointReachable(j, LV.cube, cb.poles)) continue;
    const p = cubeJointPos(j); if (!p) continue;
    T.push({ kind: cb.joints[j.id] ? 'clashed' : 'cjoint', id: j.id, pos: p, show: !cb.joints[j.id] });
  }
  collectHeightTargets(T);
  if (LV.carousel && seatStage(G.stage)) collectSeatTargets(T);
  if (LV.wheel && wheelStage(G.stage)) collectWheelTargets(T);
  if (G.stage === 'unguy') eachKlaf(k => {
    for (const g of GUYS) {
      if (!isInnerGuy(g) || G.build.guyOff[g.id] || !G.sim?.guys[g.id]) continue;
      const a = anchorPos(g);
      T.push({ kind: 'guyOff', id: g.id, klaf: G.ki, pos: [a[0], 0.4, a[2]], show: true });
    }
  });
}
function pickTarget(x, y) {
  let best = null, bd = 34;
  for (const t of targets) {
    const sp = toScreen(t.pos); if (!sp) continue;
    // when rings sit close together, the one still to be tied wins
    const d = Math.hypot(sp[0] - x, sp[1] - y) - (t.show ? 10 : 0);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}
function pickPole(x, y) {
  let best = null, bd = 26;
  const rig = rigStage(G.stage);
  const list = rig ? rigPart().filter(q => G.wheel.build.poles[q.id]) : seatStage(G.stage) && LV.carousel ? [...SEAT.slots, MAST].filter(q => G.stage === 'hang' ? q === MAST : q !== MAST) : G.stage === 'cube' ? LV.cube.slots : SLOTS;
  for (const s of list) {
    const segs = rig ? rigSegs(s.id) : seatStage(G.stage) && LV.carousel ? seatSegs(s.id) : G.stage === 'cube' ? cubeSegs(s.id) : poleSegs(s.id); if (!segs) continue;
    for (const [a, b] of segs) {
      const A = toScreen(a), B = toScreen(b); if (!A || !B) continue;
      const d = distToSeg(x, y, A, B);
      if (d < bd) { bd = d; best = s.id; }
    }
  }
  return best;
}
function distToSeg(x, y, A, B) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const t = Math.max(0, Math.min(1, ((x - A[0]) * dx + (y - A[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - A[0] - t * dx, y - A[1] - t * dy);
}

// ---------------- canvas taps ----------------
let down = null;
canvas.addEventListener('pointerdown', e => { sfx.unlock(); down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', e => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  if (moved < 10 && performance.now() - down.t < 600) { if (G.replay) endReplay(); else onTap(e.clientX, e.clientY); }
  down = null;
});
function onTap(x, y) {
  if (G.falling || closeup || decor?.active) return;
  // a length picked from the pile goes on the line that was tapped
  if (G.armed && (G.stage === 'build' || G.stage === 'cube' || G.stage === 'brace' || seatStage(G.stage) || rigStage(G.stage))) {
    let slot = null;
    if (rigStage(G.stage)) slot = nearestRigSlot(x, y);
    else if (seatStage(G.stage)) slot = nearestSeatSlot(x, y);
    else if (G.stage === 'cube') slot = nearestCubeSlot(x, y);
    else if (G.stage === 'brace') slot = nearestBrace(x, y);
    else if (freeKlaf()) return; // free build lays the pole with a drag on the grid (see layFree)
    else { const p = groundAt(x, y); if (p) slot = nearestSlot(p.x, p.z - z0()); }
    if (slot) { G.lastLength = G.armed; placePole(slot); refreshAll(); return; }
  }
  let t = pickTarget(x, y);
  // sandbox: a tap on the klaf itself, not right on a lashing, is for the klaf (move, raise)
  if (t && LV.free && G.stage === 'build' && t.kind === 'lashed' && !onRing(x, y) && pickPole(x, y)) t = null;
  if (t) return onTarget(t, x, y);
  if (LV.free && G.stage === 'cube' && !pickPole(x, y)) {
    const slot = nearestCubeSlot(x, y);
    if (slot) { G.lastLength = slot.length; placePole(slot); flashHint(`<b>${slot.he}</b>, ${slot.length.toFixed(1)} מ׳. הקישו על הטבעות כדי לכפות אותה`); refreshAll(); return; }
  }
  if (G.stage === 'brace') { // a brace that was put in goes back to the pile with a tap
    const sid = pickBrace(x, y);
    if (sid) { delete G.tri.braces[sid]; for (const j of BRACE_JOINTS) if (j.brace === sid) delete G.tri.joints[j.id]; sfx.tick(); flashHint('החיזוק חזר לערימה'); return refreshAll(); }
  }
  if (G.stage === 'build' || G.stage === 'cube' || (LV.carousel && seatStage(G.stage)) || rigStage(G.stage)) {
    const sid = pickPole(x, y);
    if (sid && LV.free && G.stage === 'build') {
      closePicker(); selectPole(sid);
      // a finished klaf opens its raise icon; an unfinished one says what it still needs
      if (freeReady()) showRaiseIcon();
      else if (poleLashed(sid)) { const m = freeMissing(); if (m) flashHint(m); }
      return;
    }
    if (sid) { closePicker(); return selectPole(sid); }
    if (LV.free && G.stage === 'build') { const k = pickOtherKlaf(x, y); if (k != null) { hideRaiseIcon(); return goStage(`build:${k}`); } }
  }
  hideRaiseIcon();
  closePicker(); selectPole(null);
}
function onTarget(t, x, y) {
  startClock();
  const b = G.build;
  switch (t.kind) {
    case 'joint': case 'lashed': return openPicker(t, x, y);
    case 'stakeJoint': case 'stakeLashed': return openPicker(t, x, y);
    case 'stake': requestDrive('leg', t.id); break;
    case 'anchor': requestDrive('anchor', t.id); break;
    case 'guyTop': {
      b.guyTop[t.id] = true;
      G.sim?.addGuy(GUYS.find(g => g.id === t.id));
      sfx.lash();
      break;
    }
    case 'cjoint': case 'clashed': { const msg = heightBlock(cubeJoint(t.id)); if (msg) return flashHint(msg); return openPicker(t, x, y); }
    case 'harness': { const c = G.height.climbers.find(q => q.role === t.id); if (c) clipHarness(c); break; }
    case 'hspot': moveClimber(t.spot); break;
    case 'guyTie': return openPicker(t, x, y);
    case 'bjoint': case 'blashed': case 'tsj': case 'tsjd': return openPicker(t, x, y);
    case 'sjoint': case 'slashed': case 'mjoint': case 'mlashed': return openPicker(t, x, y);
    case 'wjoint': case 'wlashed': return openPicker(t, x, y);
    case 'wrope': {
      // the seat hangs on four ropes from the wheel's bottom corner pole
      if (ropeLeft() <= 0) return flashHint('<b>נגמרו החבלים.</b> אפשר להתיר כפיתה מיותרת כדי לקבל חבל בחזרה');
      G.wheel.ropes[t.id] = true; sfx.lash(); buzz(12);
      break;
    }
    case 'pivot': {
      // the mast hangs from the roof X's centre on a rope ring, so it can turn
      if (ropeLeft() <= 0) return flashHint('<b>נגמרו החבלים.</b> אפשר להתיר כפיתה מיותרת כדי לקבל חבל בחזרה');
      lashCloseup(t.pos, () => { G.seat.pivot = true; G.tying = { id: 'S.ring', t: 0 }; sfx.lash(); refreshAll(); }, 420, false);
      return;
    }
    case 'hrope': {
      if (ropeLeft() <= 0) return flashHint('<b>נגמרו החבלים.</b> אפשר להתיר כפיתה מיותרת כדי לקבל חבל בחזרה');
      G.seat.ropes[t.id] = true; sfx.lash(); buzz(12);
      break;
    }
    case 'tguyTop': G.tri.guys.top[t.id] = true; sfx.lash(); buzz(12); break;
    case 'tanchor': G.tri.guys.hits[t.id] = (G.tri.guys.hits[t.id] || 0) + 1; sfx.hammer(); buzz(15); fun.shake(0.015, 0.12); fun.dust(t.pos, 4, 0.35); break;
    case 'tguyTie': return openPicker(t, x, y);
    case 'tstake': G.tri.stakes[t.id] = (G.tri.stakes[t.id] || 0) + 1; sfx.hammer(); buzz(15); fun.shake(0.015, 0.12); fun.dust(t.pos, 4, 0.35); break;
    case 'foot': flashHint('<b>גררו את הרגל</b> על הקרקע כדי להזיז אותה'); break;
    case 'guyOff': {
      // an inner guy line comes down: untie it from its stake
      const keep = G.ki; useKlaf(t.klaf);
      G.build.guyOff[t.id] = true;
      G.cube.sim?.removeGuy(t.klaf, t.id);
      useKlaf(keep);
      sfx.lash();
      break;
    }
  }
  refreshChips(); refreshActions(); refreshHint();
}

// ---------------- free build: designing the klaf on the grid ----------------
// The player picks a length in the pile, then drags on the grid: the pole starts
// where the finger went down and points where it is dragged. A tap stands it upright.
let lay = null;
const toKlaf = (x, y) => { const p = groundAt(x, y); return p ? [p.x, p.z - z0()] : null; };
const canLay = () => !decor?.active && freeKlaf() && G.stage === 'build' && G.armed && !G.falling && !closeup;
function layGhost(pole) {
  const h = pole.length / 2, e = k => [pole.centre[0] + pole.dir[0] * k, 0.12, pole.centre[1] + pole.dir[1] * k + z0()];
  placeCylinder(ghost, e(-h), e(h));
  ghost.visible = true;
}
canvas.addEventListener('pointerdown', e => {
  if (!canLay()) return;
  const a = toKlaf(e.clientX, e.clientY); if (!a) return;
  lay = { a, len: G.armed, pole: layPole(a, a, G.armed) };
  try { canvas.setPointerCapture(e.pointerId); } catch { /* fine without it */ }
  layGhost(lay.pole);
});
canvas.addEventListener('pointermove', e => {
  if (!lay) return;
  const b = toKlaf(e.clientX, e.clientY); if (!b) return;
  lay.pole = layPole(lay.a, b, lay.len);
  layGhost(lay.pole);
  flashHint(`סנדה של <b>${lay.pole.length.toFixed(1)} מ׳</b>${lay.pole.kind === 'v' ? ' · זקופה' : lay.pole.kind === 'h' ? ' · מאוזנת' : ' · אלכסון'}`);
});
canvas.addEventListener('pointerup', () => { if (!lay) return; const pole = lay.pole; lay = null; ghost.visible = false; freePlace(pole); });
canvas.addEventListener('pointercancel', () => { lay = null; ghost.visible = false; });
function disarm() { G.armed = null; controls.enabled = true; renderPile(); }
// ---- moving a pole that is already on the grid (Omer, 2026-11-16) ----
// A placed pole is dragged to a new spot. Once a lashing is tied on it, it stays where it is.
const poleLashed = id => JOINTS.some(j => (j.a === id || j.b === id) && G.build.joints[j.id]);
const LASHED_MSG = '<b>הסנדה הזו כבר כפותה</b> ולא זזה. כדי להזיז אותה מתירים קודם את הכפיתות שלה';
let moveDrag = null;
function onRing(x, y, r = 15) { return targets.some(t => { const sp = toScreen(t.pos); return sp && Math.hypot(sp[0] - x, sp[1] - y) < r; }); }
// ---- moving a whole structure over the plaza (Omer, 2026-11-21) ----
// A structure lying on the ground is dragged anywhere on the plaza: by the move handle beside
// it, by a pole that is already lashed, or (a tripod) by any of its legs.
let wholeDrag = null;
const canMoveWhole = () => LV.free && G.stage === 'build' && !G.sim && !(G.tri && (G.tri.up > 0 || G.tri.raising)) && !G.falling && !closeup && !decor?.active;
function startWhole(x, y) {
  const p = groundWorld(x, y); if (!p) return false;
  const c = K().cfg;
  wholeDrag = { p0: [p.x, p.z], x0: c.x0 || 0, z0: c.z0, moved: false };
  controls.enabled = false;
  return true;
}
function moveWhole(x, y) {
  const m = wholeDrag, p = groundWorld(x, y); if (!m || !p) return;
  if (!m.moved && Math.hypot(p.x - m.p0[0], p.z - m.p0[1]) < 0.15) return;
  const sn = v => Math.round(v * 10) / 10, c = K().cfg;
  // the plaza is about 30 × 26 m: a structure stays on it, lying or raised
  let nx = Math.max(-11, Math.min(11, sn(m.x0 + p.x - m.p0[0]))); const nz = Math.max(-9, Math.min(11 - (G.tri ? TRI.legLength : LEVEL.height), sn(m.z0 + p.z - m.p0[1])));
  if (!m.moved) { m.moved = true; hideRaiseIcon(); selectPole(null); closePicker(); }
  // a klaf brought near the line of another klaf snaps onto it, so the two can be joined
  if (c.kind !== 'tripod') { const o = LV.klafim.find(q => q !== c && q.kind !== 'tripod' && Math.abs((q.x0 || 0) - nx) < 0.35); if (o) nx = o.x0 || 0; }
  if (nx === (c.x0 || 0) && nz === c.z0) return;
  c.x0 = nx; c.z0 = nz; useKlaf(G.ki);
}
function endWhole() {
  const m = wholeDrag; if (!m) return; wholeDrag = null;
  if (!camTween && !closeup) controls.enabled = true;
  if (!m.moved) return;
  sfx.thud(); camMode = null; setCameraMode('buildView');
  STAGES = stageList(); makeChips(); // klafim in a row can now be joined (or no longer)
  const row = freeRows(LV.klafim).find(r => r.includes(G.ki));
  flashHint(row ? `<b>${K().cfg.he}</b> עומד בשורה אחת עם ${row.filter(i => i !== G.ki).map(i => LV.klafim[i].he).join(' ו')}. אחרי שכולם יורמו אפשר יהיה לחבר אותם` : `המקום של <b>${K().cfg.he}</b> עודכן. אפשר לגרור שוב, או להקיש על המבנה כשהוא מוכן להרמה`);
  refreshAll();
}
const moveIcon = Object.assign(document.createElement('button'), { type: 'button', id: 'move-icon', hidden: true, title: 'גררו כדי להזיז', innerHTML: '<span class="arrow">✥</span><span>גררו להזזה</span>' });
document.body.appendChild(moveIcon);
moveIcon.addEventListener('pointerdown', e => { e.preventDefault(); if (!canMoveWhole() || !startWhole(e.clientX, e.clientY)) return; try { moveIcon.setPointerCapture(e.pointerId); } catch { /* fine */ } });
moveIcon.addEventListener('pointermove', e => { if (wholeDrag) moveWhole(e.clientX, e.clientY); });
moveIcon.addEventListener('pointerup', endWhole);
moveIcon.addEventListener('pointercancel', endWhole);
function placeMoveIcon() {
  const show = canMoveWhole() && !G.armed && !wholeDrag?.moved && !G.check && $('picker').hidden && !G.selected && !G.tying && $('modal').hidden;
  moveIcon.hidden = !show; if (!show) return;
  const p = toScreen(G.tri ? [1.5, 0, z0() - 0.6] : [-(GRID.uMax + 0.9), 0, z0() - 0.8]); if (!p) { moveIcon.hidden = true; return; }
  moveIcon.style.left = Math.max(70, Math.min(window.innerWidth - 190, p[0])) + 'px';
  moveIcon.style.top = Math.max(70, Math.min(window.innerHeight - 120, p[1])) + 'px';
}
canvas.addEventListener('pointerdown', e => {
  if (!LV.free || !canMoveWhole() || G.armed || !freeTri()) return;
  const sid = pickPole(e.clientX, e.clientY); if (!sid) return;
  if (startWhole(e.clientX, e.clientY)) { try { canvas.setPointerCapture(e.pointerId); } catch { /* fine */ } }
});
canvas.addEventListener('pointermove', e => { if (wholeDrag) moveWhole(e.clientX, e.clientY); });
canvas.addEventListener('pointerup', endWhole);
canvas.addEventListener('pointercancel', endWhole);
canvas.addEventListener('pointerdown', e => {
  if (decor?.active || !freeKlaf() || G.stage !== 'build' || G.armed || G.falling || closeup || G.sim) return;
  if (onRing(e.clientX, e.clientY)) return; // right on a ring: that press ties a lashing
  const sid = pickPole(e.clientX, e.clientY); if (!sid || G.carrying[sid]) return;
  // a lashed pole doesn't move on its own: it takes the whole klaf with it
  if (poleLashed(sid)) { if (startWhole(e.clientX, e.clientY)) { try { canvas.setPointerCapture(e.pointerId); } catch { /* fine */ } } return; }
  const a = toKlaf(e.clientX, e.clientY); if (!a) return;
  moveDrag = { sid, a, from: [...slotById(sid).centre], moved: false, locked: poleLashed(sid) };
  controls.enabled = false;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* fine without it */ }
});
canvas.addEventListener('pointermove', e => {
  const m = moveDrag; if (!m) return;
  const b = toKlaf(e.clientX, e.clientY); if (!b) return;
  const sn = v => Math.round(v * 10) / 10;
  let du = sn(b[0] - m.a[0]), dv = sn(b[1] - m.a[1]);
  if (!m.moved && Math.hypot(b[0] - m.a[0], b[1] - m.a[1]) < 0.12) return;
  if (m.locked) { if (!m.told) { m.told = true; flashHint(LASHED_MSG); } return; }
  const sl = slotById(m.sid); if (!sl) return;
  if (m.sid.startsWith('leg')) dv = 0; // a leg slides along the foot line
  const centre = [Math.round((m.from[0] + du) * 1000) / 1000, Math.round((m.from[1] + dv) * 1000) / 1000];
  if (m.sid.startsWith('leg') && (Math.sign(centre[0]) !== Math.sign(m.from[0]) || Math.abs(centre[0]) < 0.1)) return;
  if (centre[0] === sl.centre[0] && centre[1] === sl.centre[1]) return;
  const next = { ...sl, centre };
  if (!onSheet(next)) return;
  m.moved = true;
  if (G.selected !== m.sid) selectPole(m.sid);
  freeSync(SLOTS.map(q => q.id === m.sid ? next : q));
  hideRaiseIcon();
});
const endMove = () => { const m = moveDrag; if (!m) return; moveDrag = null; if (!camTween && !closeup) controls.enabled = true; if (m.moved) { sfx.thud(); refreshAll(); } };
canvas.addEventListener('pointerup', endMove);
canvas.addEventListener('pointercancel', endMove);

// ---- the raise icon (Omer, 2026-11-16) ----
// A klaf that has its two legs and every crossing lashed is ready. Tapping it opens
// an icon over it, and the icon starts its raise (stakes first).
const freeReady = () => freeTri() ? stageDone('build') && G.tri.up <= 0 && !G.tri.raising
  : !!(G.build.poles.legL && G.build.poles.legR) && JOINTS.length > 0 && JOINTS.every(j => G.build.joints[j.id]);
const raiseIcon = Object.assign(document.createElement('button'), { type: 'button', id: 'raise-icon', hidden: true, innerHTML: '<span class="arrow">⬆</span><span>הרמת הקלף</span>' });
document.body.appendChild(raiseIcon);
function showRaiseIcon() { G.raiseIconFor = G.ki; raiseIcon.lastChild.textContent = freeTri() ? 'הקמת החצובה' : 'הרמת הקלף'; raiseIcon.hidden = false; placeRaiseIcon(); }
function hideRaiseIcon() { if (G) G.raiseIconFor = null; raiseIcon.hidden = true; }
function placeRaiseIcon() {
  if (raiseIcon.hidden) return;
  if (!LV.free || G.stage !== 'build' || G.raiseIconFor !== G.ki || !freeReady()) return hideRaiseIcon();
  const p = toScreen([0, 0.4, z0() + (freeTri() ? TRI.legLength * 0.5 : LEVEL.height * 0.5)]); if (!p) return;
  raiseIcon.style.left = Math.max(70, Math.min(window.innerWidth - 190, p[0])) + 'px';
  raiseIcon.style.top = Math.max(70, Math.min(window.innerHeight - 120, p[1])) + 'px';
}
raiseIcon.addEventListener('click', () => {
  const want = freeTri() ? 'spread' : 'stakes', st = STAGES.find(q => q.id === want && (q.k == null || q.k === G.ki));
  hideRaiseIcon(); sfx.tick();
  if (st) goStage(st.key);
});
// what a klaf still needs before it can be raised
function freeMissing() {
  const b = G.build;
  if (freeTri()) {
    const n = LEG_IDS.filter(id => b.poles[id]).length;
    if (n < 3) return `<b>לחצובה צריך שלוש רגליים.</b> בחרו אורך בערימה והקישו על קו בשרטוט · ${n}/3`;
    return b.joints.TJ ? '' : '<b>כפתו את שלוש הרגליים יחד</b> ליד הראש (הקישו על הטבעת), ואז הקשה על החצובה פותחת את ההקמה';
  }
  if (!b.poles.legL || !b.poles.legR) return '<b>כדי להרים, לקלף צריכות להיות שתי רגליים</b> שעומדות על קו הרגליים, אחת מכל צד';
  const n = JOINTS.filter(j => !b.joints[j.id]).length;
  if (!JOINTS.length) return 'הרגליים עוד לא מחוברות: הוסיפו רוחבים ואלכסונים וכפתו אותם';
  return n ? `<b>נשארו ${n} מפגשים לא כפותים.</b> כשהכול כפות, הקשה על הקלף פותחת את ההרמה` : '';
}
// a tap on another klaf of the sandbox moves the work to it
function pickOtherKlaf(x, y) {
  const keep = G.ki; let found = null;
  for (let i = 0; i < G.klafim.length && found == null; i++) { if (i === keep) continue; useKlaf(i); if (!G.sim && !(G.tri?.up > 0) && pickPole(x, y)) found = i; }
  useKlaf(keep);
  return found;
}
function freePlace(pole) {
  startClock();
  if (!onSheet(pole)) { flashHint('הסנדה יוצאת מהרשת או נכנסת לאדמה. נסו מקום או כיוון אחר'); return; }
  const id = idFor(pole, SLOTS);
  if (!id) { flashHint(pole.kind === 'v' && pole.foot ? '<b>בצד הזה כבר עומדת רגל.</b> לקלף שתי רגליים, אחת מכל צד של קו האמצע' : 'אין מקום לעוד סנדות בקלף הזה'); return; }
  G.build.poles[id] = { length: pole.length };
  G.lastLength = pole.length;
  freeSync([...SLOTS, slotFor(id, pole)]);
  startCarry(id);
  sfx.tick();
  disarm();
  refreshAll();
}
// the plan follows the poles: joints are wherever poles cross, and lashings whose crossing is gone fall off
function freeSync(slots) {
  markLoad(slots);
  K().plan = { slots, joints: crossings(slots) };
  setPlan(K().plan.slots, K().plan.joints);
  const b = G.build;
  for (const id in b.joints) if (!JOINTS.some(j => j.id === id)) delete b.joints[id];
  for (const id in b.poles) if (!slots.some(q => q.id === id)) delete b.poles[id];
  // a leg that moved takes its stake, guy lines and crew posts with it
  const legs = slots.filter(q => q.id.startsWith('leg')).map(q => q.id + q.centre[0] + ':' + q.length).join('|');
  if (legs !== K().freeLegs) { K().freeLegs = legs; b.stakes = {}; b.guyTop = {}; b.anchors = {}; b.crew = {}; }
  freeCfg(K().cfg, slots);
}
// another klaf of the same sandbox: it is designed and stands a little further back
// Another structure of the same sandbox, a klaf or a tripod (Omer, 2026-11-20): it is
// built on the ground a little further back, and raised in its turn after all are built.
// A lying tripod's legs reach 4.5 m back, so the one after it starts further away.
const freeGap = (prev, kind) => prev.kind === 'tripod' ? 5.2 : (prev.frontDist || 2) + (kind === 'tripod' ? 1.2 : 0.4);
function nameFree() {
  const n = { klaf: 0, tripod: 0 };
  for (const k of LV.klafim) { const kind = k.kind || 'klaf'; n[kind]++; k.he = `${kind === 'tripod' ? 'חצובה' : 'קלף'} ${n[kind]}`; k.short = (kind === 'tripod' ? 'ח' : '') + n[kind]; }
}
function addFreeKlaf(kind = 'klaf') {
  const n = LV.klafim.length;
  if (n >= MAX_KLAFIM) return flashHint(`אפשר לבנות עד ${MAX_KLAFIM} מבנים במגרש`);
  const prev = LV.klafim[n - 1];
  const cfg = { ...prev, kind, z0: Math.round((prev.z0 + freeGap(prev, kind)) * 10) / 10 };
  if (kind !== 'tripod') freeCfg(cfg, []);
  LV.klafim.push(cfg); G.klafim.push(freshKlaf(cfg));
  nameFree();
  KM[n].blueprint.visible = false;
  STAGES = stageList(); makeChips();
  goStage(`build:${n}`);
  flashHint(`<b>${cfg.he}</b> ${kind === 'tripod' ? 'תיבנה' : 'ייבנה'} ${(cfg.z0 - prev.z0).toFixed(1)} מ׳ מאחורי ה${prev.he}. גררו את <b>✥</b> כדי למקם אותו בכל מקום במגרש`);
}
function freeHint(nPoles, nJ) {
  const b = G.build;
  if (G.armed) return '<b>ציירו את הסנדה על הרשת:</b> גררו מהמקום שבו היא מתחילה עד המקום שבו היא נגמרת. האורך נקבע לפי הגרירה. <b>מרחק כפיתה:</b> הסנדה ממשיכה 15 ס״מ אחרי כל מפגש, אחרת אי אפשר לכפות שם';
  if (!b.poles.legL || !b.poles.legR) return 'הקישו על <b>סנדה</b> וציירו רגל: גררו מ<b>קו הרגליים</b> ישר למעלה. לקלף שתי רגליים, אחת מכל צד של קו האמצע';
  if (nPoles === 2) return 'יש רגליים. הוסיפו <b>רוחבים ואלכסונים</b>: לוקחים סנדה ומציירים אותה על הרשת, 15 ס״מ מעבר לכל רגל (מרחק כפיתה)';
  if (nJ < JOINTS.length) return `סנדות ${nPoles} · כפיתות ${nJ}/${JOINTS.length} · הקישו על <b>טבעת</b> במפגש סנדות כדי לכפות`;
  return `סנדות ${nPoles} · כפיתות ${nJ}/${JOINTS.length} · הכול כפות: <b>הקישו על הקלף</b> כדי להתחיל להרים אותו`;
}
// why a free klaf fell: no drawing to compare with, so the reasons are the rules themselves
function explainFree(kind) {
  const sim = G.sim, b = G.build;
  const untied = JOINTS.filter(j => !b.joints[j.id]).map(j => j.id);
  const tiedOn = id => JOINTS.filter(j => (j.a === id || j.b === id) && b.joints[j.id]).length;
  const diags = SLOTS.filter(q => q.kind === 'd' && b.poles[q.id] && tiedOn(q.id) >= 2);
  const lean = q => Math.sign(q.dir[0] * q.dir[1]);
  const xA = diags.some(q => lean(q) > 0), xB = diags.some(q => lean(q) < 0);
  const loose = SLOTS.filter(q => !q.id.startsWith('leg') && b.poles[q.id] && tiedOn(q.id) < 2).map(q => q.id);
  const focus = { joints: untied, poles: loose };
  const top = sim.topCentre();
  const dir = top[0] < 0 ? 'ימינה' : 'שמאלה';
  const stakesIn = LEG_STAKES.every(q => (b.stakes[q.id] || 0) >= LEG_STAKE_HITS);
  const xRule = () => (!xA && !xB)
    ? { rule: 'קלף צריך איקס: שני אלכסונים, אחד לכל כיוון', detail: `אין בקלף אלכסון שכפות בשני הקצוות שלו. מסגרת של סנדות עם כפיתות בפינות בלבד מתעקמת למקבילית, והקלף נפל ${dir}.`, focus }
    : { rule: 'קלף צריך איקס: שני אלכסונים, אחד לכל כיוון', detail: `יש בקלף אלכסון רק לכיוון אחד, והקלף נפל ${dir}. אלכסון מחזיק כשמושכים אותו ומתכופף כשדוחפים אותו, ולכן צריך אלכסון שני בכיוון ההפוך.`, focus };
  if (kind === 'load') return { rule: 'סנדה שנושאת משקל נכפתת בשני הקצוות שלה', detail: 'הסנדה העליונה שקעה או נפלה כשהמדריך תלה עליה את דלי המים.', focus };
  if (kind === 'slid' || (!stakesIn && sim.baseSlid() > 0.2))
    return { rule: 'בז״נטים נדפקים ליד הרגליים לפני שמרימים את הקלף', detail: 'בלי בז״נטים, החבל גרר את רגלי הקלף על הקרקע והקלף לא נשאר במקומו.', focus: { feet: true } };
  const grip = sim.brokenGrip();
  if (grip && !(xA && xB)) return xRule();
  if (grip) return { rule: 'מרימים לאט ובשליטה, ועוצרים כשהקלף ניצב', detail: `המשיכה הייתה חזקה מדי, או שהקלף כבד מדי לצוות: ה${GUYS.find(g => g.id === grip.tag).he} נקרע מידי המחזיקים.` };
  if (G.check || sim.lettingGo) {
    const off = GUYS.filter(g => !sim.guys[g.id]?.tied).length;
    if (off) return { rule: 'לא עוזבים את הקלף לפני שכל 4 היתרים כפותים לבז״נטים', detail: `${off} יתרים לא היו כפותים לבז״נט, וכשהמחזיקים עזבו הקלף נפל.` };
  }
  if (!(xA && xB)) return xRule();
  if (kind === 'over') return { rule: 'עוצרים את המשיכה כשהקלף ניצב', detail: 'הקלף עבר את האנך ונפל לכיוון המושכים.' };
  if (untied.length) return { rule: 'כל מפגש של סנדות נכפת', detail: `${untied.length} מפגשים בקלף לא כפותים, והמסגרת התעקמה.`, focus };
  return { rule: 'הקלף לא עמד', detail: 'נסו להוסיף רוחב או אלכסון, או לקצר את הקלף: קלף גבוה וצר קשה יותר להחזיק.', focus };
}
// the inspection of a free klaf: it stands or it falls, no stars
function finishFreeTri() {
  G.endedAt = performance.now();
  pushArrow.visible = false;
  G.result = { stars: 0, free: true };
  sfx.ok();
  const st = triState(), t = G.tri;
  const lens = LEG_IDS.map(id => G.build.poles[id]?.length || 0);
  const nB = BRACES.filter(q => t.braces[q.id]).length;
  const nStakes = TRI_STAKE_JOINTS.filter(j => t.stakeJoints[j.id]).length;
  showModal(`
    <div class="eyebrow">תוצאות המסדר · חצובה חופשית</div>
    <h2>החצובה שלכם עומדת!</h2>
    <ul class="inspect">
      <li class="ok">עמדה בדחיפות מכל הכיוונים</li>
      <li class="ok">נשאה את המשקל על הראש</li>
    </ul>
    <div class="score-grid">
      <span>גובה הראש</span><b>${st.height.toFixed(1)} מ׳</b>
      <span>בין הרגליים</span><b>${st.apart.map(d => d.toFixed(1)).join(' / ')} מ׳</b>
      <span>רגליים</span><b>${lens.map(l => l.toFixed(1)).join(' / ')} מ׳</b>
      <span>חיזוקים</span><b>${nB}/3</b>
      <span>רגליים לבז״נט</span><b>${nStakes}/3</b>
      <span>זמן</span><b>${fmt(elapsed())}</b>
    </div>
  `, [
    ['לבנות חצובה אחרת', restart, true],
    ['למסך הבית', () => { closeModal(); showHome(); }],
  ]);
  refreshAll();
}
function finishFree() {
  G.endedAt = performance.now();
  pushArrow.visible = false;
  G.result = { stars: 0, free: true };
  sfx.ok();
  let nP = 0, nJ = 0, metres = 0, high = 0, nK = 0, nT = 0;
  const joined = LV.cube?.free && G.cube?.sim && countTrue(G.cube.build.joints) > 0 ? LV.cube.members.length : 0;
  eachKlaf(() => {
    const b = G.build;
    nP += SLOTS.filter(q => b.poles[q.id]).length; nJ += JOINTS.filter(j => b.joints[j.id]).length;
    if (G.ki === 0 && joined) { const cb = G.cube.build; nP += countTrue(cb.poles); nJ += countTrue(cb.joints); metres += Object.values(cb.poles).reduce((a, q) => a + q.length, 0); }
    metres += SLOTS.reduce((a, q) => a + (b.poles[q.id]?.length || 0), 0);
    if (G.tri) {
      nT++; high = Math.max(high, triState()?.height || 0);
      const br = Object.values(G.tri.braces); nP += br.length; metres += br.reduce((a, q) => a + q.length, 0);
      nJ += countTrue(G.tri.joints) + countTrue(G.tri.stakeJoints);
    } else { nK++; high = Math.max(high, LEVEL.height); }
  });
  const many = G.klafim.length > 1;
  const what = !many ? (nT ? 'החצובה שלכם עומדת!' : 'הקלף שלכם עומד!') : !nT ? `כל ${nK} הקלפים עומדים!` : !nK ? `כל ${nT} החצובות עומדות!` : `כל ${nK + nT} המבנים עומדים!`;
  const last = G.klafim[G.klafim.length - 1];
  showModal(`
    <div class="eyebrow">תוצאות המסדר · בנייה חופשית</div>
    <h2>${what}</h2>
    <ul class="inspect">
      <li class="ok">${many ? 'עמדו' : nT ? 'עמדה' : 'עמד'} בדחיפות מכל הכיוונים</li>
      <li class="ok">${many ? 'החזיקו את הדלי והמשקל' : nT ? 'נשאה את המשקל על הראש' : 'החזיק את דלי המים'}</li>
      ${joined ? `<li class="ok">${joined} קלפים מחוברים עמדו כמבנה אחד</li>` : ''}
    </ul>
    <div class="score-grid">
      <span>גובה</span><b>${high.toFixed(1)} מ׳</b>
      ${many ? `<span>מבנים</span><b>${[nK ? `${nK} קלפים` : '', nT ? `${nT} חצובות` : ''].filter(Boolean).join(' · ')}</b>` : ''}
      <span>סנדות</span><b>${nP} (${metres.toFixed(1)} מ׳ עץ)</b>
      <span>כפיתות</span><b>${nJ}</b>
      <span>זמן</span><b>${fmt(elapsed())}</b>
    </div>
  `, [
    ['לבנות מחדש', restart, true],
    [`לשנות את ה${many ? last.cfg.he : last.tri ? 'חצובה' : 'קלף'}${many ? ' (האחרון)' : ''}`, () => {
      closeModal(); G.check = null; G.result = null;
      if (G.tri) { G.tri.sim = null; layTripod(); } else lowerKlaf();
      goStage(STAGES.find(s => s.id === 'build' && s.k === G.ki).key);
    }],
    ['למסך הבית', () => { closeModal(); showHome(); }],
  ]);
  refreshAll();
}

// ---------------- the tripod (station 3) ----------------
// On the ground the three legs are ordinary poles on a plan (see tripod.js). From
// the moment it is stood up, the tripod is drawn from where its feet stand.
function triCentre() { const c = LV.free ? null : (K()?.cfg.centre || LV.centre); return [c?.[0] ?? 0, z0() + (c?.[1] ?? 0.7)]; }
const triLens = () => LEG_IDS.map((id, i) => G.build.poles[id]?.length ?? triSpec().slots[i].length);
function freshTri() { return { up: 0, raising: false, feet: null, braces: {}, joints: {}, stakes: {}, stakeJoints: {}, sim: null, guys: { top: {}, hits: {}, fix: {} } }; }
let triCache = null;
function triState() {
  const t = G.tri; if (!t?.feet) return null;
  const key = JSON.stringify([G.ki, t.feet, triLens()]);
  if (!triCache || triCache.key !== key) {
    // legs that cannot meet at the lashing (a wrong pole) still stand, drawn at the plan's lengths:
    // the מסדר and the score judge the wrong pole
    const sp = triSpec(), plan = sp.legLengths || LEG_IDS.map((id, i) => sp.slots[i].length);
    triCache = { key, st: standing(t.feet, triLens(), sp) || standing(t.feet, plan, sp) || standing(triPlanFeet(), plan, sp) };
  }
  return triCache.st;
}
const norm2 = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, 0, z / l]; };
// at the head the three legs sit side by side round the lashing, each on its own foot's side
function headOffset(i, st = triState()) {
  const f = st.legs[i].foot, n = norm2(f[0] - st.apex[0], f[2] - st.apex[2]);
  return [n[0] * 0.06, 0, n[2] * 0.06];
}
function triLegSegs(sid) {
  let i = LEG_IDS.indexOf(sid), tw = null;
  const t = G.tri, st = triState(), sp = triSpec();
  // the giant wheel's second upright leg stands beside the first
  if (i < 0 && sp.twin?.id === sid) { i = sp.twin.of; tw = sp.twin.offset; }
  if (i < 0 || !st || !G.build.poles[sid]) return null;
  const o = tw ? add3(headOffset(i, st), tw, 1) : headOffset(i, st);
  if (t.sim) { const [a, b] = t.sim.legEnds(i); return [[add3(a, o, 1), add3(b, o, 1)]]; }
  const stand = [add3(st.legs[i].foot, o, 1), add3(st.legs[i].top, o, 1)];
  if (t.up >= 1) return [stand];
  // on its way up: the foot walks to its place while the pole swings upright
  const lie = klafRestEnds(sid), k = ease(Math.max(0, t.up)), len = G.build.poles[sid].length;
  const mix = (a, b) => a.map((v, c) => v + (b[c] - v) * k);
  const foot = mix(lie[0], stand[0]);
  const d = mix(lie[1].map((v, c) => v - lie[0][c]), stand[1].map((v, c) => v - stand[0][c])), dl = Math.hypot(...d) || 1;
  return [[foot, add3(foot, d.map(v => v / dl), len)]];
}
function triApex() {
  const t = G.tri;
  if (t.sim) return t.sim.apex();
  if (t.up >= 1) return triState()?.apex ?? null;
  if (!triState()) {
    // still lying on the ground: the lashing point on the middle leg
    const slot = slotById('t2'); if (!slot || !G.build.poles.t2) return null;
    const p = slotPoint(slot, (triSpec().lashV - slot.centre[1]) / (slot.dir[1] || 1));
    return add3(kw(p[0], p[1]), [0, 1, 0], layerOff(slot) + 0.08);
  }
  const seg = triLegSegs('t2'); if (!seg) return null;
  const [a, b] = seg[0], len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return add3(a, [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len], len - triSpec().lashFromTop);
}
// where a leg is at the braces' height, and at the height it is lashed to its stake
const triLegPoint = (i, what) => (what === 'brace' && G.tri.sim) ? G.tri.sim.bracePoint(i) : triState().legs[i][what];
// a brace lies on the outside of its two legs
function braceSide(brace, st) {
  const [a, b] = brace.legs.map(i => st.legs[i].brace);
  return norm2((a[0] + b[0]) / 2 - st.apex[0], (a[2] + b[2]) / 2 - st.apex[2]);
}
function braceEnds(brace, len, st = triState()) {
  const live = st === triState() && G.tri?.sim;
  const [a, b] = brace.legs.map(i => live ? G.tri.sim.bracePoint(i) : st.legs[i].brace);
  const mid = a.map((v, c) => (v + b[c]) / 2), d = b.map((v, c) => v - a[c]), dl = Math.hypot(...d) || 1, n = braceSide(brace, st);
  const m = add3(mid, n, GAP);
  return [add3(m, d.map(v => v / dl), -len / 2), add3(m, d.map(v => v / dl), len / 2)];
}
function braceJointPos(j) {
  const brace = BRACES.find(q => q.id === j.brace);
  return add3(triLegPoint(j.leg, 'brace'), braceSide(brace, triState()), GAP / 2);
}
function triStakePos(i) {
  const st = triState(), f = st.legs[i].foot, n = norm2(f[0] - st.apex[0], f[2] - st.apex[2]);
  return [f[0] - n[2] * GAP * 1.1, f[2] + n[0] * GAP * 1.1];
}
const braceOn = id => { const b = BRACES.find(q => q.id === id), p = G.tri.braces[id]; return !!p && braceReaches(triState(), b, p.length); };
function nearestBrace(x, y) {
  let best = null, bd = 70;
  for (const b of BRACES) {
    if (G.tri.braces[b.id]) continue;
    const [p, q] = braceEnds(b, b.length), A = toScreen(p), B = toScreen(q); if (!A || !B) continue;
    const d = distToSeg(x, y, A, B);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function pickBrace(x, y) {
  let best = null, bd = 22;
  for (const b of BRACES) {
    const pl = G.tri.braces[b.id]; if (!pl) continue;
    const [p, q] = braceEnds(b, pl.length), A = toScreen(p), B = toScreen(q); if (!A || !B) continue;
    const d = distToSeg(x, y, A, B);
    if (d < bd) { bd = d; best = b.id; }
  }
  return best;
}
function collectTriTargets(T) {
  const t = G.tri, st = triState();
  if (G.stage === 'spread' && !t.raising) collectTriGuyTargets(T);
  if (!st || t.up < 1) return;
  if (G.stage === 'spread') st.legs.forEach((L, i) => { if (!footFixed(i)) T.push({ kind: 'foot', id: 'F' + i, pos: [L.foot[0], 0.12, L.foot[2]], show: true }); });
  if (G.stage !== 'brace') return;
  for (const j of BRACE_JOINTS) {
    if (!braceOn(j.brace)) continue;
    T.push({ kind: t.joints[j.id] ? 'blashed' : 'bjoint', id: j.id, pos: braceJointPos(j), show: !t.joints[j.id] });
  }
  TRI_STAKES.forEach((sk, i) => {
    const [x, z] = triStakePos(i);
    if ((t.stakes[sk.id] || 0) < TRI_STAKE_HITS) return T.push({ kind: 'tstake', id: sk.id, pos: [x, 0.12, z], show: true });
    const sj = TRI_STAKE_JOINTS[i], p = st.legs[i].stake;
    T.push({ kind: t.stakeJoints[sj.id] ? 'tsjd' : 'tsj', id: sj.id, pos: [(p[0] + x) / 2, p[1], (p[2] + z) / 2], show: !t.stakeJoints[sj.id] });
  });
}
// the three distances between the feet are as in the drawing
function feetOnPlan() { if (triLoose()) return true; const st = triState(); return !!st && fitsPlan(st, triSpec()).apart.every(Boolean); }
// a foot that already has a stake or a brace stays where it is
const footFixed = i => (G.tri.stakes[TRI_STAKES[i].id] || 0) > 0 || BRACES.some(b => b.legs.includes(i) && G.tri.braces[b.id]);
// spreading the legs: drag a foot over the ground, and the head follows
let footDrag = null;
canvas.addEventListener('pointerdown', e => {
  if (decor?.active || !triOn() || G.stage !== 'spread' || G.tri.up < 1 || G.falling) return;
  const st = triState(); let best = null, bd = 42;
  st.legs.forEach((L, i) => { const sp = toScreen([L.foot[0], 0.1, L.foot[2]]); if (!sp) return; const d = Math.hypot(sp[0] - e.clientX, sp[1] - e.clientY); if (d < bd) { bd = d; best = i; } });
  if (best == null) return;
  if (footFixed(best)) { flashHint('<b>הרגל הזו כבר מחוברת</b> לחיזוק או לבז״נט, ולא זזה'); return; }
  startClock();
  footDrag = { i: best }; controls.enabled = false;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* fine without it */ }
});
canvas.addEventListener('pointermove', e => {
  if (!footDrag) return;
  const p = groundAt(e.clientX, e.clientY); if (!p) return;
  const c = triCentre(), snap = v => Math.round(v * 10) / 10;
  let x = snap(p.x), z = snap(p.z);
  const far = Math.hypot(x - c[0], z - c[1]); if (far > 4) { x = c[0] + (x - c[0]) * 4 / far; z = c[1] + (z - c[1]) * 4 / far; }
  // close to its spot in the drawing, the foot drops into it
  const spot = triPlanFeet()[footDrag.i];
  if (!triLoose() && Math.hypot(x - spot[0], z - spot[1]) < 0.25) { x = spot[0]; z = spot[1]; }
  const next = G.tri.feet.map((f, i) => i === footDrag.i ? [x, z] : f);
  const st = standing(next, triLens(), triSpec());
  if (!st || st.height < 2) return flashHint('<b>הרגליים רחוקות מדי</b>: הראש יורד נמוך מדי');
  if (Math.min(...st.apart) < 0.4) return;
  G.tri.feet = next; refreshHint();
});
const endFootDrag = () => { if (!footDrag) return; footDrag = null; if (!camTween && !closeup) controls.enabled = true; sfx.thud(); refreshAll(); };
canvas.addEventListener('pointerup', endFootDrag);
canvas.addEventListener('pointercancel', endFootDrag);

function raiseTripod() {
  const t = G.tri; if (t.up > 0 || t.raising) return;
  if (!triGuysReady()) return infoCard('קודם יתרים ורבזים', 'מקימים חצובה כמו קלף: לכל רגל קושרים יתר במקום של כפיתת החצובה, ולכל יתר דופקים רבז. היתרים הקדמיים מושכים, והאחוריים מייצבים.');
  startClock();
  t.feet = startFeet(triCentre()); t.raising = true; t.crew = {};
  crewKey = ''; flashHint('<b>מקימים חצובה כמו קלף:</b> משבצים את הצוות בחלון הצוות, ואז מושכים בחבל');
  refreshAll();
}
// ---- a tripod's guy lines (Omer, 2026-11-21) ----
// A tripod is raised like a klaf: a יתר is tied on each leg where the tripod lashing
// goes, each to its own רבז. The front lines (on the side away from where the tops
// lie) pull it up; the rear ones steady it. Once it stands each is fixed (קיבוע).
const triGuyLegs = () => triSpec().twin ? [0, 1, 2, 3] : [0, 1, 2];
const TG = i => 'TG' + (i + 1);
function triLegName(i) {
  const sp = triSpec(), id = i === 3 ? sp.twin?.id : LEG_IDS[i];
  return (sp.slots.find(q => q.id === id) || TRI_SLOTS[i])?.he || 'רגל';
}
// the tripod as drawn, standing on its feet in the drawing
function triPlanStanding() {
  const sp = triSpec(), lens = sp.legLengths || LEG_IDS.map((id, i) => sp.slots[i].length);
  return standing(triPlanFeet(), lens, sp) || standing(triPlanFeet(), [TRI.legLength, TRI.legLength, TRI.legLength]);
}
// where guy line i reaches the ground: out from the head, as far as the head is high (45°)
function triGuyAnchor(i) {
  const st = triPlanStanding(), a = st.apex, h = a[1];
  let d = i <= 2 ? [st.legs[i].foot[0] - a[0], st.legs[i].foot[2] - a[2]] : [0, 0];
  // an upright leg has its foot under the head: its line goes out to the side
  if (Math.hypot(d[0], d[1]) < 0.3) d = [i === 3 ? 1 : -1, -(K()?.cfg.out || 0) * 0.15];
  const l = Math.hypot(d[0], d[1]);
  return [a[0] + d[0] / l * h, 0, a[2] + d[1] / l * h];
}
// the front lines are on the side away from the tops lying on the ground (−z)
const triGuyFront = i => triGuyAnchor(i)[2] < triPlanStanding().apex[2] - 0.05;
const triGuysReady = () => triGuyLegs().every(i => G.tri.guys.top[TG(i)] && (G.tri.guys.hits[TG(i)] || 0) >= ANCHOR_HITS);
const triGuysFixed = () => !!G.tri && triGuyLegs().every(i => G.tri.guys.fix[TG(i)]);
const triSimGuys = () => triGuyLegs().filter(i => G.tri.guys.fix[TG(i)]).map(i => ({ leg: i === 3 ? triSpec().twin.of : i, anchor: triGuyAnchor(i) }));
// where a guy line is tied on its leg (at the tripod lashing), wherever the tripod is now
function triGuyTop(i) {
  const p = triApex(); if (!p) return null;
  return add3(p, [(i === 3 ? 0.07 : (i - 1) * 0.14), 0.04, 0], 1);
}
function triAnchorTop(i) {
  const a = triGuyAnchor(i), hits = G.tri.guys.hits[TG(i)] || 0, h = triApex() || [a[0], 3, a[2]];
  const n = norm2(a[0] - h[0], a[2] - h[2]), s = Math.sin(STAKE_LEAN), c = Math.cos(STAKE_LEAN);
  return add3([a[0], -0.25 * Math.min(hits, ANCHOR_HITS) / ANCHOR_HITS, a[2]], [n[0] * s, c, n[2] * s], ANCHOR_LEN - 0.06);
}
function collectTriGuyTargets(T) {
  const t = G.tri, g = t.guys;
  if (!LEG_IDS.every(id => G.build.poles[id]) || !G.build.joints.TJ) return;
  for (const i of triGuyLegs()) {
    const id = TG(i);
    if (t.up <= 0 && !g.top[id]) { const p = triGuyTop(i); if (p) T.push({ kind: 'tguyTop', id, pos: p, show: true }); continue; }
    if ((g.hits[id] || 0) < ANCHOR_HITS) { const a = triGuyAnchor(i); T.push({ kind: 'tanchor', id, pos: [a[0], 0.12, a[2]], show: true }); continue; }
    if (t.up >= 1 && g.top[id] && !g.fix[id] && feetOnPlan()) { const a = triGuyAnchor(i); T.push({ kind: 'tguyTie', id, pos: [a[0], 0.4, a[2]], show: true }); }
  }
}
// the guy lines and their stakes, for the tripod being drawn
function drawTriGuys() {
  const t = G.tri, g = t.guys, m = KM[G.ki];
  const gone = fadedOut();
  [0, 1, 2, 3].forEach(i => {
    const rv = m.triGuyRopes[i], sk = m.triAnchors[i], id = TG(i), on = triGuyLegs().includes(i);
    const hits = on ? g.hits[id] || 0 : 0;
    sk.visible = hits > 0;
    if (hits > 0) {
      const a = triGuyAnchor(i), h = triApex() || [a[0], 3, a[2]], n = norm2(a[0] - h[0], a[2] - h[2]);
      sk.position.set(a[0], -0.25 * Math.min(hits, ANCHOR_HITS) / ANCHOR_HITS, a[2]);
      sk.quaternion.setFromUnitVectors(UPV3, new THREE.Vector3(n[0] * Math.sin(STAKE_LEAN), Math.cos(STAKE_LEAN), n[2] * Math.sin(STAKE_LEAN)));
    }
    const fixG = lashMesh(id);
    if (!on || !g.top[id] || gone) { rv.show(false); fixG.visible = false; return; }
    const top = triGuyTop(i); if (!top) { rv.show(false); fixG.visible = false; return; }
    const a = triGuyAnchor(i);
    // a line not yet on its stake lies slack on the ground towards it; a tight one runs to the stake
    const end = hits > 0 ? triAnchorTop(i) : add3([top[0], 0.03, top[2]], norm2(a[0] - top[0], a[2] - top[2]), 1.2);
    rv.set(top, end, t.up >= 1 || t.raising ? 0.04 : 0.4);
    fixG.visible = !!g.fix[id];
    if (g.fix[id]) { const e = triAnchorTop(i); placeParallelLashing(fixG, add3(e, [0, -0.05, 0], 1), add3(e, [0, 0.05, 0], 1), [0, 1, 0]); coilProgress(fixG, id); }
  });
}
// the raise: two scouts on each front line pull, one holds each rear line, the rest lift the head
// (Omer, 11-21: a tripod is raised like a klaf) one scout on each guy line, pulling on the
// front ones and holding the rear ones, and the rest lift and steady the head
function triRaiseCrew() {
  const t = G.tri, crewOf = t.crew || {};
  const h = triApex() || [0, 1, z0()];
  let lifter = 0;
  triRoles().forEach((r, k) => {
    const a = people[TRI_CREW[k]]; if (!a) return;
    if (crewOf[r.id] == null) { a.clear(); return; }
    if (r.guy != null) {
      const an = triGuyAnchor(r.guy), n = norm2(an[0] - h[0], an[2] - h[2]), back = r.front ? 1.0 : 0.5;
      a.set([an[0] - n[0] * back, 0, an[2] - n[2] * back], Math.atan2(n[0], n[2]), r.front ? -0.35 : -0.1, 0.8);
    } else { const m = lifter++; a.set([h[0] + (m - 0.5) * 0.7, 0, h[2] + 0.6], Math.PI, 0.3, 0.7 + t.up * 1.6); }
  });
}
// the raise roles: one per guy line, and lifters at the head to make the crew
function triRoles() {
  const roles = triGuyLegs().map(i => ({ id: TG(i), guy: i, front: triGuyFront(i) }));
  for (let n = 0; roles.length < crewSize(); n++) roles.push({ id: 'TL' + n, lifter: true });
  return roles;
}
const triRaiseMode = () => triOn() && G.stage === 'spread' && !!G.tri?.raising && G.tri.up < 1;
function triCrewReady() {
  const t = G.tri, roles = triRoles();
  const missing = roles.filter(r => t.crew?.[r.id] == null).length;
  const walking = !missing && roles.some((r, k) => !people[TRI_CREW[k]].arrived());
  return { missing, walking, ok: !missing && !walking };
}
function toggleTriCrew(id) {
  const t = G.tri; t.crew ||= {};
  if (t.up > 0.02) return flashHint('את הצוות משבצים לפני שמתחילים למשוך');
  if (t.crew[id] != null) delete t.crew[id];
  else {
    const used = new Set(Object.values(t.crew)), free = [...Array(crewSize()).keys()].filter(i => !used.has(i));
    if (!free.length) return flashHint(`<b>כל ${crewSize()} הצופים כבר משובצים.</b> הקישו על תפקיד כדי לשחרר צופה`);
    t.crew[id] = free[0];
  }
  sfx.tick(); crewKey = ''; renderCrew(); refreshAll();
}
function renderTriCrew() {
  const t = G.tri, roles = triRoles(), used = Object.values(t.crew || {}).length;
  $('crew-free').textContent = `${crewSize() - used} מתוך ${crewSize()} פנויים`;
  $('crew-list').innerHTML = roles.map(r => {
    const who = t.crew?.[r.id];
    const role = r.lifter ? 'בראש · מרים ומייצב' : `${r.front ? 'מושכים · יתר קדמי' : 'מחזיקים · יתר אחורי'}, ${triLegName(r.guy).replace('רגל ', '')}`;
    return `<button type="button" class="crew-row${who != null ? ' on' : ''}" data-gid="${r.id}">
      <span class="crew-role">${role}</span><span class="crew-who">${who != null ? CREW_NAMES[who] : '+ צופה'}</span></button>`;
  }).join('');
}
// a pull on the rope stands the tripod up a little more
function pullTripod(dy) {
  const t = G.tri, cr = triCrewReady();
  if (t.up <= 0.001) {
    if (cr.missing) return flashHint(`<b>צריך צוות של ${crewSize()} כדי להקים חצובה.</b> שבצו עוד ${cr.missing === 1 ? 'צופה אחד' : cr.missing + ' צופים'} בחלון הצוות`);
    if (cr.walking) return flashHint('הצוות עוד בדרך למקומות. מושכים כשכולם במקום');
  }
  t.up = Math.min(1, t.up + dy * 0.0035);
}
function layTripod() { G.tri = freshTri(); triCache = null; G.check = null; G.result = null; }
// six scouts, two to a leg
const TRI_CREW = ['baseL', 'baseR', 'lift1', 'lift2', 'guyG1', 'guyG2'];
// the sheet the legs are laid on (the current tripod's), and the guide for spreading its feet
function drawTriShared(dt) {
  drawTriGuide();
  const on = triOn();
  const show = on && G.stage === 'build' && !stageDone('build');
  triSheets.forEach((sh, i) => {
    const mine = show && (i === 1) === (triSpec() === TRI90);
    sh.material.opacity = Math.max(0, Math.min(0.96, sh.material.opacity + (mine ? 1 : -1) * dt / 0.4));
    sh.visible = sh.material.opacity > 0.01;
    if (mine) sh.position.z = sh.userData.z + z0();
  });
}
// one tripod (run as the current klaf by eachKlaf); its crew only while it is the one being worked on
function drawTripod(dt, current = true) {
  const t = G.tri, triStakeMeshes = KM[G.ki].triStakes;
  if (!t) return;
  if (!current) {
    if (t.raising) { t.up = Math.min(1, t.up + dt / 1.4); if (t.up >= 1) t.raising = false; }
    TRI_STAKES.forEach((sk, i) => { if (!(t.up >= 1 && t.stakes[sk.id])) triStakeMeshes[i].visible = false; });
  }
  const st = triState(), up = t.up >= 1;
  for (const b of BRACES) {
    const m = poleMeshes[b.id][0], pl = t.braces[b.id];
    poleMeshes[b.id][1].visible = false;
    if (!up || !pl) { m.visible = false; continue; }
    const [p, q] = braceEnds(b, pl.length);
    // a brace too short to reach hangs from its first leg
    if (!braceOn(b.id)) placeCylinder(m, p, [q[0], 0.12, q[2]]); else placeCylinder(m, p, q);
  }
  for (const j of BRACE_JOINTS) {
    const g = lashMesh(j.id);
    if (!up || !t.joints[j.id] || !braceOn(j.brace)) { g.visible = false; continue; }
    const brace = BRACES.find(q => q.id === j.brace), [p, q] = braceEnds(brace, 1), n = braceSide(brace, st);
    placeLashing(g, braceJointPos(j), st.legs[j.leg].dir, [q[0] - p[0], q[1] - p[1], q[2] - p[2]], [-n[0] * GAP / 2, 0, -n[2] * GAP / 2]);
    g.visible = !fadedOut(); coilProgress(g, j.id);
  }
  TRI_STAKES.forEach((sk, i) => {
    const m = triStakeMeshes[i], hits = t.stakes[sk.id] || 0, g = lashMesh(TRI_STAKE_JOINTS[i].id);
    if (!up || !hits) { m.visible = false; g.visible = false; return; }
    const [x, z] = triStakePos(i);
    m.visible = true; m.position.set(x, -0.3 * Math.min(hits, TRI_STAKE_HITS) / TRI_STAKE_HITS, z);
    if (!t.stakeJoints[TRI_STAKE_JOINTS[i].id]) { g.visible = false; return; }
    const p = t.sim ? add3(t.sim.pos(t.sim.legs[i].foot), st.legs[i].dir, TRI.stakeJointHeight) : st.legs[i].stake;
    placeParallelLashing(g, p, [x, p[1], z], [0, 1, 0]);
    g.visible = !fadedOut(); coilProgress(g, TRI_STAKE_JOINTS[i].id);
  });
  drawTriGuys();
  // the crew: they stand the bundle up, then hold the legs until the inspection
  if (!current) return;
  if (t.raising) {
    triRaiseCrew();
    if (t.up >= 1) { t.up = 1; t.raising = false; sfx.ok(); fun.landed(triApex()); setCameraMode('triView'); refreshAll(); }
  } else if (up && !G.check && !G.falling) {
    st.legs.forEach((L, i) => {
      const n = norm2(L.foot[0] - st.apex[0], L.foot[2] - st.apex[2]);
      for (const side of [-1, 1]) {
        const pos = [L.foot[0] + n[0] * 0.25 - n[2] * side * 0.42, 0, L.foot[2] + n[2] * 0.25 + n[0] * side * 0.42];
        people[TRI_CREW[i * 2 + (side > 0 ? 1 : 0)]].set(pos, Math.atan2(L.foot[0] - pos[0], L.foot[2] - pos[2]), 0.12, 1.15);
      }
    });
  }
}
function triInspector(push) {
  const c = G.check, ts = G.tri.sim;
  if (!c?.running || G.falling || !ts) { inspector.clear(); buckets.forEach(b => { b.visible = false; }); return; }
  const a = ts.apex(), ct = triCentre();
  buckets.forEach((b, i) => { b.visible = i === 0 && !!c.loading; });
  if (c.loading) buckets[0].position.set(a[0], a[1] - 0.1, a[2]);
  if (push) {
    const d = new THREE.Vector3(push[0], 0, push[2]).normalize();
    inspector.set([a[0] - d.x * 0.9, 0, a[2] - d.z * 0.9], Math.atan2(d.x, d.z), 0.3, 2.6);
  } else if (c.loading) inspector.set([a[0] + 0.5, 0, a[2] - 0.5], Math.atan2(-0.5, 0.5), 0.05, Math.PI * 0.9);
  else inspector.set([ct[0] + 2.6, 0, ct[1] - 2.8], Math.atan2(-2.6, 2.8), 0, 0.2);
}
function watchTripod() {
  const ts = G.tri.sim; if (!ts || G.falling) return;
  const kind = ts.slid() > 0.35 ? 'slid' : ts.sunk() > 0.25 * ts.h0 ? 'down' : null;
  if (!kind) return;
  G.falling = { kind, t: 0, tri: true, explain: explainTri(kind) };
  sfx.crash(); buzz([60, 40, 90]); fun.collapse(G.sim?.topCentre?.() || [0, 0, z0()]);
  closePicker(); refreshAll();
}
function explainTri(kind) {
  const ts = G.tri.sim, st = triState();
  const loose = [0, 1, 2].filter(i => !ts.staked[i]).length;
  const minApart = Math.min(...st.apart);
  if (minApart < 1.6 && !(kind === 'slid' && ts.braced.length < 3))
    return { rule: 'חצובה צריכה בסיס רחב', detail: `הרגליים עומדות רק ${minApart.toFixed(1)} מ׳ זו מזו, והראש בגובה ${st.height.toFixed(1)} מ׳. חצובה גבוהה וצרה מתהפכת בדחיפה. בשרטוט יש ${apartText()}.` };
  if (ts.braced.length < 3 && loose)
    return { rule: 'רגלי חצובה לא נשארות במקום לבד', detail: `כשכולם עזבו, ${loose === 3 ? 'הרגליים' : 'רגל שלא כפותה לבז״נט'} החליקו החוצה על החול, והחצובה נפתחה ושקעה. חיזוק שכפות בשני הקצוות שלו בין כל שתי רגליים, ובז״נט שהרגל כפותה אליו, מחזיקים את הרגליים במקום.` };
  if (loose) return { rule: 'כל רגל של החצובה נכפתת לבז״נט', detail: 'החיזוקים החזיקו את הרגליים יחד, אבל בלי בז״נטים החצובה כולה זזה או התהפכה כשדחפו אותה.' };
  return { rule: 'החצובה לא עמדה במסדר', detail: 'בדקו שכל חיזוק כפות בשני הקצוות שלו ושכל רגל כפותה לבז״נט.' };
}
function scoreTripod() {
  const t = G.tri, b = G.build, st = triState();
  const all = [
    [{ id: 'TJ', correct: 'tripod', tri: 'head', uid: 'TJ' }, b.joints.TJ],
    ...BRACE_JOINTS.map(j => [{ ...j, tri: 'brace', uid: j.id }, braceOn(j.brace) ? t.joints[j.id] : null]),
    ...TRI_STAKE_JOINTS.map(j => [{ ...j, tri: 'stake', uid: j.id }, (t.stakes[j.stake] || 0) >= TRI_STAKE_HITS ? t.stakeJoints[j.id] : null]),
    ...triGuyLegs().map(i => [{ id: TG(i), correct: 'guy', tri: 'guy', uid: TG(i) }, (t.guys.hits[TG(i)] || 0) >= ANCHOR_HITS ? t.guys.fix[TG(i)] : null]),
  ];
  const total = all.length, tied = all.filter(([, v]) => v).length, correct = all.filter(([j, v]) => v === j.correct).length;
  const nPoles = 6;
  const polesOk = LEG_IDS.filter(id => Math.abs(b.poles[id].length - TRI.legLength) < 0.05).length + BRACES.filter(q => t.braces[q.id] && Math.abs(t.braces[q.id].length - q.length) < 0.05).length;
  const fit = fitsPlan(st), fitN = (fit.height ? 1 : 0) + fit.apart.filter(Boolean).length;
  const shape = { ok: fitN === 4, text: fitN === 4 ? 'הגובה והמרחקים בין הרגליים כמו בשרטוט' : `לא בדיוק לפי השרטוט: גובה ${st.height.toFixed(1)} מ׳, בין הרגליים ${st.apart.map(d => d.toFixed(1)).join(' / ')} מ׳` };
  const accuracy = Math.round(40 * tied / total + 25 * correct / total + 15 * polesOk / nPoles + 20 * fitN / 4);
  const sec = elapsed(), bonus = sec <= LV.targetTimeSec ? 10 : 0;
  // Omer (11-19): no stars while any lashing in the drawing is missing
  let stars = 0;
  if (tied === total) stars = 2;
  if (tied === total && correct === total && accuracy >= LEVEL.threeStarScore) stars = 3;
  if (stars && !shape.ok) stars = 1;
  const groups = {};
  for (const [j, v] of all) if (!v) { const key = sheetOf(j); groups[key] = (groups[key] || 0) + 1; }
  const hintsAllowed = Math.max(1, Math.floor(total / 10)), hintCost = Math.round(40 / total), penalty = G.hintsUsed * hintCost;
  return { total, tied, correct, polesOk, nPoles, accuracy, bonus, sec, sum: accuracy + bonus - penalty, stars, groups, wrong: tied - correct, hintsAllowed, hintCost, penalty, all, shape };
}
function triStatus(nPoles, nJ) {
  const t = G.tri;
  switch (G.stage) {
    case 'build': return `רגליים ${nPoles}/3 · כפיתה סביב שלוש הרגליים ${nJ}/1` + (LV.free ? (G.armed ? ' · <b>הקישו על קו בשרטוט</b> כדי להניח את הרגל' : nPoles === 3 && nJ ? ' · הכול כפות: <b>הקישו על החצובה</b> כדי להקים אותה' : ' · בחרו אורך בערימה') : '');
    case 'spread': {
      if (t.raising) { const cr = triCrewReady(); return cr.missing ? `<b>צוות הקמה:</b> משבצים ${crewSize()} צופים בחלון הצוות, על כל יתר ובראש` : cr.walking && t.up <= 0 ? 'הצוות הולך למקומות…' : '<b>מושכים בחבל</b> (גוררים למטה) כדי להקים את החצובה'; }
      if (t.up < 1) {
        const L = triGuyLegs(), g = t.guys, top = L.filter(i => g.top[TG(i)]).length, hit = L.filter(i => (g.hits[TG(i)] || 0) >= ANCHOR_HITS).length;
        if (top < L.length || hit < L.length) return `יתרים על הרגליים ${top}/${L.length} · רבזים ${hit}/${L.length} · קושרים יתר לכל רגל במקום של כפיתת החצובה, ודופקים לו רבז`;
        return 'היתרים הקדמיים מושכים והאחוריים מייצבים: מקימים את החצובה';
      }
      const st = triState();
      if (triLoose()) return `גובה הראש <b>${st.height.toFixed(1)} מ׳</b> · בין הרגליים <b>${st.apart.map(d => d.toFixed(1)).join(' / ')}</b> מ׳ · גוררים כל רגל לאן שרוצים`;
      if (feetOnPlan() && !triGuysFixed()) return `הרגליים במקומן. קיבוע היתרים ${triGuyLegs().filter(i => t.guys.fix[TG(i)]).length}/${triGuyLegs().length}: הקישו על כל רבז`;
      if (feetOnPlan()) return `הרגליים במקומן: <b>${apartText()}</b>, הראש בגובה <b>${st.height.toFixed(1)} מ׳</b>`;
      return `בין הרגליים <b>${st.apart.map(d => d.toFixed(1)).join(' / ')}</b> מ׳, צריך <b>${triSpec().apart.map(d => d.toFixed(1)).join(' / ')}</b> · גוררים כל רגל אל העיגול שלה`;
    }
    case 'brace': {
      const n = BRACES.filter(q => t.braces[q.id]).length, j = BRACE_JOINTS.filter(q => t.joints[q.id]).length;
      const s = TRI_STAKES.filter(q => (t.stakes[q.id] || 0) >= TRI_STAKE_HITS).length, sj = TRI_STAKE_JOINTS.filter(q => t.stakeJoints[q.id]).length;
      return `חיזוקים ${n}/3 · כפיתות חיזוק ${j}/6 · בז״נטים ${s}/3 · רגל לבז״נט ${sj}/3`;
    }
    case 'check': return G.check?.running ? (G.check.label || 'מסדר…') : 'מסדר: המדריך דוחף את ראש החצובה, תולה עליו משקל ובודק כל כפיתה';
  }
  return '';
}

// ---------------- the carousel (station 4) ----------------
// After the cube is joined and its inner guy lines are down, the seat is built
// lying on its drawing in the middle of the cube, lifted by six scouts, and hung:
// the mast goes up through the #'s middle square, hangs from the roof X on a rope
// ring, is lashed to the #, and eight ropes run from it to the octagon's corners.
const seatSlot = id => id === MAST.id ? MAST : SEAT.slots.find(s => s.id === id);
const seatJoint = id => SEAT.joints.find(j => j.id === id);
const isSeatPole = sid => sid.startsWith('S.');
const seatLift = () => ease(Math.max(0, Math.min(1, G.seat?.lift || 0))) * CAR.seat.height;
const seatOff = slot => [0, (slot.layer || 0) * GAP, 0];
const mastOn = () => G.seat?.build.poles[MAST.id];
// where the mast stands: through the middle of the #, its foot just above the ground
function mastSegs() {
  const m = mastOn(); if (!m) return null;
  const ss = G.seat.sim;
  if (ss?.mast) return [[ss.pos(ss.mast.foot), ss.pos(ss.mast.top)]];
  return [[[SEAT_C[0], CAR.seat.mastFoot, SEAT_C[1]], [SEAT_C[0], mastTopY(m.length), SEAT_C[1]]]];
}
function seatSegs(sid, plan = false, len = null) {
  if (sid === MAST.id) {
    if (plan) { const L = len ?? MAST.length; return [[[SEAT_C[0], CAR.seat.mastFoot, SEAT_C[1]], [SEAT_C[0], mastTopY(L), SEAT_C[1]]]]; }
    return mastSegs();
  }
  const slot = seatSlot(sid), L = len ?? G.seat.build.poles[sid]?.length;
  if (L == null) return null;
  const off = seatOff(slot), ss = G.seat.sim;
  if (!plan && ss?.poles[sid]) { const P = ss.poles[sid]; return [[add3(ss.pos(P[0].id), off, 1), add3(ss.pos(P[P.length - 1].id), off, 1)]]; }
  const y = plan ? 0 : seatLift();
  const e = k => [slot.centre[0] + slot.dir[0] * k, slot.centre[1] + y, slot.centre[2] + slot.dir[2] * k];
  return [[add3(e(-L / 2), off, 1), add3(e(L / 2), off, 1)]];
}
// a point of the seat (in the plan, at y = pole radius), where it is now
function seatPoint(sid, at) {
  const ss = G.seat.sim;
  if (ss) { const q = ss.near(sid, at); if (q != null) return ss.pos(q); }
  return [at[0], at[1] + seatLift(), at[2]];
}
function seatJointPos(j) {
  const a = seatSlot(j.a), b = seatSlot(j.b), p = seatPoint(j.a, j.at), oa = seatOff(a), ob = seatOff(b);
  return add3(p, oa.map((v, i) => (v + ob[i]) / 2), 1);
}
function mastJointPos(mj) {
  const ss = G.seat.sim, slot = seatSlot(mj.b);
  if (ss?.poles[mj.b]) { const q = ss.poles[mj.b].find(v => Math.abs(v.t) < 1e-6); if (q) return add3(ss.pos(q.id), seatOff(slot), 1); }
  return add3([slot.centre[0], slot.centre[1] + seatLift(), slot.centre[2]], seatOff(slot), 1);
}
function cornerPos(k) {
  const c = cornerAt(k), sid = `S.o${k + 1}`;
  return add3(seatPoint(sid, [c[0], LEVEL.poleRadius, c[1]]), seatOff(seatSlot(sid)), 1);
}
// the hanging ropes are tied at the centre of the roof X (Omer, 11-20)
function mastRopePos() { return roofCentre(); }
// the roof X's centre, where the ring hangs (it moves with the frame in the check)
function roofCentre() {
  const cs = G.cube?.sim, q = cs?.findParticle('C.xAT', 0);
  return q != null ? add3(cs.pos(q), [0, 2 * LEVEL.poleRadius, 0], 1) : [...PIVOT];
}
const seatPolesIn = () => SEAT.slots.every(s => G.seat.build.poles[s.id]);
function seatReachable(j) { return cubeJointReachable(j, SEAT, G.seat.build.poles); }
function liftSeat() {
  if (!seatPolesIn()) return infoCard('קודם בונים את כל המושב', 'שמונה סנדות למתומן, ארבע ל־# שבתוכו וארבע לאיקס הכפול, כולן במקומן על השרטוט. רק אז מרימים אותו.');
  startClock(); G.seat.lifting = true; refreshAll();
}
// back to building the seat: it comes down, and the mast with everything on it comes off
function lowerSeat() {
  const s = G.seat; s.lift = 0; s.lifting = false; s.pivot = false; s.mastJoints = {}; s.ropes = {}; s.sim = null;
  delete s.build.poles[MAST.id];
}
const SEAT_CREW = ['baseL', 'baseR', 'lift1', 'lift2', 'guyG1', 'guyG2'];
let ridersOn = false;
function drawSeat(dt) {
  const on = !!LV.carousel, S = G.seat;
  // the seat's drawing lies on the ground while the seat is built
  const show = on && G.stage === 'seat' && !stageDone('seat');
  SM.sheet.material.opacity = Math.max(0, Math.min(0.94, SM.sheet.material.opacity + (show ? 1 : -1) * dt / 0.4));
  SM.sheet.visible = SM.sheet.material.opacity > 0.01;
  const gone = fadedOut();
  for (const id in SM.poles) {
    const m = SM.poles[id][0];
    if (!on || !S.build.poles[id]) { m.visible = false; continue; }
    const segs = seatSegs(id); if (!segs) { m.visible = false; continue; }
    placeCylinder(m, segs[0][0], segs[0][1]);
  }
  for (const j of SEAT.joints) {
    const g = SM.lash[j.id];
    if (!on || !S.build.joints[j.id] || !seatReachable(j)) { g.visible = false; continue; }
    const a = seatSlot(j.a), b = seatSlot(j.b), oa = seatOff(a), ob = seatOff(b);
    placeLashing(g, seatJointPos(j), seatSegDir(j.a), seatSegDir(j.b), oa.map((v, i) => (v - ob[i]) / 2));
    g.visible = !gone; coilProgress(g, j.id);
  }
  for (const mj of MAST_JOINTS) {
    const g = SM.lash[mj.id];
    if (!on || !S.mastJoints[mj.id] || !mastOn() || !S.build.poles[mj.b]) { g.visible = false; continue; }
    const p = mastJointPos(mj), sep = [(p[0] - SEAT_C[0]) / 2, 0, 0];
    placeLashing(g, add3(p, sep, -1), [0, 1, 0], seatSegDir(mj.b), sep);
    g.visible = !gone; coilProgress(g, mj.id);
  }
  for (const h of HANG_ROPES) {
    const rv = SM.ropes[h.id];
    if (!on || !S.ropes[h.id] || !mastOn() || gone) { rv.show(false); continue; }
    rv.set(mastRopePos(), cornerPos(h.corner), 0.01);
  }
  if (on && S.pivot && mastOn() && !gone) {
    const top = roofCentre(), ss = S.sim, hp = ss?.mast ? ss.pos(ss.mast.hang) : [SEAT_C[0], PIVOT[1] - 0.1, SEAT_C[1]];
    SM.ring.set(add3(top, [0.06, 0.05, 0], 1), add3(hp, [0.05, 0, 0], 1), 0.0);
  } else SM.ring.show(false);
  SM.guide.visible = on && G.stage === 'hang' && S.lift >= 1 && !mastOn() && !G.check;
  if (SM.guide.visible) placeCylinder(SM.guide, [SEAT_C[0], CAR.seat.mastFoot, SEAT_C[1]], [SEAT_C[0], PIVOT[1] + 0.3, SEAT_C[1]]);
  if (!on) return;
  // six scouts carry the seat up and hold it until the inspection
  const holding = S.lifting || (S.lift > 0 && !G.check && !G.falling && seatStage(G.stage));
  if (holding) {
    const y = seatLift();
    SEAT_CREW.forEach((k, n) => {
      const c = cornerAt([0, 1, 3, 4, 5, 7][n]), d = [c[0] - SEAT_C[0], c[1] - SEAT_C[1]], l = Math.hypot(d[0], d[1]);
      const pos = [c[0] + d[0] / l * 0.45, 0, c[1] + d[1] / l * 0.45];
      people[k].set(pos, Math.atan2(-d[0], -d[1]), 0.25, 0.7 + y * 1.4);
    });
    if (S.lifting && (S.lift > 0 || SEAT_CREW.every(k => people[k].arrived()))) {
      S.lift = Math.min(1, S.lift + dt / 1.1);
      if (S.lift >= 1) { S.lifting = false; sfx.ok(); refreshAll(); }
    }
  }
  // the riders, in the inspection
  const c = G.check, ss = S.sim;
  const riding = !!(ss && c && (c.riders || 0) > 0 && !gone);
  if (riding) {
    // each pair walks in a moment before its weight counts
    const spots = ss.riderSpots(), order = [0, 4, 2, 6, 1, 5, 3, 7], n = Math.min(8, Math.floor(c.riders / 2) * 2 + 2);
    const m = ss.mast ? ss.pos(ss.mast.seat) : [SEAT_C[0], 0, SEAT_C[1]];
    order.forEach((k, i) => {
      const a = crew[i]; if (spots[k] == null) return;
      if (i >= n) { a.clear(); return; }
      const p = ss.pos(spots[k]), d = [p[0] - m[0], p[2] - m[2]], l = Math.hypot(d[0], d[1]) || 1;
      const seat = [p[0] + d[0] / l * 0.05, p[1] - 0.55, p[2] + d[1] / l * 0.05];
      const near = Math.hypot(a.pos.x - seat[0], a.pos.z - seat[2]) < 0.3;
      a.set(seat, Math.atan2(d[0], d[1]), -0.1, 0.5, { lock: near || ridersOn, sit: near });
    });
    ridersOn = (c.riders || 0) >= 8;
  } else if (ridersOn || crew.some(a => a.want?.sit)) { ridersOn = false; for (const a of crew) if (a.want?.sit || a.want?.lock) a.clear(); }
}
function seatSegDir(sid) { const s = seatSegs(sid); if (!s) return [1, 0, 0]; const [a, b] = s[0]; return [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; }
function nearestSeatSlot(x, y) {
  let best = null, bd = 44;
  const list = G.stage === 'hang' ? (G.seat.lift >= 1 && !mastOn() ? [MAST] : []) : SEAT.slots.filter(s => !G.seat.build.poles[s.id]);
  for (const s of list) {
    const [[a, b]] = seatSegs(s.id, true, s.length);
    const A = toScreen(a), B = toScreen(b); if (!A || !B) continue;
    const d = distToSeg(x, y, A, B);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function collectSeatTargets(T) {
  const S = G.seat;
  if (G.stage === 'seat') for (const j of SEAT.joints) {
    if (!seatReachable(j)) continue;
    T.push({ kind: S.build.joints[j.id] ? 'slashed' : 'sjoint', id: j.id, pos: seatJointPos(j), show: !S.build.joints[j.id] });
  }
  if (G.stage !== 'hang' || S.lift < 1 || !mastOn()) return;
  if (!S.pivot && mastReaches(mastOn().length)) T.push({ kind: 'pivot', id: 'S.ring', pos: add3(roofCentre(), [0, -0.12, 0], 1), show: true });
  for (const mj of MAST_JOINTS) if (S.build.poles[mj.b]) T.push({ kind: S.mastJoints[mj.id] ? 'mlashed' : 'mjoint', id: mj.id, pos: mastJointPos(mj), show: !S.mastJoints[mj.id] });
  for (const h of HANG_ROPES) if (!S.ropes[h.id] && S.build.poles[`S.o${h.corner + 1}`]) T.push({ kind: 'hrope', id: h.id, pos: cornerPos(h.corner), show: true });
}
function hangReady() {
  const S = G.seat;
  return S.lift >= 1 && !!mastOn() && mastReaches(mastOn().length) && S.pivot && MAST_JOINTS.every(j => S.mastJoints[j.id]) && HANG_ROPES.every(h => S.ropes[h.id]);
}
// the inspection's carousel part: riders get on in pairs, the crew spins it, the מדריך pushes the seat
const RIDE = { board: [19, 22.5], spin: [23, 28.5], side: [30, 31.5], end: 33 };
function rideLabel(c) {
  const t = c.t;
  if (t >= RIDE.board[0] && t < RIDE.board[1]) return 'שמונה צופים עולים על הקרוסלה, <b>בזוגות משני הצדדים</b>';
  if (t >= RIDE.spin[0] && t < RIDE.spin[1]) return 'הצוות <b>מסובב את הקרוסלה</b> עם הרוכבים';
  if (t >= RIDE.side[0] && t < RIDE.side[1]) return 'המדריך דוחף את המושב <b>הצידה</b>';
  if (t >= RIDE.board[0]) return 'הקרוסלה מסתובבת…';
  return null;
}
function stepCarousel(h) {
  const ss = G.seat.sim, c = G.check; if (!ss) return;
  const t = c?.t ?? 99;
  const riders = c && t >= RIDE.board[0] ? Math.min(8, (t - RIDE.board[0]) / (RIDE.board[1] - RIDE.board[0]) * 8.9) : (G.falling ? (c?.riders || 0) : 0);
  if (c) c.riders = riders;
  ss.setPivot(roofCentre());
  ss.step(h, { riders, spin: !!c && t >= RIDE.spin[0] && t < RIDE.spin[1], side: c && t >= RIDE.side[0] && t < RIDE.side[1] ? [CAR_TUNING.sidePush, 0, 0] : null });
  // the carousel's weight, with its riders, hangs on the roof X
  const cs = G.cube?.sim, q = cs?.findParticle('C.xAT', 0);
  if (q != null && ss.ring?.active) {
    let kg = 0; for (const p of ss.world.p) if (p.w) kg += 1 / p.w;
    cs.world.applyForce(q, [0, -(kg * 9.81 + Math.floor(riders / 2) * 2 * CAR_TUNING.rider) * CAR_TUNING.frameShare, 0]);
  }
}
function watchCarousel() {
  const ss = G.seat.sim; if (!ss || G.falling || !G.check?.running) return;
  // the seat is judged once the scouts start getting on
  if ((G.check.t ?? 0) < RIDE.board[0]) return;
  let kind = null;
  if (ss.sag() > CAR_TUNING.sagLimit) kind = 'seat';
  else if (ss.swing() > CAR_TUNING.swingLimit) kind = 'swing';
  else if (ss.mastTilt() > 20) kind = 'tilt';
  if (!kind) return;
  G.falling = { kind, t: 0, carousel: true, explain: explainCarousel(kind) };
  sfx.crash(); buzz([60, 40, 90]); fun.collapse(G.sim?.topCentre?.() || [0, 0, z0()]);
  closePicker(); refreshAll();
}
function explainCarousel(kind) {
  const S = G.seat, b = S.build;
  const corners = SEAT.joints.filter(j => j.corner != null && !(b.joints[j.id] && seatReachable(j)));
  const ropes = HANG_ROPES.filter(h => !S.ropes[h.id]);
  const focus = { seatJoints: corners.map(j => j.id), corners: ropes.map(h => h.corner) };
  if (kind === 'seat' && corners.length) return { rule: 'כל פינה של המתומן נכפתת', detail: `${corners.length === 1 ? 'פינה אחת של המתומן לא הייתה כפותה' : `${corners.length} פינות של המתומן לא היו כפותות`}, והסנדה שנשענה עליה צנחה תחת הרוכבים.`, focus };
  if (kind === 'seat' && ropes.length) return { rule: 'כל פינה של המושב תלויה בחבל מראש התורן', detail: `${ropes.length === 1 ? 'פינה אחת לא הייתה תלויה' : `${ropes.length} פינות לא היו תלויות`}, והמושב שקע שם כשהצופים עלו.`, focus };
  if (kind === 'swing' || MAST_JOINTS.some(j => !S.mastJoints[j.id])) return { rule: 'המושב נכפת לתורן', detail: 'המושב לא היה כפות לתורן בשתי סנדות האורך של ה־#, ולכן זז הצידה כשסובבו ודחפו אותו, ונתקע בתורן.', focus: { mastJoints: MAST_JOINTS.filter(j => !S.mastJoints[j.id]).map(j => j.id) } };
  if (kind === 'tilt') return { rule: 'התורן תלוי ישר מאמצע איקס הגג', detail: 'התורן נטה הצידה תחת הרוכבים. בדקו את טבעת התלייה, את כפיתות התורן ל־# ואת חבלי התלייה.', focus };
  return { rule: 'המושב צריך לשאת את הרוכבים', detail: 'המושב שקע תחת שמונת הרוכבים. בדקו את כפיתות המתומן וה־# ואת חבלי התלייה.', focus };
}
function seatStatus() {
  const S = G.seat, b = S.build;
  if (G.stage === 'seat') return `סנדות במושב ${SEAT.slots.filter(s => b.poles[s.id]).length}/${SEAT.slots.length} · כפיתות ${SEAT.joints.filter(j => b.joints[j.id]).length}/${SEAT.joints.length}`;
  if (S.lifting) return 'שישה צופים מרימים את המושב…';
  if (S.lift < 1) return 'שישה צופים מרימים את המושב לגובה 50 ס״מ ומחזיקים אותו';
  if (!mastOn()) return 'מעבירים את <b>התורן</b> דרך הריבוע שבאמצע ה־# (גררו סנדה מהערימה אל הקו האדום)';
  return `תליית התורן ${S.pivot ? 1 : 0}/1 · התורן ל־# ${MAST_JOINTS.filter(j => S.mastJoints[j.id]).length}/2 · חבלי תלייה ${HANG_ROPES.filter(h => S.ropes[h.id]).length}/8`;
}

// ---------------- the giant wheel (station 5) ----------------
// After the two A towers stand and are joined at the bottom, the wheel is built
// standing on its bottom corner between them (two squares with an X each, the
// axle through the X's centres, four corner poles), lifted by six scouts until the
// axle lies in the towers' forks, and the seat is built under it and hung on four ropes.
const rigSlot = id => RIG.slots.find(s => s.id === id);
const rigJoint = id => RIG.joints.find(j => j.id === id);
const rigPart = () => G.stage === 'gond' ? GOND.slots : WHEEL.slots;
const rigDone = part => (part === 'seat' ? GOND : WHEEL).slots.every(s => G.wheel.build.poles[s.id]);
// the drawn gap between crossing poles: the wheel's along the axle, the seat's up and down
function rigOff(sl) {
  const L = sl.layer || 0;
  if (sl.part === 'seat') return [0, L * GAP, 0];
  return [0, 0, (L - Math.sign(L) * 0.5) * GAP];
}
// how far below its place a part still is, while it is built on the ground and lifted
function rigDrop(sl) {
  const W = G.wheel;
  if (sl.part === 'seat') { const e = ease(Math.max(0, Math.min(1, W.seatLift))); return -(1 - e) * SEAT_DROP + (1 - e) * 2 * GAP; }
  return -(1 - ease(Math.max(0, Math.min(1, W.lift)))) * WHEEL_DROP;
}
function rigSegs(sid, plan = false, len = null) {
  const sl = rigSlot(sid), L = len ?? G.wheel.build.poles[sid]?.length;
  if (!sl || L == null) return null;
  const off = rigOff(sl), ws = G.wheel.sim;
  if (!plan && ws?.poles[sid]) { const P = ws.poles[sid]; return [[add3(ws.pos(P[0].id), off, 1), add3(ws.pos(P[P.length - 1].id), off, 1)]]; }
  const y = rigDrop(sl);
  const e = k => [sl.centre[0] + sl.dir[0] * k, sl.centre[1] + sl.dir[1] * k + y, sl.centre[2] + sl.dir[2] * k];
  return [[add3(e(-L / 2), off, 1), add3(e(L / 2), off, 1)]];
}
function rigDir(sid) { const s = rigSegs(sid); if (!s) return rigSlot(sid).dir; const [a, b] = s[0]; return [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; }
// a point of a pole in the drawing, where it is now (without the drawn gap)
function rigPoint(sid, at) {
  const ws = G.wheel.sim;
  if (ws) { const q = ws.near(sid, at); if (q != null) return ws.pos(q); }
  return [at[0], at[1] + rigDrop(rigSlot(sid)), at[2]];
}
function rigJointPos(j) {
  const a = rigSlot(j.a), b = rigSlot(j.b), oa = rigOff(a), ob = rigOff(b);
  if (j.axle) {
    // the axle's lashing: on the X's centre, its ring a little inside the square
    const zs = j.at[2] + (j.sq ? 0.12 : -0.12), p = rigPoint(j.b, [j.at[0], j.at[1], zs]);
    return add3(p, [0, 0, j.at[2] - zs + ob[2] / 2], 1);
  }
  return add3(rigPoint(j.a, j.at), oa.map((v, i) => (v + ob[i]) / 2), 1);
}
const longOfCorner = k => k === 0 || k === 3 ? 'W.gL1' : 'W.gL2';
function rigRopeFoot(k) { const sid = longOfCorner(k); return add3(rigPoint(sid, ropeFoot(k)), rigOff(rigSlot(sid)), 1); }
function rigRopeTop(k) { return add3(rigPoint('W.c0', ropeTop(k)), [0, -R, 0], 1); }
const WMM = { poles: {}, lash: {}, ropes: {}, guides: {} };
{
  let i = 0;
  const gm = new THREE.MeshBasicMaterial({ color: 0x3a7bff, transparent: true, opacity: 0.32, depthWrite: false });
  for (const sl of RIG.slots) {
    const a = makePoleMesh((i++ % 3) / 2); a.visible = false; scene.add(a); WMM.poles[sl.id] = [a];
    const gd = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 8), gm); gd.visible = false; scene.add(gd); WMM.guides[sl.id] = gd;
  }
  for (const j of RIG.joints) { const g = makeLashing(); g.visible = false; scene.add(g); WMM.lash[j.id] = g; }
  for (const h of SEAT_ROPES) { WMM.ropes[h.id] = new RopeViz(scene); WMM.ropes[h.id].show(false); }
}
function liftWheel() {
  if (!rigDone('wheel')) return infoCard('קודם בונים את כל הגלגל', 'שני ריבועים עם איקס, הציר דרך מרכז האיקסים וארבע סנדות פינה, כולן במקומן. רק אז מרימים אותו.');
  startClock(); G.wheel.lifting = true; refreshAll();
}
function liftWheelSeat() {
  if (!rigDone('seat')) return infoCard('קודם בונים את כל המושב', 'שתי סנדות אורך, שתי סנדות רוחב ואיקס, כולן במקומן מתחת לגלגל. רק אז מרימים אותו.');
  startClock(); G.wheel.seatLifting = true; refreshAll();
}
// back to building the wheel: it comes down to the ground, and the seat comes off it
function lowerWheel() {
  const W = G.wheel; W.lift = 0; W.lifting = false; W.seatLift = 0; W.seatLifting = false; W.ropes = {}; W.sim = null;
}
const WHEEL_CREW = ['baseL', 'baseR', 'lift1', 'lift2', 'guyG1', 'guyG2'];
let wheelRiders = false;
function drawWheel(dt) {
  const on = !!LV.wheel, W = G.wheel, gone = fadedOut();
  for (const sl of RIG.slots) {
    const m = WMM.poles[sl.id][0], gd = WMM.guides[sl.id];
    const placed = on && W.build.poles[sl.id];
    if (!placed) m.visible = false;
    else { const segs = rigSegs(sl.id); if (segs) { placeCylinder(m, segs[0][0], segs[0][1]); m.visible = true; } }
    const guide = on && !placed && rigStage(G.stage) && !G.check && rigPart().includes(sl);
    gd.visible = !!guide;
    if (guide) { const [[a, b]] = rigSegs(sl.id, true, sl.length); placeCylinder(gd, a, b); }
  }
  for (const j of RIG.joints) {
    const g = WMM.lash[j.id];
    if (!on || !W.build.joints[j.id] || !rigReachable(j, W.build.poles)) { g.visible = false; continue; }
    const oa = rigOff(rigSlot(j.a)), ob = rigOff(rigSlot(j.b));
    placeLashing(g, rigJointPos(j), rigDir(j.a), rigDir(j.b), j.axle ? [0, 0.04, 0] : oa.map((v, i) => (v - ob[i]) / 2));
    g.visible = !gone; coilProgress(g, j.id);
  }
  for (const h of SEAT_ROPES) {
    const rv = WMM.ropes[h.id];
    if (!on || !W.ropes[h.id] || !W.build.poles['W.c0'] || !W.build.poles[longOfCorner(h.corner)] || gone) { rv.show(false); continue; }
    rv.set(rigRopeTop(h.corner), rigRopeFoot(h.corner), 0.01);
  }
  if (!on) return;
  // six scouts lift the wheel by its bottom and side corner poles, three on each side
  const holdWheel = W.lifting;
  const holdSeat = W.seatLifting;
  if (holdWheel || holdSeat) {
    const y = holdWheel ? AXLE_Y - WHEEL_DROP * (1 - ease(W.lift)) : WSEAT_Y;
    WHEEL_CREW.forEach((k, n) => {
      const side = n % 2 ? 1 : -1, row = Math.floor(n / 2);
      const pos = holdWheel ? [side * 1.95, 0, WHEEL_Z + (row - 1) * 0.9] : [WSEAT_C[0] + side * 0.75, 0, WSEAT_C[1] + (row - 1) * 0.55];
      people[k].set(pos, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0.2, holdWheel ? Math.min(1.9, 0.4 + y * 0.5) : 0.4 + ease(W.seatLift) * 0.6);
    });
    const ready = WHEEL_CREW.every(k => people[k].arrived());
    if (holdWheel && (W.lift > 0 || ready)) {
      W.lift = Math.min(1, W.lift + dt / 1.4);
      if (W.lift >= 1) { W.lifting = false; sfx.ok(); WHEEL_CREW.forEach(k => people[k].clear()); refreshAll(); }
    }
    if (holdSeat && (W.seatLift > 0 || ready)) {
      W.seatLift = Math.min(1, W.seatLift + dt / 1.1);
      if (W.seatLift >= 1) { W.seatLifting = false; sfx.ok(); refreshAll(); }
    }
  } else if (W.seatLift >= 1 && G.stage === 'gond' && !G.check && !SEAT_ROPES.every(h => W.ropes[h.id])) {
    // the seat is held up until all four ropes are tied
    WHEEL_CREW.slice(0, 4).forEach((k, n) => { const c = ropeFoot(n); people[k].set([c[0] + (n === 0 || n === 3 ? -0.35 : 0.35), 0, c[2]], (n === 0 || n === 3) ? Math.PI / 2 : -Math.PI / 2, 0.2, 1.0); });
  } else if (W.seatLift >= 1 && G.stage === 'gond' && !G.check && WHEEL_CREW.some(k => people[k].want)) WHEEL_CREW.forEach(k => people[k].clear());
  // the two riders, in the inspection
  const c = G.check, ws = W.sim;
  if (ws && c && (c.riders || 0) > 0 && !gone) {
    const spots = ws.riderSpots();
    [[0, 1], [2, 3]].forEach(([i1, i2], n) => {
      const a = crew[n];
      if (spots[i1] == null || spots[i2] == null) return;
      if (c.riders < n + 0.5) { a.clear(); return; }
      const p = ws.pos(spots[i1]).map((v, i) => (v + ws.pos(spots[i2])[i]) / 2);
      const seat = [p[0], p[1] - 0.5, p[2]];
      const near = Math.hypot(a.pos.x - seat[0], a.pos.z - seat[2]) < 0.3;
      a.set(seat, Math.PI / 2, -0.1, 0.5, { lock: near || wheelRiders, sit: near });
    });
    wheelRiders = (c.riders || 0) >= 2;
  } else if (wheelRiders) { wheelRiders = false; for (const a of crew.slice(0, 2)) a.clear(); }
}
function nearestRigSlot(x, y) {
  let best = null, bd = 44;
  for (const s of rigPart().filter(q => !G.wheel.build.poles[q.id])) {
    const [[a, b]] = rigSegs(s.id, true, s.length);
    const A = toScreen(a), B = toScreen(b); if (!A || !B) continue;
    const d = distToSeg(x, y, A, B);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function collectWheelTargets(T) {
  const W = G.wheel;
  if (G.stage === 'wlift') return;
  const part = G.stage === 'gond' ? 'seat' : 'wheel';
  if (part === 'seat' || W.lift <= 0) for (const j of RIG.joints) {
    if (j.part !== part || !rigReachable(j, W.build.poles)) continue;
    T.push({ kind: W.build.joints[j.id] ? 'wlashed' : 'wjoint', id: j.id, pos: rigJointPos(j), show: !W.build.joints[j.id] });
  }
  if (part === 'seat' && W.seatLift >= 1 && W.build.poles['W.c0']) for (const h of SEAT_ROPES)
    if (!W.ropes[h.id] && W.build.poles[longOfCorner(h.corner)]) T.push({ kind: 'wrope', id: h.id, pos: rigRopeFoot(h.corner), show: true });
}
// the inspection: the מדריך pushes the towers, two scouts get on, the crew turns it a full turn, he pushes the seat
const WHEEL_PUSHES = [
  { from: 1.5, to: 3.0, f: [1, 0, 0], label: 'המדריך דוחף את החצובות <b>שמאלה</b>' },
  { from: 3.5, to: 5.0, f: [-1, 0, 0], label: 'המדריך דוחף <b>ימינה</b>' },
  { from: 5.5, to: 7.0, f: [0, 0, 1], label: 'המדריך דוחף <b>לאורך הציר</b>' },
];
const WRIDE = { board: [8, 10], spin: [10.5, 19], side: [19.8, 21.3], end: 22.5 };
function wheelRideLabel(c) {
  const t = c.t;
  if (t >= WRIDE.board[0] && t < WRIDE.board[1]) return 'שני צופים <b>עולים על המושב</b>';
  if (t >= WRIDE.spin[0] && t < WRIDE.spin[1]) return `הצוות <b>מסובב את הגלגל</b> · ${Math.abs((G.wheel.sim?.angle || 0) / 2 / Math.PI).toFixed(1)} סיבובים`;
  if (t >= WRIDE.side[0] && t < WRIDE.side[1]) return 'המדריך דוחף את המושב <b>לאורך הציר</b>';
  if (t >= WRIDE.board[0]) return 'הגלגל מסתובב…';
  return null;
}
// the inspection's physics: both tripods in one world, the axle holding their heads
// apart, and the wheel (with its seat) in a world of its own lying on their heads
function startWheelSim() {
  const W = G.wheel, TW = new World();
  TW.mu = 0; TW.iterations = 3;
  eachKlaf(k => {
    const t = k.tri;
    t.sim = new TripodSim({ feet: t.feet, lens: triLens(), braces: t.braces, joints: t.joints, stakes: t.stakes, stakeJoints: t.stakeJoints, spec: triSpec(), world: TW, guys: triSimGuys() });
  });
  W.triWorld = TW;
  const heads = G.klafim.map(k => k.tri.sim.legs[1].head);
  // the axle lies on both heads: they stay their distance apart
  if (W.build.poles['W.axle']) TW.add('rigid', heads[0], heads[1], { tag: 'axle' });
  W.sim = new WheelSim(W.build, { seat: true, ropes: W.ropes });
}
function stopWheelSims() {
  if (!G.wheel) return;
  G.wheel.sim = null; G.wheel.triWorld = null;
  G.klafim.forEach(k => { if (k.tri) k.tri.sim = null; });
}
// where the axle lies on a tripod's head, from where the head is
const axleOn = sim => add3(sim.pos(sim.legs[1].head), [0, AXLE_Y - (WH.forkHeight + R), 0], 1);
function stepWheel(h, push) {
  const W = G.wheel, ws = W.sim, c = G.check; if (!ws) return;
  const t = c?.t ?? 99;
  const riders = c && t >= WRIDE.board[0] ? Math.min(2, (t - WRIDE.board[0]) / (WRIDE.board[1] - WRIDE.board[0]) * 2.2) : (G.falling ? (c?.riders || 0) : 0);
  if (c) c.riders = riders;
  // the towers: the מדריך pushes the front tripod's head; the wheel, with its riders, lies on both
  const sims = G.klafim.map(k => k.tri.sim);
  const N = ws.mass() * 9.81 + Math.min(2, riders) * WH_TUNING.rider;
  sims.forEach((ts, i) => ts.forces({ push: i === 0 ? push : null, load: N / 2 }));
  W.triWorld.step(h, 30);
  ws.setPivots(sims.map(axleOn));
  ws.step(h, { riders, spin: !!c && t >= WRIDE.spin[0] && t < WRIDE.spin[1], side: c && t >= WRIDE.side[0] && t < WRIDE.side[1] ? [0, 0, WH_TUNING.sidePush] : null });
}
function watchWheel() {
  const ws = G.wheel.sim; if (!ws || G.falling || !G.check?.running) return;
  if ((G.check.t ?? 0) < 1) return;
  let kind = null, tower = -1;
  G.klafim.forEach((k, i) => { const ts = k.tri.sim; if (tower < 0 && (ts.slid() > 0.35 || ts.sunk() > 0.25 * ts.h0)) tower = i; });
  if (tower >= 0) kind = 'tower';
  else if (ws.rack() > WH_TUNING.rackLimit) kind = 'rack';
  else if (ws.slip() > WH_TUNING.slipLimit) kind = 'slip';
  else if (ws.seatBend() > WH_TUNING.seatBend) kind = 'bend';
  else if (ws.seatTilt() > WH_TUNING.seatTilt) kind = 'tilt';
  else if (ws.seatDrop() > 0.3) kind = 'drop';
  if (!kind) return;
  G.falling = { kind, t: 0, wheel: true, explain: explainWheel(kind, tower) };
  sfx.crash(); buzz([60, 40, 90]); fun.collapse([0, AXLE_Y, WHEEL_Z]);
  closePicker(); refreshAll();
}
function explainWheel(kind, tower = 0) {
  const W = G.wheel, b = W.build;
  if (kind === 'tower') {
    const k = G.klafim[tower], ts = k.tri.sim, loose = [0, 1, 2].filter(i => !ts.staked[i]).length;
    const stage = STAGES.find(q => q.id === 'brace' && q.k === tower).key, he = LV.klafim[tower].he;
    if (ts.braced.length < 3 && loose) return { stage, rule: 'רגלי חצובה לא נשארות במקום לבד', detail: `ב${he} ${loose === 3 ? 'הרגליים' : 'רגל שלא כפותה לבז״נט'} החליקו על החול תחת משקל הגלגל, והחצובה נפתחה ושקעה. חיזוק כפות בין כל שתי רגליים, ובז״נט לכל רגל, מחזיקים אותן במקום.`, focus: {} };
    if (loose) return { stage, rule: 'כל רגל של החצובה נכפתת לבז״נט', detail: `ב${he} רגל לא הייתה כפותה לבז״נט, והחצובה זזה כשדחפו אותה עם הגלגל עליה.`, focus: {} };
    return { stage, rule: 'החצובות צריכות לשאת את הגלגל', detail: `${he} לא עמדה במשקל הגלגל והרוכבים. בדקו את החיזוקים והבז״נטים שלה.`, focus: {} };
  }
  const miss = pred => RIG.joints.filter(j => pred(j) && !(b.joints[j.id] && rigReachable(j, b.poles)));
  const sq = miss(j => j.part === 'wheel' && !j.axle);
  const ax = miss(j => j.axle);
  const seat = miss(j => j.part === 'seat');
  const ropes = SEAT_ROPES.filter(h => !W.ropes[h.id]);
  if (kind === 'rack') return { stage: 'wheel', rule: 'כל ריבוע בגלגל צריך איקס מלא וכפיתה בכל פינה', detail: sq.length ? `${sq.length === 1 ? 'כפיתה אחת חסרה' : `${sq.length} כפיתות חסרות`} בריבועי הגלגל, והריבוע התקפל למעוין כשהגלגל הסתובב עם הרוכבים.` : 'ריבוע בגלגל התקפל תחת הרוכבים. בדקו את הכפיתות ואת אורכי הסנדות.', focus: { rigJoints: sq.map(j => j.id) } };
  if (kind === 'slip') return { stage: 'wheel', rule: 'מרכז האיקס בכל ריבוע נכפת אל הציר', detail: ax.length ? 'הגלגל לא היה כפות לציר, ולכן הציר הסתובב לבד והגלגל החליק עליו ונפל הצידה.' : 'הגלגל זז על הציר. בדקו את כפיתות האיקסים אל הציר.', focus: { rigJoints: ax.map(j => j.id) } };
  if (kind === 'bend') return { stage: 'gond', rule: 'כל פינה של המושב נכפתת', detail: seat.length ? `${seat.length === 1 ? 'כפיתה אחת חסרה' : `${seat.length} כפיתות חסרות`} במושב, והפינה צנחה כשהרוכבים ישבו עליה.` : 'המושב התעקם תחת הרוכבים.', focus: { rigJoints: seat.map(j => j.id) } };
  return { stage: 'gond', rule: 'המושב תלוי בארבעה חבלים, אחד מכל פינה', detail: ropes.length ? `${ropes.length === 1 ? 'פינה אחת של המושב לא הייתה תלויה' : `${ropes.length} פינות לא היו תלויות`}, והמושב נטה ושפך את הרוכבים.` : 'המושב נטה תחת הרוכבים. בדקו את חבלי התלייה ואת כפיתות המושב.', focus: { ropes: ropes.map(h => h.corner), rigJoints: seat.map(j => j.id) } };
}
function wheelStatus() {
  const W = G.wheel, b = W.build;
  const of = part => [RIG.slots.filter(s => s.part === part && b.poles[s.id]).length, RIG.slots.filter(s => s.part === part).length, RIG.joints.filter(j => j.part === part && b.joints[j.id]).length, RIG.joints.filter(j => j.part === part).length];
  if (G.stage === 'wheel') { const [p, P, j, J] = of('wheel'); return W.lift > 0 ? 'הגלגל למעלה. כדי לשנות אותו מורידים אותו (הקישו על השלב)' : `סנדות בגלגל ${p}/${P} · כפיתות ${j}/${J}`; }
  if (G.stage === 'wlift') return W.lifting ? 'שישה צופים מרימים את הגלגל…' : W.lift >= 1 ? 'הציר נח בראשי החצובות, ומסתובב בהם' : 'שישה צופים מרימים את הגלגל עד שהציר נכנס למזלגות';
  const [p, P, j, J] = of('seat');
  if (W.seatLifting) return 'הצוות מרים את המושב…';
  if (W.seatLift < 1) return `סנדות במושב ${p}/${P} · כפיתות ${j}/${J}`;
  return `חבלי תלייה ${SEAT_ROPES.filter(h => W.ropes[h.id]).length}/4 · הקישו על כל פינה של המושב כדי לקשור אליה חבל מסנדת הפינה התחתונה`;
}
// the folder's drawings of the wheel (front view) and of the seat (from above)
function wheelFolderCanvas(mode) {
  const seat = mode === 'seat';
  const c = document.createElement('canvas'); c.width = 900; c.height = 640; c.className = 'bp-canvas';
  const g = c.getContext('2d');
  g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(47,99,176,.12)'; g.lineWidth = 1;
  for (let x = 0; x < c.width; x += 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
  for (let y = 0; y < c.height; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
  const ink = '#2f63b0', red = '#c0392b';
  const line = (a, b, w = 8, col = ink) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); };
  const text = (s, x, y, size = 22, col = ink) => { g.fillStyle = col; g.font = `bold ${size}px sans-serif`; g.textAlign = 'center'; g.fillText(s, x, y); };
  const dot = (p, col = '#e0a93b', r = 9) => { g.fillStyle = col; g.beginPath(); g.arc(...p, r, 0, 7); g.fill(); };
  if (mode === 'tri') {
    // the 90° tripod: from the side (the upright leg on the wheel's side) and from above (where the feet stand)
    const S = 140, base = 560, O = [250, base], P = (x, y) => [O[0] - x * S, O[1] - y * S];
    const out = WH.footOut;
    line(P(0, 0), P(0, WH.forkHeight + WH.lashFromTop), 10);
    line(P(-out, 0), P(out * WH.lashFromTop / WH.forkHeight, WH.forkHeight + WH.lashFromTop), 9);
    dot(P(0, WH.forkHeight), '#e0a93b', 12);
    line([60, base + 4], [440, base + 4], 3, '#8a6d3b');
    text('מהצד', 250, 40);
    text(`זקופה ${TRI90.legLengths[1].toFixed(1)} מ׳`, 160, 330, 20);
    text(`נוטה ${TRI90.legLengths[0].toFixed(1)} מ׳`, 380, 330, 20);
    text(`כפיתת חצובה בגובה ${WH.forkHeight.toFixed(1)} מ׳`, 250, base - WH.forkHeight * S - 50, 20);
    text('→ הגלגל', 110, base - 40, 22, red);
    // from above: the three feet
    const Q = [680, 200], T = 110, pf = TRI90.planFeet([0, 0], 1).map(([x, z]) => [Q[0] - x * T, Q[1] + z * T]);
    for (let i = 0; i < 3; i++) line(pf[i], pf[(i + 1) % 3], 3);
    pf.forEach((p, i) => dot(p, i === 1 ? red : '#6b4423', 12));
    text('מלמעלה', 680, 40);
    text(`${TRI90.apart[0].toFixed(2)} מ׳`, 590, 290, 20); text(`${TRI90.apart[0].toFixed(2)} מ׳`, 770, 290, 20);
    text(`${TRI90.apart[2].toFixed(1)} מ׳`, 680, pf[0][1] + 40, 20);
    text('אדום: הרגל הזקופה, בצד של הגלגל', 680, 610, 20, red);
    return c;
  }
  if (!seat) {
    // front view: one square, its X, the axle in the middle, the corner poles' ends; the seat below
    const S = 150, O = [450, 300], P = q => [O[0] - q[0] * S, O[1] - (q[1] - AXLE_Y) * S];
    const sl = id => rigSlot(id), ends = id => { const s = sl(id), h = s.length / 2; return [P(add3(s.centre, s.dir, -h)), P(add3(s.centre, s.dir, h))]; };
    for (let k = 0; k < 4; k++) line(...ends(`W.s1${k}`), 9);
    line(...ends('W.dA1'), 7); line(...ends('W.dB1'), 7);
    for (let k = 0; k < 4; k++) dot(P(sl(`W.c${k}`).centre), '#6b4423', 11);
    dot(P([0, AXLE_Y]), red, 13);
    text(`צלע ${sl('W.s10').length.toFixed(1)} מ׳`, 640, 470);
    text(`אלכסון ${sl('W.dA1').length.toFixed(1)} מ׳`, 450, 120);
    text('ציר (אדום): כפיתה מרובעת במרכז האיקס', 450, 610, 20, red);
    text('סנדת פינה (חומה): כפיתה מרובעת לשתי הצלעות', 450, 580, 20, '#6b4423');
    text(`הציר בגובה ${AXLE_Y.toFixed(2)} מ׳, במזלגות`, 170, 300, 20);
    text(`שני ריבועים, ${(WH.apart - 2 * WH.inset).toFixed(1)} מ׳ זה מזה`, 170, 60, 20);
    // the seat hangs from the bottom corner pole
    const b = P(sl('W.c0').centre);
    line([b[0], b[1] + 8], [b[0], b[1] + 8 + WH.seat.hang * S * 0.55], 2, '#8a6d3b');
    line([b[0] - WH.seat.width * S * 0.5, b[1] + 8 + WH.seat.hang * S * 0.55], [b[0] + WH.seat.width * S * 0.5, b[1] + 8 + WH.seat.hang * S * 0.55], 8);
    text('המושב', b[0] + 110, b[1] + 50, 20);
  } else {
    // the seat from above: two long poles, two cross poles, an X; the ropes' corners
    const S = 300, O = [450, 320], P = q => [O[0] - (q[0] - WSEAT_C[0]) * S, O[1] - (q[2] - WSEAT_C[1]) * S];
    for (const s of GOND.slots) { const h = s.length / 2; line(P(add3(s.centre, s.dir, -h)), P(add3(s.centre, s.dir, h)), 9); }
    for (const j of GOND.joints) dot(P(j.at), j.correct === 'square' ? '#e0a93b' : '#7aa64a', 9);
    for (let k = 0; k < 4; k++) { const p = P(ropeFoot(k)); g.strokeStyle = '#8a6d3b'; g.lineWidth = 3; g.beginPath(); g.arc(...p, 18, 0, 7); g.stroke(); }
    const L = rigSlot('W.gL1').length, E = rigSlot('W.gE1').length;
    text(`אורך ${L.toFixed(1)} מ׳ (לאורך הציר)`, 450, 610);
    text(`רוחב ${E.toFixed(1)} מ׳`, 450, 40);
    text('עיגול: חבל תלייה אל סנדת הפינה התחתונה', 450, 580, 18, '#8a6d3b');
  }
  return c;
}

// ---------------- lashing picker ----------------
const picker = { el: $('picker'), target: null };
const lashIcon = {
  square: '<svg viewBox="0 0 26 22"><path d="M13 1v20M3 11h20" stroke="currentColor" stroke-width="3"/><rect x="8" y="6" width="10" height="10" fill="none" stroke="#e0a93b" stroke-width="2"/></svg>',
  cross: '<svg viewBox="0 0 26 22"><path d="M4 2l18 18M22 2L4 20" stroke="currentColor" stroke-width="3"/><path d="M8 11l5-5 5 5-5 5z" fill="none" stroke="#e0a93b" stroke-width="2"/></svg>',
  parallel: '<svg viewBox="0 0 26 22"><path d="M9 1v20M17 1v20" stroke="currentColor" stroke-width="3"/><path d="M6 8h14M6 12h14" stroke="#e0a93b" stroke-width="2"/></svg>',
  tripod: '<svg viewBox="0 0 26 22"><path d="M13 2L4 21M13 2v19M13 2l9 19" stroke="currentColor" stroke-width="3"/><circle cx="13" cy="5" r="3.5" fill="none" stroke="#e0a93b" stroke-width="2"/></svg>',
  guy: '<svg viewBox="0 0 26 22"><path d="M4 21V6" stroke="currentColor" stroke-width="4"/><path d="M4 9L24 2" stroke="#e0a93b" stroke-width="2"/><circle cx="4" cy="9" r="3.5" fill="none" stroke="#e0a93b" stroke-width="2"/></svg>',
};
// tutorial only: describe the meeting point, without naming the lashing
const TUTORIAL_TIP = {
  square: 'שתי סנדות נפגשות בזווית ישרה',
  cross: 'סנדות נפגשות בזווית שאינה ישרה',
  parallel: 'שתי סנדות צמודות זו לצד זו',
  guy: 'יתר שנכפת לבז״נט',
};
$('picker').insertBefore(Object.assign(document.createElement('div'), { id: 'picker-tip', className: 'picker-tip' }), $('picker-opts'));
$('picker-untie').addEventListener('click', () => {
  const t = picker.target; if (!t) return;
  if (t.kind === 'lashed') delete G.build.joints[t.id];
  if (t.kind === 'clashed') { delete G.cube.build.joints[t.id]; rebuildCube(); }
  if (t.kind === 'blashed') delete G.tri.joints[t.id];
  if (t.kind === 'slashed') delete G.seat.build.joints[t.id];
  if (t.kind === 'wlashed') delete G.wheel.build.joints[t.id];
  if (t.kind === 'mlashed') delete G.seat.mastJoints[t.id];
  closePicker(); refreshAll();
});
const cubeJoint = id => LV.cube.joints.find(j => j.id === id);
const cubeSlot = id => LV.cube?.slots.find(s => s.id === id);
function jointLabel(t) {
  if (t.kind === 'cjoint' || t.kind === 'clashed') {
    const j = cubeJoint(t.id), name = id => cubeSlot(id).he.replace(/ \(.*\)/, '');
    return j.b ? `${name(j.a)} × ${name(j.b)}` : `${name(j.a)} × רגל ה${LV.klafim[j.klaf].he}`;
  }
  if (t.kind === 'bjoint' || t.kind === 'blashed') { const j = BRACE_JOINTS.find(q => q.id === t.id); return `חיזוק × ${TRI_SLOTS[j.leg].he}`; }
  if (t.kind === 'sjoint' || t.kind === 'slashed') { const j = seatJoint(t.id); return `${seatSlot(j.a).he} × ${seatSlot(j.b).he}`; }
  if (t.kind === 'wjoint' || t.kind === 'wlashed') { const j = rigJoint(t.id), nm = id => rigSlot(id).he.replace(/ \(.*\)/, ''); return `${nm(j.a)} × ${nm(j.b)}`; }
  if (t.kind === 'mjoint' || t.kind === 'mlashed') return MAST_JOINTS.find(q => q.id === t.id).he;
  if (t.kind === 'tsj' || t.kind === 'tsjd') return `${TRI_SLOTS[TRI_STAKE_JOINTS.find(q => q.id === t.id).leg].he} אל הבז״נט`;
  if (t.kind === 'guyTie') return GUYS.find(g => g.id === t.id).he + ' אל הבז״נט';
  if (t.kind === 'tguyTie') return `היתר של ה${triLegName(+t.id.slice(2) - 1)} אל הרבז`;
  if (t.kind.startsWith('stake')) { const sj = STAKE_JOINTS.find(s => s.id === t.id); return `${slotById(sj.leg).he} אל הבז״נט`; }
  const j = JOINTS.find(q => q.id === t.id);
  const name = id => slotById(id).he.replace(/ \(.*\)/, '');
  return `${name(j.a)} × ${name(j.b)}`;
}
function correctFor(t) {
  if (t.kind === 'cjoint' || t.kind === 'clashed') return cubeJoint(t.id).correct;
  if (t.kind === 'bjoint' || t.kind === 'blashed') return 'square';
  if (t.kind === 'sjoint' || t.kind === 'slashed') return seatJoint(t.id).correct;
  if (t.kind === 'wjoint' || t.kind === 'wlashed') return rigJoint(t.id).correct;
  if (t.kind === 'mjoint' || t.kind === 'mlashed') return 'square';
  if (t.kind === 'tsj' || t.kind === 'tsjd') return 'parallel';
  if (t.kind === 'guyTie' || t.kind === 'tguyTie') return 'guy';
  if (t.kind.startsWith('stake')) return STAKE_JOINTS.find(s => s.id === t.id).correct;
  return JOINTS.find(j => j.id === t.id).correct;
}
function openPicker(t, x, y) {
  picker.target = t;
  const el = picker.el;
  el.hidden = false;
  const cur = t.kind === 'lashed' ? G.build.joints[t.id] : t.kind === 'stakeLashed' ? G.build.stakeJoints[t.id] : t.kind === 'clashed' ? G.cube.build.joints[t.id] : t.kind === 'blashed' ? G.tri.joints[t.id] : t.kind === 'tsjd' ? G.tri.stakeJoints[t.id] : t.kind === 'slashed' ? G.seat.build.joints[t.id] : t.kind === 'mlashed' ? G.seat.mastJoints[t.id] : t.kind === 'wlashed' ? G.wheel.build.joints[t.id] : t.kind === 'tguyTie' ? G.tri.guys.fix[t.id] : null;
  $('picker-title').textContent = (cur ? 'החלפת כפיתה · ' : 'בחרו כפיתה · ') + jointLabel(t);
  const opts = $('picker-opts'); opts.innerHTML = '';
  for (const id of t.kind === 'guyTie' || t.kind === 'tguyTie' ? GUY_LASHING_ORDER : LASHING_ORDER) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.dataset.type = id; btn.className = id === cur ? 'cur' : '';
    btn.innerHTML = lashIcon[id] + `<span>${LASHINGS[id].he}</span>`;
    btn.addEventListener('click', () => chooseLashing(id));
    opts.appendChild(btn);
  }
  const tip = LV.tutorial ? TUTORIAL_TIP[correctFor(t)] : '';
  $('picker-tip').textContent = tip ? 'הדרכה: ' + tip : '';
  $('picker-tip').hidden = !tip;
  $('picker-untie').hidden = !((t.kind === 'lashed' && G.stage === 'build') || (t.kind === 'clashed' && G.stage === 'cube') || t.kind === 'blashed' || t.kind === 'slashed' || t.kind === 'mlashed' || t.kind === 'wlashed');
  const w = el.offsetWidth, h = el.offsetHeight;
  const W = window.innerWidth, H = window.innerHeight;
  let left = x - w / 2, top = y + 28;
  if (top + h > H - 50) top = y - h - 28;
  left = Math.max(8, Math.min(W - w - 8, left)); top = Math.max(50, Math.min(H - h - 8, top));
  el.style.left = left + 'px'; el.style.top = top + 'px';
}
function closePicker() { picker.el.hidden = true; picker.target = null; }
function chooseLashing(type) {
  const t = picker.target; if (!t || closeup) return;
  const b = G.build;
  closePicker();
  const fresh = t.kind === 'joint' || t.kind === 'cjoint' || t.kind === 'guyTie' || t.kind === 'tguyTie' || t.kind === 'stakeJoint' || t.kind === 'bjoint' || t.kind === 'tsj' || t.kind === 'sjoint' || t.kind === 'mjoint' || t.kind === 'wjoint';
  if (fresh && ropeLeft() <= 0) return flashHint('<b>נגמרו החבלים.</b> אפשר להתיר כפיתה מיותרת כדי לקבל חבל בחזרה');
  const tie = () => {
    if (t.kind === 'joint' || t.kind === 'lashed') {
      b.joints[t.id] = type;
      G.sim?.addJoint(JOINTS.find(j => j.id === t.id));
    } else if (t.kind === 'cjoint' || t.kind === 'clashed') {
      G.cube.build.joints[t.id] = type;
      G.cube.sim?.addJoint(cubeJoint(t.id));
    } else if (t.kind === 'bjoint' || t.kind === 'blashed') {
      G.tri.joints[t.id] = type;
    } else if (t.kind === 'sjoint' || t.kind === 'slashed') {
      G.seat.build.joints[t.id] = type;
    } else if (t.kind === 'mjoint' || t.kind === 'mlashed') {
      G.seat.mastJoints[t.id] = type;
    } else if (t.kind === 'wjoint' || t.kind === 'wlashed') {
      G.wheel.build.joints[t.id] = type;
    } else if (t.kind === 'tsj' || t.kind === 'tsjd') {
      G.tri.stakeJoints[t.id] = type;
    } else if (t.kind === 'tguyTie') {
      G.tri.guys.fix[t.id] = type;
    } else if (t.kind === 'guyTie') {
      b.guyTies[t.id] = type;
      G.sim?.tieGuy(t.id);
    } else {
      const fresh = !b.stakeJoints[t.id];
      b.stakeJoints[t.id] = type;
      if (fresh) G.sim?.tieStakeJoint(STAKE_JOINTS.find(s => s.id === t.id));
    }
    G.tying = { id: t.id, t: 0 };
    sfx.lash();
    if (!(t.kind === 'lashed' || t.kind === 'stakeLashed' || t.kind === 'clashed' || t.kind === 'blashed' || t.kind === 'tsjd' || t.kind === 'slashed' || t.kind === 'mlashed' || t.kind === 'wlashed')) { const pos = t.pos; setTimeout(() => fun.lashed(pos), 280); }
    refreshAll();
  };
  // changing the type of a lashing already tied needs no close-up
  if (t.kind === 'lashed' || t.kind === 'stakeLashed' || t.kind === 'clashed' || t.kind === 'blashed' || t.kind === 'tsjd' || t.kind === 'slashed' || t.kind === 'mlashed' || t.kind === 'wlashed') return tie();
  lashCloseup(t.pos, tie);
}

// ---------------- pole tray (drag a pole onto the drawing) ----------------
const trayPole = $('tray-pole');
let drag = null;
trayPole.addEventListener('pointerdown', e => {
  sfx.unlock(); startClock();
  const item = e.target.closest('.pile-item'); if (!item) return;
  if (item.dataset.len === 'free') { // the pole bar: take a pole, its length is drawn on the grid
    closePicker(); selectPole(null);
    if (G.stage !== 'build') return;
    G.armed = G.armed ? null : (G.lastLength || 2); controls.enabled = !G.armed; renderPile(); refreshHint();
    return;
  }
  const len = +item.dataset.len;
  if (poleLeft(len) <= 0) { flashHint(`<b>אין עוד סנדות של ${len.toFixed(1)} מ׳ בערימה.</b> אפשר להחזיר סנדה מהשרטוט`); return; }
  G.lastLength = len; renderPile();
  trayPole.setPointerCapture(e.pointerId);
  drag = { slot: null, len, x: e.clientX, y: e.clientY };
  closePicker();
});
trayPole.addEventListener('pointermove', e => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return; // a tap, not a drag
  if (freeKlaf() && G.stage === 'build') return; // free build: the pole is laid with a drag on the grid itself
  const p = groundAt(e.clientX, e.clientY);
  if (!p) return;
  drag.moved = true;
  const len = G.lastLength;
  if (rigStage(G.stage)) {
    const slot = nearestRigSlot(e.clientX, e.clientY);
    drag.slot = slot; slotGlow.visible = false;
    if (slot) { const [[a, b]] = rigSegs(slot.id, true, len); placeCylinder(ghost, a, b); }
    else placeCylinder(ghost, [p.x - len / 2, 0.2, p.z], [p.x + len / 2, 0.2, p.z]);
    return;
  }
  if (LV.carousel && seatStage(G.stage)) {
    const slot = nearestSeatSlot(e.clientX, e.clientY);
    drag.slot = slot; slotGlow.visible = false;
    if (slot) { const [[a, b]] = seatSegs(slot.id, true, len); placeCylinder(ghost, a, b); }
    else placeCylinder(ghost, [p.x - len / 2, 0.2, p.z], [p.x + len / 2, 0.2, p.z]);
    return;
  }
  if (G.stage === 'brace') {
    const slot = nearestBrace(e.clientX, e.clientY);
    drag.slot = slot; slotGlow.visible = false;
    if (slot) { const [a, b] = braceEnds(slot, len); placeCylinder(ghost, a, b); }
    else placeCylinder(ghost, [p.x - len / 2, 0.5, p.z], [p.x + len / 2, 0.5, p.z]);
    return;
  }
  if (G.stage === 'cube') {
    // side poles go up between the two klafim: snap to the nearest planned line on screen
    const slot = nearestCubeSlot(e.clientX, e.clientY);
    drag.slot = slot;
    slotGlow.visible = false;
    if (slot) { const [[a, b]] = cubeSegs(slot.id, true, len); placeCylinder(ghost, a, b); }
    else placeCylinder(ghost, [p.x - len / 2, 0.2, p.z], [p.x + len / 2, 0.2, p.z]);
    return;
  }
  const slot = nearestSlot(p.x, p.z - z0());
  drag.slot = slot;
  if (slot) {
    const a = slotPoint(slot, -len / 2), b = slotPoint(slot, len / 2);
    placeCylinder(ghost, [a[0], 0.2, a[1] + z0()], [b[0], 0.2, b[1] + z0()]);
    const pa = slotPoint(slot, -slot.length / 2), pb = slotPoint(slot, slot.length / 2);
    slotGlow.visible = true;
    slotGlow.position.set((pa[0] + pb[0]) / 2, 0.01, (pa[1] + pb[1]) / 2 + z0());
    slotGlow.scale.set(slot.length, 1, 1);
    slotGlow.rotation.set(-Math.PI / 2, 0, Math.atan2(slot.dir[1], slot.dir[0]));
  } else {
    placeCylinder(ghost, [p.x - len / 2, 0.2, p.z], [p.x + len / 2, 0.2, p.z]);
    slotGlow.visible = false;
  }
});
// put a pole of the chosen length from the pile on a line of the drawing
function placePole(slot) {
  if (poleLeft(G.lastLength) <= 0) { flashHint(`<b>אין עוד סנדות של ${G.lastLength.toFixed(1)} מ׳ בערימה.</b> אפשר להחזיר סנדה מהשרטוט`); return false; }
  if (G.stage === 'brace') {
    G.tri.braces[slot.id] = { length: G.lastLength };
    if (!braceReaches(triState(), slot, G.lastLength)) flashHint(`<b>הסנדה הזו קצרה מדי</b> ולא מגיעה לשתי הרגליים. הקישו עליה כדי להחזיר אותה לערימה`);
    sfx.thud(); G.armed = null; renderPile();
    return true;
  }
  if (rigStage(G.stage)) {
    G.wheel.build.poles[slot.id] = { length: G.lastLength };
    sfx.thud(); selectPole(slot.id); G.armed = null; renderPile();
    return true;
  }
  if (LV.carousel && seatStage(G.stage)) {
    G.seat.build.poles[slot.id] = { length: G.lastLength };
    if (slot === MAST && !mastReaches(G.lastLength)) flashHint(`<b>התורן קצר מדי</b>: ${G.lastLength.toFixed(1)} מ׳ לא מגיעים לטבעת שבאמצע איקס הגג. החליפו אותו בסנדה ארוכה יותר`);
    sfx.thud(); selectPole(slot.id); G.armed = null; renderPile();
    return true;
  }
  if (G.stage === 'cube') { G.cube.build.poles[slot.id] = { length: G.lastLength }; rebuildCube(); }
  else G.build.poles[slot.id] = { length: G.lastLength };
  startCarry(slot.id);
  selectPole(slot.id);
  G.armed = null; renderPile();
  return true;
}
function endDrag() {
  if (!drag) return;
  ghost.visible = false; slotGlow.visible = false;
  if (drag.slot) placePole(drag.slot);
  else if (!drag.moved) {
    // a tap on the pile: hold that length, then tap a line on the drawing
    G.armed = drag.len; renderPile();
    if (freeKlaf() && G.stage === 'build') { controls.enabled = false; flashHint(`נבחרה סנדה של <b>${drag.len.toFixed(1)} מ׳</b>. גררו על הרשת מהמקום שבו היא מתחילה אל הכיוון שלה. הקשה במקום מניחה אותה זקופה`); }
    else if (G.stage === 'brace') flashHint(`נבחרה סנדה של <b>${drag.len.toFixed(1)} מ׳</b>. הקישו בין שתי רגליים של החצובה כדי לשים אותה שם`);
    else if (rigStage(G.stage)) flashHint(`נבחרה סנדה של <b>${drag.len.toFixed(1)} מ׳</b>. הקישו על קו כחול ב${G.stage === 'gond' ? 'מושב' : 'גלגל'} כדי להניח אותה שם`);
    else if (G.stage === 'hang') flashHint(`נבחרה סנדה של <b>${drag.len.toFixed(1)} מ׳</b>. הקישו על הקו שבאמצע ה־# כדי להעביר אותה שם כתורן`);
    else if (G.stage === 'seat') flashHint(`נבחרה סנדה של <b>${drag.len.toFixed(1)} מ׳</b>. הקישו על קו בשרטוט המושב כדי להניח אותה`);
    else flashHint(`נבחרה סנדה של <b>${drag.len.toFixed(1)} מ׳</b>. הקישו על קו בשרטוט כדי להניח אותה, או גררו אותה לשם`);
  } else if (drag.slot === null && drag.moved) {
    flashHint(rigStage(G.stage) ? 'שחררו את הסנדה על אחד הקווים הכחולים' : G.stage === 'brace' ? 'שחררו את הסנדה בין שתי רגליים של החצובה' : G.stage === 'cube' ? 'שחררו את הסנדה על אחד הקווים בשרטוטי הצדדים' : 'שחררו את הסנדה על אחד הקווים הכחולים בשרטוט');
  }
  drag = null; refreshAll();
}
trayPole.addEventListener('pointerup', endDrag);
trayPole.addEventListener('pointercancel', () => { drag = null; ghost.visible = false; slotGlow.visible = false; });
function nearestCubeSlot(x, y) {
  let best = null, bd = 44;
  for (const s of LV.cube.slots) {
    if (G.cube.build.poles[s.id]) continue;
    const [[a, b]] = cubeSegs(s.id, true, s.length);
    const A = toScreen(a), B = toScreen(b); if (!A || !B) continue;
    const d = distToSeg(x, y, A, B);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function nearestSlot(x, z) {
  let best = null, bd = 0.45;
  for (const s of SLOTS) {
    if (G.build.poles[s.id]) continue;
    const a = slotPoint(s, -s.length / 2), b = slotPoint(s, s.length / 2);
    const d = distToSeg(x, z, a, b);
    // diagonals cross at the centre: prefer the one whose direction fits the finger's spot
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// ---------------- pole length (finger scroll) ----------------
// klaf poles and the cube's side poles
const isCubePole = sid => sid.startsWith('C.') || sid.startsWith('F.');
const isRigPole = sid => sid.startsWith('W.');
const slotOf = sid => isRigPole(sid) ? rigSlot(sid) : isSeatPole(sid) ? seatSlot(sid) : isCubePole(sid) ? cubeSlot(sid) : slotById(sid);
const polesOf = sid => isRigPole(sid) ? G.wheel.build.poles : isSeatPole(sid) ? G.seat.build.poles : isCubePole(sid) ? G.cube.build.poles : G.build.poles;
const meshesOf = sid => isRigPole(sid) ? WMM.poles[sid] : isSeatPole(sid) ? SM.poles[sid] : isCubePole(sid) ? CM.poles[sid] : poleMeshes[sid];
function selectPole(sid) {
  if (G.selected) meshesOf(G.selected).forEach(m => m.material[0].emissive?.setHex(0x000000));
  G.selected = sid;
  $('length-panel').hidden = !sid || (G.stage !== 'build' && G.stage !== 'cube' && !seatStage(G.stage) && !rigStage(G.stage));
  if (sid) {
    meshesOf(sid).forEach(m => m.material[0].emissive.setHex(0x5a3a00));
    updateLengthPanel();
  }
  refreshHint();
}
function updateLengthPanel() {
  const sid = G.selected; if (!sid) return;
  const slot = slotOf(sid), pole = polesOf(sid)[sid];
  $('lp-name').textContent = slot.he.replace(/ \((?!צד).*\)/, '');
  $('lp-value').textContent = pole.length.toFixed(1);
  $('lp-plan').textContent = slot.length.toFixed(1);
  const d = pole.length - slot.length;
  $('lp-value').style.color = LV.free ? '' : Math.abs(d) < 0.05 ? '#9be37f' : d < 0 ? '#ff9a85' : '';
  document.querySelector('.lp-plan').hidden = !!LV.free;
  $('lp-remove').textContent = LV.free ? 'הסרת הסנדה' : 'החזרה לערימה';
  $('lp-fit').textContent = LV.free ? 'החליקו למעלה או למטה כדי לשנות את האורך' : Math.abs(d) < 0.05 ? 'בדיוק כמו בשרטוט' : d < 0 ? 'קצרה מדי: צריך 15 ס״מ מעבר לכל כפיתה (מרחק כפיתה)' : 'ארוכה מהשרטוט: תעבוד, אבל בפחות נקודות';
}
function changeLength(steps) {
  const sid = G.selected; if (!sid || !steps) return;
  if (freeKlaf()) { // free build: any length; the pole grows from its lower end
    const sl = slotById(sid), nl = Math.round(Math.max(POLE_MIN, Math.min(POLE_MAX, sl.length + steps * 0.1)) * 10) / 10;
    if (nl === sl.length || G.stage !== 'build') return;
    if (poleLashed(sid)) return flashHint(LASHED_MSG);
    const d = (nl - sl.length) / 2;
    const next = { ...sl, centre: [sl.centre[0] + sl.dir[0] * d, sl.centre[1] + sl.dir[1] * d], length: nl };
    if (!onSheet(next)) return;
    G.build.poles[sid] = { length: nl }; G.lastLength = nl;
    freeSync(SLOTS.map(q => q === sl ? next : q));
    sfx.tick(); buzz(8); updateLengthPanel(); refreshAll();
    return;
  }
  const pole = polesOf(sid)[sid];
  const nl = Math.round(Math.max(1.0, Math.min(5.0, pole.length + steps * 0.1)) * 10) / 10;
  if (nl === pole.length) return;
  pole.length = nl; G.lastLength = nl;
  // a lashing falls off if the pole no longer reaches the joint
  if (isRigPole(sid)) {
    for (const j of RIG.joints) if (G.wheel.build.joints[j.id] && !rigReachable(j, G.wheel.build.poles)) delete G.wheel.build.joints[j.id];
  } else if (isSeatPole(sid)) {
    for (const j of SEAT.joints) if (G.seat.build.joints[j.id] && !seatReachable(j)) delete G.seat.build.joints[j.id];
    if (sid === MAST.id && !mastReaches(nl)) G.seat.pivot = false;
  } else if (isCubePole(sid)) {
    for (const j of LV.cube.joints) if (G.cube.build.joints[j.id] && !cubeJointReachable(j, LV.cube, G.cube.build.poles)) delete G.cube.build.joints[j.id];
    rebuildCube();
  } else for (const j of JOINTS) if (G.build.joints[j.id] && !jointReachable(j, G.build.poles)) delete G.build.joints[j.id];
  sfx.tick();
  // the pole clicks to each 10 cm step; a stronger buzz when it matches the drawing
  buzz(Math.abs(nl - slotOf(sid).length) < 0.05 ? 35 : 8);
  updateLengthPanel(); refreshAll();
}
{
  const sc = $('lp-scroll'); let acc = 0, lastY = 0, on = false;
  sc.addEventListener('pointerdown', e => { on = true; lastY = e.clientY; acc = 0; sc.setPointerCapture(e.pointerId); });
  sc.addEventListener('pointermove', e => {
    if (!on) return;
    acc += lastY - e.clientY; lastY = e.clientY;
    $('lp-ticks').style.transform = `translateY(${-(acc % 22)}px)`;
    while (acc >= 22) { acc -= 22; changeLength(1); }
    while (acc <= -22) { acc += 22; changeLength(-1); }
  });
  sc.addEventListener('pointerup', () => { on = false; });
  sc.addEventListener('wheel', e => { e.preventDefault(); changeLength(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  $('lp-plus').addEventListener('click', () => changeLength(1));
  $('lp-minus').addEventListener('click', () => changeLength(-1));
  $('lp-remove').addEventListener('click', () => {
    const sid = G.selected; if (!sid) return;
    if (freeKlaf() && poleLashed(sid)) return flashHint(LASHED_MSG);
    delete polesOf(sid)[sid];
    if (isRigPole(sid)) {
      for (const j of RIG.joints) if (j.a === sid || j.b === sid) delete G.wheel.build.joints[j.id];
      if (sid === 'W.c0' || sid === 'W.gL1' || sid === 'W.gL2') G.wheel.ropes = {};
    } else if (isSeatPole(sid)) {
      for (const j of SEAT.joints) if (j.a === sid || j.b === sid) delete G.seat.build.joints[j.id];
      for (const mj of MAST_JOINTS) if (sid === MAST.id || mj.b === sid) delete G.seat.mastJoints[mj.id];
      if (sid === MAST.id) { G.seat.pivot = false; G.seat.ropes = {}; }
    } else if (isCubePole(sid)) {
      for (const j of LV.cube.joints) if (j.a === sid || j.b === sid) delete G.cube.build.joints[j.id];
      rebuildCube();
    } else for (const j of JOINTS) if (j.a === sid || j.b === sid) delete G.build.joints[j.id];
    selectPole(null);
    if (freeKlaf()) { meshesOf(sid).forEach(m => { m.visible = false; }); freeSync(SLOTS.filter(q => q.id !== sid)); }
    refreshAll();
  });
}

// ---------------- the pole pile and the rope (limited per level) ----------------
// Each level comes with a pile of real poles: the lengths its drawings need, plus
// a few that fit nowhere exactly. Poles are not cut, so every choice uses one up.
const r1 = x => Math.round(x * 10) / 10;
function pileStock() {
  const m = new Map();
  const add = l => m.set(r1(l), (m.get(r1(l)) || 0) + 1);
  // free build has a pole bar, not a pile: any length, as many as needed; a tripod takes its poles from an open pile
  if (LV.free) return freeTri() ? [6.0, 5.5, 5.0, 4.5, 4.0, 3.5, 3.0, 2.5, 2.0].map(l => [l, Infinity]) : [];
  for (let i = 0; i < LV.klafim.length; i++) (LV.klafim[i].plan?.slots ?? SLOTS).forEach(s => add(s.length));
  if (LV.cube) LV.cube.slots.forEach(s => add(s.length));
  if (LV.tripod) BRACES.forEach(q => add(q.length));
  if (LV.carousel) [...SEAT.slots, MAST].forEach(q => add(q.length));
  if (LV.wheel) { RIG.slots.forEach(q => add(q.length)); LV.klafim.forEach(k => k.tri && Object.values(k.tri.braceLengths).forEach(add)); }
  (LV.stockExtra || []).forEach(add);
  return [...m.entries()].sort((a, b) => b[0] - a[0]);
}
function polesInUse() {
  const m = new Map();
  const add = set => { for (const id in set) if (set[id]) { const l = r1(set[id].length); m.set(l, (m.get(l) || 0) + 1); } };
  G.klafim.forEach(k => add(k.build.poles));
  if (G.cube) add(G.cube.build.poles);
  G.klafim.forEach(k => { if (k.tri) add(k.tri.braces); });
  if (G.seat) add(G.seat.build.poles);
  if (G.wheel) add(G.wheel.build.poles);
  return m;
}
const poleLeft = len => LV.free ? Infinity : (pileStock().find(([l]) => l === r1(len))?.[1] || 0) - (polesInUse().get(r1(len)) || 0);
// rope: one length per lashing in the plan, and a couple to spare
const countTrue = o => Object.values(o).filter(Boolean).length;
function ropeTotal() {
  if (LV.free) return Infinity; // free build: rope as needed
  if (LV.tripod) return TRI_JOINTS.length + BRACE_JOINTS.length + TRI_STAKE_JOINTS.length + 3 + (LV.ropeSpare ?? 2);
  const klafJ = LV.klafim.reduce((a, k) => a + (k.kind === 'tripod' ? TRI_JOINTS.length + BRACE_JOINTS.length + TRI_STAKE_JOINTS.length + (k.tri?.twin ? 4 : 3) : (k.plan?.joints ?? JOINTS).length + STAKE_JOINTS.length + GUYS.length), 0);
  const seatJ = LV.carousel ? SEAT.joints.length + MAST_JOINTS.length + HANG_ROPES.length + 1 : LV.wheel ? RIG.joints.length + SEAT_ROPES.length : 0;
  return klafJ + (LV.cube ? LV.cube.joints.length : 0) + seatJ + (LV.ropeSpare ?? 2);
}
function ropeUsed() {
  let n = 0;
  for (const k of G.klafim) n += countTrue(k.build.joints) + countTrue(k.build.stakeJoints) + countTrue(k.build.guyTies);
  if (G.cube) n += countTrue(G.cube.build.joints);
  for (const k of G.klafim) if (k.tri) n += countTrue(k.tri.joints) + countTrue(k.tri.stakeJoints) + countTrue(k.tri.guys.fix);
  if (G.seat) n += countTrue(G.seat.build.joints) + countTrue(G.seat.mastJoints) + countTrue(G.seat.ropes) + (G.seat.pivot ? 1 : 0);
  if (G.wheel) n += countTrue(G.wheel.build.joints) + countTrue(G.wheel.ropes);
  return n;
}
const ropeLeft = () => ropeTotal() - ropeUsed();
let pileKey = '';
function renderPile() {
  if (freeKlaf()) {
    const key = 'free' + !!G.armed;
    if (key !== pileKey) {
      pileKey = key;
      $('tray-pole').innerHTML = `<button type="button" class="pile-item pole-bar${G.armed ? ' on' : ''}" data-len="free"><span class="pile-stick" style="width:70px"></span><b>סנדה</b><small>${G.armed ? 'ציירו אותה על הרשת' : 'הקישו כדי לקחת'}</small></button>`;
    }
    $('rope-count').innerHTML = ''; $('tray-count').textContent = '';
    return;
  }
  const rows = pileStock().map(([l, n]) => [l, n - (polesInUse().get(l) || 0)]);
  const key = JSON.stringify(rows);
  if (key !== pileKey) {
    // rebuilt only when the counts change, never under a finger that is starting a drag
    pileKey = key;
    $('tray-pole').innerHTML = rows.map(([l, left]) => `<button type="button" class="pile-item${left ? '' : ' empty'}" data-len="${l}">
      <span class="pile-stick" style="width:${Math.round(l * 22)}px"></span><b>${l.toFixed(1)}</b><small>${isFinite(left) ? '×' + left : ''}</small></button>`).join('');
  }
  for (const el of $('tray-pole').children) el.classList.toggle('on', +el.dataset.len === (G.armed ?? G.lastLength) && poleLeft(+el.dataset.len) > 0);
  $('rope-count').innerHTML = isFinite(ropeLeft()) ? `חבלים לכפיתות: <b>${ropeLeft()}</b>` : '';
}

// ---------------- the raise crew ----------------
// The player sends the scouts of the level's crew to the guy lines: pullers
// on the front lines, holders on the back ones. A line nobody holds lies
// slack, and the physics shows what that means.
// A proper klaf raise takes 6 (Omer): 4 on the guy lines and 2 lifting the top of the klaf.
// Every role is one entry here, so roles are easy to change.
const CREW_NAMES = ['נועה', 'איתי', 'מאיה', 'יונתן', 'תמר', 'עידו', 'שירה', 'אורי'];
const LIFTERS = [{ id: 'L1', leg: 'legL', lifter: true }, { id: 'L2', leg: 'legR', lifter: true }];
const crewRoles = () => [...GUYS, ...LIFTERS];
function crewRole(g) {
  const side = (slotById(g.leg)?.he || (g.leg === 'legR' ? 'רגל שמאל' : 'רגל ימין')).replace('רגל ', '');
  if (g.lifter) return `בקלף · מרים ומייצב, ${side}`;
  return `${g.side < 0 ? 'מושכים' : 'מחזיקים'} · ${g.side < 0 ? 'קדמי' : 'אחורי'} ${side}`;
}
const crewSize = () => LV.crew || 6;
function freeCrew() {
  const used = new Set(Object.values(G.build.crew).filter(v => v != null));
  return [...Array(crewSize()).keys()].filter(i => !used.has(i));
}
function toggleCrew(gid) {
  const b = G.build, sim = G.sim, g = crewRoles().find(q => q.id === gid);
  if (!sim || sim.angle() > 8 || b.guyTies[gid]) return flashHint('את הצוות משבצים לפני שמתחילים למשוך');
  if (!g.lifter && !b.guyTop[gid]) return flashHint('קודם כופתים את היתר לראש הרגל');
  if (b.crew[gid] != null) { delete b.crew[gid]; if (!g.lifter) sim.dropGuy(gid); }
  else {
    const free = freeCrew();
    if (!free.length) return flashHint(`<b>כל ${crewSize()} הצופים כבר משובצים.</b> הקישו על תפקיד כדי לשחרר צופה`);
    b.crew[gid] = free[0];
    if (!g.lifter) sim.addGuy(g);
  }
  sfx.tick(); renderCrew(); refreshAll();
}
// Omer: a klaf is raised only once the whole crew is assigned and everyone is at their post
const crewActor = g => g.lifter ? people[g.leg === 'legR' ? 'lift1' : 'lift2'] : people['guy' + g.id];
function crewReady() {
  const b = G.build, roles = crewRoles();
  const missing = roles.filter(g => b.crew[g.id] == null).length;
  const walking = !missing && roles.some(g => !crewActor(g).arrived());
  return { missing, walking, ok: !missing && !walking };
}
let crewKey = '';
function renderCrew() {
  const b = G.build; if (!b) return;
  const key = JSON.stringify([b.crew, b.guyTop, G.ki, LV.number, G.height?.panel, G.height?.crew, triOn() && G.tri?.crew, triOn() && G.tri?.raising]);
  if (key === crewKey) return;
  crewKey = key;
  $('crew-panel').querySelector('.tray-title').textContent = heightPanelOn() ? 'עבודה בגובה' : triRaiseMode() ? 'צוות הקמת החצובה' : 'צוות ההרמה';
  if (heightPanelOn()) return renderHeightCrew();
  if (triRaiseMode()) return renderTriCrew();
  $('crew-free').textContent = `${freeCrew().length} מתוך ${crewSize()} פנויים`;
  $('crew-list').innerHTML = crewRoles().map(g => {
    const who = b.crew[g.id], ready = g.lifter || b.guyTop[g.id];
    return `<button type="button" class="crew-row${who != null ? ' on' : ''}${ready ? '' : ' off'}" data-gid="${g.id}">
      <span class="crew-role">${crewRole(g)}</span><span class="crew-who">${who != null ? CREW_NAMES[who] : ready ? '+ צופה' : 'יתר לא כפות'}</span></button>`;
  }).join('');
}
$('crew-list').addEventListener('click', e => { const r = e.target.closest('.crew-row'); if (r) (heightPanelOn() ? toggleHeightCrew : triRaiseMode() ? toggleTriCrew : toggleCrew)(r.dataset.gid); });

// ---------------- rope pull ----------------
{
  const pad = $('rp-pad'); let on = false, lastY = 0, ropeOff = 0, lastCreak = 0;
  pad.addEventListener('pointerdown', e => { sfx.unlock(); startClock(); on = true; lastY = e.clientY; pad.setPointerCapture(e.pointerId); });
  pad.addEventListener('pointermove', e => {
    if (!on || G.falling) return;
    const dy = e.clientY - lastY; lastY = e.clientY;
    if (dy <= 0) return;
    if (triRaiseMode()) { pullTripod(dy); ropeOff += dy; $('rp-rope').style.backgroundPosition = `0 ${ropeOff}px`; const now = performance.now(); if (now - lastCreak > 200) { lastCreak = now; sfx.creak(Math.min(1, dy / 12)); } return; }
    if (!G.sim) return;
    if (!G.sim.canPull()) { flashHint('המושכים מושכים ב<b>יתרים הקדמיים</b>: כפתו אותם קודם לראש הקלף'); return; }
    if (G.sim.angle() < 8) {
      const cr = crewReady();
      if (cr.missing) { flashHint(`<b>צריך צוות של ${crewSize()} כדי להרים קלף.</b> שבצו עוד ${cr.missing === 1 ? 'צופה אחד' : cr.missing + ' צופים'} בחלון הצוות`); return; }
      if (cr.walking) { flashHint('הצוות עוד בדרך למקומות. מושכים כשכולם במקום'); return; }
    }
    ropeOff += dy;
    $('rp-rope').style.backgroundPosition = `0 ${ropeOff}px`;
    G.sim.pullTo(G.sim.target + dy * 0.16);
    lastPull = performance.now(); if (G.sim.angle() > 10) balanceFor().stroke(dy);
    const now = performance.now();
    if (now - lastCreak > 180 + Math.random() * 120) { lastCreak = now; sfx.creak(Math.min(1, dy / 12)); }
  });
  pad.addEventListener('pointerup', () => { on = false; });
  pad.addEventListener('pointercancel', () => { on = false; });
}

// ---------------- the raise's balance (a skill moment, fun.js) ----------------
// A jerky pull makes the klaf lean; the two buttons steady it. The lean is a real
// sideways push on the klaf: a klaf built without its X racks under it.
let bal = null, lastPull = 0, balSign = 1;
const balUI = Object.assign(document.createElement('div'), { id: 'balance', hidden: true,
  innerHTML: '<button type="button" class="bal-btn" data-s="-1" aria-label="ליישר שמאלה">◀</button><div class="bal-bar"><div class="bal-zone"></div><div class="bal-dot" id="bal-dot"></div></div><button type="button" class="bal-btn" data-s="1" aria-label="ליישר ימינה">▶</button><div class="bal-label">שומרים על הקלף ישר</div>' });
$('app').appendChild(balUI);
function balanceFor() { if (!bal || bal.k !== G.ki || bal.lv !== LV || bal.g !== G) bal = Object.assign(makeBalance(!!LV.tutorial), { k: G.ki, lv: LV, g: G }); return bal; }
const balanceOn = () => G.stage === 'raise' && !!G.sim && !G.raisedOnce && !G.falling && !G.check;
function balanceHide() { bal = null; balUI.hidden = true; }
balUI.addEventListener('pointerdown', e => {
  const b = e.target.closest('.bal-btn'); if (!b || !balanceOn()) return;
  e.preventDefault();
  const B = balanceFor(), before = B.saves;
  B.steer(+b.dataset.s * balSign);
  b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
  sfx.tick();
  if (B.saves > before) fun.bubble(G.sim.topCentre(), 'הצלה!', 'good');
});
function balanceTick(dt, t) {
  const on = balanceOn() && G.sim.angle() > 10;
  balUI.hidden = !on;
  if (!on) return;
  const B = balanceFor();
  // which way on the screen the klaf's own sideways is (the camera is turned)
  const top = G.sim.topCentre(), a = toScreen(top), b = toScreen(add3(top, [1, 0, 0], 1));
  if (a && b) balSign = b[0] >= a[0] ? 1 : -1;
  const r = B.tick(dt, performance.now() - lastPull < 450, t);
  $('bal-dot').style.left = `${50 + B.lean * balSign * 46}%`;
  balUI.classList.toggle('warn', Math.abs(B.lean) > 0.7);
  if (r === 'slip') {
    G.sim.slip(BALANCE.slip);
    fun.shake(0.05, 0.3); sfx.thud();
    flashHint('<b>הקלף נטה הצידה</b> והמושכים הורידו אותו מעט. מושכים לאט ובקצב קבוע, ומיישרים בכפתורים ◀ ▶');
  }
}
const balanceLean = () => (balanceOn() && bal && G.sim.angle() > 15 ? bal.force() : 0);

// ---------------- crew jobs: carrying poles, driving stakes ----------------
const jobs = [];
const driverPool = [];
function getDriver() {
  let d = driverPool.find(m => !m.userData.used);
  if (!d) { d = makeDriver(); curGroup.add(d); driverPool.push(d); }
  d.userData.used = true; d.visible = true;
  return d;
}
function endJob(job) {
  job.actors.forEach(a => { a.busy = null; a.clear(); });
  if (job.mesh) { job.mesh.userData.used = false; job.mesh.visible = false; }
  if (job.type === 'carry') delete job.store[job.sid];
  jobs.splice(jobs.indexOf(job), 1);
}
function clearJobs() { while (jobs.length) endJob(jobs[0]); }

// הלמנייה: two scouts bring the post driver and drive the stake, one on each handle
function requestDrive(kind, id) {
  const store = kind === 'leg' ? G.build.stakes : G.build.anchors;
  const max = kind === 'leg' ? LEG_STAKE_HITS : ANCHOR_HITS;
  // stake ids repeat on every klaf: a job belongs to the klaf it was started on
  let job = jobs.find(j => j.type === 'drive' && j.id === id && j.k === G.ki);
  if ((store[id] || 0) + (job ? job.queued : 0) >= max) return;
  if (!job) {
    const [x, z] = kind === 'leg' ? [LEG_STAKES.find(s => s.id === id).u, stakeZ()] : (a => [a[0], a[2]])(anchorPos(GUYS.find(g => g.id === id)));
    const two = freeActors(crew, 2, new THREE.Vector3(x, 0, z));
    if (!two) { flashHint('כל הצופים עסוקים, עוד רגע…'); return; }
    job = { type: 'drive', k: G.ki, kind, id, x, z, actors: two, queued: 0, t: 0, idle: 0, mesh: getDriver() };
    two.forEach(a => { a.busy = job; });
    jobs.push(job);
  }
  job.queued++;
}
function stakeTopNow(job) {
  if (job.kind === 'leg') return stakeTopPos(LEG_STAKES.find(s => s.id === job.id))[1];
  return ANCHOR_LEN - 0.25 * Math.min(G.build.anchors[job.id] || 0, ANCHOR_HITS) / ANCHOR_HITS;
}
function updateDrive(job, dt) {
  const [a1, a2] = job.actors;
  const top = stakeTopNow(job);
  let lift = 0;
  const there = a1.arrived() && a2.arrived();
  if (there && job.queued > 0) {
    job.t += dt;
    const u = Math.min(1, job.t / 0.3);
    lift = u < 0.65 ? 0.3 * (u / 0.65) : 0.3 * (1 - (u - 0.65) / 0.35);
    if (u >= 1) {
      job.t = 0; job.queued--;
      const store = job.kind === 'leg' ? G.build.stakes : G.build.anchors;
      store[job.id] = (store[job.id] || 0) + 1;
      sfx.hammer(); buzz(15); fun.shake(0.015, 0.12); fun.dust([(a1.pos.x + a2.pos.x) / 2, 0, (a1.pos.z + a2.pos.z) / 2], 4, 0.35);
      if (job.kind === 'leg' && store[job.id] >= LEG_STAKE_HITS && G.sim && G.sim.angle() < 8) startSim(); // feet now rest against the stakes
      refreshAll();
    }
  } else if (there) {
    job.idle += dt;
    if (job.idle > 0.5) return endJob(job);
  }
  const handY = top + 0.28 + lift;
  const reach = Math.max(0.5, Math.min(2.6, 0.5 + (handY - 0.5) * 2.2));
  a1.set([job.x - 0.4, 0, job.z], Math.PI / 2, 0.05, reach, { carry: 0.5 });
  a2.set([job.x + 0.4, 0, job.z], -Math.PI / 2, 0.05, reach, { carry: 0.5 });
  const m = job.mesh;
  if (there) m.position.set(job.x, top - 0.12 + lift, job.z);
  else { const h = a1.hands(0.55); m.position.set(h[0], h[1] - 0.3, h[2]); }
}

// two scouts carry each new pole in and lay it in place: on its line in the
// drawing, or (for the cube's side poles) up against the legs
function startCarry(sid) {
  const cube = isCubePole(sid);
  const fin = () => cube ? cubeSegs(sid, true)[0] : klafRestEnds(sid);
  const [e1, e2] = fin();
  const two = freeActors(crew, 2, new THREE.Vector3((e1[0] + e2[0]) / 2, 0, (e1[2] + e2[2]) / 2));
  if (!two) return; // nobody free: the pole is simply laid
  const store = cube ? G.cube.carrying : G.carrying;
  const job = { type: 'carry', sid, cube, fin, actors: two, phase: 'walk', t: 0, store };
  two.forEach(a => { a.busy = job; });
  jobs.push(job);
  store[sid] = job;
}
function klafRestEnds(sid) {
  const slot = slotById(sid), len = G.build.poles[sid].length, off = layerOff(slot);
  return [-1, 1].map(k => { const p = slotPoint(slot, k * len / 2); return add3(kw(p[0], p[1]), [0, 1, 0], off); });
}
// where the two carriers stand: near each end, beside the pole (outside the cube)
function carryStands(job) {
  const [e1, e2] = job.fin();
  let d = [e2[0] - e1[0], 0, e2[2] - e1[2]]; const dl = Math.hypot(d[0], d[2]) || 1; d = [d[0] / dl, 0, d[2] / dl];
  const n = job.cube ? (cubeSlot(job.sid).side ? [cubeSlot(job.sid).side, 0, 0] : [-d[2], 0, d[0]]) : [-d[2], 0, d[0]];
  const off = job.cube ? 0.45 : 0.38;
  return [[e1, 1], [e2, -1]].map(([e, k]) => [e[0] + d[0] * 0.3 * k + n[0] * off, 0, e[2] + d[2] * 0.3 * k + n[2] * off]);
}
function updateCarry(job, dt) {
  const poles = job.cube ? G.cube.build.poles : G.build.poles;
  if (!poles[job.sid] || (G.stage !== 'build' && G.stage !== 'cube')) return endJob(job);
  const [s1, s2] = carryStands(job);
  const [e1, e2] = job.fin();
  const face = (st, e) => Math.atan2(e[0] - st[0], e[2] - st[2]);
  const laying = job.phase === 'lay';
  const high = job.cube && laying ? Math.min(Math.PI * 0.85, 0.9 + job.t * 3.5) : null;
  job.actors[0].set(s1, face(s1, e1), laying && !job.cube ? 0.55 : 0.1, high ?? (laying ? 0.95 : 0.5), { carry: 0.5 });
  job.actors[1].set(s2, face(s2, e2), laying && !job.cube ? 0.55 : 0.1, high ?? (laying ? 0.95 : 0.5), { carry: 0.5 });
  if (!laying && job.actors.every(a => a.arrived())) { job.phase = 'lay'; job.t = 0; }
  if (laying) { job.t += dt; if (job.t > (job.cube ? 0.4 : 0.25)) { sfx.thud(); endJob(job); refreshAll(); } }
}
// where a carried pole is drawn
function carriedSegs(job) {
  const [e1, e2] = job.fin();
  if (job.phase === 'lay') {
    // from the carriers' hands to its place
    const k = Math.min(1, job.t / (job.cube ? 0.7 : 0.45));
    const from = e => [e[0], 0.6, e[2]];
    const lerp = (a, b) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    if (!job.cube) { const lift = 0.55 * (1 - k); return [[add3(e1, [0, 1, 0], lift), add3(e2, [0, 1, 0], lift)]]; }
    return [[lerp(from(e1), e1), lerp(from(e2), e2)]];
  }
  const len = Math.hypot(e2[0] - e1[0], e2[1] - e1[1], e2[2] - e1[2]);
  const h1 = job.actors[0].hands(0.6), h2 = job.actors[1].hands(0.6);
  const c = [(h1[0] + h2[0]) / 2, 0.6, (h1[2] + h2[2]) / 2];
  let d = [h2[0] - h1[0], 0, h2[2] - h1[2]]; const dl = Math.hypot(d[0], d[2]) || 1; d = [d[0] / dl, 0, d[2] / dl];
  return [[add3(c, d, -len / 2), add3(c, d, len / 2)]];
}
function updateJobs(dt) {
  for (const job of [...jobs]) {
    if (job.type !== 'drive') { updateCarry(job, dt); continue; }
    const keep = G.ki; useKlaf(job.k); updateDrive(job, dt); useKlaf(keep);
  }
}

// ---------------- work at height (עבודה בגובה, Omer 2026-11-21) ----------------
// Every connection above 2 m is tied by scouts who climb the structure in a harness
// (a connection at 2 m is still tied from the ground). The real order: first every
// connection that can be tied from the ground; then the player picks two climbers and
// a safety person below. The climbers go up, clip their harness to a pole, and tie what
// is within arm's reach (1.5 m); to reach more they climb along, unclip and clip again.
// They stay up until the structure is finished, and climb down after.
const HEIGHT = { above: 2.2, reach: 1.5, speed: 0.9, feet: 1.15 };
const HROPES = [0, 1].map(() => { const r = new RopeViz(scene); r.show(false); return r; });
const HEIGHT_ROLES = [{ id: 'c1', he: 'מטפס ראשון' }, { id: 'c2', he: 'מטפס שני' }, { id: 'safe', he: 'אבטחה למטה' }];
function freshHeight() { return { crew: {}, panel: false, up: false, climbers: [], safe: null, down: false }; }
const highJoint = j => j.at[1] > HEIGHT.above;
const heightJoints = () => LV.cube ? LV.cube.joints.filter(highJoint) : [];
// free build: only the connections of poles that were put in count (nothing there is required)
const joinPlaced = j => !LV.cube.free || cubeJointReachable(j, LV.cube, G.cube.build.poles);
const heightNeeded = () => heightJoints().some(joinPlaced);
// every connection that can be tied from the ground is tied
const groundDone = () => LV.cube.joints.filter(j => !highJoint(j) && joinPlaced(j)).every(j => G.cube.build.joints[j.id]);
// where climbers can stand: a few spots on the frame that between them reach every high
// connection (greedy cover over the connections themselves, so each spot is on a pole)
let spotCache = null;
function heightSpots() {
  if (spotCache?.cube === LV.cube) return spotCache.spots;
  const js = heightJoints(), left = new Set(js.map(j => j.id)), spots = [];
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  while (left.size) {
    let best = null, bn = -1;
    for (const c of js) { const n = js.filter(j => left.has(j.id) && d(c.at, j.at) <= HEIGHT.reach).length; if (n > bn) { bn = n; best = c; } }
    const covers = js.filter(j => left.has(j.id) && d(best.at, j.at) <= HEIGHT.reach);
    // the spot: the middle of what it covers, pulled onto the nearest of them
    const mid = [0, 1, 2].map(i => covers.reduce((a, j) => a + j.at[i], 0) / covers.length);
    const on = covers.reduce((a, j) => d(j.at, mid) < d(a.at, mid) ? j : a, covers[0]);
    spots.push({ at: [...on.at], ids: js.filter(j => d(on.at, j.at) <= HEIGHT.reach).map(j => j.id) });
    covers.forEach(j => left.delete(j.id));
  }
  spotCache = { cube: LV.cube, spots };
  return spots;
}
const cubeMid = () => [0, 0, (LV.cube.zA ?? 0) + (LV.cube.span ?? LV.cube.depth) / 2];
// where a climber's feet are when working at a spot: a little below and outside it
function spotFeet(sp) {
  const c = cubeMid(), n = norm2(sp.at[0] - c[0], sp.at[2] - c[2]);
  return [sp.at[0] + n[0] * 0.3, Math.max(0.4, sp.at[1] - HEIGHT.feet), sp.at[2] + n[2] * 0.3];
}
const climberAt = sp => G.height.climbers.find(c => c.spot === sp && !c.path);
// a connection can be tied when a clipped-in climber at a spot reaches it
const heightReach = id => G.height.climbers.some(c => c.clipped && !c.path && heightSpots()[c.spot].ids.includes(id));
function heightBlock(j) {
  if (!G.height || !highJoint(j)) return null;
  if (!groundDone()) return '<b>חיבור בגובה.</b> קודם כופתים את כל החיבורים שאפשר מהקרקע (עד 2 מ׳), ורק אז עולים לגובה';
  if (!G.height.up) return '<b>חיבור בגובה.</b> מעל 2 מ׳ כופתים רק מלמעלה: לוחצים על <b>עולים לגובה</b> ומשבצים שני מטפסים ואיש אבטחה';
  if (!heightReach(j.id)) return '<b>אין מטפס עם רתמה במרחק יד.</b> מקישים על נקודת טיפוס (חץ כחול) ליד החיבור, ומחברים שם את הרתמה';
  return null;
}
const heightActor = role => G.height.crew[role] != null ? crew[G.height.crew[role]] : null;
function openHeightCrew() { G.height.panel = true; crewKey = ''; renderCrew(); refreshAll(); flashHint('<b>עבודה בגובה:</b> משבצים שני מטפסים ואיש אבטחה שנשאר למטה'); }
function toggleHeightCrew(role) {
  const H = G.height; if (H.up) return flashHint('המטפסים כבר למעלה. הם יורדים כשהמבנה גמור');
  if (H.crew[role] != null) delete H.crew[role];
  else {
    const used = new Set(Object.values(H.crew)), free = crew.map((a, i) => i).filter(i => !used.has(i) && !crew[i].busy);
    if (!free.length) return flashHint('אין צופה פנוי');
    H.crew[role] = free[0];
  }
  sfx.tick(); crewKey = ''; renderCrew();
  if (HEIGHT_ROLES.every(r => H.crew[r.id] != null)) startClimb();
  refreshAll();
}
function renderHeightCrew() {
  const H = G.height;
  $('crew-free').textContent = H.up ? 'למעלה עד סוף הבנייה' : `${HEIGHT_ROLES.filter(r => H.crew[r.id] == null).length} תפקידים פנויים`;
  $('crew-list').innerHTML = HEIGHT_ROLES.map(r => {
    const who = H.crew[r.id];
    return `<button type="button" class="crew-row${who != null ? ' on' : ''}" data-gid="${r.id}">
      <span class="crew-role">${r.he}</span><span class="crew-who">${who != null ? CREW_NAMES[who] : '+ צופה'}</span></button>`;
  }).join('');
}
// up they go: each climber walks to the leg nearest a spot, climbs it, and goes to the spot
function startClimb() {
  const H = G.height, spots = heightSpots(), c = cubeMid();
  // the two first spots: the one with most still to tie, then the farthest from it
  const todo = sp => sp.ids.filter(id => !G.cube.build.joints[id] && joinPlaced(cubeJoint(id))).length;
  const order = spots.map((sp, i) => i).sort((a, b) => todo(spots[b]) - todo(spots[a]));
  const first = order[0], second = order.slice(1).sort((a, b) => Math.hypot(...spots[b].at.map((v, k) => v - spots[first].at[k])) - Math.hypot(...spots[a].at.map((v, k) => v - spots[first].at[k])))[0] ?? first;
  H.climbers = ['c1', 'c2'].map((role, n) => {
    const sp = n ? second : first, f = spotFeet(spots[sp]);
    const zA = LV.cube.zA ?? 0, zB = zA + (LV.cube.span ?? LV.cube.depth);
    const leg = [Math.sign(f[0] - c[0] || 1) * ((LV.cube.legX ?? 0.9) + 0.25), 0, f[2] < c[2] ? zA - 0.25 : zB + 0.25];
    return { role, spot: sp, clipped: false, pos: [leg[0], 0, leg[2]], path: [[leg[0], 0, leg[2]], [leg[0], f[1], leg[2]], f], walk: true, rope: HROPES[n] };
  });
  H.up = true; H.panel = false; crewKey = '';
  sfx.tick();
  flashHint('<b>המטפסים עולים.</b> כשהם במקום, מקישים על הרתמה של כל אחד כדי לחבר אותה לסנדה');
}
// a climber moves to another spot: unclip, climb along the frame, clip in again
function moveClimber(spot) {
  const H = G.height;
  if (climberAt(spot)) return flashHint('מטפס כבר עובד בנקודה הזאת');
  const free = H.climbers.filter(c => !c.path);
  if (!free.length) return;
  const to = heightSpots()[spot].at, c = free.reduce((a, q) => Math.hypot(...heightSpots()[q.spot].at.map((v, k) => v - to[k])) < Math.hypot(...heightSpots()[a.spot].at.map((v, k) => v - to[k])) ? q : a, free[0]);
  const f = spotFeet(heightSpots()[spot]);
  c.clipped = false; c.spot = spot; c.path = [[...c.pos], [c.pos[0], Math.max(c.pos[1], f[1]), c.pos[2]], [f[0], Math.max(c.pos[1], f[1]), f[2]], f];
  sfx.tick();
}
function clipHarness(c) { c.clipped = true; sfx.lash(); buzz(12); flashHint(`<b>${CREW_NAMES[G.height.crew[c.role]]} מחובר/ת ברתמה.</b> אפשר לכפות את מה שבהישג יד`); }
function collectHeightTargets(T) {
  const H = G.height; if (!H?.up || H.down || G.stage !== 'cube') return;
  const spots = heightSpots();
  for (const c of H.climbers) if (!c.path && !c.clipped) T.push({ kind: 'harness', id: c.role, pos: add3(spots[c.spot].at, [0, 0.35, 0], 1), show: true });
  spots.forEach((sp, i) => {
    if (climberAt(i) || H.climbers.some(c => c.spot === i)) return;
    if (!sp.ids.some(id => !G.cube.build.joints[id] && joinPlaced(cubeJoint(id)))) return; // nothing left to tie there
    T.push({ kind: 'hspot', id: 'H' + i, spot: i, pos: add3(sp.at, [0, 0.12, 0], 1), show: true });
  });
}
// each frame: climbers move along their paths; harness lines; the safety person under them
function stepHeight(dt) {
  const H = G.height;
  if (!H?.up) { HROPES.forEach(r => r.show(false)); return; }
  const done = G.stage !== 'cube' || G.check || G.falling;
  if (done && !H.down) {
    // the structure is finished: everyone climbs down
    H.down = true;
    for (const c of H.climbers) { c.clipped = false; c.path = [[...c.pos], [c.pos[0], 0, c.pos[2]]]; c.walk = false; }
  }
  const t = performance.now() / 1000;
  for (const c of H.climbers) {
    const a = heightActor(c.role); if (!a) continue;
    if (c.walk) {
      // walk on the ground to the foot of the leg first
      a.set(c.path[0], 0, 0, 0.3);
      if (a.arrived()) c.walk = false; else { c.rope.show(false); continue; }
    }
    if (c.path) {
      let step = HEIGHT.speed * dt;
      while (step > 0 && c.path.length > 1) {
        const [p, q] = c.path, d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        if (d <= step) { c.path.shift(); step -= d; c.pos = [...c.path[0]]; continue; }
        const k = step / d; c.pos = p.map((v, i) => v + (q[i] - v) * k); c.path[0] = c.pos; step = 0;
      }
      if (c.path.length <= 1) c.path = null;
    }
    const sp = heightSpots()[c.spot], face = Math.atan2(sp.at[0] - c.pos[0], sp.at[2] - c.pos[2]);
    const moving = !!c.path;
    if (H.down && !moving) { a.clear(); c.rope.show(false); continue; }
    a.set(c.pos, face, moving ? 0.15 : 0.1, moving ? Math.PI * (0.8 + 0.15 * Math.sin(t * 14)) : 0.9, { lock: true, snap: true });
    // the harness line: from the climber's waist to the pole above, once clipped in
    // (the ropes are drawn in the plaza's frame: a free-build structure may stand to the side)
    if (c.clipped && !moving) c.rope.set([c.pos[0] + X0(), c.pos[1] + 0.85, c.pos[2]], add3(sp.at, [X0(), 0.25, 0], 1), 0.05); else c.rope.show(false);
  }
  // the safety person stands below, between the climbers, watching them
  const s = heightActor('safe');
  if (s) {
    if (H.down && H.climbers.every(c => !c.path)) { s.clear(); H.up = false; H.climbers.forEach(c => c.rope.show(false)); return; }
    const mid = H.climbers.reduce((acc, c) => [acc[0] + c.pos[0] / 2, 0, acc[2] + c.pos[2] / 2], [0, 0, 0]), cm = cubeMid();
    const n = norm2(mid[0] - cm[0], mid[2] - cm[2]);
    s.set([mid[0] + n[0] * 1.2, 0, mid[2] + n[2] * 1.2], Math.atan2(-n[0], -n[2]), -0.1, 0.4);
  }
}
const heightPanelOn = () => !!G?.height && G.stage === 'cube' && (G.height.panel || (G.height.up && !G.height.down));
function heightLine() {
  const H = G.height;
  if (!groundDone()) return '<b>עבודה בגובה:</b> קודם כופתים את כל מה שאפשר מהקרקע (עד 2 מ׳). אחר כך עולים לגובה';
  if (!H.up) return H.panel ? '<b>עבודה בגובה:</b> משבצים שני מטפסים ואיש אבטחה בחלון הצוות' : '<b>עבודה בגובה:</b> מעל 2 מ׳ כופתים רק מלמעלה. לוחצים על <b>עולים לגובה</b>';
  if (H.climbers.some(c => c.path || c.walk)) return '<b>עבודה בגובה:</b> המטפסים בדרך…';
  if (H.climbers.some(c => !c.clipped)) return '<b>עבודה בגובה:</b> מקישים על הרתמה (⚲) כדי לחבר את המטפס לסנדה';
  return '<b>עבודה בגובה:</b> כופתים את מה שבהישג יד. כדי להגיע לעוד, מקישים על נקודת טיפוס (▲) והמטפס הקרוב עובר אליה';
}
const heightTodo = () => heightJoints().filter(j => !G.cube.build.joints[j.id] && joinPlaced(j)).length;

// ---------------- action buttons and hints ----------------
function refreshActions() {
  const el = $('actions'); el.innerHTML = '';
  const add = (label, fn, primary = true) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tool' + (primary ? ' primary' : '');
    b.textContent = label; b.addEventListener('click', fn); el.appendChild(b);
  };
  if (G.falling || G.check?.running) return;
  if (G.challenge?.kind === 'fix') {
    G.klafim.forEach((k, i) => { if (i !== G.ki) add(`ל${LV.klafim[i].he}`, () => goStage(STAGES.find(q => q.id === 'build' && q.k === i).key), false); });
    add('המדריך בודק את התיקונים', fixCheck);
    return;
  }
  const nx = nextStage();
  const go = label => add(label, () => goStage(nx.key));
  // where the next button leads, in words
  const many = LV.klafim.length > 1, of = nx?.k != null && many ? LV.klafim[nx.k].he : '';
  const nextLabel = () => nx.id === 'build' ? `המשך לבניית ה${of}` : nx.id === 'spread' ? (of ? `המשך להקמת ה${of}` : 'המשך להקמה')
    : nx.id === 'stakes' ? (G.stage !== 'build' && of ? `המשך להרמת ה${of}` : of ? `המשך לבז״נטים, ${of}` : 'המשך לבז״נטים') : nx.id === 'check' ? 'למסדר המדריך' : nx.id === 'cube' ? (LV.free ? 'המשך לחיבור הקלפים' : 'המשך לחיבור הקובייה') : `המשך ל${nx.he}`;
  if (LV.free && G.stage === 'build') {
    if (stageDone('build') && nx.id !== 'build' && LV.klafim.length < MAX_KLAFIM) add('+ עוד מבנה', () => showModal('<h2>מה מוסיפים למגרש?</h2><p>בונים אותו על הקרקע מאחורי האחרון. אחרי שהכול בנוי מרימים את המבנים אחד אחרי השני.</p>',
      [['קלף', () => { closeModal(); addFreeKlaf('klaf'); }, true], ['חצובה', () => { closeModal(); addFreeKlaf('tripod'); }, true], ['ביטול', closeModal]]), false);
  }
  if (triOn()) {
    if (G.stage === 'build' && stageDone('build')) go(nextLabel());
    if (G.stage === 'spread' && G.tri.up <= 0 && !G.tri.raising) add('מקימים את החצובה', raiseTripod);
    if (G.stage === 'spread' && G.tri.up >= 1 && feetOnPlan() && triGuysFixed()) go('המשך לחיזוקים');
    if (G.stage === 'brace') go(nextLabel());
    if (G.stage === 'check' && !G.check) add('קוראים למדריך למסדר', runCheck);
    return;
  }
  if (G.stage === 'build' && stageDone('build')) go(nextLabel());
  if (G.stage === 'stakes' && stageDone('stakes')) go('המשך להרמה');
  // a raised klaf must be anchored (guy lines fixed, legs lashed to their stakes) before moving on
  if (G.stage === 'anchor' && G.raisedOnce && stageDone('anchor')) go(nextLabel());
  if (G.stage === 'cube' && heightNeeded() && groundDone() && !G.height.up && !G.height.panel) add('עולים לגובה', openHeightCrew);
  if (G.stage === 'cube' && LV.cube?.free) go('למסדר המדריך');
  else if (G.stage === 'cube' && cubeComplete()) go('המשך להורדת היתרים הפנימיים');
  if (G.stage === 'unguy' && stageDone('unguy')) go(nx.id === 'seat' ? 'המשך לבניית המושב' : nx.id === 'wheel' ? 'המשך לבניית הגלגל' : 'למסדר המדריך');
  if (G.stage === 'wheel' && stageDone('wheel')) go('המשך להרמת הגלגל');
  if (G.stage === 'wlift' && G.wheel.lift <= 0 && !G.wheel.lifting) add('מרימים את הגלגל אל ראשי החצובות', liftWheel);
  if (G.stage === 'wlift' && stageDone('wlift')) go('המשך למושב');
  if (G.stage === 'gond' && rigDone('seat') && G.wheel.seatLift <= 0 && !G.wheel.seatLifting) add('מרימים את המושב ותולים אותו', liftWheelSeat);
  if (G.stage === 'gond' && stageDone('gond')) go('למסדר המדריך');
  if (G.stage === 'seat' && stageDone('seat')) go('המשך לתליית הקרוסלה');
  if (G.stage === 'hang' && G.seat.lift <= 0 && !G.seat.lifting) add('מרימים את המושב', liftSeat);
  if (G.stage === 'hang' && stageDone('hang')) go('למסדר המדריך');
  if (G.stage === 'check' && !G.check) add('קוראים למדריך למסדר', runCheck);
}
let flashUntil = 0;
function flashHint(html) { $('hint-text').innerHTML = html; flashUntil = performance.now() + 2600; }
function hintText() {
  const b = G.build, sim = G.sim;
  if (G.replay) return '<b>הילוך חוזר איטי</b> · מה שגרם לקריסה מסומן באדום · הקישו כדי לדלג';
  if (G.falling) return G.falling.tri ? '<b>החצובה קורסת…</b>' : G.falling.cube ? '<b>המבנה קורס…</b>' : '<b>הקלף קורס…</b>';
  const nPoles = SLOTS.filter(s => b.poles[s.id]).length;
  const nJ = JOINTS.filter(j => b.joints[j.id]).length;
  if (G.stage === 'cube' && !G.check && heightNeeded() && (G.challenge || G.height.up || G.height.panel)) return heightLine();
  if (G.challenge?.kind === 'cube' && !G.check) return '<b>קובייה לא שלמה:</b> משלימים לפי תיק המבנה ומזמינים מסדר';
  if (G.challenge?.kind === 'fix') return '<b>תקנו את המחנה:</b> משהו כאן לא בנוי לפי השרטוט. בודקים מול תיק המבנה';
  // after the first structure's tutorial: no step guidance, only where things stand
  if (!LV.tutorial) return statusText(nPoles, nJ);
  switch (G.stage) {
    case 'build': {
      if (G.selected) {
        const sl = slotById(G.selected), p = b.poles[G.selected];
        if (Math.abs(p.length - sl.length) > 0.05) return `הסנדה הזו ${p.length.toFixed(1)} מ׳, ובשרטוט ${sl.length.toFixed(1)} מ׳. אפשר <b>להחזיר אותה לערימה</b> ולקחת אחרת`;
      }
      if (nPoles < 6) return `בחרו בערימה <b>סנדה באורך הנכון</b> וגררו אותה אל קו כחול. הסנדות מוגבלות! · ${nPoles}/6`;
      if (nJ < 9) return `הקישו על <b>טבעת</b> במפגש סנדות ובחרו כפיתה · כפיתות ${nJ}/9`;
      { const nx = nextStage(); if (nx?.id === 'build') return `הקלף מוכן על הקרקע. קודם בונים את כל הקלפים: המשיכו ל<b>${LV.klafim[nx.k].he}</b>`; }
      return LV.klafim.length > 1 ? 'כל הקלפים מוכנים על הקרקע. עכשיו מרימים אותם אחד אחד, מהקדמי: המשיכו ל<b>דפיקת בז״נטים</b>' : 'הקלף מוכן על הקרקע. המשיכו ל<b>דפיקת בז״נטים</b>';
    }
    case 'stakes': {
      const d = LEG_STAKES.filter(s => (b.stakes[s.id] || 0) >= LEG_STAKE_HITS).length;
      if (d < 2) return `הקישו על מקום הבז״נט ליד כל רגל, וכל הקשה היא מכת <b>הלמנייה</b> · בז״נטים ${d}/2`;
      return 'הבז״נטים בפנים. המשיכו ל<b>הרמה</b>';
    }
    case 'raise': {
      if (!sim) return '';
      const ang = sim.angle();
      const g = GUYS.filter(q => b.guyTop[q.id]).length;
      if (ang < 6 && g < 4) return `כפתו <b>4 יתרים</b> לראש הקלף (הקישו על הטבעות) · ${g}/4`;
      const manned = crewRoles().filter(q => b.crew[q.id] != null).length;
      if (ang < 6 && manned < crewRoles().length) return `שבצו <b>${crewSize()} צופים</b>: מושכים מקדימה, מחזיקים מאחור, ושניים בקלף · ${manned}/${crewRoles().length}`;
      if (ang < 6) return 'החליקו את היתרים <b>למטה</b> כדי למשוך. לאט ובשליטה';
      if (ang < 80) return 'ממשיכים למשוך, לאט ובשליטה…';
      if (ang <= 97) return '<b>עצרו!</b> הקלף ניצב';
      return '<b>הקלף עובר את האנך!</b>';
    }
    case 'anchor': {
      if (!G.raisedOnce) return 'קודם מרימים את הקלף (שלב 3)';
      const a = GUYS.filter(q => (b.anchors[q.id] || 0) >= ANCHOR_HITS).length;
      const t = GUYS.filter(q => b.guyTies[q.id]).length;
      const s = STAKE_JOINTS.filter(q => b.stakeJoints[q.id]).length;
      return `עגנו את הקלף: בז״נטי יתרים ${a}/4 · יתרים כפותים ${t}/4 · כפיתות רגל לבז״נט ${s}/4`;
    }
    case 'check':
      if (G.check?.running) return G.check.label || 'מסדר…';
      if (!G.raisedOnce) return 'אין עדיין מה לבדוק: קודם מרימים את הקלף';
      return 'במסדר כולם עוזבים את מה שלא כפות. המדריך דוחף את הקלף מכל הכיוונים ותולה עליו דלי מים';
  }
  return '';
}
function statusText(nPoles, nJ) {
  const b = G.build, sim = G.sim;
  const kn = LV.klafim.length > 1 && !cubeStage(G.stage) ? `<b>${K().cfg.he}</b> · ` : '';
  if (triOn()) return kn + triStatus(nPoles, nJ);
  switch (G.stage) {
    case 'build':
      if (LV.free) return kn + freeHint(nPoles, nJ);
      return `${kn}סנדות ${nPoles}/${SLOTS.length} · כפיתות ${nJ}/${JOINTS.length}`;
    case 'stakes': return `${kn}בז״נטים ${LEG_STAKES.filter(s => (b.stakes[s.id] || 0) >= LEG_STAKE_HITS).length}/2`;
    case 'raise': {
      if (!sim) return kn;
      const ang = sim.angle();
      if (ang < 6) return `${kn}יתרים בראש הקלף ${GUYS.filter(q => b.guyTop[q.id]).length}/4 · צוות ${crewRoles().filter(q => b.crew[q.id] != null).length}/${crewSize()}`;
      if (ang < 82) return `${kn}עולה…`;
      return ang <= 97 ? `${kn}<b>הקלף ניצב</b>` : `${kn}<b>הקלף עובר את האנך!</b>`;
    }
    case 'anchor': {
      const a = GUYS.filter(q => (b.anchors[q.id] || 0) >= ANCHOR_HITS).length;
      const t = GUYS.filter(q => b.guyTies[q.id]).length;
      const st = STAKE_JOINTS.filter(q => b.stakeJoints[q.id]).length;
      return `${kn}בז״נטי יתרים ${a}/4 · יתרים מקובעים ${t}/4 · רגליים לבז״נט ${st}/4`;
    }
    case 'cube': {
      const cb = G.cube.build;
      if (LV.cube.free) {
        const nP = LV.cube.slots.filter(s => cb.poles[s.id]).length, js = LV.cube.joints.filter(joinPlaced), nJ = js.filter(j => cb.joints[j.id]).length;
        if (!nP) return 'הקישו על <b>קו מקווקו</b> בין הקלפים כדי להניח שם סנדת חיבור: חיבור תחתון ועליון בכל צד, איקס בכל צד ואיקס למעלה. בוחרים מה לחבר';
        return `סנדות חיבור ${nP}/${LV.cube.slots.length} · כפיתות ${nJ}/${js.length}${nJ < js.length ? ' · הקישו על <b>טבעת</b> כדי לכפות' : ' · אפשר להוסיף עוד, או לקרוא למדריך'}`;
      }
      return `סנדות בקובייה ${LV.cube.slots.filter(s => cb.poles[s.id]).length}/${LV.cube.slots.length} · כפיתות ${LV.cube.joints.filter(j => cb.joints[j.id]).length}/${LV.cube.joints.length}`;
    }
    case 'unguy': {
      let n = 0, all = 0; eachKlaf(() => { n += GUYS.filter(g => isInnerGuy(g) && G.build.guyOff[g.id]).length; all += GUYS.filter(isInnerGuy).length; });
      return `יתרים פנימיים שירדו ${n}/${all}`;
    }
    case 'seat': case 'hang': return seatStatus();
    case 'wheel': case 'wlift': case 'gond': return wheelStatus();
    case 'check': return G.check?.running ? kn + (G.check.label || 'מסדר…') : 'מסדר: המדריך דוחף, תולה משקל ובודק כל כפיתה';
  }
  return '';
}
function refreshHint() { if (performance.now() > flashUntil) $('hint-text').innerHTML = hintText(); }
function refreshAll() {
  if (LV.tripod) setLashFor(LV.sandbox ? LEG_IDS.filter(id => G.build?.poles[id]).map(id => G.build.poles[id].length) : null); refreshChips(); refreshActions(); refreshHint(); renderPile(); renderCrew(); }

// ---------------- clock ----------------
function startClock() { if (!G.startedAt) G.startedAt = performance.now(); }
function elapsed() { if (!G.startedAt) return 0; return ((G.endedAt || performance.now()) - G.startedAt) / 1000 + (G.challenge?.penalty || 0); }
function fmt(sec) { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; }

// ---------------- the push test ----------------
// the inspection of the current structure starts: everyone lets go
function startCheckFor() {
  if (triOn()) {
    const t = G.tri;
    rec.length = 0;
    t.sim = new TripodSim({ feet: t.feet, lens: triLens(), braces: t.braces, joints: t.joints, stakes: t.stakes, stakeJoints: t.stakeJoints, spec: triSpec(), guys: triSimGuys() });
    G.check = { t: 0, running: true, label: 'כולם עוזבים…', pushes: TRI_PUSHES, load: [9, 11.5], end: 12.2 };
  } else {
    G.sim.letGo();
    G.check = { t: 0, running: true, label: 'כולם עוזבים…', load: [10, 12.5], end: 13 };
  }
  if (LV.free) { camMode = null; setCameraMode(triOn() ? 'triView' : 'orbit'); }
  refreshAll();
}
const standsUp = k => k.tri ? k.tri.up >= 1 : k.raisedOnce && !!k.sim;
function runCheck() {
  if (LV.tripod) return startCheckFor();
  if (LV.free) {
    // every structure is inspected, one after another, from the first
    if (!G.klafim.every(standsUp)) return infoCard('יש מבנה שעוד לא עומד', 'המסדר בודק את כל המבנים במגרש. קודם מרימים ומעגנים כל קלף ומקימים כל חצובה.');
    // the joined klafim are inspected first, as one structure; then each other structure on its own
    const joined = G.cube?.sim && LV.cube?.free && Object.keys(G.cube.build.joints).length ? LV.cube.members : [];
    G.freeQueue = G.klafim.map((k, i) => i).filter(i => !joined.includes(i));
    if (!joined.length) {
      // nothing was lashed between the klafim: each one stands on its own again
      if (G.cube?.sim) { leaveCube(); LV.cube = null; }
      G.joinDone = true; useKlaf(G.freeQueue.shift()); return startCheckFor();
    }
    G.joinDone = false;
    useKlaf(joined[0]);
    rec.length = 0;
    G.cube.sim.letGo();
    camMode = null; setCameraMode('cubeView');
    G.check = { t: 0, running: true, label: 'כולם עוזבים…', pushes: CUBE_PUSHES, load: [18, 20.5], end: 21, joined: true };
    return refreshAll();
  }
  if (LV.wheel) {
    const Wh = G.wheel;
    if (Wh.lift < 1 || Wh.seatLift < 1) return infoCard('הגלגל עוד לא מוכן', 'קודם מרימים את הגלגל אל ראשי החצובות, ותולים את המושב על סנדת הפינה התחתונה.');
    rec.length = 0;
    startWheelSim();
    // the frame first (pushes, the outer guy lines stay), then the riders and a full turn
    G.check = { t: 0, running: true, label: 'כולם עוזבים…', pushes: WHEEL_PUSHES, load: null, end: WRIDE.end, wride: true, riders: 0 };
    return refreshAll();
  }
  if (LV.carousel) {
    if (!G.cube.sim) return;
    const S = G.seat, m = mastOn();
    if (S.lift < 1 || !m || !S.pivot) return infoCard('הקרוסלה עוד לא תלויה', 'קודם מרימים את המושב, מעבירים את התורן דרך ה־# ותולים אותו בטבעת מאמצע איקס הגג.');
    rec.length = 0;
    S.sim = new CarouselSim(S.build, { mast: m, pivot: S.pivot && mastReaches(m.length), joints: S.mastJoints, ropes: S.ropes });
    G.cube.sim.letGo();
    // the frame first (pushes, then all guy lines down), then riders and the spin
    G.check = { t: 0, running: true, label: 'כולם עוזבים…', pushes: CUBE_PUSHES, release: 8, load: null, end: RIDE.end, ride: true, riders: 0 };
    return refreshAll();
  }
  if (LV.cube) {
    if (!G.cube.sim) return;
    G.cube.sim.letGo();
    // with the outer guy lines first; then they come down too, and a braced cube stands by itself
    G.check = { t: 0, running: true, label: 'כולם עוזבים…', pushes: CUBE_PUSHES, release: 8, load: [18, 20.5], end: 21 };
    return refreshAll();
  }
  if (!G.raisedOnce || !G.sim) return infoCard('אין עדיין מה לבדוק', 'קודם בונים את הקלף, דופקים בז״נטים ומרימים אותו.');
  G.sim.letGo();
  G.check = { t: 0, running: true, label: 'כולם עוזבים…', load: [10, 12.5], end: 13 };
  refreshAll();
}
// the tripod is pushed at its head from three sides, each time towards the gap between two feet
const TRI_PUSHES = [[1.2, 3, 0, 'המדריך דוחף את ראש החצובה <b>שמאלה</b>'], [3.5, 5.3, 120, 'המדריך דוחף מ<b>הצד השני</b>'], [5.8, 7.6, 240, 'המדריך דוחף מ<b>הצד השלישי</b>']]
  .map(([from, to, deg, label]) => ({ from, to, label, f: [Math.cos(deg * Math.PI / 180), 0, Math.sin(deg * Math.PI / 180)].map(v => v * TRI_TUNING.push / TUNING.pushForce) }));
const CUBE_PUSHES = [
  { from: 1.5, to: 3.0, f: [1, 0, 0], label: 'המדריך דוחף את הקובייה <b>שמאלה</b>' },
  { from: 3.5, to: 5.0, f: [0, 0, 1], label: 'המדריך דוחף <b>אחורה</b>' },
  { from: 5.5, to: 7.0, f: [0, 0, -1], label: 'המדריך דוחף <b>קדימה</b>' },
  { from: 9.5, to: 11, f: [1, 0, 0], label: 'בלי יתרים: המדריך דוחף <b>שמאלה</b>' },
  { from: 11.5, to: 13, f: [-1, 0, 0], label: 'בלי יתרים: המדריך דוחף <b>ימינה</b>' },
  { from: 13.5, to: 15, f: [0, 0, 1], label: 'בלי יתרים: המדריך דוחף <b>אחורה</b>' },
  { from: 15.5, to: 17, f: [0, 0, -1], label: 'בלי יתרים: המדריך דוחף <b>קדימה</b>' },
];
const PUSHES = [
  { from: 1.5, to: 3.5, f: [1, 0, 0], label: 'המדריך דוחף את הקלף <b>שמאלה</b>' },
  { from: 4.0, to: 6.0, f: [-1, 0, 0], label: 'המדריך דוחף את הקלף <b>ימינה</b>' },
  { from: 6.5, to: 7.7, f: [0, 0, 0.7], label: 'המדריך דוחף <b>אחורה</b>' },
  { from: 8.2, to: 9.4, f: [0, 0, -0.7], label: 'המדריך דוחף <b>קדימה</b>' },
];
function checkPush(dt) {
  const c = G.check; if (!c?.running || G.falling) return null;
  c.t += dt;
  let push = null;
  c.loading = false;
  c.label = c.t < 1.5 ? 'כולם עוזבים…' : 'המדריך עובר לבדיקה הבאה…';
  if (c.release != null && c.t >= c.release) {
    if (!c.released) {
      c.released = true; G.cube.sim.releaseAllGuys();
      // built against the plan (an X missing or not fully lashed), the bracing doesn't
      // hold: the Xs that are there work loose and the structure racks on its corners
      if (cubeXs().some(x => !x.ok)) G.cube.sim.unbrace();
    }
    c.label = 'מורידים את כל היתרים: קובייה עם איקסים עומדת בעצמה';
  }
  for (const p of c.pushes || PUSHES) if (c.t >= p.from && c.t <= p.to) {
    const k = Math.min(1, (c.t - p.from) / 0.5, (p.to - c.t) / 0.3);
    push = p.f.map(v => v * TUNING.pushForce * Math.max(0, k));
    c.label = p.label;
  }
  if (c.ride) { const l = rideLabel(c); if (l) c.label = l; }
  if (c.wride) { const l = wheelRideLabel(c); if (l) c.label = l; }
  if (c.load && c.t >= c.load[0] && c.t <= c.load[1]) {
    c.loading = true;
    c.label = triOn() ? 'המדריך תולה <b>משקל כבד</b> על ראש החצובה' : LV.cube ? 'המדריך תולה <b>דלי מים</b> על הרוחב העליון של כל קלף' : 'המדריך תולה <b>דלי מים</b> על הרוחב העליון';
  }
  if (c.t > (c.end || 10.2)) { c.running = false; finish(); }
  return push;
}

// ---------------- collapse watch ----------------
// the top horizontal sagged or fell under the inspection's bucket
// (measured against its height in the drawing: a pole hanging from one lashing is caught here too)
function loadDropped(ks) {
  if (!G.check?.loading) return false;
  const planY = SLOTS.find(q => q.load)?.centre[1] ?? (LV.free ? LEVEL.height : (SLOTS.find(q => q.id === 'topH')?.centre[1] ?? SIZES.klaf.topHeight));
  // (free-build klafim that are joined each have their own top pole)
  return ks.some(k => (LV.free ? k.slots?.find(q => q.load)?.centre[1] ?? planY : planY) + R - k.loadY() > 0.25);
}
// the top horizontal hangs on its two square lashings
function loadRule(missing) {
  return missing
    ? { rule: 'כל סנדה נכפתת בשני הקצוות שלה', detail: 'הרוחב העליון לא היה כפות בשני הקצוות, ונפל כשהמדריך תלה עליו את דלי המים.' }
    : { rule: 'המבנה צריך לשאת משקל', detail: 'הרוחב העליון שקע תחת דלי המים. בדקו את הכפיתות בראש הקלף.' };
}
const topMissing = b => !b.poles.topH || !b.joints.J3 || !b.joints.J4;
function watchSim(dt) {
  const sim = G.sim; if (!sim || G.falling) return;
  const ang = sim.angle(), top = sim.topCentre();
  if (ang > 82 && ang < 98) { G.uprightFor += dt; if (G.uprightFor > 0.6 && !G.raisedOnce) { G.raisedOnce = true; sfx.ok(); fun.landed(top); balanceHide(); if (G.stage === 'raise') setTimeout(() => G.stage === 'raise' && !G.falling && goStage('anchor'), 500); refreshAll(); } }
  else G.uprightFor = 0;
  let kind = null;
  if (sim.baseSlid() > 0.35) kind = 'slid';
  else if (sim.rack() > 0.42) kind = 'rack';
  else if (ang > 122) kind = 'over';
  else if (G.raisedOnce && (top[1] < 0.7 * LEVEL.height || ang < 55)) kind = 'down';
  else if (loadDropped([sim])) kind = 'load';
  if (kind) {
    G.falling = { kind, t: 0, explain: explain(kind) };
    sim.flat = false;
    sfx.crash(); buzz([60, 40, 90]); fun.collapse(G.sim?.topCentre?.() || [0, 0, z0()]);
    closePicker(); refreshAll();
  }
}
function watchCube(dt) {
  const cs = G.cube.sim; if (G.falling) return;
  let kind = null;
  if (loadDropped(cs.klafim)) kind = 'load';
  else if (cs.baseSlid() > 0.35) kind = 'slid';
  else if (cs.rack() > 0.42) kind = 'rack';
  else if (cs.sway() > TUNING.cubeSwayLimit) kind = 'sway';
  else if (cs.lowestTop() < 0.7 * (LV.cube.height ?? 2.0)) kind = 'down';
  if (kind) {
    G.falling = { kind, t: 0, cube: true, explain: explainCube(kind) };
    sfx.crash(); buzz([60, 40, 90]); fun.collapse(G.sim?.topCentre?.() || [0, 0, z0()]);
    closePicker(); refreshAll();
  }
}
function explainCube(kind) {
  if (LV.cube.free) return explainFreeJoin(kind);
  if (kind === 'load') return { ...loadRule(G.klafim.some(k => topMissing(k.build))), focus: { cubePoles: [], cubeGhosts: [], cubeJoints: [] } };
  const b = G.cube.build, cs = G.cube.sim;
  const focus = { cubePoles: [], cubeGhosts: [], cubeJoints: [] };
  const bad = cubeXs().filter(x => !x.ok);
  for (const x of bad) {
    // a ghost of each missing diagonal, between its two end lashings (not the centre one)
    for (const pid of x.missingPoles) focus.cubeGhosts.push(x.ends.filter(id => { const j = cubeJoint(id); return j.a === pid && !(j.b && x.ids.includes(j.b)); }));
    for (const id of x.ids) if (b.poles[id] && x.missingJoints.some(j => cubeJoint(j).a === id)) focus.cubePoles.push(id);
    focus.cubeJoints.push(...x.missingJoints.filter(j => !x.missingPoles.includes(cubeJoint(j).a)));
  }
  const top = cs.klafim[0].topCentre();
  const dir = top[2] > 0 ? 'אחורה' : 'קדימה';
  if (kind === 'slid') return { rule: 'רגלי הקלפים עומדות ליד בז״נטים ונכפתות אליהם', detail: 'רגלי הקובייה החליקו על הקרקע.', focus: { feet: true } };
  if (kind === 'rack') return { rule: 'כל קלף צריך איקס מלא, כפי שהוא מופיע בשרטוט', detail: 'אחד הקלפים התעקם למקבילית והקובייה קרסה.', focus };
  if (bad.length) return {
    rule: 'כל קובייה צריכה איקס מרחבי מלא בשני הצדדים ובחלק העליון' + (LV.cube.bays > 1 ? ', ועוד אחד בגובה 2 מ׳ בחיבור בין הקוביות' : ''),
    detail: `אין איקס מלא ${bad.map(x => x.where).join(', ')}. מבנה שלא נבנה לפי השרטוט לא עומד: כל עוד היתרים מחזיקים לא רואים את זה, אבל כשהורידו אותם האיקסים שכן נבנו השתחררו, והמבנה נטה ${dir} ונפל.`,
    focus };
  const missH = LV.cube.slots.filter(s => s.kind === 'h' && !b.poles[s.id]);
  if (missH.length) return { rule: 'שני הקלפים מחוברים בחיבור תחתון ועליון בכל צד', detail: `חסרות ${missH.length} סנדות חיבור, והקלפים זזו זה מול זה.`, focus: { cubeGhosts: [] } };
  return { rule: 'הקובייה לא עמדה בבדיקה', detail: 'בדקו בשרטוטי הצדדים שכל הכפיתות כפותות.', focus };
}
// free build: why the joined klafim fell, from the rules (there is no drawing to compare with)
function explainFreeJoin(kind) {
  const b = G.cube.build, cs = G.cube.sim, focus = { cubePoles: [], cubeGhosts: [], cubeJoints: [] };
  const top = cs.klafim[0].topCentre(), dir = top[2] > (LV.cube.zA + LV.cube.zB) / 2 ? 'אחורה' : 'קדימה';
  if (kind === 'load') return { rule: 'סנדה שנושאת משקל נכפתת בשני הקצוות שלה', detail: 'הרוחב העליון של אחד הקלפים שקע או נפל כשהמדריך תלה עליו את דלי המים.', focus };
  if (kind === 'slid') return { rule: 'רגלי הקלפים עומדות ליד בז״נטים ונכפתות אליהם', detail: 'רגלי המבנה החליקו על הקרקע.', focus: { feet: true } };
  if (kind === 'rack') return { rule: 'כל קלף צריך איקס: שני אלכסונים, אחד לכל כיוון', detail: 'אחד הקלפים התעקם למקבילית, והמבנה המחובר קרס איתו.', focus };
  const xs = cubeXs(), side = xs.filter(x => x.side && !x.ok), loose = LV.cube.slots.filter(s => b.poles[s.id] && LV.cube.joints.filter(j => (j.a === s.id || j.b === s.id) && b.joints[j.id]).length < 2);
  focus.cubePoles = loose.map(s => s.id);
  if (side.length) return { rule: 'קלפים מחוברים צריכים איקס מרחבי בכל צד',
    detail: `אין איקס מלא ${side.map(x => x.where).join(', ')}. סנדות חיבור עם כפיתות בקצוות בלבד לא מונעות מהקלפים לנטות יחד, והמבנה נטה ${dir} ונפל.`, focus };
  if (loose.length) return { rule: 'כל סנדת חיבור נכפתת בשני הקצוות שלה', detail: `${loose.length === 1 ? 'סנדת חיבור אחת לא כפותה' : `${loose.length} סנדות חיבור לא כפותות`} בשני הקצוות, והמבנה זז.`, focus };
  return { rule: 'המבנה המחובר לא עמד בבדיקה', detail: `המבנה נטה ${dir} ונפל. נסו לחבר עוד: חיבור עליון ותחתון בכל צד, איקס בכל צד ואיקס למעלה.`, focus };
}
// the joints that hold a diagonal to the rest of the klaf (not its crossing with the other diagonal)
const diagJoints = d => JOINTS.filter(j => (j.a === d || j.b === d) && !(slotById(j.a === d ? j.b : j.a)?.id || '').startsWith('diag'));
function diagOk(d) {
  const b = G.build;
  return !!b.poles[d] && diagJoints(d).every(j => b.joints[j.id] && jointReachable(j, b.poles));
}
// A: every diagonal of the A family (diagA, and diagC on klafim with two X's); B likewise
function xComplete() {
  const fam = ds => ds.filter(d => slotById(d)).every(diagOk);
  return { A: fam(['diagA', 'diagC']), B: fam(['diagB', 'diagD']) };
}
function explain(kind) {
  const e = explainRule(kind);
  e.focus = e.focus || {};
  return e;
}
function explainRule(kind) {
  if (LV.free) return explainFree(kind);
  const sim = G.sim, b = G.build;
  if (kind === 'load') return { ...loadRule(topMissing(b)), focus: { joints: ['J3', 'J4'].filter(id => !b.joints[id]) } };
  const x = xComplete();
  const top = sim.topCentre();
  const dir = top[0] < 0 ? 'ימינה' : 'שמאלה'; // +x is on the left from the pullers' side
  const stakesIn = LEG_STAKES.every(s => (b.stakes[s.id] || 0) >= LEG_STAKE_HITS);
  const grip = sim.brokenGrip();
  const corners = ['J1', 'J2', 'J3', 'J4'].filter(id => !b.joints[id]).length;
  const backGuys = GUYS.filter(g => g.side > 0 && b.guyTop[g.id]).length;
  const xRule = () => {
    let detail;
    if (!x.A && !x.B) detail = `אין בקלף איקס. מלבן של סנדות עם כפיתות בפינות בלבד מתעקם למקבילית, והקלף נפל ${dir}.`;
    else {
      const d = ['diagA', 'diagB', 'diagC', 'diagD'].find(q => slotById(q) && !diagOk(q)), he = slotById(d).he, m = he.match(/\((.*)\)/);
      detail = `${m ? `חסר האלכסון שהולך מ${m[1]}` : `חסר האלכסון "${he}"`}, או שאחד הקצוות שלו לא כפות, והקלף נפל ${dir}. אלכסון לבד מחזיק רק בכיוון אחד: כשמושכים אותו הוא נמתח ומחזיק, כשדוחפים אותו הוא מתכופף.`;
    }
    // what the slow-motion replay points at: the half-tied diagonal, or a red ghost where a diagonal is missing
    const focus = { poles: [], ghosts: [], joints: [] };
    for (const d of ['diagA', 'diagB', 'diagC', 'diagD']) {
      if (!slotById(d) || diagOk(d)) continue;
      const js = diagJoints(d).map(j => j.id);
      if (!b.poles[d]) focus.ghosts.push(js);
      else { focus.poles.push(d); focus.joints.push(...js.filter(id => !b.joints[id])); }
    }
    return { rule: 'כל קלף צריך איקס מלא, כפי שהוא מופיע בשרטוט', detail, focus };
  };
  if (kind === 'slid' || (!stakesIn && sim.baseSlid() > 0.2))
    return { rule: 'בז״נטים נדפקים ליד הרגליים לפני שמרימים את הקלף', detail: 'בלי בז״נטים, החבל גרר את רגלי הקלף על הקרקע והקלף לא נשאר במקומו.', focus: { feet: true } };
  const cornerRule = { rule: 'כל פינה של הקלף נכפתת', detail: `חסרות ${corners} כפיתות בפינות הקלף, המסגרת התעקמה, והמחזיקים לא הצליחו להחזיק אותה.`, focus: { joints: ['J1', 'J2', 'J3', 'J4'].filter(id => !b.joints[id]) } };
  if (grip && (!x.A || !x.B)) return xRule();
  if (grip && corners) return cornerRule;
  if (grip)
    return { rule: 'מרימים לאט ובשליטה, ועוצרים כשהקלף ניצב', detail: `המשיכה הייתה חזקה מדי: ה${GUYS.find(g => g.id === grip.tag).he} נקרע מידי המחזיקים, והקלף עבר את האנך ונפל לכיוון המושכים.` };
  // the crew: a line with nobody on it does nothing
  const sideBy = side => GUYS.filter(g => Math.sign(g.side) === side && b.guyTop[g.id]);
  const heldBack = sideBy(1).filter(g => b.crew[g.id] != null).length;
  const heldFront = sideBy(-1).filter(g => b.crew[g.id] != null).length;
  if (!sim.lettingGo && !G.check && kind === 'over' && backGuys === 2 && heldBack < 2)
    return { rule: 'על כל יתר אחורי עומד מחזיק בזמן ההרמה', detail: heldBack ? 'רק יתר אחורי אחד הוחזק. הקלף נמשך מצד אחד, הסתובב ועבר את האנך.' : 'אף אחד לא החזיק את היתרים האחוריים, אז אף אחד לא עצר את הקלף כשהגיע לאנך, והוא המשיך ונפל.' };
  if (!sim.lettingGo && !G.check && heldFront < 2 && sideBy(-1).length === 2)
    return { rule: 'מושכים בשני היתרים הקדמיים יחד', detail: 'רק יתר קדמי אחד נמשך. הקלף עלה עקום, צד אחד לפני השני, ולא נשאר ישר.' };
  if (kind === 'over' && backGuys < 2)
    return { rule: 'כופתים 4 יתרים לראש הקלף לפני ההרמה', detail: 'בלי היתרים האחוריים אין מי שיעצור את הקלף כשהוא מגיע לאנך, והוא המשיך ונפל.' };
  if (kind === 'rack') {
    if (!x.A || !x.B) return xRule();
    if (corners) return cornerRule;
    return { rule: 'כל כפיתה בשרטוט נושאת עומס', detail: 'הקלף התעקם. בדקו בשרטוט שכל המפגשים כפותים.', focus: { joints: JOINTS.filter(j => !b.joints[j.id]).map(j => j.id) } };
  }
  if (G.check || sim.lettingGo) {
    const untied = GUYS.filter(g => !sim.guys[g.id]?.tied).length;
    if (untied) return { rule: 'לא עוזבים את הקלף לפני שכל 4 היתרים כפותים לבז״נטים', detail: `${untied} יתרים לא היו כפותים לבז״נט, וכשהמחזיקים עזבו הקלף נפל.` };
    if (!x.A || !x.B) return xRule();
    if (!stakesIn) return { rule: 'רגלי הקלף עומדות ליד בז״נטים ונכפתות אליהם', detail: 'בלי בז״נטים רגלי הקלף החליקו בבדיקת הדחיפה.', focus: { feet: true } };
    return { rule: 'הקלף לא עמד בבדיקת הדחיפה', detail: 'בדקו את הכפיתות ואת היתרים ונסו שוב.' };
  }
  if (!x.A || !x.B) return xRule();
  if (kind === 'over') return { rule: 'עוצרים את המשיכה כשהקלף ניצב', detail: 'הקלף עבר את האנך ונפל לכיוון המושכים.' };
  return { rule: 'הקלף נפל', detail: 'בדקו שכל הכפיתות כפותות ושהיתרים מוחזקים.' };
}

// ---------------- results ----------------
function score() {
  if (LV.tripod) return scoreTripod();
  // every lashing in the structure: each klaf's own, its legs to their stakes, its guy lines, and the cube's
  const all = [];
  let polesOk = 0, nPoles = 0;
  eachKlaf((k, i) => {
    const b = G.build;
    if (k.tri) {
      // a 90° tripod of the giant wheel: its head lashing, braces and stakes
      const t = k.tri, sp = triSpec();
      all.push([{ id: 'TJ', correct: 'tripod', tri: 'head', klaf: i, uid: `${i}:TJ` }, b.joints.TJ]);
      for (const j of BRACE_JOINTS) all.push([{ ...j, tri: 'brace', klaf: i, uid: `${i}:${j.id}` }, t.up >= 1 && braceOn(j.brace) ? t.joints[j.id] : null]);
      for (const j of TRI_STAKE_JOINTS) all.push([{ ...j, tri: 'stake', klaf: i, uid: `${i}:${j.id}` }, (t.stakes[j.stake] || 0) >= TRI_STAKE_HITS ? t.stakeJoints[j.id] : null]);
      for (const g of triGuyLegs()) all.push([{ id: TG(g), correct: 'guy', tri: 'guy', klaf: i, uid: `${i}:${TG(g)}` }, (t.guys.hits[TG(g)] || 0) >= ANCHOR_HITS ? t.guys.fix[TG(g)] : null]);
      polesOk += sp.slots.filter(q => b.poles[q.id] && Math.abs(b.poles[q.id].length - q.length) < 0.05).length + BRACES.filter(q => t.braces[q.id] && Math.abs(t.braces[q.id].length - sp.braceLengths[q.id]) < 0.05).length;
      nPoles += sp.slots.length + 3;
      return;
    }
    for (const j of JOINTS) all.push([{ ...j, klaf: i, uid: `${i}:${j.id}` }, b.joints[j.id]]);
    for (const j of STAKE_JOINTS) all.push([{ ...j, klaf: i, uid: `${i}:${j.id}`, stake: true }, b.stakeJoints[j.id]]);
    for (const g of GUYS) all.push([{ ...g, correct: 'guy', guy: true, klaf: i, uid: `${i}:${g.id}` }, b.guyTies[g.id]]);
    polesOk += SLOTS.filter(s => b.poles[s.id] && Math.abs(b.poles[s.id].length - s.length) < 0.05).length;
    nPoles += SLOTS.length;
  });
  if (LV.cube) {
    const cb = G.cube.build;
    for (const j of LV.cube.joints) all.push([{ ...j, cube: true, uid: j.id }, cb.joints[j.id]]);
    polesOk += LV.cube.slots.filter(s => cb.poles[s.id] && Math.abs(cb.poles[s.id].length - s.length) < 0.05).length;
    nPoles += LV.cube.slots.length;
  }
  if (LV.carousel) {
    const S = G.seat;
    for (const j of SEAT.joints) all.push([{ ...j, seat: true, uid: j.id }, seatReachable(j) ? S.build.joints[j.id] : null]);
    for (const j of MAST_JOINTS) all.push([{ ...j, seat: true, mast: true, uid: j.id }, S.mastJoints[j.id]]);
    // the hanging ropes and the ring are tied, not lashed: they count as tied or not
    for (const h of HANG_ROPES) all.push([{ ...h, correct: 'hang', seat: true, rope: true, uid: h.id }, S.ropes[h.id] ? 'hang' : null]);
    all.push([{ id: 'S.ring', correct: 'hang', seat: true, rope: true, uid: 'S.ring' }, S.pivot ? 'hang' : null]);
    polesOk += [...SEAT.slots, MAST].filter(q => S.build.poles[q.id] && Math.abs(S.build.poles[q.id].length - q.length) < 0.05).length;
    nPoles += SEAT.slots.length + 1;
  }
  if (LV.wheel) {
    const Wh = G.wheel;
    for (const j of RIG.joints) all.push([{ ...j, rig: true, uid: j.id }, rigReachable(j, Wh.build.poles) ? Wh.build.joints[j.id] : null]);
    // the seat's ropes are tied, not lashed: they count as tied or not
    for (const h of SEAT_ROPES) all.push([{ ...h, correct: 'hang', rig: true, rope: true, uid: h.id }, Wh.ropes[h.id] ? 'hang' : null]);
    polesOk += RIG.slots.filter(q => Wh.build.poles[q.id] && Math.abs(Wh.build.poles[q.id].length - q.length) < 0.05).length;
    nPoles += RIG.slots.length;
  }
  const total = all.length;
  const tied = all.filter(([, t]) => t).length;
  const correct = all.filter(([j, t]) => t === j.correct).length;
  const accuracy = Math.round(50 * tied / total + 30 * correct / total + 20 * polesOk / nPoles);
  const sec = elapsed();
  const bonus = sec <= LV.targetTimeSec ? 10 : 0;
  // Omer (11-19): no stars on any level while a lashing in the drawing is missing
  let stars = 0;
  if (tied === total) stars = 2;
  if (tied === total && correct === total && accuracy >= LEVEL.threeStarScore) stars = 3;
  // where the missing joints are: drawing sheet and height band, never the joint itself
  const groups = {};
  for (const [j, t] of all) if (!t) { const key = sheetOf(j); groups[key] = (groups[key] || 0) + 1; }
  // hints: one per 10 lashings, each costs about half of what a missed lashing costs
  const hintsAllowed = Math.max(1, Math.floor(total / 10));
  const hintCost = Math.round(40 / total);
  const penalty = G.hintsUsed * hintCost;
  return { total, tied, correct, polesOk, nPoles, accuracy, bonus, sec, sum: accuracy + bonus - penalty, stars, groups, wrong: tied - correct,
    hintsAllowed, hintCost, penalty, all };
}
function finish() {
  if (LV.free && G.freeQueue?.length) { G.joinDone = true; useKlaf(G.freeQueue.shift()); return startCheckFor(); } // on to the next structure
  if (LV.free) return finishFree();
  if (LV.sandbox) return finishFreeTri();
  G.endedAt = G.endedAt || performance.now();
  pushArrow.visible = false;
  const s = G.result = score();
  if (LV.number) saveStars(LV.number, s.stars); // the cube challenge is not a level
  // the scouts use the structure first, and the stars light up as they do (Omer's מסדר idea)
  if (!G.paraded) { G.paraded = true; return celebrate(s, finish); }
  const extra = s.stars >= 2 ? (onWin?.(s) || '') : G.challenge ? '<p class="ch-note">באתגר הזמן נספר רק כשכל הכפיתות שבשרטוט כפותות.</p>' : '';
  sfx.ok();
  const stars = [1, 2, 3].map(i => `<span class="${i <= s.stars ? 'on' : ''}">★</span>`).join('');
  const nMissing = s.total - s.tied;
  const missing = nMissing ? (nMissing === 1 ? 'כפיתה אחת חסרה במבנה.' : `${nMissing} כפיתות חסרות במבנה.`) : '';
  showModal(`
    <div class="eyebrow">תוצאות המסדר</div>
    <h2>${s.stars === 3 ? 'בנייה מושלמת!' : s.stars ? 'עברתם את השלב' : 'עוד לא עברתם את השלב'}</h2>
    <div class="stars">${stars}</div>
    ${extra}
    <ul class="inspect">
      <li class="ok">${LV.tripod ? 'החצובה עמדה' : LV.wheel ? 'החצובות עמדו' : LV.carousel ? 'מסגרת הקרוסלה עמדה' : LV.cube ? 'הקובייה עמדה' : 'הקלף עמד'} בדחיפות מכל הכיוונים${LV.cube && !LV.wheel ? ', גם בלי יתרים' : ''}</li>
      ${LV.cube && !LV.wheel ? `<li class="ok">איקס מרחבי מלא בכל צד ובחלק העליון${LV.cube.bays > 1 ? ', וגם בחיבור בין הקוביות' : ''}</li>` : ''}
      <li class="ok">${LV.tripod ? 'נשאה את המשקל על הראש' : LV.wheel ? 'הגלגל הסתובב סיבוב שלם עם שני רוכבים, והמושב נשאר ישר' : LV.carousel ? 'הקרוסלה נשאה שמונה רוכבים והסתובבה בלי להיתקע בתורן' : 'החזיק את דלי המים על הרוחב העליון'}</li>
      ${s.shape ? `<li class="${s.shape.ok ? 'ok' : 'no'}">${s.shape.text}</li>` : ''}
      <li class="${s.tied === s.total ? 'ok' : 'no'}">${s.tied === s.total ? 'כל הכפיתות במקום' : 'המדריך מצא כפיתות חסרות'}</li>
      <li class="${s.correct === s.total ? 'ok' : 'no'}">${s.correct === s.total ? 'כל כפיתה מהסוג הנכון' : 'יש כפיתות מסוג לא נכון'}</li>
    </ul>
    <div class="score-grid">
      <span>כפיתות כפותות</span><b>${s.tied}/${s.total}</b>
      <span>סוג כפיתה נכון</span><b>${s.correct}/${s.total}</b>
      <span>סנדות באורך שבשרטוט</span><b>${s.polesOk}/${s.nPoles}</b>
      <span>דיוק</span><b>${s.accuracy}</b>
      <span>בונוס זמן (${fmt(s.sec)})</span><b>+${s.bonus}</b>
      ${s.penalty ? `<span>רמזים (${G.hintsUsed})</span><b>−${s.penalty}</b>` : ''}
      <span></span><span></span>
      <span class="total">סה״כ</span><b class="total">${s.sum}</b>
    </div>
    ${missing ? `<p>${missing} אפשר לחפש לבד בתיק המבנה, או לקחת רמז.</p>` : ''}
    ${s.wrong ? `<p>${s.wrong === 1 ? 'כפיתה אחת כפותה' : `${s.wrong} כפיתות כפותות`} בסוג לא נכון. זה מוריד ניקוד, אבל לא מפיל את המבנה.</p>` : ''}
    ${!s.stars ? '<p>המבנה עמד, אבל חסרות בו כפיתות שבשרטוט, ולכן אין כוכבים. משלימים את כל החיבורים ומזמינים שוב את המדריך.</p>' : s.stars < 3 ? '<p>אפשר לחזור, להשלים ולתקן, ולשפר את הכוכבים.</p>' : ''}
  `, [
    s.stars < 3 ? ['להשלים ולתקן', reopenForFixes, true] : null,
    s.stars < 3 && G.hintsUsed < s.hintsAllowed && G.result ? [`רמז (${s.hintsAllowed - G.hintsUsed} נותרו, −${s.hintCost} נק׳)`, () => useHint(s)] : null,
    LV.number && LEVELS[LV.number] && s.stars ? [`לשלב ${LV.number + 1}: ${LEVELS[LV.number].name}`, () => switchLevel(LV.number + 1), s.stars === 3] : null,
    ['למגרש שלי', () => { closeModal(); showLevels(); }, s.stars === 3 && !LEVELS[LV.number]],
    ['לבנות מחדש', restart],
  ].filter(Boolean));
  refreshAll();
}
function reopenForFixes() {
  closeModal(); G.check = null; G.result = null; G.endedAt = null; G.paraded = false;
  if (LV.tripod) { G.tri.sim = null; goStage('brace'); }
  else if (LV.carousel) { G.cube.sim = null; G.seat.sim = null; goStage('hang'); }
  else if (LV.wheel) { stopWheelSims(); goStage('gond'); }
  else if (LV.cube) { G.cube.sim = null; goStage('cube'); } else goStage('anchor');
}
// ---------------- the festive מסדר ----------------
// After the inspection the scouts actually use what they built: one climbs it (on a
// base he stands right on top), the rest cheer. The stars light up with what happens:
// ★ it stood every push, ★★ every lashing in the drawing is there so a scout may climb,
// ★★★ every lashing is the right type. Missing lashings: the מדריך stops the climb.
// A tap skips it. Short on purpose: animations must be fast (Omer).
let parade = null;
let onWin = null; // challenges listen here
function paradeCentre() {
  if (LV.tripod) return triApex() || [0, 4, z0()];
  if (LV.carousel) return [SEAT_C[0], 2.5, SEAT_C[1]];
  if (LV.wheel) return [0, 1.8, WHEEL_Z];
  const cs = G.cube?.sim;
  if (cs) { const t = cs.klafim.map(k => k.topCentre()); return [0, 1, 2].map(i => t.reduce((a, q) => a + q[i], 0) / t.length); }
  return G.sim ? G.sim.topCentre() : [0, 2, z0()];
}
function celebrate(s, done) {
  const c = paradeCentre();
  const cam = new THREE.Vector3(camera.position.x - c[0], 0, camera.position.z - c[2]).normalize();
  const side = new THREE.Vector3(-cam.z, 0, cam.x);
  const big = LV.carousel || LV.wheel || LV.frame ? 3.4 : LV.cube || LV.tripod ? 2.6 : 1.9;
  const free = crew.filter(a => !a.busy && !a.want?.sit && !a.want?.lock);
  const climber = LV.carousel || LV.wheel ? null : free.shift() || null;
  const cheer = free.slice(0, 4);
  // where the climber goes: up a leg of a klaf, onto the top of a base, or hanging from a tripod
  let base, topY;
  if (LV.tripod) { base = [c[0] + cam.x * 0.3, 0, c[2] + cam.z * 0.3]; topY = 0.35; }
  else if (LV.cube && !LV.carousel && !LV.frame) { base = [c[0], 0, c[2]]; topY = Math.max(0.5, c[1] + 0.02); }
  else { const lt = G.sim && legTop('legL'); base = lt ? [lt[0] + cam.x * 0.28, 0, lt[2] + cam.z * 0.28] : [c[0], 0, c[2]]; topY = Math.min(1.1, Math.max(0.4, (lt?.[1] ?? 2) - 1.0)); }
  parade = { t: 0, s, done, c, cam, side, big, climber, cheer, base, topY, lit: 0, ok: s.stars >= 2 };
  fun.starsShow();
  controls.enabled = true;
}
function endParade() {
  if (!parade) return;
  const p = parade; parade = null;
  for (const a of [p.climber, ...p.cheer]) a?.clear();
  fun.starsHide();
  p.done();
}
function stepParade(dt) {
  const p = parade; if (!p) return;
  p.t += dt;
  const t = p.t, s = p.s;
  const face = Math.atan2(-p.cam.x, -p.cam.z);
  // cheering scouts: in an arc between the structure and the camera, jumping once things go well
  p.cheer.forEach((a, i) => {
    const off = (i - (p.cheer.length - 1) / 2) * 0.9;
    const pos = [p.c[0] + p.cam.x * (p.big + 0.6) + p.side.x * off, 0, p.c[2] + p.cam.z * (p.big + 0.6) + p.side.z * off];
    const happy = p.ok && t > 2.2;
    if (happy && a.arrived()) pos[1] = Math.abs(Math.sin(t * 8 + i * 1.3)) * 0.22;
    a.set(pos, face, happy ? -0.1 : 0.05, happy ? Math.PI * 0.92 : 0.3);
  });
  // the climber
  const a = p.climber;
  if (a) {
    const at = Math.hypot(a.pos.x - p.base[0], a.pos.z - p.base[2]) < 0.05;
    let y = 0;
    if (at && t > 0.5) {
      const go = p.ok ? 1 : 0.18; // missing lashings: the מדריך stops him almost at once
      y = p.topY * go * Math.min(1, (t - 0.5) / 1.4);
    }
    const climbing = at && t > 0.5 && t < 1.9;
    const wave = p.ok && t >= 1.9 ? 0.25 * Math.sin(t * 10) : 0;
    a.set([p.base[0], y, p.base[2]], LV.cube && !LV.carousel && p.ok && t > 1.9 ? face : face + Math.PI, climbing ? 0.25 : 0, (climbing ? Math.PI * (0.8 + 0.15 * Math.sin(t * 14)) : p.ok && t >= 1.9 ? Math.PI * 0.95 : 0.4) + wave);
  }
  // the stars, one by one
  const light = (i, label) => { if (p.lit > i) return; p.lit = i + 1; fun.starOn(i, label); };
  if (t > 0.4) {
    if (p.ok) light(0, LV.wheel ? 'הגלגל הסתובב עם הרוכבים' : LV.carousel ? 'הקרוסלה עמדה והסתובבה עם הרוכבים' : 'המבנה עמד בכל הדחיפות');
    else if (!p.bad) { p.bad = true; fun.starLabel('<b>המדריך עוצר:</b> חסרות כפיתות שבשרטוט, לא עולים על המבנה', true); sfx.buzzer(); }
  }
  if (p.ok && t > 1.9) light(1, LV.carousel || LV.wheel ? 'כל הכפיתות במקום: אפשר לעלות' : LV.tripod ? 'צופה נתלה על החצובה: כל הכפיתות במקום' : LV.cube ? 'צופה עומד על המבנה: כל הכפיתות במקום' : 'צופה טיפס על הקלף: כל הכפיתות במקום');
  if (p.ok && t > 2.2 && !p.cheered) { p.cheered = true; sfx.cheer(); }
  if (p.ok && t > 2.6) {
    if (s.stars === 3) { if (p.lit < 3) { light(2, 'כל כפיתה מהסוג הנכון!'); fun.confetti(); sfx.fanfare(); } }
    else if (!p.noThird) { p.noThird = true; fun.starLabel('יש כפיתות מסוג לא נכון: אין כוכב שלישי'); fun.confetti(30); }
  }
  if (t > (p.ok ? 3.9 : 2.6)) endParade();
}
// a tap skips the festive inspection
$('app').addEventListener('pointerdown', () => { if (parade && parade.t > 0.3) endParade(); }, true);

// where a lashing is, as the structure file names it: the drawing sheet and the height band
function sheetOf(j) {
  if (j.tri === 'guy') return 'מפת יתרים' + (LV.wheel ? ` (${LV.klafim[j.klaf].he})` : '');
  if (LV.wheel && j.tri) return `שרטוט החצובה (${LV.klafim[j.klaf].he}), ${j.tri === 'head' ? 'בראש' : j.tri === 'stake' ? 'ליד הקרקע (רגל לבז״נט)' : 'בחיזוקים'}`;
  if (LV.tripod) return j.tri === 'head' ? 'שרטוט החצובה, בראש' : j.tri === 'stake' ? 'שרטוט החצובה, ליד הקרקע (רגל לבז״נט)' : 'שרטוט החצובה, בחיזוקים';
  if (j.seat) return j.rope ? 'שרטוט המושב, חבלי התלייה' : j.mast ? 'שרטוט המושב, התורן' : 'שרטוט המושב';
  if (j.rig) return j.rope ? 'שרטוט המושב, חבלי התלייה' : j.part === 'seat' ? 'שרטוט המושב' : j.cornerPole != null ? 'שרטוט הגלגל, סנדות הפינה' : j.axle ? 'שרטוט הגלגל, הציר' : `שרטוט הגלגל, ה${j.sq ? 'ריבוע האחורי' : 'ריבוע הקדמי'}`;
  const band = y => LV.frame ? (y < 2.2 ? 'גובה 0–2 מ׳' : 'גובה 2–4 מ׳ (עבודה בגובה)') : LV.carousel ? (y < 2.5 ? 'גובה 0–2.5 מ׳' : 'גובה 2.5–5 מ׳') : LV.wheel ? (y < 1.4 ? 'גובה 0–1.4 מ׳' : 'גובה 1.4–3.4 מ׳') : y < 1.0 ? 'גובה 0–1 מ׳' : 'גובה 1–2 מ׳';
  const of = LV.klafim.length > 1 && j.klaf != null ? `, ${LV.klafim[j.klaf].he}` : '';
  if (j.cube && j.side === 0) return 'שרטוט מבט על' + (LV.cube.bays > 1 ? (j.bay % 1 ? ', בחיבור בין הקוביות' : j.bay ? ', קובייה אחורית' : ', קובייה קדמית') : '');
  if (j.cube) return `שרטוט ${j.side > 0 ? 'הצד השמאלי' : 'הצד הימני'}${LV.cube.bays > 1 ? (j.bay ? ', קובייה אחורית' : ', קובייה קדמית') : ''}, ${band(j.at[1])}`;
  if (j.guy) return 'מפת יתרים' + of;
  if (j.stake) return 'מפת בסיסים (רגליים לבז״נטים)' + of;
  return `שרטוט ${LV.klafim.length > 1 ? 'ה' + LV.klafim[j.klaf].he : 'הקלף'}, ${band(j.at[1])}`;
}
// a hint names the sheet and height of one problem (missing first, then a wrong type),
// never the joint itself
function useHint(s) {
  const pick = s.all.find(([j, t]) => !t && !G.hinted.includes(j.uid)) || s.all.find(([j, t]) => t && t !== j.correct && !G.hinted.includes(j.uid));
  if (!pick) return;
  const [j, t] = pick;
  G.hintsUsed++;
  G.hinted.push(j.uid);
  const text = t ? `יש כפיתה מסוג לא נכון ב<b>${sheetOf(j)}</b>` : `חסרה כפיתה ב<b>${sheetOf(j)}</b>`;
  showModal(`<div class="eyebrow">רמז</div><h2>${t ? 'כפיתה מסוג לא נכון' : 'כפיתה חסרה'}</h2><p>${text}.</p>
    ${!j.stake && !j.guy && !j.cube && !j.tri && !j.seat && !j.rig ? '<p>כפיתות בקלף אפשר לתקן רק כשהקלף שוכב על הקרקע.</p>' : ''}`,
    [['הבנתי', () => { closeModal(); finish(); }, true]]);
}
function restart() {
  closeModal();
  clearJobs();
  cubeGroup.position.x = 0;
  if (LV.free) { LV.cube = null; LV.klafim.length = 1; Object.assign(LV.klafim[0], { z0: 0, x0: 0, he: freeFirst === 'tripod' ? 'חצובה' : 'קלף', kind: freeFirst }); delete LV.klafim[0].short; setPlan([], []); freeCfg(LV.klafim[0], []); G && (G.armed = null); controls.enabled = true; STAGES = stageList(); makeChips(); }
  if (LV.tripod) setPlan(TRI_SLOTS, TRI_JOINTS);
  G = freshState();
  // each klaf's drawing on the ground, at its size (the carousel's 5 m klafim need a bigger sheet)
  if (!LV.free && !LV.tripod) {
    if (LV.carousel) setBlueprintSize(6.8, 2.45); else if (LV.frame) setBlueprintSize(5.6, 2.0); else if (LV.wheel) setBlueprintSize(4.4, 1.6); else setBlueprintSize(BP_BASE.span, BP_BASE.v0);
    LV.klafim.forEach((k, i) => { useKlaf(i); redrawBlueprint(KM[i].blueprint, JOINTS, LV.frame ? `${k.he} · ${LV.name}` : LV.carousel ? `${k.he} · קרוסלה 5×5` : LV.wheel ? `${k.he} · גלגל ענק` : undefined); });
  }
  useKlaf(0);
  ridersOn = false; for (const a of crew) if (a.want?.sit || a.want?.lock) a.clear();
  for (const set of [...KM.map(m => m.poles), CM.poles, SM.poles, WMM.poles]) for (const k in set) set[k].forEach(m => m.material[0].emissive.setHex(0));
  // hide everything of klafim this level does not use
  KM.forEach((m, i) => {
    const used = i < LV.klafim.length;
    for (const k in m.poles) m.poles[k].forEach(x => { x.visible = false; });
    for (const k in m.lash) m.lash[k].visible = false;
    for (const k in m.stakes) m.stakes[k].visible = false;
    for (const k in m.ropes) m.ropes[k].show(false);
    m.blueprint.material.opacity = 0; m.blueprint.visible = false;
    if (used) m.blueprint.position.z = BP.v0 + LV.klafim[i].z0;
  });
  KM.forEach(m => m.triStakes.forEach(x => { x.visible = false; }));
  if (LV.cube) { for (const side of [-1, 1]) drawSideSheet(CM.sheets[side], LV.cube, side, LV.klafim.map(k => k.he)); drawTopSheet(CM.sheets[0], LV.cube, LV.klafim.map(k => k.he)); }
  $('timer').textContent = '0:00';
  drawPlaza();
  camMode = null; // a new level: always aim the camera afresh
  goStage(STAGES[0].key);
  refreshAll();
  startChallenge();
}
function switchLevel(n) {
  resetPlan();
  LV = LEVELS[n - 1];
  STAGES = stageList();
  makeChips();
  restart();
}
// ---------------- the growing plaza ----------------
// Every structure the player has passed stays standing on the plaza, in its
// own spot around the building ground, so the camp grows level by level.
const PLAZA_SPOTS = { 1: { x: -9, z: 6.5, yaw: 0.35 }, 2: { x: 8.5, z: 7, yaw: -0.3 }, 3: { x: -9.5, z: -5.5, yaw: 1.2 }, 4: { x: 0.5, z: 10.6, yaw: Math.PI }, 5: { x: 9.5, z: -5.5, yaw: -1.2 } };
const plazaShown = {};
function makeDisplay(L) {
  const g = new THREE.Group();
  const pole = (a, b) => { const m = makePoleMesh(0); placeCylinder(m, a, b); g.add(m); };
  if (L.tripod) {
    const st = standing(planFeet([0, 0]), [TRI.legLength, TRI.legLength, TRI.legLength]);
    st.legs.forEach((q, i) => { const o = headOffset(i, st); pole(add3(q.foot, o, 1), add3(q.top, o, 1)); const m = makeStake(TRI.stakeLength); m.position.set(q.foot[0] - o[2] * 2.2, -0.3, q.foot[2] + o[0] * 2.2); g.add(m); });
    for (const b of BRACES) { const [a, c] = braceEnds(b, b.length, st); pole(a, c); }
    const k = makeLashing(); placeParallelLashing(k, add3(st.apex, [1, 0, 0], -0.07), add3(st.apex, [1, 0, 0], 0.07), [0, 1, 0]); k.children.forEach(c => c.scale.set(2.3, 2.3, 1)); g.add(k);
    return g;
  }
  const knot = (p, dA, dB, sep) => { const k = makeLashing(); placeLashing(k, p, dA, dB, sep); g.add(k); };
  const N = [0, 0, -1]; // a standing klaf faces the pullers
  // the plan being played (a tripod, free build, another level) is put back afterwards
  const keep = { slots: [...SLOTS], joints: [...JOINTS], u: LEG_STAKES.map(q => q.u), h: LEVEL.height };
  for (const cfg of L.klafim.filter(q => q.kind !== 'tripod')) {
    if (cfg.plan) setPlan(cfg.plan.slots, cfg.plan.joints); else resetPlan();
    const at = (u, v, slot) => { const p = klafToWorld(u, v, 90); p[2] += cfg.z0; return add3(p, N, slot ? layerOff(slot) : 0); };
    for (const sl of SLOTS) {
      const h = sl.length / 2;
      pole(at(sl.centre[0] - sl.dir[0] * h, sl.centre[1] - sl.dir[1] * h, sl), at(sl.centre[0] + sl.dir[0] * h, sl.centre[1] + sl.dir[1] * h, sl));
    }
    for (const j of JOINTS) {
      const A = slotById(j.a), B = slotById(j.b);
      const pa = at(j.at[0], j.at[1], A), pb = at(j.at[0], j.at[1], B);
      knot(pa.map((v, i) => (v + pb[i]) / 2), [A.dir[0], A.dir[1], 0], [B.dir[0], B.dir[1], 0], pa.map((v, i) => (v - pb[i]) / 2));
    }
    for (const st of LEG_STAKES) { const m = makeStake(LEG_STAKE_LEN); m.position.set(st.u, -0.3, cfg.z0 - GAP); g.add(m); }
    // a klaf standing alone keeps its guy lines; inside a cube the inner ones are down
    if (!L.cube) for (const gl of GUYS) {
      const u = slotById(gl.leg).centre[0];
      const a = guyAnchor(cfg, gl); a[1] = 0.3;
      const top = at(u, slotById(gl.leg).length, slotById(gl.leg));
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 5), new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 1 }));
      placeCylinder(r, top, a); g.add(r);
      const sk = makeStake(ANCHOR_LEN); poseAnchorStake(sk, gl, a, ANCHOR_HITS); g.add(sk);
      { const ax = anchorStakeAxis(gl); const t = add3([a[0], -0.25, a[2]], [ax.x, ax.y, ax.z], ANCHOR_LEN - 0.06); placeCylinder(r, top, t); }
    }
  }
  if (L.cube) for (const sl of L.cube.slots) {
    const h = sl.length / 2;
    pole(cubeSlotPoint(sl, -h), cubeSlotPoint(sl, h));
  }
  if (L.carousel) {
    // the seat hanging from the mast, and its ropes
    const y = CAR.seat.height;
    for (const sl of SEAT.slots) { const h = sl.length / 2, o = (sl.layer || 0) * GAP; pole([sl.centre[0] - sl.dir[0] * h, sl.centre[1] + y + o, sl.centre[2] - sl.dir[2] * h], [sl.centre[0] + sl.dir[0] * h, sl.centre[1] + y + o, sl.centre[2] + sl.dir[2] * h]); }
    pole([SEAT_C[0], CAR.seat.mastFoot, SEAT_C[1]], [SEAT_C[0], mastTopY(MAST.length), SEAT_C[1]]);
    const rm = new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 1 });
    for (let k = 0; k < 8; k++) { const c = cornerAt(k), rr = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1, 5), rm); placeCylinder(rr, [SEAT_C[0], PIVOT[1], SEAT_C[1]], [c[0], LEVEL.poleRadius + y, c[1]]); g.add(rr); }
  }
  if (L.wheel) {
    // the two 90° tripods standing, with their braces
    for (const cfg of L.klafim) {
      const sp = cfg.tri, st = standing(sp.planFeet([cfg.centre[0], cfg.z0 + cfg.centre[1]], cfg.out), sp.legLengths, sp);
      st.legs.forEach((q, i) => { const o = headOffset(i, st); pole(add3(q.foot, o, 1), add3(q.top, o, 1)); });
      if (st.twin) { const o = add3(headOffset(sp.twin.of, st), sp.twin.offset, 1); pole(add3(st.legs[sp.twin.of].foot, o, 1), add3(st.legs[sp.twin.of].top, o, 1)); }
      for (const b of BRACES) { const [a, c] = braceEnds(b, sp.braceLengths[b.id], st); pole(a, c); }
    }
    // the wheel in its forks, and its seat hanging from the bottom corner pole
    for (const sl of RIG.slots) { const h = sl.length / 2, o = rigOff(sl); pole(add3(add3(sl.centre, sl.dir, -h), o, 1), add3(add3(sl.centre, sl.dir, h), o, 1)); }
    const rm = new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 1 });
    for (const h of SEAT_ROPES) { const rr = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1, 5), rm); placeCylinder(rr, ropeTop(h.corner), ropeFoot(h.corner)); g.add(rr); }
  }
  SLOTS.length = 0; SLOTS.push(...keep.slots); JOINTS.length = 0; JOINTS.push(...keep.joints);
  LEG_STAKES.forEach((q, i) => { q.u = keep.u[i]; }); LEVEL.height = keep.h;
  // centre it on its spot
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3());
  const outer = new THREE.Group(); g.position.set(-c.x, 0, -c.z); outer.add(g);
  return outer;
}
function drawPlaza() {
  for (const L of LEVELS) {
    const spot = PLAZA_SPOTS[L.number]; if (!spot) continue;
    const want = starsOf(L.number) >= 1 && L !== LV;
    if (want && !plazaShown[L.number]) {
      const d = plazaShown[L.number] = makeDisplay(L);
      d.position.set(spot.x, 0, spot.z); d.rotation.y = spot.yaw; scene.add(d);
    }
    if (plazaShown[L.number]) plazaShown[L.number].visible = want;
  }
}

// ---------------- home screen and the plaza's levels ----------------
// Best stars per level are kept on this device only. One star opens the next level.
const PROGRESS_KEY = 'buildit.stars';
function loadStars() { try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch { return {}; } }
function saveStars(n, stars) {
  const all = loadStars();
  if ((all[n] || 0) >= stars) return;
  all[n] = stars;
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(all)); } catch { /* private mode: progress lasts this visit */ }
  memStars = all;
}
let memStars = loadStars();
const starsOf = n => Math.max(memStars[n] || 0, loadStars()[n] || 0);
// test builds for Omer: every level is open, so he never has to start from the beginning
const ALL_LEVELS_OPEN = true;
const unlocked = n => ALL_LEVELS_OPEN || n === 1 || starsOf(n - 1) >= 1;
// structures that come after the playable ones, shown on the path as coming soon
const COMING = [];
const ICONS = {
  1: '<svg viewBox="0 0 64 46"><g stroke="#6b4423" stroke-width="4" stroke-linecap="round"><path d="M14 44V4M50 44V4M8 36h48M8 8h48M14 36L50 8M14 8l36 28"/></g></svg>',
  2: '<svg viewBox="0 0 64 46"><g stroke="#6b4423" stroke-width="3" stroke-linecap="round" fill="none"><path d="M4 44V12M22 44V12M40 44V12M4 38h36M4 14h36M4 38L22 14M4 14l18 24M22 38L40 14M22 14l18 24"/><path d="M40 12l16-8M40 44l16-8M56 36V4M4 12l16-8h36" opacity=".6"/></g></svg>',
  3: '<svg viewBox="0 0 64 46"><g stroke="#6b4423" stroke-width="3.5" stroke-linecap="round" fill="none"><path d="M34 2L10 44M30 2l24 42M32 2v36"/><path d="M15 36l17-6 18 6" opacity=".7"/></g><circle cx="32" cy="7" r="5" fill="none" stroke="#e0a93b" stroke-width="2.5"/></svg>',
  5: '<svg viewBox="0 0 64 46"><g stroke="#6b4423" stroke-width="3" stroke-linecap="round" fill="none"><path d="M4 44L14 6M24 44L14 6M40 44L50 6M60 44L50 6M7 34h14M43 34h14M10 4h44"/></g><g stroke="#e0a93b" stroke-width="2.5" fill="none"><path d="M32 -8L48 8 32 24 16 8z" transform="translate(0 4) scale(1 .9)"/><path d="M32 26v8M26 36h12"/></g></svg>',
  4: '<svg viewBox="0 0 64 46"><g stroke="#6b4423" stroke-width="3" stroke-linecap="round" fill="none"><path d="M6 44V4M58 44V4M4 6h56M4 24h56M6 4l52 20M58 4L6 24"/><path d="M32 6v32"/></g><g stroke="#e0a93b" stroke-width="2.5" fill="none"><path d="M32 12L18 36M32 12l14 24"/><path d="M14 37h36"/></g></svg>',
  soon: '<svg viewBox="0 0 64 46"><g stroke="#3a3a30" stroke-width="3.5" stroke-linecap="round" fill="none" opacity=".7"><path d="M4 44V14M30 44V14M56 44V14M4 16h52M4 38h52"/></g></svg>',
};
const starRow = n => [1, 2, 3].map(i => `<span class="${i <= n ? 'on' : ''}">★</span>`).join('');
function showHome() {
  $('levels').hidden = true; $('home').hidden = false;
  try { drawPlaza(); } catch (e) { reportError(e); }
  const total = LEVELS.reduce((a, l) => a + starsOf(l.number), 0);
  $('home-stars').textContent = total ? `★ ${total} / ${LEVELS.length * 3}` : 'מתחילים מהקלף הראשון';
  $('home-bar').style.width = `${Math.round(100 * total / (LEVELS.length * 3))}%`;
  $('levels').hidden = true; $('home').hidden = false;
}
function showLevels() {
  $('home').hidden = true; $('levels').hidden = false;
  try { drawPlaza(); } catch (e) { reportError(e); }
  const total = LEVELS.reduce((a, l) => a + starsOf(l.number), 0);
  $('levels-total').textContent = `★ ${total} / ${LEVELS.length * 3}`;
  const path = $('levels-path'); path.innerHTML = '';
  for (const l of LEVELS) {
    const open = unlocked(l.number);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lvl-card' + (open ? '' : ' locked');
    b.innerHTML = `<span class="num">${l.number}</span>${ICONS[l.number] || ICONS.soon}<span class="nm">${l.name}</span>
      ${open ? `<span class="st">${starRow(starsOf(l.number))}</span>` : `<span class="lock">נפתח בכוכב אחד בשלב ${l.number - 1}</span>`}`;
    if (open) b.addEventListener('click', () => playLevel(l.number));
    path.appendChild(b);
  }
  for (const [i, c] of COMING.entries()) {
    const d = document.createElement('div');
    d.className = 'lvl-card locked';
    d.innerHTML = `<span class="num">${LEVELS.length + i + 1}</span>${ICONS.soon}<span class="nm">${c.name}</span><span class="sub">${c.sub}</span><span class="lock">בקרוב</span>`;
    path.appendChild(d);
  }
  $('home').hidden = true; $('levels').hidden = false;
}
function playLevel(n) {
  $('home').hidden = true; $('levels').hidden = true;
  switchLevel(n);
}
$('home-plaza').addEventListener('click', showLevels);
// free build: what the plaza starts with (more klafim and tripods are added as you go)
let freeFirst = 'klaf';
function playFree(lv = FREE_LEVEL, first = 'klaf') {
  freeFirst = first;
  $('home').hidden = true; $('levels').hidden = true;
  LV = lv;
  STAGES = stageList();
  makeChips();
  restart();
}
$('home-sketch').addEventListener('click', () => { $('sketch-file').value = ''; $('sketch-file').click(); });
$('sketch-file').addEventListener('change', async () => {
  const file = $('sketch-file').files?.[0]; if (!file) return;
  showModal('<h2>טוענים את השרטוט…</h2><p>רגע, מכינים את העמודים לתיק המבנה.</p>', []);
  try {
    const sk = await loadSketch(file);
    closeModal();
    playFree({ ...FREE_LEVEL, sketch: sk, name: sk.name.slice(0, 28) || 'השרטוט שלי' });
    openFolder();
  } catch (e) {
    infoCard('לא הצלחנו לפתוח את הקובץ', e?.message === 'not-a-drawing' ? 'אפשר להעלות קובץ PDF או תמונה (JPG, PNG).' : 'הקובץ לא נפתח. נסו קובץ PDF אחר, או צילום של השרטוט כתמונה.');
    reportError(e);
  }
});
$('home-free').addEventListener('click', () => showModal(`<div class="eyebrow">בנייה חופשית</div><h2>במה מתחילים?</h2>
  <p>במגרש אחד אפשר לבנות כמה קלפים וחצובות. בונים את כולם על הקרקע, ואז מרימים אותם אחד אחרי השני.</p>
  <p><b>קלף</b>: מתכננים אותו על הרשת. <b>חצובה</b>: בוחרים אורך לרגליים, ומעמידים אותן איפה שרוצים.</p>`,
  [['קלף', () => { closeModal(); playFree(FREE_LEVEL, 'klaf'); }, true], ['חצובה', () => { closeModal(); playFree(FREE_LEVEL, 'tripod'); }, true], ['ביטול', closeModal]]));
// the top buttons are wired before anything else here can fail
$('levels-back').addEventListener('click', showHome);
$('btn-home').addEventListener('click', () => { closeModal(); showHome(); });
$('btn-level').addEventListener('click', () => { closeModal(); showLevels(); });
try { decor = makeDecor({
  scene, camera, controls, canvas, allOpen: ALL_LEVELS_OPEN,
  stars: () => LEVELS.reduce((a, l) => a + starsOf(l.number), 0),
  onExit: () => { camMode = null; showHome(); },
}); } catch (e) { reportError(e); }
$('home-decor').addEventListener('click', () => {
  $('home').hidden = true; $('levels').hidden = true;
  closeModal(); closePicker(); camTween = null; closeup = null; camMode = null;
  decor.enter();
});
// ---------------- short challenges (challenges.js) ----------------
// A speed run, "fix the broken camp" and a challenge of the day. They are played on a
// copy of the level without the tutorial; a speed run is the whole level against the
// clock, and a fixed camp is judged by the מדריך right on the ground.
function timerText() {
  const t = fmt(elapsed()), ch = G.challenge;
  if (ch?.kind === 'speed') return `${t} · ${MEDAL_ICON[0]} ${fmt(SPEED[LV.number].medals[0])}`;
  if (ch?.kind === 'fix') return `${t} · ${MEDAL_ICON[0]} ${fmt(FIX[LV.number].medals[0])}`;
  if (ch?.kind === 'cube') return `${t} · ${MEDAL_ICON[0]} ${fmt(cubeMedals(ch)[0])}`;
  return t;
}
function playChallenge(ch) {
  closeModal();
  $('home').hidden = true; $('levels').hidden = true;
  resetPlan();
  LV = { ...(ch.kind === 'cube' ? (ch.level === 4 ? CUBE4_LEVEL : CUBE_LEVEL) : LEVELS[ch.level - 1]), tutorial: false, challenge: ch };
  STAGES = stageList(); makeChips(); restart();
}
// restart() calls this: a challenge starts again from the same point
function startChallenge() {
  const ch = LV.challenge; if (!ch) return;
  G.challenge = { ...ch, penalty: 0, calls: 0 };
  if (ch.kind === 'fix') breakCamp(G.challenge);
  else if (ch.kind === 'cube') (ch.level === 4 ? breakCube4 : breakCube)(G.challenge);
  else flashHint(`<b>מול השעון:</b> בונים את כל המבנה ומזמינים מסדר. הזמן נספר רק אם כל הכפיתות כפותות`);
  refreshAll();
}
// lay every klaf on its drawing, built and lashed, then hide faults in them
function breakCamp(ch) {
  const rand = rng(ch.seed ?? Math.floor(Math.random() * 1e9));
  const spots = [];
  eachKlaf((k, i) => {
    const b = G.build;
    for (const sl of SLOTS) b.poles[sl.id] = { length: sl.length };
    for (const j of JOINTS) b.joints[j.id] = j.correct;
    for (const j of JOINTS) spots.push({ i, kind: rand() < 0.5 ? 'miss' : 'type', id: j.id });
    // a pole too long: only where the pile holds a longer one
    for (const sl of SLOTS) { const longer = (LV.stockExtra || []).filter(l => l > sl.length + 0.05).sort((a, c) => a - c)[0]; if (longer) spots.push({ i, kind: 'long', id: sl.id, len: longer }); }
  });
  ch.faults = [];
  const used = new Set(), longs = new Set();
  let guard = 0;
  while (ch.faults.length < FIX[LV.number].faults && guard++ < 500) {
    const f = spots[Math.floor(rand() * spots.length)];
    const key = f.i + ':' + f.id;
    if (used.has(key)) continue;
    if (f.kind === 'long' && (longs.has(f.len) || rand() < 0.5)) continue; // one of each spare pole at most
    used.add(key); if (f.kind === 'long') longs.add(f.len);
    ch.faults.push(f);
  }
  for (const f of ch.faults) {
    const b = G.klafim[f.i].build;
    if (f.kind === 'miss') delete b.joints[f.id];
    else if (f.kind === 'type') { const j = JOINTS.find(q => q.id === f.id); const other = LASHING_ORDER.filter(t => t !== j.correct); b.joints[f.id] = other[Math.floor(rand() * other.length)]; }
    else b.poles[f.id] = { length: f.len };
  }
  useKlaf(0);
  startClock();
  flashHint('<b>המחנה לא תקין.</b> בודקים מול תיק המבנה ומזמינים את המדריך');
}
// the 2x2 cube stands, both klafim raised and anchored, every joining pole in place but one
// top connection (Omer, 11-20): the player finds it in the structure file, adds and lashes
// it, takes the inner guy lines down, and calls the מסדר. Without it the cube racks.
function breakCube(ch) {
  const rand = rng(Math.floor(Math.random() * 1e9));
  const crewIds = [...GUYS.map(g => g.id), 'L1', 'L2'];
  eachKlaf(k => {
    const b = G.build;
    for (const sl of SLOTS) b.poles[sl.id] = { length: sl.length };
    for (const j of JOINTS) b.joints[j.id] = j.correct;
    for (const st of LEG_STAKES) b.stakes[st.id] = LEG_STAKE_HITS;
    for (const g of GUYS) { b.guyTop[g.id] = true; b.anchors[g.id] = ANCHOR_HITS; b.guyTies[g.id] = 'guy'; }
    for (const sj of STAKE_JOINTS) b.stakeJoints[sj.id] = sj.correct;
    crewIds.forEach((id, n) => { b.crew[id] = n; });
    k.raisedOnce = true;
    k.sim = new KlafSim(b, k.cfg); k.sim.standUp();
  });
  const side = rand() < 0.5 ? 'L' : 'R', gone = `C.top${side}`;
  ch.missing = gone;
  const cb = G.cube.build;
  for (const sl of LV.cube.slots) if (sl.id !== gone) cb.poles[sl.id] = { length: sl.length };
  for (const j of LV.cube.joints) if (j.a !== gone && j.b !== gone) cb.joints[j.id] = j.correct;
  useKlaf(0);
  goStage('cube');
  startClock();
  flashHint('<b>קובייה לא שלמה.</b> משלימים לפי תיק המבנה ומזמינים מסדר');
}
// the 4×4 cube (Omer, 11-21): standing and anchored, every connection from the ground
// tied, some connections above 2 m missing. The player goes up (work at height) and ties them.
function breakCube4(ch) {
  const rand = rng(Math.floor(Math.random() * 1e9));
  const crewIds = [...GUYS.map(g => g.id), 'L1', 'L2'];
  eachKlaf(k => {
    const b = G.build;
    for (const sl of SLOTS) b.poles[sl.id] = { length: sl.length };
    for (const j of JOINTS) b.joints[j.id] = j.correct;
    for (const st of LEG_STAKES) b.stakes[st.id] = LEG_STAKE_HITS;
    for (const g of GUYS) { b.guyTop[g.id] = true; b.anchors[g.id] = ANCHOR_HITS; b.guyTies[g.id] = 'guy'; }
    for (const sj of STAKE_JOINTS) b.stakeJoints[sj.id] = sj.correct;
    crewIds.forEach((id, n) => { b.crew[id] = n; });
    k.raisedOnce = true;
    k.sim = new KlafSim(b, k.cfg); k.sim.standUp();
  });
  const high = LV.cube.joints.filter(highJoint).map(j => j.id).sort(() => rand() - 0.5);
  ch.missing = high.slice(0, 5 + Math.floor(rand() * 3));
  const cb = G.cube.build;
  for (const sl of LV.cube.slots) cb.poles[sl.id] = { length: sl.length };
  for (const j of LV.cube.joints) if (!ch.missing.includes(j.id)) cb.joints[j.id] = j.correct;
  useKlaf(0);
  goStage('cube');
  startClock();
  flashHint('<b>עבודה בגובה.</b> משלימים לפי תיק המבנה ומזמינים מסדר');
}
function faultsLeft() {
  let n = 0;
  eachKlaf(() => {
    const b = G.build;
    for (const sl of SLOTS) if (!b.poles[sl.id] || Math.abs(b.poles[sl.id].length - sl.length) > 0.05) n++;
    for (const j of JOINTS) if (b.joints[j.id] !== j.correct) n++;
  });
  return n;
}
function fixCheck() {
  const ch = G.challenge, left = faultsLeft();
  ch.calls++;
  if (left) {
    ch.penalty += FIX_PENALTY;
    sfx.buzzer(); fun.shake(0.03, 0.2);
    return infoCard('המחנה עוד לא תקין', `המדריך לא מגלה מה ואיפה. כל בדיקה מוקדמת מוסיפה ${FIX_PENALTY} שניות לזמן.`);
  }
  G.endedAt = performance.now();
  const sec = elapsed(), med = medalOf(sec, FIX[LV.number].medals);
  const best = recordChallenge(ch, sec);
  sfx.fanfare(); fun.confetti(med === 0 ? 90 : 50);
  showModal(`<div class="eyebrow">תקנו את המחנה</div>
    <h2>${med >= 0 ? `${MEDAL_ICON[med]} מדליית ${MEDAL_HE[med]}` : 'המחנה תקין!'}</h2>
    <p>המחנה תקין, ב־<b>${fmt(sec)}</b>${ch.penalty ? ` (כולל ${ch.penalty} שניות על בדיקות מוקדמות)` : ''}.</p>
    ${best ? '<p class="ch-best">שיא חדש!</p>' : `<p>השיא שלכם: ${fmt(bestOf(ch))}</p>`}`,
  [['עוד אתגר', showChallenges, true], ['למסך הבית', () => { closeModal(); showHome(); }]]);
  refreshAll();
}
// a structure passed with every lashing tied (two stars or more)
onWin = s => {
  const ch = G.challenge;
  if (ch?.kind !== 'speed' && ch?.kind !== 'cube') return '';
  const medals = ch.kind === 'cube' ? cubeMedals(ch) : SPEED[LV.number].medals;
  const sec = s.sec, med = medalOf(sec, medals), best = recordChallenge(ch, sec);
  if (med >= 0) fun.confetti(40);
  return `<div class="ch-result">${med >= 0 ? `${MEDAL_ICON[med]} <b>מדליית ${MEDAL_HE[med]}</b>` : 'בלי מדליה הפעם'} · ${fmt(sec)}${best ? ' · <b>שיא חדש!</b>' : ''}</div>`;
};
function challengeRow(ch, label, sub) {
  const best = bestOf(ch), m = best != null ? medalOf(best, ch.kind === 'cube' ? cubeMedals(ch) : (ch.kind === 'speed' ? SPEED : FIX)[ch.level].medals) : -1;
  return `<button type="button" class="ch-row" data-k="${ch.kind}" data-l="${ch.level}"><span class="ch-nm">${label}</span><span class="ch-sub">${sub}</span>
    <span class="ch-best">${best != null ? `${m >= 0 ? MEDAL_ICON[m] : ''} ${fmt(best)}` : 'עוד לא'}</span></button>`;
}
function showChallenges() {
  showModal(`<div class="eyebrow">אתגרים קצרים</div><h2>אתגרים</h2>
    <div class="ch-grid">
      ${challengeRow({ kind: 'cube', level: 0 }, 'קובייה לא שלמה', 'משלימים ועוברים מסדר')}
      ${challengeRow({ kind: 'cube', level: 4 }, 'עבודה בגובה: קובייה 4×4', 'עולים עם רתמות ומשלימים למעלה')}
      ${challengeRow({ kind: 'speed', level: 1 }, 'מול השעון: קלף 2×2', 'כל המבנה, כמה שיותר מהר')}
      ${challengeRow({ kind: 'speed', level: 3 }, 'מול השעון: חצובה', 'כל המבנה, כמה שיותר מהר')}
      ${challengeRow({ kind: 'fix', level: 1 }, 'תקנו את המחנה: קלף', 'מוצאים מה לא תקין')}
      ${challengeRow({ kind: 'fix', level: 2 }, 'תקנו את המחנה: בסיס 2×4', 'מוצאים מה לא תקין')}
    </div>`, [['סגירה', () => { closeModal(); showHome(); }]]);
  document.querySelectorAll('.ch-row').forEach(b => b.addEventListener('click', () => playChallenge({ kind: b.dataset.k, level: +b.dataset.l })));
}
$('home-challenges').addEventListener('click', showChallenges);
// a direct link to a level (?level=2) skips the home screen
if (new URLSearchParams(location.search).get('level')) $('home').hidden = true; else showHome();

// ---------------- modal cards ----------------
function showModal(html, actions) {
  $('modal-body').innerHTML = html;
  const box = $('modal-actions'); box.innerHTML = '';
  for (const [label, fn, primary] of actions) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tool' + (primary ? ' primary' : '');
    b.textContent = label; b.addEventListener('click', fn); box.appendChild(b);
  }
  $('modal').hidden = false;
}
function closeModal() { $('modal').hidden = true; }
function confirmCard(title, text, yes, fn) {
  showModal(`<h2>${title}</h2><p>${text}</p>`, [[yes, () => { closeModal(); fn(); }, true], ['ביטול', closeModal]]);
}
function infoCard(title, text) { showModal(`<h2>${title}</h2><p>${text}</p>`, [['הבנתי', closeModal, true]]); }
function collapseCard() {
  const e = G.falling.explain;
  if (G.falling.wheel) {
    const title = { tower: 'חצובה קרסה', rack: 'הגלגל התקפל', slip: 'הגלגל החליק מהציר', tilt: 'המושב נטה', bend: 'המושב נשבר', drop: 'המושב נפל' }[G.falling.kind] || 'הגלגל נשבר';
    return showModal(`<div class="eyebrow">מבחן מציאות</div><h2>${title}</h2><div class="rule">${e.rule}</div><p>${e.detail}</p>`, [['חזרה לגלגל', () => {
      closeModal(); G.falling = null; G.check = null; stopWheelSims(); setPolesOpacity(1); goStage(e.stage || 'gond');
    }, true]]);
  }
  if (G.falling.carousel) {
    const title = G.falling.kind === 'swing' ? 'המושב נתקע בתורן' : G.falling.kind === 'tilt' ? 'התורן נטה' : 'המושב נשבר';
    return showModal(`<div class="eyebrow">מבחן מציאות</div><h2>${title}</h2><div class="rule">${e.rule}</div><p>${e.detail}</p>`, [['חזרה לתליית הקרוסלה', () => {
      closeModal(); G.falling = null; G.check = null; G.seat.sim = null; G.cube.sim = null; setPolesOpacity(1); goStage('hang');
    }, true]]);
  }
  if (G.falling.cube) {
    return showModal(`<div class="eyebrow">מבחן מציאות</div><h2>${LV.wheel ? 'המגדלים קרסו' : G.falling.kind === 'sway' ? 'הקובייה נטתה ונפלה' : 'הקובייה קרסה'}</h2>
      <div class="rule">${e.rule}</div><p>${e.detail}</p>`, [['חזרה לקובייה', () => {
      closeModal(); G.falling = null; G.check = null; G.cube.sim = null; if (G.seat) G.seat.sim = null; if (G.wheel) G.wheel.sim = null; setPolesOpacity(1); goStage('cube');
    }, true]]);
  }
  if (G.falling.tri) {
    return showModal(`<div class="eyebrow">מבחן מציאות</div><h2>החצובה קרסה</h2><div class="rule">${e.rule}</div><p>${e.detail}</p>`, [['חזרה לחצובה', () => {
      closeModal(); G.falling = null; G.check = null; G.tri.sim = null; setPolesOpacity(1); goStage('brace');
    }, true]]);
  }
  showModal(`
    <div class="eyebrow">מבחן מציאות</div>
    <h2>הקלף קרס</h2>
    <div class="rule">${e.rule}</div>
    <p>${e.detail}</p>
  `, [['חזרה לבנייה', () => {
    closeModal(); G.falling = null; G.check = null; lowerKlaf(); setPolesOpacity(1); goStage(STAGES.find(s => s.id === 'build' && s.k === G.ki).key);
  }, true]]);
}
// ---------------- slow-motion replay of a collapse ----------------
// The last moments of the simulation are recorded every frame. After a
// collapse they play back at 40% speed with the cause marked in red
// (the half-tied pole, a ghost of a missing pole, the missing lashings or
// the unstaked feet), and then the rule card appears.
const rec = [];          // { t, p: Float32Array }
let recT = 0;
const REPLAY = { before: 1.0, speed: 0.4 };
function fadedOut() { return G.falling && G.falling.t >= 2.2 && !G.replay; }
function record(dt) {
  if (!G.sim) return;
  const ps = G.sim.world.p;
  recT += dt;
  const a = new Float32Array(ps.length * 3);
  ps.forEach((q, i) => { a[i * 3] = q.x[0]; a[i * 3 + 1] = q.x[1]; a[i * 3 + 2] = q.x[2]; });
  const ss = (G.seat?.sim || G.wheel?.sim)?.world.p;
  let sp = null;
  if (ss) { sp = new Float32Array(ss.length * 3); ss.forEach((q, i) => { sp[i * 3] = q.x[0]; sp[i * 3 + 1] = q.x[1]; sp[i * 3 + 2] = q.x[2]; }); }
  rec.push({ t: recT, p: a, s: sp });
  // keep a short window before the collapse; once falling, keep everything
  if (!G.falling) while (rec.length && recT - rec[0].t > REPLAY.before + 0.2) rec.shift();
  else if (G.falling.t0 == null) G.falling.t0 = recT;
  if (rec.length > 600) rec.shift();
}
const markMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.9, depthTest: false });
const marks = [];
function mark(i) {
  if (!marks[i]) { marks[i] = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 28), markMat); marks[i].renderOrder = 10; curGroup.add(marks[i]); }
  return marks[i];
}
const ghostMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.5, depthWrite: false });
const ghostPoles = [...Array(12).keys()].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 10), ghostMat); m.visible = false; curGroup.add(m); return m; });
function startReplay() {
  if (rec.length < 2 || !G.falling.t0) { collapseCard(); return; }
  const t0 = Math.max(rec[0].t, G.falling.t0 - REPLAY.before);
  G.replay = { t: t0, end: rec[rec.length - 1].t, focus: G.falling.explain.focus || {} };
  setPolesOpacity(1);
}
function stepReplay(dt) {
  const r = G.replay;
  r.t += dt * REPLAY.speed;
  if (r.t >= r.end) { endReplay(); return; }
  let i = rec.findIndex(f => f.t >= r.t); if (i < 1) i = 1;
  const A = rec[i - 1], B = rec[i], k = Math.min(1, Math.max(0, (r.t - A.t) / (B.t - A.t || 1)));
  G.sim.world.p.forEach((q, n) => { for (let c = 0; c < 3; c++) q.x[c] = A.p[n * 3 + c] + (B.p[n * 3 + c] - A.p[n * 3 + c]) * k; });
  const side = G.seat?.sim || G.wheel?.sim;
  if (A.s && B.s && side) side.world.p.forEach((q, n) => { for (let c = 0; c < 3; c++) q.x[c] = A.s[n * 3 + c] + (B.s[n * 3 + c] - A.s[n * 3 + c]) * k; });
  drawFocus();
}
function drawFocus() {
  const f = G.replay.focus, b = G.build;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
  for (const sid of f.poles || []) poleMeshes[sid].forEach(m => m.material[0].emissive.setRGB(0.55 + 0.4 * pulse, 0.05, 0));
  (f.ghosts || []).forEach((js, i) => {
    const [pa, pb] = js.map(id => jointPos(JOINTS.find(j => j.id === id)));
    if (pa && pb) placeCylinder(ghostPoles[i], pa, pb);
  });
  for (const sid of f.cubePoles || []) CM.poles[sid].forEach(m => m.material[0].emissive.setRGB(0.55 + 0.4 * pulse, 0.05, 0));
  (f.cubeGhosts || []).forEach((js, i) => {
    const cs = G.cube.sim; if (!cs) return;
    const [pa, pb] = js.map(id => {
      const j = cubeJoint(id);
      // a flat X ends on a top side pole, a side X on a klaf leg
      const q = j.b ? cs.findParticle(j.b, cubeSlotParam(cubeSlot(j.b), j.at)) : cs.legParticle(j);
      return q == null ? null : cs.pos(q);
    });
    if (pa && pb && ghostPoles[i]) placeCylinder(ghostPoles[i], pa, pb);
  });
  const spots = [...(f.joints || []).map(id => jointPos(JOINTS.find(j => j.id === id))), ...(f.cubeJoints || []).map(id => cubeJointPos(cubeJoint(id))),
    ...(f.seatJoints || []).map(id => seatJointPos(seatJoint(id))), ...(f.rigJoints || []).map(id => rigJointPos(rigJoint(id))), ...(f.ropes || []).map(k => rigRopeFoot(k)), ...(f.corners || []).map(k => cornerPos(k)), ...(f.mastJoints || []).map(id => mastJointPos(MAST_JOINTS.find(q => q.id === id)))];
  if (f.feet) for (const leg of ['legL', 'legR']) { const P = G.sim.poleParticles[leg]; if (P) spots.push(G.sim.pos(P[0].id)); }
  let n = 0;
  for (const p of spots) {
    if (!p) continue;
    const m = mark(n++); m.visible = true; m.position.set(...p);
    m.lookAt(camera.position); m.scale.setScalar(0.85 + 0.35 * pulse);
  }
  for (; n < marks.length; n++) marks[n].visible = false;
}
function endReplay() {
  if (!G.replay) return;
  G.replay = null;
  marks.forEach(m => { m.visible = false; });
  ghostPoles.forEach(m => { m.visible = false; });
  for (const k in poleMeshes) poleMeshes[k].forEach(m => m.material[0].emissive.setHex(0));
  for (const k in CM.poles) CM.poles[k].forEach(m => m.material[0].emissive.setHex(0));
  setPolesOpacity(0);
  collapseCard();
}
function setPolesOpacity(o) {
  for (const set of [...KM.map(m => m.poles), CM.poles, SM.poles, WMM.poles]) for (const k in set) for (const m of set[k]) for (const mat of m.material) { mat.transparent = o < 1; mat.opacity = o; }
  for (const set of [...KM.map(m => m.lash), CM.lash, SM.lash, WMM.lash]) for (const k in set) set[k].visible = set[k].visible && o > 0.05;
}

// ---------------- structure folder (תיק מבנה) ----------------
// The structure file: the drawings and the pole list, always open to flip
// through. The work order and the lashing guide are part of the first
// structure's tutorial only.
function folderTabs() {
  if (LV.sketch) return LV.sketch.pages.map((_, i) => [`sk${i}`, LV.sketch.pages.length > 1 ? `עמוד ${i + 1}` : 'השרטוט']);
  if (LV.tripod) return [['drawing', 'שרטוט החצובה'], ['poles', 'רשימת סנדות']];
  if (LV.wheel) return [['tri90', 'חצובה ב־90 מעלות (שתיים זהות)'], ['wheelF', 'הגלגל'], ['wseat', 'המושב'], ['poles', 'רשימת סנדות']];
  if (LV.carousel) return [['klaf0', 'קלף השער'], ['klaf1', 'הקלף האחורי'], ['sideR', 'הצד הימני'], ['sideL', 'הצד השמאלי'], ['top', 'מבט על (הגג)'], ['seat', 'המושב והתורן'], ['poles', 'רשימת סנדות']];
  if (LV.frame) return [['klaf0', 'שרטוט הקלפים (שניים זהים)'], ['sideR', 'הצד הימני'], ['sideL', 'הצד השמאלי'], ['top', 'מבט על (הגג)'], ['poles', 'רשימת סנדות']];
  if (LV.cube) return [['drawing', 'שרטוט קלף'], ['sideR', 'שרטוט הצד הימני'], ['sideL', 'שרטוט הצד השמאלי'], ['top', 'שרטוט מבט על'], ['poles', 'רשימת סנדות']];
  return [['drawing', 'שרטוט הקלף'], ['poles', 'רשימת סנדות'], ...(LV.tutorial ? [['order', 'סדר עבודה (הדרכה)'], ['lashings', 'איזו כפיתה איפה (הדרכה)']] : [])];
}
function poleTable() {
  const k = SIZES.klaf, n = LV.klafim.length;
  const m = v => `${v.toFixed(1)} מ׳`;
  if (LV.wheel) {
    const len = id => RIG.slots.find(q => q.id === id).length, bl = TRI90.braceLengths;
    const rows = [
      ['רגל זקופה (אחת בכל חצובה)', 2, m(TRI90.legLengths[1])],
      ['רגליים נוטות', 4, m(TRI90.legLengths[0])],
      ['חיזוקים מהרגל הזקופה לנוטות (בגובה כ־50 ס״מ)', 4, m(bl.B12)],
      ['חיזוק בין שתי הנוטות', 2, m(bl.B31)],
      ['צלעות הריבועים בגלגל', 8, m(len('W.s10'))],
      ['אלכסונים (איקס בכל ריבוע)', 4, m(len('W.dA1'))],
      ['סנדות פינה בין הריבועים', 4, m(len('W.c0'))],
      ['הציר', 1, m(len('W.axle'))],
      ['סנדות אורך במושב', 2, m(len('W.gL1'))], ['סנדות רוחב במושב', 2, m(len('W.gE1'))], ['איקס במושב', 2, m(len('W.gA'))],
      ['בז״נטים לרגליים', 6, m(TRI.stakeLength)],
    ];
    return `<table><thead><tr><th>סנדה</th><th>כמות</th><th>אורך</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table>
      <p class="note">ועוד 4 חבלי תלייה למושב. המידות זמניות, עד שיגיעו שרטוטים אמיתיים.</p>`;
  }
  if (LV.frame) {
    const C = SIZES.cube4;
    const rows = [
      ['רגליים (שני הקלפים)', 4, m(C.legLength)],
      [`רוחב תחתון, אמצעי (בגובה ${C.midHeight.toFixed(1)} מ׳) ועליון בשני הקלפים`, 6, m(C.horizontalLength)],
      ['אלכסונים בקלפים (איקס עליון ואיקס תחתון בכל קלף)', 8, m(C.diagLength)],
      ['חיבורים בין הקלפים (תחתון, אמצעי ועליון בכל צד)', 6, m(C.horizontalLength)],
      ['אלכסונים לאיקסים מרחביים בצדדים (שני איקסים בכל צד)', 8, m(C.sideDiagLength)],
      ['איקס הגג, פינה לפינה', 2, m(C.topDiagLength)],
    ];
    return `<table><thead><tr><th>סנדה</th><th>כמות</th><th>אורך</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table>
      <p class="note">כל חיבור מעל 2 מ׳ כופתים בעבודה בגובה: שני מטפסים עם רתמות ואיש אבטחה למטה.</p>`;
  }
  if (LV.carousel) {
    const C = CAR, S = C.seat;
    const rows = [
      ['רגליים (שני הקלפים)', 4, m(C.legLength)],
      [`רוחב עליון ואמצעי (בגובה ${C.midHeight.toFixed(1)} מ׳) בשני הקלפים, ותחתון בקלף האחורי`, 5, m(C.horizontalLength)],
      ['רוחב תחתון בקלף השער, מתחת לחצי השמאלי בלבד', 1, m(C.gateBottomLength)],
      ['עמוד הדלת בקלף השער', 1, m(C.postLength)],
      ['אלכסונים בקלפים (איקס עליון בשניהם, איקס תחתון בקלף האחורי)', 6, m(C.diagLength)],
      ['אלכסונים לאיקס בחצי השמאלי התחתון של השער', 2, m(C.gateDiagLength)],
      ['חיבורים בין הקלפים (תחתון, אמצעי ועליון בכל צד)', 6, m(C.horizontalLength)],
      ['אלכסונים לאיקסים מרחביים בצדדים (שני איקסים בכל צד)', 8, m(C.sideDiagLength)],
      ['אלכסונים לאיקס הגג, מפינה לפינה', 2, m(C.topDiagLength)],
      ['צלעות המתומן במושב', 8, m(S.sideLength)],
      ['סנדות ה־# במושב', 4, m(S.plusLength)],
      ['האיקס הכפול במושב (זוג בכל כיוון, מחובר ל־#)', 4, m(SEAT.slots.find(q => q.xd).length)],
      ['התורן', 1, m(S.mastLength)],
      ['בז״נטים לרגליים', 4, m(1.0)], ['בז״נטים ליתרים', 8, m(0.6)],
    ];
    return `<table><thead><tr><th>סנדה</th><th>כמות</th><th>אורך</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table>
      <p class="note">ועוד 8 חבלי תלייה וטבעת חבל לתורן. מבנה מעל 4 מ׳ הוא מבנה הנדסי לפי נוהל הבנייה המחנאית: עבודה בגובה רק לפי הנוהל. אלכסון של 7.2 מ׳ מחברים לרוב משתי סנדות.</p>`;
  }
  if (LV.tripod) {
    const rows = [['רגליים', 3, m(TRI.legLength)], [`חיזוקים בין הרגליים (בגובה ${Math.round(TRI.braceHeight * 100)} ס״מ)`, 3, m(TRI.braceLength)], ['בז״נטים לרגליים', 3, m(TRI.stakeLength)]];
    return `<table><thead><tr><th>סנדה</th><th>כמות</th><th>אורך</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table>
      <p class="note">בערימה יש גם סנדות שלא מתאימות. המידות זמניות, עד שיגיעו שרטוטים אמיתיים.</p>`;
  }
  const rows = [
    ['רגליים', 2 * n, m(k.legLength)],
    [`רוחב (תחתון ${Math.round(k.bottomHeight * 100)} ס״מ מעל הקרקע, עליון בגובה ${k.topHeight} מ׳)`, 2 * n, m(k.horizontalLength)],
    ['אלכסונים (איקס בקלף)', 2 * n, m(k.diagLength)],
  ];
  if (LV.cube) {
    const c = SIZES.cube;
    const bays = LV.cube.bays ?? 1;
    rows.push(['חיבורים בין הקלפים (תחתון ועליון בכל צד)', 4 * bays, m(c.sideHorizontalLength)]);
    rows.push(['אלכסונים לאיקסים מרחביים בצדדים (שניים בכל צד)', 4 * bays, m(c.sideDiagLength)]);
    rows.push(['אלכסונים לאיקס המרחבי העליון (שניים בכל קובייה)', 2 * bays, m(c.topDiagLength)]);
    if (bays > 1) rows.push(['אלכסונים לאיקס בגובה 2 מ׳ בחיבור בין הקוביות', 2 * (bays - 1), m(c.linkDiagLength)]);
  }
  rows.push(['בז״נטים לרגליים', 2 * n, m(k.legStakeLength)], ['בז״נטים ליתרים', 4 * n, m(k.guyStakeLength)]);
  return `<table><thead><tr><th>סנדה</th><th>כמות</th><th>אורך</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table>
    <p class="note">המידות זמניות, עד שיגיעו שרטוטים אמיתיים.</p>`;
}
function openFolder(tab = LV.sketch ? 'sk0' : LV.wheel ? 'tri90' : LV.carousel ? 'klaf0' : 'drawing') {
  document.querySelector('#folder .folder-head h2').textContent = LV.name;
  const tabs = $('folder-tabs'); tabs.innerHTML = '';
  for (const [id, he] of folderTabs()) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = he; b.className = id === tab ? 'on' : '';
    b.addEventListener('click', () => openFolder(id)); tabs.appendChild(b);
  }
  const body = $('folder-body'); body.innerHTML = '';
  if (tab.startsWith('sk') && LV.sketch) {
    const pg = LV.sketch.pages[+tab.slice(2)], img = document.createElement('img');
    img.src = pg.url; img.alt = LV.sketch.name; img.style.cssText = 'width:100%;display:block;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.15)';
    body.appendChild(img);
    body.insertAdjacentHTML('beforeend', `<p class="note">בונים לפי השרטוט על הרשת של הבנייה החופשית. המשחק לא קורא את השרטוט: המדריך בודק רק שהמבנה עומד.${LV.sketch.more ? ' מוצגים 8 העמודים הראשונים.' : ''}</p>`);
  } else if (tab === 'drawing') {
    const c = document.createElement('canvas'); c.width = c.height = BP.size;
    if (LV.tripod) drawTripodFolder(c, TRI); else
    drawBlueprint(c.getContext('2d'), { joints: JOINTS });
    body.appendChild(c);
  } else if (tab === 'klaf0' || tab === 'klaf1') {
    // the carousel's two klafim have drawings of their own
    const c = document.createElement('canvas'); c.width = c.height = BP.size;
    const keep = G.ki; useKlaf(+tab.slice(4));
    drawBlueprint(c.getContext('2d'), { joints: JOINTS, title: LV.wheel ? 'מגדל · גלגל ענק' : LV.frame ? `קלף · ${LV.name}` : `${LV.klafim[+tab.slice(4)].he} · קרוסלה 5×5` });
    useKlaf(keep);
    body.appendChild(c);
  } else if (tab === 'tri90') {
    body.appendChild(wheelFolderCanvas('tri'));
    body.insertAdjacentHTML('beforeend', `<ol>
      <li>מניחים שלוש רגליים זו לצד זו, הראשים יחד: הרגל הזקופה (${TRI90.legLengths[1].toFixed(1)} מ׳, הקצרה) באמצע, והנוטות (${TRI90.legLengths[0].toFixed(1)} מ׳) משני צדיה.</li>
      <li>כופתים כפיתת חצובה ${Math.round(TRI90.lashFromTop * 100)} ס״מ מתחת לראשים.</li>
      <li>שישה צופים מקימים את החצובה. הרגל הזקופה עומדת ישר, בצד של הגלגל; כל רגל נוטה ${WH.footSide.toFixed(1)} מ׳ הצידה ו־${WH.footOut.toFixed(2)} מ׳ החוצה, הרחק מהגלגל.</li>
      <li>חיזוק בין כל שתי רגליים בגובה כ־50 ס״מ, ובז״נט לכל רגל. שתי החצובות זהות, ${WH.apart.toFixed(1)} מ׳ בין הרגליים הזקופות. הציר נח בין שני הראשים.</li></ol>`);
  } else if (tab === 'wheelF' || tab === 'wseat') {
    body.appendChild(wheelFolderCanvas(tab === 'wseat' ? 'seat' : 'wheel'));
    body.insertAdjacentHTML('beforeend', tab === 'wseat' ? `<ol>
      <li>בונים את המושב שוכב על הקרקע, מתחת לגלגל: מסגרת של 4 סנדות ואיקס.</li>
      <li>מרימים אותו ל־${Math.round(WSEAT_Y * 100)} ס״מ ותולים אותו בארבעה חבלים, מכל פינה של המושב אל סנדת הפינה התחתונה של הגלגל.</li>
      <li>מסדר: המדריך דוחף את החצובות, שני צופים עולים, הצוות מסובב את הגלגל סיבוב שלם, והמדריך דוחף את המושב.</li></ol>` : `<ol>
      <li>בונים את הגלגל עומד על הפינה התחתונה, בין שתי החצובות: שני ריבועים (קלפים) עם איקס, אחד ליד כל מגדל.</li>
      <li>מעבירים את הציר (${RIG.slots.find(q => q.axle).length.toFixed(1)} מ׳) דרך מרכז האיקסים, וכופתים כל איקס אל הציר.</li>
      <li>מחברים את שני הריבועים בארבע סנדות פינה, כל אחת בשקע שבין שתי הצלעות שמחוץ לפינה.</li>
      <li>שישה צופים מרימים את הגלגל ${WHEEL_DROP.toFixed(2)} מ׳, עד שהציר נח בראשי שתי החצובות. הציר מסתובב שם יחד עם הגלגל.</li></ol>`);
  } else if (tab === 'seat') {
    const c = SM.sheet.userData.canvas, img = document.createElement('canvas'); img.width = c.width; img.height = c.height;
    img.getContext('2d').drawImage(c, 0, 0);
    body.appendChild(img);
    body.insertAdjacentHTML('beforeend', `<ol>
      <li>בונים את המושב שוכב על השרטוט שבאמצע הקובייה: מתומן של 8 סנדות, ובתוכו # של 4 סנדות ואיקס כפול של 4 סנדות שכפות ל־#.</li>
      <li>שישה צופים מרימים את המושב ל־${Math.round(CAR.seat.height * 100)} ס״מ.</li>
      <li>מעבירים את התורן (${MAST.length.toFixed(1)} מ׳) דרך הריבוע שבאמצע ה־#, ותולים אותו בטבעת חבל מאמצע איקס הגג, כך שיוכל להסתובב.</li>
      <li>כופתים את התורן לשתי סנדות האורך של ה־#.</li>
      <li>קושרים 8 חבלי תלייה ממרכז איקס הגג אל כל פינה של המתומן.</li>
      <li>מסדר: המדריך דוחף את המסגרת, כל היתרים יורדים, שמונה צופים עולים, מסובבים את הקרוסלה, והמדריך דוחף את המושב הצידה.</li></ol>`);
  } else if (tab === 'sideR' || tab === 'sideL') {
    const c = document.createElement('canvas');
    drawSideSheet(null, LV.cube, tab === 'sideL' ? 1 : -1, LV.klafim.map(k => k.he), c);
    body.appendChild(c);
  } else if (tab === 'top') {
    const c = document.createElement('canvas');
    drawTopSheet(null, LV.cube, LV.klafim.map(k => k.he), c);
    body.appendChild(c);
  } else if (tab === 'poles') {
    body.innerHTML = poleTable();
  } else if (tab === 'order') {    body.innerHTML = `<ol>
      <li>בונים את הקלף שוכב על הקרקע, על גבי השרטוט.</li>
      <li>דופקים בז״נט ליד כל רגל, במקום שבו הרגליים יעמדו.</li>
      <li>כופתים 4 יתרים לראשי הרגליים. אין חבל שנכפת לאמצע סנדה.</li>
      <li>מרימים: המרימים מגביהים את הראש, והמושכים מושכים ביתרים הקדמיים לאט ובשליטה עד שהקלף ניצב. מחזיקי היתרים האחוריים עוצרים אותו באנך.</li>
      <li>דופקים בז״נטי יתרים כגובה הקלף מהרגליים (45°) ומקבעים אליהם את היתרים בקיבוע.</li>
      <li>כופתים כל רגל לבז״נט שלה בשתי כפיתות.</li>
      <li>מסדר: המדריך דוחף מכל הכיוונים ותולה דלי מים על הרוחב העליון.</li></ol>`;
  } else {
    body.innerHTML = `<table><thead><tr><th>מפגש</th><th>כפיתה</th></tr></thead><tbody>
      <tr><td>שתי סנדות בזווית ישרה (רוחב על רגל)</td><td>כפיתה מרובעת</td></tr>
      <tr><td>סנדות בזווית אחרת (אלכסון על רגל, מרכז האיקס)</td><td>כפיתה אלכסונית</td></tr>
      <tr><td>סנדות זו לצד זו (רגל לבז״נט)</td><td>כפיתה מקבילה</td></tr>
      <tr><td>שלוש סנדות כפותות בראש</td><td>כפיתת חצובה</td></tr>
      <tr><td>יתר אל הבז״נט שלו</td><td>קיבוע</td></tr></tbody></table>
      <p class="note">כפיתה מסוג לא נכון לא מפילה את המבנה, אבל מורידה ניקוד.</p>`;
  }
  $('folder').hidden = false;
}
$('btn-folder').addEventListener('click', () => openFolder());
$('folder-close').addEventListener('click', () => { $('folder').hidden = true; });
$('btn-full').addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.('landscape').catch(() => {}); }
    else await document.exitFullscreen();
  } catch { /* not available here */ }
});

// ---------------- the cube's side poles ----------------
// segments of a side pole: from the simulation, or (plan) where the drawing puts it
// side poles are drawn a little outside their side, flat Xs a little above the poles they rest on
const cubeOff = (slot, layer) => slot.side ? [slot.side * layer * GAP, 0, 0] : [0, (layer - 1) * GAP, 0];
function cubeSegs(sid, plan = false, len = null) {
  const slot = cubeSlot(sid); const L = len ?? G.cube.build.poles[sid]?.length;
  if (L == null) return null;
  const off = cubeOff(slot, slot.layer);
  const cs = G.cube.sim;
  if (!plan && cs) {
    const P = cs.poleParticles[sid]; if (!P) return null;
    return [[add3(cs.pos(P[0].id), off, 1), add3(cs.pos(P[P.length - 1].id), off, 1)]];
  }
  return [[add3(cubeSlotPoint(slot, -L / 2), off, 1), add3(cubeSlotPoint(slot, L / 2), off, 1)]];
}
// from the lashing's centre to pole A's drawn axis
function cubeJointSep(j) {
  const slot = cubeSlot(j.a), oa = cubeOff(slot, slot.layer), ob = j.b ? cubeOff(cubeSlot(j.b), cubeSlot(j.b).layer) : [0, 0, 0];
  return oa.map((v, i) => (v - ob[i]) / 2);
}
function cubeJointPos(j) {
  const slot = cubeSlot(j.a), cs = G.cube.sim;
  // halfway between the two poles' drawn centres (a klaf leg is drawn where it is)
  const oa = cubeOff(slot, slot.layer), ob = j.b ? cubeOff(cubeSlot(j.b), cubeSlot(j.b).layer) : [0, 0, 0];
  const off = oa.map((v, i) => (v + ob[i]) / 2);
  if (cs) {
    const id = cs.findParticle(j.a, cubeSlotParam(slot, j.at));
    if (id != null) return add3(cs.pos(id), off, 1);
  }
  return add3(j.at, off, 1);
}
// free build: every joining pole not put in yet is shown as a see-through line
const joinGhostMat = new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.42, depthWrite: false });
function drawJoinGhosts() {
  const list = LV.cube?.free && G.stage === 'cube' && !G.check ? LV.cube.slots.filter(s => !G.cube.build.poles[s.id] && !G.cube.carrying[s.id]) : [];
  while (joinGhosts.length < list.length) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), joinGhostMat); m.renderOrder = 5; cubeGroup.add(m); joinGhosts.push(m); }
  joinGhosts.forEach((m, i) => {
    const s = list[i]; m.visible = !!s; if (!s) return;
    const [[a, b]] = cubeSegs(s.id, true, s.length);
    placeCylinder(m, a, b);
  });
}
function drawCube(dt) {
  const on = !!LV.cube;
  for (const sid in CM.poles) {
    const m = CM.poles[sid][0];
    if (!on || !G.cube.build.poles[sid]) { m.visible = false; continue; }
    const segs = G.cube.carrying[sid] ? carriedSegs(G.cube.carrying[sid]) : cubeSegs(sid);
    if (!segs) { m.visible = false; continue; }
    placeCylinder(m, segs[0][0], segs[0][1]);
  }
  for (const jid in CM.lash) {
    const g = CM.lash[jid];
    const j = on && cubeJoint(jid);
    if (!j || !G.cube.build.joints[jid] || !cubeJointReachable(j, LV.cube, G.cube.build.poles) || G.cube.carrying[j.a] || (j.b && G.cube.carrying[j.b])) { g.visible = false; continue; }
    const da = cubeSlot(j.a).dir, db = j.b ? cubeSlot(j.b).dir : [0, 1, 0];
    placeLashing(g, cubeJointPos(j), da, db, cubeJointSep(j));
    g.visible = !fadedOut();
    coilProgress(g, jid);
  }
  // the side drawings lie on the ground beside each side while it is built
  const done = on && !LV.cube.free ? cubeSides() : {};
  drawJoinGhosts();
  for (const side of [-1, 1, 0]) {
    const m = CM.sheets[side];
    const show = on && !LV.cube.free && G.stage === 'cube' && !done[side];
    m.material.opacity = Math.max(0, Math.min(0.92, m.material.opacity + (show ? 1 : -1) * dt / 0.5));
    m.visible = on && m.material.opacity > 0.01;
  }
}

// ---------------- per-frame drawing ----------------
function drawPoles() {
  if (LV.free) for (const id in poleMeshes) if (!G.build.poles[id]) poleMeshes[id].forEach(m => { m.visible = false; });
  if (LV.free) for (const id in lashMeshes) if (!G.build.joints[id] && !STAKE_JOINTS.some(q => q.id === id)) lashMeshes[id].visible = false;
  for (const s of SLOTS) {
    const [m0, m1] = poleMeshes[s.id];
    const segs = G.carrying[s.id] ? carriedSegs(G.carrying[s.id]) : poleSegs(s.id);
    if (!segs) { m0.visible = m1.visible = false; continue; }
    placeCylinder(m0, segs[0][0], segs[0][1]);
    if (segs[1]) placeCylinder(m1, segs[1][0], segs[1][1]); else m1.visible = false;
  }
}
function drawLashings() {
  const b = G.build;
  for (const j of JOINTS) {
    const g = lashMesh(j.id);
    const on = b.joints[j.id] && jointReachable(j, b.poles) && (!G.sim || G.sim.jointCons[j.id]);
    if (!on) { g.visible = false; continue; }
    const p = jointPos(j); if (!p) { g.visible = false; continue; }
    g.visible = !fadedOut();
    const n = G.sim ? visNormal() : [0, 1, 0], h = (layerOff(slotById(j.a)) - layerOff(slotById(j.b))) / 2;
    if (j.all) { // one lashing round several poles lying side by side
      const up = triShape() && G.tri.up > 0, d = up ? [0, 1, 0] : poleDir(j.a);
      placeParallelLashing(g, add3(p, [1, 0, 0], -0.07), add3(p, [1, 0, 0], 0.07), d);
      g.children.forEach(c => c.scale.set(up ? 2.3 : 3.6, up ? 2.3 : 1.2, 1));
    } else
    placeLashing(g, p, poleDir(j.a), poleDir(j.b), n.map(v => v * h));
    coilProgress(g, j.id);
  }
  for (const sj of STAKE_JOINTS) {
    const g = lashMeshes[sj.id];
    if (!b.stakeJoints[sj.id] || !G.sim || !G.sim.stakeCons[sj.id]) { g.visible = false; continue; }
    const p = legPoint(sj.leg, sj.v); if (!p) { g.visible = false; continue; }
    const st = LEG_STAKES.find(s => s.leg === sj.leg), sl = slotById(sj.leg);
    g.visible = !fadedOut();
    placeParallelLashing(g, p, [st.u + legU(sl, sj.v) - legFootU(sl), p[1], stakeZ()], [0, 1, 0]);
    coilProgress(g, sj.id);
  }
}
// coils wind on one by one during the close-up
function coilProgress(g, id) {
  const n = G.tying && G.tying.id === id ? Math.ceil(Math.min(1, G.tying.t / 0.32) * g.children.length) : g.children.length;
  g.children.forEach((c, i) => { c.visible = i < n; });
  // the coils go on loose and are pulled tight
  if (G.tying && G.tying.id === id) {
    const k = Math.min(1, Math.max(0, (G.tying.t - 0.2) / 0.3)), f = 1 + 0.45 * (1 - k * k * (3 - 2 * k));
    g.children.forEach(c => { c.scale.x *= f; c.scale.y *= f; });
  }
}
// A guy stake leans away from the klaf along its line (out at 45°), and the line is
// fixed (קיבוע) just below its top
const STAKE_LEAN = 0.35, UPV3 = new THREE.Vector3(0, 1, 0);
function anchorStakeAxis(g) {
  const sl = slotById(g.leg), u = sl ? legTopU(sl) : (g.leg === 'legR' ? 1 : -1), s = Math.SQRT1_2;
  return new THREE.Vector3(Math.sign(u) * s * Math.sin(STAKE_LEAN), Math.cos(STAKE_LEAN), g.side * s * Math.sin(STAKE_LEAN));
}
function poseAnchorStake(m, g, a, hits) {
  m.position.set(a[0], -0.25 * Math.min(hits, ANCHOR_HITS) / ANCHOR_HITS, a[2]);
  m.quaternion.setFromUnitVectors(UPV3, anchorStakeAxis(g));
}
function anchorTie(g) {
  const a = anchorPos(g), hits = G.build.anchors[g.id] || 0, ax = anchorStakeAxis(g);
  const base = [a[0], -0.25 * Math.min(hits, ANCHOR_HITS) / ANCHOR_HITS, a[2]];
  return add3(base, [ax.x, ax.y, ax.z], ANCHOR_LEN - 0.06);
}
function drawStakes() {
  const b = G.build;
  for (const st of LEG_STAKES) {
    const m = stakeMeshes[st.id], hits = b.stakes[st.id] || 0;
    m.visible = hits > 0 || jobs.some(j => j.id === st.id && j.k === G.ki);
    const top = stakeTopPos(st)[1];
    m.position.set(st.u, top - LEG_STAKE_LEN, stakeZ());
  }
  for (const g of GUYS) {
    const m = stakeMeshes['A' + g.id], hits = b.anchors[g.id] || 0;
    m.visible = hits > 0 || jobs.some(j => j.id === g.id && j.k === G.ki);
    poseAnchorStake(m, g, anchorPos(g), hits);
  }
}
function drawCrew() {
  for (const k in people) if (k !== 'tier') people[k].clear();
  const cur = G.ki;
  // every klaf's guy lines are drawn; the raise crew works only on the current klaf
  eachKlaf((k, i) => drawKlafCrew(i === cur && !cubeStage(G.stage)));
}
function drawKlafCrew(withPeople) {
  const sim = G.sim, st = G.stage;
  for (const k in guyRopes) guyRopes[k].show(false);
  if (!sim || (G.falling && G.falling.t > 2.2 && !G.replay)) return;
  const place = withPeople ? placeActor : () => {};
  const ang = sim.angle();
  const holding = !sim.lettingGo;
  // no separate base holders: the crew is exactly 6 (Omer), and the two lifters steady the klaf
  // lifters carry the top until the guy lines take over
  // (they stand ready at the top before the pull starts, too)
  if (holding && sim.target < 55 && ang < 60 && st === 'raise') {
    const tp = sim.topCentre();
    const reach = Math.min(Math.PI * 0.9, 0.6 + ang / 40);
    if (sim.lifted('legR')) place(people.lift1, [0.5, 0, tp[2] + 0.3], Math.PI, 0.15, reach);
    if (sim.lifted('legL')) place(people.lift2, [-0.5, 0, tp[2] + 0.3], Math.PI, 0.15, reach);
  }
  // guy lines: the front ones are the pullers' lines, the back ones are paid out
  for (const g of GUYS) {
    const con = sim.guys[g.id];
    if (!con && G.build.guyTop[g.id] && !sim.lettingGo) {
      // nobody on this line: it lies slack on the ground
      const top = legTop(g.leg), a = anchorPos(g);
      if (top) guyRopes[g.id].set(top, [a[0], 0.03, a[2] - g.side * 0.5], 0.5);
      continue;
    }
    if (!con || !con.active) continue;
    const top = legTop(g.leg); if (!top) continue;
    const a = anchorPos(g);
    if (con.tied) {
      guyRopes[g.id].set(top, anchorTie(g), 0.02);
    } else if (con.pull || g.side < 0) {
      const h = sim.pullHand(legTopU(slotById(g.leg), G.build.poles[g.leg]?.length));
      const lean = con.force > 30 ? -0.35 : -0.1;
      place(people['guy' + g.id], [h[0], 0, h[2] - 0.2], 0, lean, 1.2);
      guyRopes[g.id].set(top, h, con.force > 5 ? 0.02 : 0.25);
    } else {
      // the holder stands where the physics holds the line, a little behind its hands
      const hp = sim.world.p[con.j].x;
      const holder = [hp[0], 0, hp[2] + g.side * 0.3];
      place(people['guy' + g.id], holder, Math.PI, -0.15, 1.0);
      guyRopes[g.id].set(top, [hp[0], 0.9, hp[2]], con.force > 5 ? 0.03 : 0.3);
    }
  }
}
// a scout steps in to tie each lashing, during its close-up
function drawTier() {
  const p = people.tier;
  if (!closeup || !closeup.tier) { p.clear(); return; }
  const J = closeup.tier;
  if (!closeup.stand) {
    const d = new THREE.Vector3(camera.position.x - J[0], 0, camera.position.z - J[2]);
    if (d.lengthSq() < 1e-6) d.set(0, 0, -1);
    d.normalize();
    // beside the joint, seen side-on, so the lean and the reaching arms read clearly
    const side = new THREE.Vector3(-d.z, 0, d.x);
    closeup.stand = [J[0] + side.x * 0.5 - d.x * 0.15, 0, J[2] + side.z * 0.5 - d.z * 0.15];
  }
  const st = closeup.stand;
  const yaw = Math.atan2(J[0] - st[0], J[2] - st[2]);
  const low = J[1] < 0.6; // joints near the ground: bend down to them
  const reach = low ? 0.9 : Math.min(Math.PI * 0.85, 0.6 + J[1] * 0.7);
  const wiggle = closeup.phase === 'tie' ? 0.15 * Math.sin(performance.now() / 70) : 0;
  p.set(low ? [st[0], -0.28, st[2]] : st, yaw, low ? 0.6 : 0.1, reach + wiggle, { snap: true }); // kneel for low joints
}
function jointPosOf(sid, s) {
  const id = G.sim.findParticle(sid, s); if (id == null) return null;
  return add3(G.sim.pos(id), visNormal(), layerOff(slotById(sid)));
}
function placeActor(actor, pos, rotY, lean, reach) { actor.set(pos, rotY, lean, reach); }
function drawGauge() {
  const tr = triRaiseMode();
  $('rope-panel').hidden = (G.stage !== 'raise' && !tr) || !!G.falling;
  $('crew-panel').hidden = (G.stage !== 'raise' && !heightPanelOn() && !tr) || !!G.falling;
  if (tr) renderCrew();
  if (!tr && (!G.sim || G.stage !== 'raise')) return;
  const ang = tr ? G.tri.up * 90 : G.sim.angle();
  $('gauge-needle').style.transform = `rotate(${Math.max(-95, Math.min(95, ang - 90))}deg)`;
  $('gauge-val').textContent = Math.round(ang) + '°';
  $('gauge-label').textContent = ang < 6 ? 'שוכב' : ang < 82 ? 'עולה' : ang <= 97 ? 'ניצב' : 'עבר את האנך!';
}
function drawInspector(push) {
  if (triOn()) return triInspector(push);
  const c = G.check;
  if (!c?.running || G.falling || G.replay) { inspector.clear(); buckets.forEach(b => { b.visible = false; }); return; }
  if (LV.wheel) {
    buckets.forEach(b => { b.visible = false; });
    if (c.t >= WRIDE.side[0] && c.t < WRIDE.side[1]) inspector.set([WSEAT_C[0] + 0.5, 0, WSEAT_C[1] - 1.3], 0, 0.35, 1.2);
    else if (push) { const d = new THREE.Vector3(push[0], 0, push[2]).normalize(); inspector.set([-d.x * 0.9, 0, -d.z * 0.9], Math.atan2(d.x, d.z), 0.35, 2.4); }
    else inspector.set([2.6, 0, -2.6], Math.atan2(-2.6, 2.6), 0, 0.2);
    return;
  }
  const cs = G.cube?.sim && cubeStage(G.stage) ? G.cube.sim : null;
  const ks = cs ? cs.klafim : [G.sim];
  const tops = ks.map(k => k.topCentre());
  const cx = tops.reduce((a, t) => a + t[0], 0) / tops.length, cz = tops.reduce((a, t) => a + t[2], 0) / tops.length;
  buckets.forEach((b, i) => {
    const k = ks[i];
    b.visible = !!(c.loading && k);
    if (b.visible) { const t = k.topParticle(); const p = k.pos(t); b.position.set(p[0], p[1] - 0.03, p[2]); }
  });
  const big = LV.carousel || LV.wheel ? 1.7 : 1;
  if (LV.wheel && c.t >= WRIDE.side[0] && c.t < WRIDE.side[1]) {
    // he pushes the seat along the axle, from the front
    inspector.set([WSEAT_C[0] + 0.5, 0, WSEAT_C[1] - 1.3], 0, 0.35, 1.2);
  } else if (LV.carousel && c.t >= RIDE.side[0] && c.t < RIDE.side[1]) {
    // the carousel: he pushes the seat sideways, from inside the frame
    inspector.set([SEAT_C[0] - 2.05, 0, SEAT_C[1]], Math.PI / 2, 0.35, 1.3);
  } else if (push) {
    // he leans into the top of the structure from the side the push comes from
    const d = new THREE.Vector3(push[0], 0, push[2]).normalize();
    const span = cs ? 1.6 * big : 1.1;
    inspector.set([cx - d.x * span, 0, cz - d.z * span], Math.atan2(d.x, d.z), 0.35, 1.5);
  } else if (c.loading) {
    inspector.set([cx + 0.7, 0, Math.min(...ks.map(k => k.z0)) - 0.8], 0, 0.1, Math.PI * 0.8);
  } else {
    // stepping back to watch, and walking round between tests
    inspector.set([cx + 2.0 * big, 0, cz - 2.4 * big], Math.atan2(-2.0, 2.4), 0, 0.2);
  }
}
function drawPushArrow(push) {
  const ts = triOn() ? G.tri.sim : null;
  if (!push || !(ts || G.sim)) { pushArrow.visible = false; return; }
  const t = ts ? ts.apex() : G.sim.topCentre();
  const d = new THREE.Vector3(...push).normalize();
  pushArrow.visible = true;
  pushArrow.position.set(t[0] - d.x * 1.0, t[1] + 0.1, t[2] - d.z * 1.0);
  pushArrow.setDirection(d);
}

// ---------------- main loop ----------------
let last = performance.now(), hintTimer = 0;
const CHECK_SPEED = 1.6; // how much faster than real time the push test plays
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const cs = G.cube?.sim && cubeStage(G.stage) ? G.cube.sim : null;
  const ts = triOn() ? G.tri.sim : null;
  const ws = LV.wheel && G.wheel?.sim && (G.check || G.falling) ? G.wheel.sim : null;
  const sim = cs || ts || ws || G.sim;
  let push = null;
  if (sim) {
    // the stability check plays faster than real time; physics still steps in small pieces,
    // and the check's clock moves only as far as the physics really stepped
    const warp = G.check?.running && !G.falling ? CHECK_SPEED : 1;
    const wobble = !sim.lettingGo && (G.stage === 'raise' || G.stage === 'anchor');
    if (G.replay) stepReplay(dt);
    else {
      const kiAt = G.ki;
      for (let w = 0; w < warp; w += 1) {
        const h = Math.min(1 / 30, dt * Math.min(1, warp - w));
        push = checkPush(h);
        if (G.ki !== kiAt) break; // free build: the inspection moved on to the next structure
        const load = G.check?.loading ? (ts ? TRI_TUNING.load : TUNING.loadForce) : 0;
        // the joined structure stands still while it is built: it is tested only in the check (Omer)
        if (ws) { if (G.check?.running || G.falling) stepWheel(h, push); }
        else if (ts) { if (G.check?.running || G.falling) ts.step(h, { push, load }); }
        else if (cs) {
          if (LV.carousel && G.seat.sim && (G.check?.running || G.falling)) stepCarousel(h);
          if (LV.wheel && G.wheel.sim && (G.check?.running || G.falling)) stepWheel(h);
          if (G.check?.running || G.falling) cs.step(h, { push, load });
        } else sim.step(h, { wobble, push, load, lean: balanceLean() });
        if (!ts && !ws) record(h);
        // beyond a single klaf, the structure is tested only in the check at the end (Omer)
        if (ws) { if (G.check?.running) watchWheel(); }
        else if (ts) { if (G.check?.running) watchTripod(); } else if (cs) { if (G.check?.running) { watchCube(h); if (LV.carousel) watchCarousel(); if (LV.wheel) watchWheel(); } } else watchSim(h);
        if (G.falling) break;
      }
    }
    if (G.falling && !G.replay) {
      G.falling.t += dt;
      if (G.falling.t > 1.6 && !G.falling.shown) { G.falling.shown = true; startReplay(); }
    }
  }
  if (G.tying) { G.tying.t += dt; if (G.tying.t > 0.6) G.tying = null; }
  const cur = G.ki;
  eachKlaf((k, i) => {
    // the drawing lies on the ground while its klaf is being built, then fades
    const showPlan = !LV.free && !LV.tripod && !LV.wheel && i === cur && G.stage === 'build' && !stageDone('build');
    const op = blueprint.material.opacity + (showPlan ? 1 : -1) * dt / 0.5;
    blueprint.material.opacity = Math.max(0, Math.min(1, op));
    blueprint.visible = blueprint.material.opacity > 0.01;
    drawPoles(); drawLashings(); drawStakes();
  });
  { // free build: the grid lies on the ground while the klaf is designed
    const show = freeKlaf() && G.stage === 'build';
    freeGrid.material.opacity = Math.max(0, Math.min(0.96, freeGrid.material.opacity + (show ? 1 : -1) * dt / 0.4));
    freeGrid.visible = freeGrid.material.opacity > 0.01;
    if (show) freeGrid.position.z = freeGrid.userData.z + z0();
  }
  drawCube(dt);
  drawCrew();
  if (G.klafim.some(k => k.tri)) eachKlaf((k, i) => { if (k.tri) drawTripod(dt, i === cur); });
  drawTriShared(dt); drawSeat(dt); drawWheel(dt); drawTier(); drawGauge(); drawPushArrow(push); drawInspector(push);
  updateJobs(dt);
  stepHeight(dt);
  for (const a of allActors) a.update(dt);
  collectTargets();
  updateCamera(dt);
  hintTimer += dt;
  if (hintTimer > 0.25) { hintTimer = 0; refreshHint(); $('timer').textContent = timerText(); $('tray-count').textContent = G.challenge ? '' : rigStage(G.stage) ? `${rigPart().filter(s => G.wheel.build.poles[s.id]).length}/${rigPart().length} ב${G.stage === 'gond' ? 'מושב' : 'גלגל'}` : G.stage === 'seat' ? `${SEAT.slots.filter(s => G.seat.build.poles[s.id]).length}/${SEAT.slots.length} במושב` : G.stage === 'hang' ? (mastOn() ? 'התורן במקום' : 'חסר תורן') : G.stage === 'cube' ? `${LV.cube.slots.filter(s => G.cube.build.poles[s.id]).length}/${LV.cube.slots.length} בקובייה` : `${SLOTS.filter(s => G.build.poles[s.id]).length}/${SLOTS.length || 6} על השרטוט`; }
  decor?.tick(now / 1000); placeRaiseIcon(); placeMoveIcon();
  fun.tick(dt, camera, toScreen); balanceTick(dt, now / 1000); stepParade(dt);
  fun.preRender(camera);
  renderer.render(scene, camera);
  fun.postRender(camera);
  requestAnimationFrame(frame);
}
restart();
requestAnimationFrame(frame);

// debug hook for automated tests
window.__game = { get state() { return G; }, onTap: (x, y) => onTap(x, y), triRoles: () => triRoles(), toggleTriCrew: id => toggleTriCrew(id), pullTripod: dy => pullTripod(dy), triCrewReady: () => triCrewReady(), heightSpots: () => heightSpots(), toggleHeightCrew: r => toggleHeightCrew(r), openHeightCrew: () => openHeightCrew(), moveClimber: i => moveClimber(i), playChallenge: ch => playChallenge(ch), triApex: () => triApex(), triGuyTop: i => triGuyTop(i), triLegSegs: s => triLegSegs(s), fun, balanceFor, finish, celebrate, get parade() { return parade; }, triGuide, BRACES, BRACE_JOINTS, TRI_STAKES, TRI_STAKE_JOINTS, TRI_STAKE_HITS, score: () => score(), standAll: () => G.klafim.forEach((k, i) => { useKlaf(i); for (const q of STAKE_JOINTS) k.build.stakeJoints[q.id] = 'parallel'; for (const q of GUYS) k.build.guyTies[q.id] = 'guy'; k.raisedOnce = true; k.sim = new KlafSim(k.build, k.cfg); k.sim.standUp(); }), WHEEL, GOND, RIG, SEAT_ROPES, liftWheel: () => liftWheel(), liftWheelSeat: () => liftWheelSeat(), SEAT, MAST_JOINTS, HANG_ROPES, liftSeat, get pickerTarget() { return picker.target; }, correctFor, ropeLeft, poleLeft, get LV() { return LV; }, rebuildCube, runCheck, rec, goStage, switchLevel, triState: () => triState(), raiseTripod: () => raiseTripod(), useKlaf, cubeSegs, cubeJointPos, enterCube, chooseLashing, openPicker, onTarget, SLOTS, JOINTS, camera, controls, toScreen, targets: () => targets };
