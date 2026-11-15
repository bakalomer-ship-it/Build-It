// Web prototype. Level 1: build a 2x2 klaf on its drawing, drive the stakes,
// raise it by the guy lines, anchor it, and pass the push test.
// Level 2: the same for two klafim, then join them into a cube with side
// poles and spatial Xs, take the inner guy lines down, and test the cube.
//
// Most of the code works on "the current klaf" (G.build, G.sim, poleMeshes
// ...): useKlaf(i) points all of them at klaf i.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SLOTS, JOINTS, STAKE_JOINTS, LEG_STAKES, GUYS, LASHINGS, LASHING_ORDER, GUY_LASHING_ORDER, LEVEL } from './level1.js';
import { SIZES } from './blueprints.js';
import { KlafSim, TUNING, jointReachable, slotById, slotParam, slotPoint, klafToWorld } from './klafSim.js';
import { CubeSim, cubeSlotPoint, cubeSlotParam, cubeJointReachable } from './cubeSim.js';
import { LEVELS } from './levels.js';
import {
  R, makeRenderer, makeWorld, makeBlueprintMesh, drawBlueprint, BP, makePoleMesh, placeCylinder, makeSideSheet, drawSideSheet,
  makeLashing, placeLashing, placeParallelLashing, RopeViz, makeStake, makeDriver,
} from './scene.js';
import { sfx, buzz } from './sound.js';
import { Actor, makeCrew, freeActors, CREW } from './crew.js';

const $ = id => document.getElementById(id);
const GAP = 1.9 * R;
// the level being played (?level=2 in the address opens level 2 directly)
let LV = LEVELS[0];
try { const n = +new URLSearchParams(location.search).get('level'); if (n >= 1 && n <= LEVELS.length) LV = LEVELS[n - 1]; } catch { /* no address here */ }
const KLAF_STAGES = [['build', 'בניית הקלף'], ['stakes', 'בז״נטים'], ['raise', 'הרמה'], ['anchor', 'עיגון']];
function stageList() {
  const L = [];
  LV.klafim.forEach((k, i) => KLAF_STAGES.forEach(([id, he]) => L.push({ key: LV.klafim.length > 1 ? `${id}:${i}` : id, id, k: i, he: LV.klafim.length > 1 ? `${he}, ${k.he}` : he })));
  if (LV.cube) {
    L.push({ key: 'cube', id: 'cube', k: null, he: 'חיבור הקלפים לקובייה' });
    L.push({ key: 'unguy', id: 'unguy', k: null, he: 'הורדת היתרים הפנימיים' });
  }
  L.push({ key: 'check', id: 'check', k: null, he: 'מסדר' });
  return L;
}
let STAGES = stageList();
const cubeStage = id => id === 'cube' || id === 'unguy' || (id === 'check' && !!LV.cube);
const LEG_STAKE_HITS = 4, ANCHOR_HITS = 3;
const LEG_STAKE_LEN = 1.0, ANCHOR_LEN = 0.6;

// ---------------- state ----------------
let G;
function freshKlaf(cfg) {
  return {
    cfg,
    build: { poles: {}, joints: {}, stakes: {}, guyTop: {}, anchors: {}, stakeJoints: {}, guyTies: {}, guyOff: {}, crew: {} },
    sim: null, raisedOnce: false, uprightFor: 0, carrying: {},
  };
}
function freshState() {
  const s = {
    stage: 'build', stageKey: STAGES[0].key,
    ki: 0, klafim: LV.klafim.map(freshKlaf),
    cube: LV.cube ? { build: { poles: {}, joints: {} }, sim: null, carrying: {} } : null,
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
  for (const key of ['build', 'sim', 'raisedOnce', 'uprightFor', 'carrying'])
    Object.defineProperty(s, key, { get() { return this.klafim[this.ki][key]; }, set(v) { this.klafim[this.ki][key] = v; } });
  return s;
}
G = freshState();
const K = () => G.klafim[G.ki];
const z0 = () => K().cfg.z0;

// ---------------- three.js setup ----------------
const canvas = $('scene');
const renderer = makeRenderer(canvas);
const scene = new THREE.Scene();
makeWorld(scene);
const camera = new THREE.PerspectiveCamera(34, 1, 0.15, 300);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 1.2;
controls.maxDistance = 34;
controls.target.set(0, 1, 0.4);
controls.enabled = false;

// each klaf has its own set of meshes; useKlaf(i) points these names at klaf i's set
let blueprint, poleMeshes, lashMeshes, stakeMeshes, guyRopes;
const MAX_KLAFIM = Math.max(...LEVELS.map(l => l.klafim.length));
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
function useKlaf(i) {
  G.ki = i;
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
ghost.castShadow = false; ghost.visible = false; scene.add(ghost);
const slotGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.16), new THREE.MeshBasicMaterial({ color: 0xe0a93b, transparent: true, opacity: 0.45, depthWrite: false }));
slotGlow.rotation.x = -Math.PI / 2; slotGlow.visible = false; scene.add(slotGlow);

for (const m of KM) {
  for (const j of [...JOINTS, ...STAKE_JOINTS]) { const g = makeLashing(); g.visible = false; scene.add(g); m.lash[j.id] = g; }
  for (const st of LEG_STAKES) { const s = makeStake(LEG_STAKE_LEN); s.visible = false; scene.add(s); m.stakes[st.id] = s; }
  for (const g of GUYS) { const s = makeStake(ANCHOR_LEN); s.visible = false; scene.add(s); m.stakes['A' + g.id] = s; }
  for (const g of GUYS) { m.ropes[g.id] = new RopeViz(scene); m.ropes[g.id].show(false); }
}
{
  const cubeSlots = LEVELS.find(l => l.cube)?.cube.slots || [];
  cubeSlots.forEach((s, i) => { const a = makePoleMesh((i % 3) / 2); a.visible = false; scene.add(a); CM.poles[s.id] = [a]; });
  for (const j of LEVELS.find(l => l.cube)?.cube.joints || []) { const g = makeLashing(); g.visible = false; scene.add(g); CM.lash[j.id] = g; }
  for (const side of [-1, 1]) { const m = makeSideSheet(); m.visible = false; scene.add(m); CM.sheets[side] = m; }
}
useKlaf(0);

// raise roles: each walks to its post when needed and walks off after
const people = {};
['baseL', 'baseR', 'lift1', 'lift2', 'tier', ...GUYS.map(g => 'guy' + g.id)].forEach((k, i) => { people[k] = new Actor(scene, i); });
// the work crew: carries poles and drives stakes
const crew = makeCrew(scene, 8);
const allActors = [...Object.values(people), ...crew];
window.CREW = CREW;

// the מדריך who runs the inspection (מסדר): a scout leader in a wide-brimmed hat
const inspector = new Actor(scene, 3);
{
  const mat = new THREE.MeshStandardMaterial({ color: 0x5b4a2c, roughness: 0.9 });
  const hat = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.025, 18), mat);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.14, 14), mat); crown.position.y = 0.075;
  hat.add(brim, crown); hat.position.y = 0.9;
  inspector.mesh.userData.torso.add(hat);
  allActors.push(inspector);
}
// the inspection's buckets of water, one per klaf
const buckets = [0, 1, 2].map(() => {
  const g = new THREE.Group();
  const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.24, 14), new THREE.MeshStandardMaterial({ color: 0x5f86b8, roughness: 0.5, metalness: 0.3 }));
  pail.position.y = -0.5; pail.castShadow = true;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.38, 5), new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 1 }));
  rope.position.y = -0.19;
  g.add(pail, rope); g.visible = false; scene.add(g);
  return g;
});
const pushArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.8, 0xe2593f, 0.25, 0.16);
pushArrow.visible = false; scene.add(pushArrow);

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
  off: ringTexture('#ff8d8d', '✕'),
};
const markerPool = [];
function markerSprite(i) {
  if (!markerPool[i]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTex.lash, depthTest: false, transparent: true, sizeAttenuation: false }));
    s.renderOrder = 10; scene.add(s); markerPool[i] = s;
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
    const id = G.sim.findParticle(leg, v - slot.centre[1]); if (id == null) return null;
    return add3(G.sim.pos(id), visNormal(), layerOff(slot));
  }
  return add3(kw(slot.centre[0], v), [0, 1, 0], layerOff(slot));
}
function legTop(leg) {
  const pole = G.build.poles[leg]; if (!pole) return null;
  return legPoint(leg, slotById(leg).centre[1] + pole.length / 2);
}
const stakeZ = () => z0() - GAP; // leg stakes stand beside the raised legs
function stakeTopPos(st) {
  const hits = G.build.stakes[st.id] || 0;
  return [st.u, LEG_STAKE_LEN - 0.3 * Math.min(hits, LEG_STAKE_HITS) / LEG_STAKE_HITS, stakeZ()];
}
// where a guy line's stake stands, for the current klaf
function anchorPos(g) {
  const c = K().cfg, u = slotById(g.leg).centre[0];
  return [u * c.anchorX[g.side > 0 ? 'back' : 'front'], 0, c.z0 + g.side * (g.side > 0 ? c.backDist : c.frontDist)];
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
  $('level-no').textContent = `שלב ${LV.number}`;
}
makeChips();
// stageDone('anchor') asks about the current klaf; a key like 'anchor:1' names the klaf
function stageDone(key) {
  const st = STAGES.find(s => s.key === key);
  if (st && st.k != null && st.k !== G.ki) { const keep = G.ki; useKlaf(st.k); const d = stageDone(st.id); useKlaf(keep); return d; }
  const id = st ? st.id : key;
  if (id === 'cube') return !!G.cube && cubeComplete();
  if (id === 'unguy') return !!G.cube && G.klafim.every((k, i) => GUYS.every(g => !innerSide(k.cfg, g) || k.build.guyOff[g.id]));
  const b = G.build;
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
  if (st.k != null) {
    if (st.k !== G.ki) { clearJobs(); selectPole(null); }
    leaveCube();
    useKlaf(st.k);
    if (id === 'build' && G.sim && G.sim.angle() > 12 && !G.falling) {
      return confirmCard('להוריד את הקלף לקרקע?', 'כדי לשנות סנדות צריך להשכיב את הקלף חזרה על השרטוט. הבז״נטים נשארים במקומם.', 'להוריד', () => { lowerKlaf(); goStage(st.key); });
    }
    if (id === 'build' && G.sim) lowerKlaf();
    if (id !== 'build') { selectPole(null); if (!G.sim) startSim(); }
  } else if (LV.cube) {
    if (!enterCube()) return;
    if (id !== 'cube') selectPole(null);
  } else {
    selectPole(null); if (!G.sim) startSim();
  }
  G.stage = id; G.stageKey = st.key;
  closePicker();
  $('tray').hidden = id !== 'build' && id !== 'cube';
  $('rope-panel').hidden = id !== 'raise';
  $('crew-panel').hidden = id !== 'raise';
  if (id !== 'build' && id !== 'cube') $('length-panel').hidden = true;
  // close enough to tap the small parts in stages with fine work, far and high otherwise
  setCameraMode(id === 'build' ? 'buildView' : (id === 'stakes' || id === 'anchor' || id === 'unguy') ? 'workView' : id === 'cube' ? 'cubeView' : 'orbit');
  refreshChips(); refreshActions(); refreshHint();
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
  G.klafim.forEach(k => { if (k.raisedOnce) { k.sim = new KlafSim(k.build, k.cfg); k.sim.standUp(); } });
  rec.length = 0;
}
function rebuildCube() { if (G.cube?.sim) { G.cube.sim = null; enterCube(); } }
function cubeSides() {
  const b = G.cube.build;
  const done = side => LV.cube.slots.filter(s => s.side === side).every(s => b.poles[s.id]) && LV.cube.joints.filter(j => j.side === side).every(j => b.joints[j.id]);
  return { [-1]: done(-1), [1]: done(1) };
}
function cubeComplete() { const d = cubeSides(); return d[-1] && d[1]; }
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
  const far = aspect < 1.6 ? 1.25 : 1; // narrower screens step back a little
  // seen from high above, so the klaf and the scouts stay small in a big plaza (Omer)
  const at = (target, dist, elev, azim) => ({ target, pos: target.clone().add(new THREE.Vector3(Math.sin(azim) * Math.cos(elev), Math.sin(elev), -Math.cos(azim) * Math.cos(elev)).multiplyScalar(dist * far)) });
  const z = LV.cube && cubeStage(G.stage) ? (LV.cube.span ?? LV.cube.depth) / 2 : z0();
  if (mode === 'buildView') return at(new THREE.Vector3(0, 0, z + 1.0), 10.5, 1.05, 0.3);
  if (mode === 'workView') return at(new THREE.Vector3(0, 0.5, z + 0.2), 9, 0.8, 0.55);
  if (mode === 'cubeView') return at(new THREE.Vector3(0, 0.9, z), 11 + 2.5 * ((LV.cube?.bays ?? 1) - 1), 0.75, 0.75);
  return at(new THREE.Vector3(0, 0.7, z + 0.4), 17, 0.85, 0.55);
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
  const near = P.clone().addScaledVector(dir, withTier ? 3.0 : 1.8).add(new THREE.Vector3(0, withTier ? 4.0 : 2.4, 0));
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
function toScreen(p) {
  const v = new THREE.Vector3(...p).project(camera);
  if (v.z > 1) return null;
  return [(v.x + 1) / 2 * window.innerWidth, (1 - v.y) / 2 * window.innerHeight];
}
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundAt(x, y) {
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
  if (!busy && LV.cube && cubeStage(st)) collectCubeTargets(T);
  else if (!busy) {
    // klaf lashings: tie (ring) or change (on the coil)
    // lashings on the klaf can only be tied or changed while it lies on the ground
    const klafDown = !sim || sim.angle() < 8;
    for (const j of JOINTS) {
      if (!klafDown || G.carrying[j.a] || G.carrying[j.b]) continue;
      if (!jointReachable(j, b.poles)) continue;
      const p = jointPos(j); if (!p) continue;
      T.push({ kind: b.joints[j.id] ? 'lashed' : 'joint', id: j.id, pos: p, show: !b.joints[j.id] });
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
    s.material.map = t.kind === 'stake' || t.kind === 'anchor' ? markerTex.stake : t.kind === 'guyOff' ? markerTex.off : (t.kind === 'guyTop' || t.kind === 'guyTie') ? markerTex.guy : markerTex.lash;
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
  for (const s of G.stage === 'cube' ? LV.cube.slots : SLOTS) {
    const segs = G.stage === 'cube' ? cubeSegs(s.id) : poleSegs(s.id); if (!segs) continue;
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
  if (G.falling || closeup) return;
  // a length picked from the pile goes on the line that was tapped
  if (G.armed && (G.stage === 'build' || G.stage === 'cube')) {
    let slot = null;
    if (G.stage === 'cube') slot = nearestCubeSlot(x, y);
    else { const p = groundAt(x, y); if (p) slot = nearestSlot(p.x, p.z - z0()); }
    if (slot) { G.lastLength = G.armed; placePole(slot); refreshAll(); return; }
  }
  const t = pickTarget(x, y);
  if (t) return onTarget(t, x, y);
  if (G.stage === 'build' || G.stage === 'cube') {
    const sid = pickPole(x, y);
    if (sid) { closePicker(); return selectPole(sid); }
  }
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
    case 'guyTie': case 'cjoint': case 'clashed': return openPicker(t, x, y);
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
  closePicker(); refreshAll();
});
const cubeJoint = id => LV.cube.joints.find(j => j.id === id);
const cubeSlot = id => LV.cube?.slots.find(s => s.id === id);
function jointLabel(t) {
  if (t.kind === 'cjoint' || t.kind === 'clashed') {
    const j = cubeJoint(t.id), name = id => cubeSlot(id).he.replace(/ \(.*\)/, '');
    return j.b ? `${name(j.a)} × ${name(j.b)}` : `${name(j.a)} × רגל ה${LV.klafim[j.klaf].he}`;
  }
  if (t.kind === 'guyTie') return GUYS.find(g => g.id === t.id).he + ' אל הבז״נט';
  if (t.kind.startsWith('stake')) { const sj = STAKE_JOINTS.find(s => s.id === t.id); return `${slotById(sj.leg).he} אל הבז״נט`; }
  const j = JOINTS.find(q => q.id === t.id);
  const name = id => slotById(id).he.replace(/ \(.*\)/, '');
  return `${name(j.a)} × ${name(j.b)}`;
}
function correctFor(t) {
  if (t.kind === 'cjoint' || t.kind === 'clashed') return cubeJoint(t.id).correct;
  if (t.kind === 'guyTie') return 'guy';
  if (t.kind.startsWith('stake')) return STAKE_JOINTS.find(s => s.id === t.id).correct;
  return JOINTS.find(j => j.id === t.id).correct;
}
function openPicker(t, x, y) {
  picker.target = t;
  const el = picker.el;
  el.hidden = false;
  const cur = t.kind === 'lashed' ? G.build.joints[t.id] : t.kind === 'stakeLashed' ? G.build.stakeJoints[t.id] : t.kind === 'clashed' ? G.cube.build.joints[t.id] : null;
  $('picker-title').textContent = (cur ? 'החלפת כפיתה · ' : 'בחרו כפיתה · ') + jointLabel(t);
  const opts = $('picker-opts'); opts.innerHTML = '';
  for (const id of t.kind === 'guyTie' ? GUY_LASHING_ORDER : LASHING_ORDER) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.dataset.type = id; btn.className = id === cur ? 'cur' : '';
    btn.innerHTML = lashIcon[id] + `<span>${LASHINGS[id].he}</span>`;
    btn.addEventListener('click', () => chooseLashing(id));
    opts.appendChild(btn);
  }
  const tip = LV.tutorial ? TUTORIAL_TIP[correctFor(t)] : '';
  $('picker-tip').textContent = tip ? 'הדרכה: ' + tip : '';
  $('picker-tip').hidden = !tip;
  $('picker-untie').hidden = !((t.kind === 'lashed' && G.stage === 'build') || (t.kind === 'clashed' && G.stage === 'cube'));
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
  const fresh = t.kind === 'joint' || t.kind === 'cjoint' || t.kind === 'guyTie' || t.kind === 'stakeJoint';
  if (fresh && ropeLeft() <= 0) return flashHint('<b>נגמרו החבלים.</b> אפשר להתיר כפיתה מיותרת כדי לקבל חבל בחזרה');
  const tie = () => {
    if (t.kind === 'joint' || t.kind === 'lashed') {
      b.joints[t.id] = type;
      G.sim?.addJoint(JOINTS.find(j => j.id === t.id));
    } else if (t.kind === 'cjoint' || t.kind === 'clashed') {
      G.cube.build.joints[t.id] = type;
      G.cube.sim?.addJoint(cubeJoint(t.id));
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
    refreshAll();
  };
  // changing the type of a lashing already tied needs no close-up
  if (t.kind === 'lashed' || t.kind === 'stakeLashed' || t.kind === 'clashed') return tie();
  lashCloseup(t.pos, tie);
}

// ---------------- pole tray (drag a pole onto the drawing) ----------------
const trayPole = $('tray-pole');
let drag = null;
trayPole.addEventListener('pointerdown', e => {
  sfx.unlock(); startClock();
  const item = e.target.closest('.pile-item'); if (!item) return;
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
  const p = groundAt(e.clientX, e.clientY);
  if (!p) return;
  drag.moved = true;
  const len = G.lastLength;
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
    flashHint(`נבחרה סנדה של <b>${drag.len.toFixed(1)} מ׳</b>. הקישו על קו בשרטוט כדי להניח אותה, או גררו אותה לשם`);
  } else if (drag.slot === null && drag.moved) {
    flashHint(G.stage === 'cube' ? 'שחררו את הסנדה על אחד הקווים בשרטוטי הצדדים' : 'שחררו את הסנדה על אחד הקווים הכחולים בשרטוט');
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
const isCubePole = sid => sid.startsWith('C.');
const slotOf = sid => isCubePole(sid) ? cubeSlot(sid) : slotById(sid);
const polesOf = sid => isCubePole(sid) ? G.cube.build.poles : G.build.poles;
const meshesOf = sid => isCubePole(sid) ? CM.poles[sid] : poleMeshes[sid];
function selectPole(sid) {
  if (G.selected) meshesOf(G.selected).forEach(m => m.material[0].emissive?.setHex(0x000000));
  G.selected = sid;
  $('length-panel').hidden = !sid || (G.stage !== 'build' && G.stage !== 'cube');
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
  $('lp-value').style.color = Math.abs(d) < 0.05 ? '#9be37f' : d < 0 ? '#ff9a85' : '';
  $('lp-fit').textContent = Math.abs(d) < 0.05 ? 'בדיוק כמו בשרטוט' : d < 0 ? 'קצרה מדי: לא תגיע לכל הכפיתות' : 'ארוכה מהשרטוט: תעבוד, אבל בפחות נקודות';
}
function changeLength(steps) {
  const sid = G.selected; if (!sid || !steps) return;
  const pole = polesOf(sid)[sid];
  const nl = Math.round(Math.max(1.0, Math.min(4.0, pole.length + steps * 0.1)) * 10) / 10;
  if (nl === pole.length) return;
  pole.length = nl; G.lastLength = nl;
  // a lashing falls off if the pole no longer reaches the joint
  if (isCubePole(sid)) {
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
    delete polesOf(sid)[sid];
    if (isCubePole(sid)) {
      for (const j of LV.cube.joints) if (j.a === sid || j.b === sid) delete G.cube.build.joints[j.id];
      rebuildCube();
    } else for (const j of JOINTS) if (j.a === sid || j.b === sid) delete G.build.joints[j.id];
    selectPole(null); refreshAll();
  });
}

// ---------------- the pole pile and the rope (limited per level) ----------------
// Each level comes with a pile of real poles: the lengths its drawings need, plus
// a few that fit nowhere exactly. Poles are not cut, so every choice uses one up.
const r1 = x => Math.round(x * 10) / 10;
function pileStock() {
  const m = new Map();
  const add = l => m.set(r1(l), (m.get(r1(l)) || 0) + 1);
  for (let i = 0; i < LV.klafim.length; i++) SLOTS.forEach(s => add(s.length));
  if (LV.cube) LV.cube.slots.forEach(s => add(s.length));
  (LV.stockExtra || []).forEach(add);
  return [...m.entries()].sort((a, b) => b[0] - a[0]);
}
function polesInUse() {
  const m = new Map();
  const add = set => { for (const id in set) if (set[id]) { const l = r1(set[id].length); m.set(l, (m.get(l) || 0) + 1); } };
  G.klafim.forEach(k => add(k.build.poles));
  if (G.cube) add(G.cube.build.poles);
  return m;
}
const poleLeft = len => (pileStock().find(([l]) => l === r1(len))?.[1] || 0) - (polesInUse().get(r1(len)) || 0);
// rope: one length per lashing in the plan, and a couple to spare
const countTrue = o => Object.values(o).filter(Boolean).length;
function ropeTotal() {
  return (JOINTS.length + STAKE_JOINTS.length + GUYS.length) * LV.klafim.length + (LV.cube ? LV.cube.joints.length : 0) + (LV.ropeSpare ?? 2);
}
function ropeUsed() {
  let n = 0;
  for (const k of G.klafim) n += countTrue(k.build.joints) + countTrue(k.build.stakeJoints) + countTrue(k.build.guyTies);
  if (G.cube) n += countTrue(G.cube.build.joints);
  return n;
}
const ropeLeft = () => ropeTotal() - ropeUsed();
let pileKey = '';
function renderPile() {
  const rows = pileStock().map(([l, n]) => [l, n - (polesInUse().get(l) || 0)]);
  const key = JSON.stringify(rows);
  if (key !== pileKey) {
    // rebuilt only when the counts change, never under a finger that is starting a drag
    pileKey = key;
    $('tray-pole').innerHTML = rows.map(([l, left]) => `<button type="button" class="pile-item${left ? '' : ' empty'}" data-len="${l}">
      <span class="pile-stick" style="width:${Math.round(l * 22)}px"></span><b>${l.toFixed(1)}</b><small>×${left}</small></button>`).join('');
  }
  for (const el of $('tray-pole').children) el.classList.toggle('on', +el.dataset.len === (G.armed ?? G.lastLength) && poleLeft(+el.dataset.len) > 0);
  $('rope-count').innerHTML = `חבלים לכפיתות: <b>${ropeLeft()}</b>`;
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
  const side = slotById(g.leg).he.replace('רגל ', '');
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
let crewKey = '';
function renderCrew() {
  const b = G.build; if (!b) return;
  const key = JSON.stringify([b.crew, b.guyTop, G.ki, LV.number]);
  if (key === crewKey) return;
  crewKey = key;
  $('crew-free').textContent = `${freeCrew().length} מתוך ${crewSize()} פנויים`;
  $('crew-list').innerHTML = crewRoles().map(g => {
    const who = b.crew[g.id], ready = g.lifter || b.guyTop[g.id];
    return `<button type="button" class="crew-row${who != null ? ' on' : ''}${ready ? '' : ' off'}" data-gid="${g.id}">
      <span class="crew-role">${crewRole(g)}</span><span class="crew-who">${who != null ? CREW_NAMES[who] : ready ? '+ צופה' : 'יתר לא כפות'}</span></button>`;
  }).join('');
}
$('crew-list').addEventListener('click', e => { const r = e.target.closest('.crew-row'); if (r) toggleCrew(r.dataset.gid); });

// ---------------- rope pull ----------------
{
  const pad = $('rp-pad'); let on = false, lastY = 0, ropeOff = 0, lastCreak = 0;
  pad.addEventListener('pointerdown', e => { sfx.unlock(); startClock(); on = true; lastY = e.clientY; pad.setPointerCapture(e.pointerId); });
  pad.addEventListener('pointermove', e => {
    if (!on || !G.sim || G.falling) return;
    const dy = e.clientY - lastY; lastY = e.clientY;
    if (dy <= 0) return;
    if (!G.sim.canPull()) { flashHint('המושכים מושכים ב<b>יתרים הקדמיים</b>: כפתו אותם קודם לראש הקלף'); return; }
    ropeOff += dy;
    $('rp-rope').style.backgroundPosition = `0 ${ropeOff}px`;
    G.sim.pullTo(G.sim.target + dy * 0.16);
    const now = performance.now();
    if (now - lastCreak > 180 + Math.random() * 120) { lastCreak = now; sfx.creak(Math.min(1, dy / 12)); }
  });
  pad.addEventListener('pointerup', () => { on = false; });
  pad.addEventListener('pointercancel', () => { on = false; });
}

// ---------------- crew jobs: carrying poles, driving stakes ----------------
const jobs = [];
const driverPool = [];
function getDriver() {
  let d = driverPool.find(m => !m.userData.used);
  if (!d) { d = makeDriver(); scene.add(d); driverPool.push(d); }
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
  let job = jobs.find(j => j.type === 'drive' && j.id === id);
  if ((store[id] || 0) + (job ? job.queued : 0) >= max) return;
  if (!job) {
    const [x, z] = kind === 'leg' ? [LEG_STAKES.find(s => s.id === id).u, stakeZ()] : (a => [a[0], a[2]])(anchorPos(GUYS.find(g => g.id === id)));
    const two = freeActors(crew, 2, new THREE.Vector3(x, 0, z));
    if (!two) { flashHint('כל הצופים עסוקים, עוד רגע…'); return; }
    job = { type: 'drive', kind, id, x, z, actors: two, queued: 0, t: 0, idle: 0, mesh: getDriver() };
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
      sfx.hammer(); buzz(15);
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
  const n = job.cube ? [cubeSlot(job.sid).side, 0, 0] : [-d[2], 0, d[0]];
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
  for (const job of [...jobs]) (job.type === 'drive' ? updateDrive : updateCarry)(job, dt);
}

// ---------------- action buttons and hints ----------------
function refreshActions() {
  const el = $('actions'); el.innerHTML = '';
  const add = (label, fn, primary = true) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tool' + (primary ? ' primary' : '');
    b.textContent = label; b.addEventListener('click', fn); el.appendChild(b);
  };
  if (G.falling || G.check?.running) return;
  const nx = nextStage();
  const go = label => add(label, () => goStage(nx.key));
  if (G.stage === 'build' && stageDone('build')) go('המשך לבז״נטים');
  if (G.stage === 'stakes' && stageDone('stakes')) go('המשך להרמה');
  if (G.stage === 'anchor' && G.raisedOnce) go(nx.id === 'check' ? 'למסדר המדריך' : nx.id === 'cube' ? 'המשך לחיבור הקובייה' : `המשך ל${nx.he.split(', ')[1] || nx.he}`);
  if (G.stage === 'cube' && cubeComplete()) go('המשך להורדת היתרים הפנימיים');
  if (G.stage === 'unguy' && stageDone('unguy')) go('למסדר המדריך');
  if (G.stage === 'check' && !G.check) add('קוראים למדריך למסדר', runCheck);
}
let flashUntil = 0;
function flashHint(html) { $('hint-text').innerHTML = html; flashUntil = performance.now() + 2600; }
function hintText() {
  const b = G.build, sim = G.sim;
  if (G.replay) return '<b>הילוך חוזר איטי</b> · מה שגרם לקריסה מסומן באדום · הקישו כדי לדלג';
  if (G.falling) return '<b>הקלף קורס…</b>';
  const nPoles = SLOTS.filter(s => b.poles[s.id]).length;
  const nJ = JOINTS.filter(j => b.joints[j.id]).length;
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
      return 'הקלף מוכן על הקרקע. המשיכו ל<b>דפיקת בז״נטים</b>';
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
  switch (G.stage) {
    case 'build': return `${kn}סנדות ${nPoles}/6 · כפיתות ${nJ}/9`;
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
      return `סנדות בקובייה ${LV.cube.slots.filter(s => cb.poles[s.id]).length}/${LV.cube.slots.length} · כפיתות ${LV.cube.joints.filter(j => cb.joints[j.id]).length}/${LV.cube.joints.length}`;
    }
    case 'unguy': {
      let n = 0; eachKlaf(() => { n += GUYS.filter(g => isInnerGuy(g) && G.build.guyOff[g.id]).length; });
      return `יתרים פנימיים שירדו ${n}/4`;
    }
    case 'check': return G.check?.running ? (G.check.label || 'מסדר…') : 'מסדר: המדריך דוחף, תולה משקל ובודק כל כפיתה';
  }
  return '';
}
function refreshHint() { if (performance.now() > flashUntil) $('hint-text').innerHTML = hintText(); }
function refreshAll() { refreshChips(); refreshActions(); refreshHint(); renderPile(); renderCrew(); }

// ---------------- clock ----------------
function startClock() { if (!G.startedAt) G.startedAt = performance.now(); }
function elapsed() { if (!G.startedAt) return 0; return ((G.endedAt || performance.now()) - G.startedAt) / 1000; }
function fmt(sec) { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; }

// ---------------- the push test ----------------
function runCheck() {
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
    if (!c.released) { c.released = true; G.cube.sim.releaseAllGuys(); }
    c.label = 'מורידים את כל היתרים: קובייה עם איקסים עומדת בעצמה';
  }
  for (const p of c.pushes || PUSHES) if (c.t >= p.from && c.t <= p.to) {
    const k = Math.min(1, (c.t - p.from) / 0.5, (p.to - c.t) / 0.3);
    push = p.f.map(v => v * TUNING.pushForce * Math.max(0, k));
    c.label = p.label;
  }
  if (c.load && c.t >= c.load[0] && c.t <= c.load[1]) {
    c.loading = true;
    c.label = LV.cube ? 'המדריך תולה <b>דלי מים</b> על הרוחב העליון של כל קלף' : 'המדריך תולה <b>דלי מים</b> על הרוחב העליון';
  }
  if (c.t > (c.end || 10.2)) { c.running = false; finish(); }
  return push;
}

// ---------------- collapse watch ----------------
// the top horizontal sagged or fell under the inspection's bucket
// (measured against its height in the drawing: a pole hanging from one lashing is caught here too)
function loadDropped(ks) {
  if (!G.check?.loading) return false;
  return ks.some(k => SIZES.klaf.topHeight + R - k.loadY() > 0.25);
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
  if (ang > 82 && ang < 98) { G.uprightFor += dt; if (G.uprightFor > 0.6 && !G.raisedOnce) { G.raisedOnce = true; sfx.ok(); if (G.stage === 'raise') setTimeout(() => G.stage === 'raise' && !G.falling && goStage('anchor'), 500); refreshAll(); } }
  else G.uprightFor = 0;
  let kind = null;
  if (sim.baseSlid() > 0.35) kind = 'slid';
  else if (sim.rack() > 0.42) kind = 'rack';
  else if (ang > 122) kind = 'over';
  else if (G.raisedOnce && (top[1] < 1.4 || ang < 55)) kind = 'down';
  else if (loadDropped([sim])) kind = 'load';
  if (kind) {
    G.falling = { kind, t: 0, explain: explain(kind) };
    sim.flat = false;
    sfx.crash(); buzz([60, 40, 90]);
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
  else if (cs.lowestTop() < 1.4) kind = 'down';
  if (kind) {
    G.falling = { kind, t: 0, cube: true, explain: explainCube(kind) };
    sfx.crash(); buzz([60, 40, 90]);
    closePicker(); refreshAll();
  }
}
function explainCube(kind) {
  if (kind === 'load') return { ...loadRule(G.klafim.some(k => topMissing(k.build))), focus: { cubePoles: [], cubeGhosts: [], cubeJoints: [] } };
  const b = G.cube.build, cs = G.cube.sim;
  const sideName = side => side > 0 ? 'הצד השמאלי' : 'הצד הימני';
  const focus = { cubePoles: [], cubeGhosts: [], cubeJoints: [] };
  const badSides = [];
  for (const side of [-1, 1]) {
    let full = true;
    for (let bay = 0; bay < (LV.cube.bays ?? 1); bay++) for (const d of ['dA', 'dB']) {
      const id = `C.${d}${side > 0 ? 'L' : 'R'}${bay ? bay + 1 : ''}`;
      const ends = LV.cube.joints.filter(j => j.a === id && !j.b);
      if (!b.poles[id]) { full = false; focus.cubeGhosts.push(ends.map(j => j.id)); }
      else if (ends.some(j => !b.joints[j.id])) { full = false; focus.cubePoles.push(id); focus.cubeJoints.push(...ends.filter(j => !b.joints[j.id]).map(j => j.id)); }
    }
    if (!full) badSides.push(side);
  }
  const top = cs.klafim[0].topCentre();
  const dir = top[2] > 0 ? 'אחורה' : 'קדימה';
  if (kind === 'slid') return { rule: 'רגלי הקלפים עומדות ליד בז״נטים ונכפתות אליהם', detail: 'רגלי הקובייה החליקו על הקרקע.', focus: { feet: true } };
  if (kind === 'rack') return { rule: 'כל קלף צריך איקס מלא, כפי שהוא מופיע בשרטוט', detail: 'אחד הקלפים התעקם למקבילית והקובייה קרסה.', focus };
  if (badSides.length) return {
    rule: 'כל צד של קובייה צריך איקס מרחבי מלא, כפי שהוא מופיע בשרטוט',
    detail: `ב${badSides.map(sideName).join(' וב')} אין איקס מלא. בלי איקס, צד של סנדות עם כפיתות בפינות בלבד מתקפל למקבילית: כל עוד היתרים מחזיקים לא רואים את זה, אבל כשהורידו אותם הקובייה נטתה ${dir}. אלכסון לבד מחזיק רק כשמושכים אותו.`,
    focus };
  const missH = LV.cube.slots.filter(s => s.kind === 'h' && !b.poles[s.id]);
  if (missH.length) return { rule: 'שני הקלפים מחוברים בחיבור תחתון ועליון בכל צד', detail: `חסרות ${missH.length} סנדות חיבור, והקלפים זזו זה מול זה.`, focus: { cubeGhosts: [] } };
  return { rule: 'הקובייה לא עמדה בבדיקה', detail: 'בדקו בשרטוטי הצדדים שכל הכפיתות כפותות.', focus };
}
function xComplete() {
  const b = G.build;
  const has = (d, j1, j2) => b.poles[d] && b.joints[j1] && b.joints[j2] && jointReachable(JOINTS.find(j => j.id === j1), b.poles) && jointReachable(JOINTS.find(j => j.id === j2), b.poles);
  return { A: has('diagA', 'J5', 'J6'), B: has('diagB', 'J7', 'J8') };
}
function explain(kind) {
  const e = explainRule(kind);
  e.focus = e.focus || {};
  return e;
}
function explainRule(kind) {
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
      const miss = slotById(x.A ? 'diagB' : 'diagA').he.match(/\((.*)\)/)[1];
      detail = `חסר האלכסון שהולך מ${miss}, או שאחד הקצוות שלו לא כפות לרגל, והקלף נפל ${dir}. אלכסון לבד מחזיק רק בכיוון אחד: כשמושכים אותו הוא נמתח ומחזיק, כשדוחפים אותו הוא מתכופף.`;
    }
    // what the slow-motion replay points at: the half-tied diagonal, or a red ghost where a diagonal is missing
    const focus = { poles: [], ghosts: [], joints: [] };
    for (const [d, ok, js] of [['diagA', x.A, ['J5', 'J6']], ['diagB', x.B, ['J7', 'J8']]]) {
      if (ok) continue;
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
  // every lashing in the structure: each klaf's own, its legs to their stakes, its guy lines, and the cube's
  const all = [];
  let polesOk = 0, nPoles = 0;
  eachKlaf((k, i) => {
    const b = G.build;
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
  const total = all.length;
  const tied = all.filter(([, t]) => t).length;
  const correct = all.filter(([j, t]) => t === j.correct).length;
  const accuracy = Math.round(50 * tied / total + 30 * correct / total + 20 * polesOk / nPoles);
  const sec = elapsed();
  const bonus = sec <= LV.targetTimeSec ? 10 : 0;
  let stars = 1;
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
  G.endedAt = performance.now();
  pushArrow.visible = false;
  const s = G.result = score();
  saveStars(LV.number, s.stars);
  sfx.ok();
  const stars = [1, 2, 3].map(i => `<span class="${i <= s.stars ? 'on' : ''}">★</span>`).join('');
  const nMissing = s.total - s.tied;
  const missing = nMissing ? (nMissing === 1 ? 'כפיתה אחת חסרה במבנה.' : `${nMissing} כפיתות חסרות במבנה.`) : '';
  showModal(`
    <div class="eyebrow">תוצאות המסדר</div>
    <h2>${s.stars === 3 ? 'בנייה מושלמת!' : 'עברתם את השלב'}</h2>
    <div class="stars">${stars}</div>
    <ul class="inspect">
      <li class="ok">${LV.cube ? 'הקובייה עמדה' : 'הקלף עמד'} בדחיפות מכל הכיוונים${LV.cube ? ', גם בלי יתרים' : ''}</li>
      <li class="ok">החזיק את דלי המים על הרוחב העליון</li>
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
    ${s.stars < 3 ? '<p>אפשר לחזור, להשלים ולתקן, ולשפר את הכוכבים.</p>' : ''}
  `, [
    s.stars < 3 ? ['להשלים ולתקן', reopenForFixes, true] : null,
    s.stars < 3 && G.hintsUsed < s.hintsAllowed && G.result ? [`רמז (${s.hintsAllowed - G.hintsUsed} נותרו, −${s.hintCost} נק׳)`, () => useHint(s)] : null,
    LEVELS[LV.number] ? [`לשלב ${LV.number + 1}: ${LEVELS[LV.number].name}`, () => switchLevel(LV.number + 1), s.stars === 3] : null,
    ['למגרש שלי', () => { closeModal(); showLevels(); }, s.stars === 3 && !LEVELS[LV.number]],
    ['לבנות מחדש', restart],
  ].filter(Boolean));
  refreshAll();
}
function reopenForFixes() {
  closeModal(); G.check = null; G.result = null; G.endedAt = null;
  if (LV.cube) { G.cube.sim = null; goStage('cube'); } else goStage('anchor');
}
// where a lashing is, as the structure file names it: the drawing sheet and the height band
function sheetOf(j) {
  const band = y => y < 1.0 ? 'גובה 0–1 מ׳' : 'גובה 1–2 מ׳';
  const of = LV.klafim.length > 1 && j.klaf != null ? `, ${LV.klafim[j.klaf].he}` : '';
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
    ${!j.stake && !j.guy && !j.cube ? '<p>כפיתות בקלף אפשר לתקן רק כשהקלף שוכב על הקרקע.</p>' : ''}`,
    [['הבנתי', () => { closeModal(); finish(); }, true]]);
}
function restart() {
  closeModal();
  clearJobs();
  G = freshState();
  useKlaf(0);
  for (const set of [...KM.map(m => m.poles), CM.poles]) for (const k in set) set[k].forEach(m => m.material[0].emissive.setHex(0));
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
  if (LV.cube) for (const side of [-1, 1]) drawSideSheet(CM.sheets[side], LV.cube, side, LV.klafim.map(k => k.he));
  $('timer').textContent = '0:00';
  drawPlaza();
  goStage(STAGES[0].key);
  refreshAll();
}
function switchLevel(n) {
  LV = LEVELS[n - 1];
  STAGES = stageList();
  makeChips();
  restart();
}
// ---------------- the growing plaza ----------------
// Every structure the player has passed stays standing on the plaza, in its
// own spot around the building ground, so the camp grows level by level.
const PLAZA_SPOTS = { 1: { x: -5.6, z: 3.6, yaw: 0.35 }, 2: { x: 5.4, z: 3.2, yaw: -0.3 }, 3: { x: -5.4, z: -3.4, yaw: 1.2 } };
const plazaShown = {};
function makeDisplay(L) {
  const g = new THREE.Group();
  const pole = (a, b) => { const m = makePoleMesh(0); placeCylinder(m, a, b); g.add(m); };
  const knot = (p, dA, dB) => { const k = makeLashing(); placeLashing(k, p, dA, dB); g.add(k); };
  const N = [0, 0, -1]; // a standing klaf faces the pullers
  for (const cfg of L.klafim) {
    const at = (u, v, slot) => { const p = klafToWorld(u, v, 90); p[2] += cfg.z0; return add3(p, N, slot ? layerOff(slot) : 0); };
    for (const sl of SLOTS) {
      const h = sl.length / 2;
      pole(at(sl.centre[0] - sl.dir[0] * h, sl.centre[1] - sl.dir[1] * h, sl), at(sl.centre[0] + sl.dir[0] * h, sl.centre[1] + sl.dir[1] * h, sl));
    }
    for (const j of JOINTS) {
      const A = slotById(j.a), B = slotById(j.b);
      knot(at(j.at[0], j.at[1], A), [A.dir[0], A.dir[1], 0], [B.dir[0], B.dir[1], 0]);
    }
    for (const st of LEG_STAKES) { const m = makeStake(LEG_STAKE_LEN); m.position.set(st.u, -0.3, cfg.z0 - GAP); g.add(m); }
    // a klaf standing alone keeps its guy lines; inside a cube the inner ones are down
    if (!L.cube) for (const gl of GUYS) {
      const u = slotById(gl.leg).centre[0];
      const a = [u * cfg.anchorX[gl.side > 0 ? 'back' : 'front'], 0.3, cfg.z0 + gl.side * (gl.side > 0 ? cfg.backDist : cfg.frontDist)];
      const top = at(u, slotById(gl.leg).length, slotById(gl.leg));
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 5), new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 1 }));
      placeCylinder(r, top, a); g.add(r);
      const sk = makeStake(ANCHOR_LEN); sk.position.set(a[0], -0.25, a[2]); sk.rotation.x = gl.side * 0.35; g.add(sk);
    }
  }
  if (L.cube) for (const sl of L.cube.slots) {
    const h = sl.length / 2;
    pole(cubeSlotPoint(sl, -h), cubeSlotPoint(sl, h));
  }
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
const unlocked = n => n === 1 || starsOf(n - 1) >= 1;
// structures that come after the playable ones, shown on the path as coming soon
const COMING = [];
const ICONS = {
  1: '<svg viewBox="0 0 64 46"><g stroke="#6b4423" stroke-width="4" stroke-linecap="round"><path d="M14 44V4M50 44V4M8 36h48M8 8h48M14 36L50 8M14 8l36 28"/></g></svg>',
  2: '<svg viewBox="0 0 64 46"><g stroke="#6b4423" stroke-width="3.5" stroke-linecap="round" fill="none"><path d="M8 44V12M38 44V12M8 38h30M8 14h30M8 38L38 14M8 14l30 24"/><path d="M38 12l18-8M38 44l18-8M56 36V4M8 12l18-8h30" opacity=".6"/></g></svg>',
  3: '<svg viewBox="0 0 64 46"><g stroke="#6b4423" stroke-width="3" stroke-linecap="round" fill="none"><path d="M4 44V12M22 44V12M40 44V12M4 38h36M4 14h36M4 38L22 14M4 14l18 24M22 38L40 14M22 14l18 24"/><path d="M40 12l16-8M40 44l16-8M56 36V4M4 12l16-8h36" opacity=".6"/></g></svg>',
  soon: '<svg viewBox="0 0 64 46"><g stroke="#3a3a30" stroke-width="3.5" stroke-linecap="round" fill="none" opacity=".7"><path d="M4 44V14M30 44V14M56 44V14M4 16h52M4 38h52"/></g></svg>',
};
const starRow = n => [1, 2, 3].map(i => `<span class="${i <= n ? 'on' : ''}">★</span>`).join('');
function showHome() {
  drawPlaza();
  const total = LEVELS.reduce((a, l) => a + starsOf(l.number), 0);
  $('home-stars').textContent = total ? `★ ${total} / ${LEVELS.length * 3}` : 'מתחילים מהקלף הראשון';
  $('levels').hidden = true; $('home').hidden = false;
}
function showLevels() {
  drawPlaza();
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
$('levels-back').addEventListener('click', showHome);
$('btn-home').addEventListener('click', () => { closeModal(); showLevels(); });
$('btn-level').addEventListener('click', () => { closeModal(); showLevels(); });
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
  if (G.falling.cube) {
    return showModal(`<div class="eyebrow">מבחן מציאות</div><h2>${G.falling.kind === 'sway' ? 'הקובייה נטתה ונפלה' : 'הקובייה קרסה'}</h2>
      <div class="rule">${e.rule}</div><p>${e.detail}</p>`, [['חזרה לקובייה', () => {
      closeModal(); G.falling = null; G.check = null; G.cube.sim = null; setPolesOpacity(1); goStage('cube');
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
  const ps = G.sim.world.p;
  recT += dt;
  const a = new Float32Array(ps.length * 3);
  ps.forEach((q, i) => { a[i * 3] = q.x[0]; a[i * 3 + 1] = q.x[1]; a[i * 3 + 2] = q.x[2]; });
  rec.push({ t: recT, p: a });
  // keep a short window before the collapse; once falling, keep everything
  if (!G.falling) while (rec.length && recT - rec[0].t > REPLAY.before + 0.2) rec.shift();
  else if (G.falling.t0 == null) G.falling.t0 = recT;
  if (rec.length > 600) rec.shift();
}
const markMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.9, depthTest: false });
const marks = [];
function mark(i) {
  if (!marks[i]) { marks[i] = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 28), markMat); marks[i].renderOrder = 10; scene.add(marks[i]); }
  return marks[i];
}
const ghostMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.5, depthWrite: false });
const ghostPoles = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 10), ghostMat); m.visible = false; scene.add(m); return m; });
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
    const [pa, pb] = js.map(id => { const q = cs.legParticle(cubeJoint(id)); return q == null ? null : cs.pos(q); });
    if (pa && pb && ghostPoles[i]) placeCylinder(ghostPoles[i], pa, pb);
  });
  const spots = [...(f.joints || []).map(id => jointPos(JOINTS.find(j => j.id === id))), ...(f.cubeJoints || []).map(id => cubeJointPos(cubeJoint(id)))];
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
  for (const set of [...KM.map(m => m.poles), CM.poles]) for (const k in set) for (const m of set[k]) for (const mat of m.material) { mat.transparent = o < 1; mat.opacity = o; }
  for (const set of [...KM.map(m => m.lash), CM.lash]) for (const k in set) set[k].visible = set[k].visible && o > 0.05;
}

// ---------------- structure folder (תיק מבנה) ----------------
// The structure file: the drawings and the pole list, always open to flip
// through. The work order and the lashing guide are part of the first
// structure's tutorial only.
function folderTabs() {
  if (LV.cube) return [['drawing', 'שרטוט קלף (קדמי ואחורי)'], ['sideR', 'שרטוט הצד הימני'], ['sideL', 'שרטוט הצד השמאלי'], ['poles', 'רשימת סנדות']];
  return [['drawing', 'שרטוט הקלף'], ['poles', 'רשימת סנדות'], ...(LV.tutorial ? [['order', 'סדר עבודה (הדרכה)'], ['lashings', 'איזו כפיתה איפה (הדרכה)']] : [])];
}
function poleTable() {
  const k = SIZES.klaf, n = LV.klafim.length;
  const m = v => `${v.toFixed(1)} מ׳`;
  const rows = [
    ['רגליים', 2 * n, m(k.legLength)],
    [`רוחב (תחתון ${Math.round(k.bottomHeight * 100)} ס״מ מעל הקרקע, עליון בגובה ${k.topHeight} מ׳)`, 2 * n, m(k.horizontalLength)],
    ['אלכסונים (איקס בקלף)', 2 * n, m(k.diagLength)],
  ];
  if (LV.cube) {
    const c = SIZES.cube;
    rows.push(['חיבורים בין הקלפים (תחתון ועליון בכל צד)', 4, m(c.sideHorizontalLength)]);
    rows.push(['אלכסונים לאיקסים מרחביים (שניים בכל צד)', 4, m(c.sideDiagLength)]);
  }
  rows.push(['בז״נטים לרגליים', 2 * n, m(k.legStakeLength)], ['בז״נטים ליתרים', 4 * n, m(k.guyStakeLength)]);
  return `<table><thead><tr><th>סנדה</th><th>כמות</th><th>אורך</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table>
    <p class="note">המידות זמניות, עד שיגיעו שרטוטים אמיתיים.</p>`;
}
function openFolder(tab = 'drawing') {
  const tabs = $('folder-tabs'); tabs.innerHTML = '';
  for (const [id, he] of folderTabs()) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = he; b.className = id === tab ? 'on' : '';
    b.addEventListener('click', () => openFolder(id)); tabs.appendChild(b);
  }
  const body = $('folder-body'); body.innerHTML = '';
  if (tab === 'drawing') {
    const c = document.createElement('canvas'); c.width = c.height = BP.size;
    drawBlueprint(c.getContext('2d'), { joints: JOINTS });
    body.appendChild(c);
  } else if (tab === 'sideR' || tab === 'sideL') {
    const c = document.createElement('canvas');
    drawSideSheet(null, LV.cube, tab === 'sideL' ? 1 : -1, LV.klafim.map(k => k.he), c);
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
function cubeSegs(sid, plan = false, len = null) {
  const slot = cubeSlot(sid); const L = len ?? G.cube.build.poles[sid]?.length;
  if (L == null) return null;
  const off = [slot.side * slot.layer * GAP, 0, 0];
  const cs = G.cube.sim;
  if (!plan && cs) {
    const P = cs.poleParticles[sid]; if (!P) return null;
    return [[add3(cs.pos(P[0].id), off, 1), add3(cs.pos(P[P.length - 1].id), off, 1)]];
  }
  return [[add3(cubeSlotPoint(slot, -L / 2), off, 1), add3(cubeSlotPoint(slot, L / 2), off, 1)]];
}
function cubeJointPos(j) {
  const slot = cubeSlot(j.a), cs = G.cube.sim;
  const layer = j.b ? (slot.layer + cubeSlot(j.b).layer) / 2 : slot.layer / 2;
  const off = [slot.side * layer * GAP, 0, 0];
  if (cs) {
    const id = cs.findParticle(j.a, cubeSlotParam(slot, j.at));
    if (id != null) return add3(cs.pos(id), off, 1);
  }
  return add3(j.at, off, 1);
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
    placeLashing(g, cubeJointPos(j), da, db);
    g.visible = !fadedOut();
    coilProgress(g, jid);
  }
  // the side drawings lie on the ground beside each side while it is built
  const done = on ? cubeSides() : {};
  for (const side of [-1, 1]) {
    const m = CM.sheets[side];
    const show = on && G.stage === 'cube' && !done[side];
    m.material.opacity = Math.max(0, Math.min(0.92, m.material.opacity + (show ? 1 : -1) * dt / 0.5));
    m.visible = on && m.material.opacity > 0.01;
  }
}

// ---------------- per-frame drawing ----------------
function drawPoles() {
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
    const g = lashMeshes[j.id];
    const on = b.joints[j.id] && jointReachable(j, b.poles) && (!G.sim || G.sim.jointCons[j.id]);
    if (!on) { g.visible = false; continue; }
    const p = jointPos(j); if (!p) { g.visible = false; continue; }
    g.visible = !fadedOut();
    placeLashing(g, p, poleDir(j.a), poleDir(j.b));
    coilProgress(g, j.id);
  }
  for (const sj of STAKE_JOINTS) {
    const g = lashMeshes[sj.id];
    if (!b.stakeJoints[sj.id] || !G.sim || !G.sim.stakeCons[sj.id]) { g.visible = false; continue; }
    const p = legPoint(sj.leg, sj.v); if (!p) { g.visible = false; continue; }
    const st = LEG_STAKES.find(s => s.leg === sj.leg);
    g.visible = !fadedOut();
    placeParallelLashing(g, p, [st.u, p[1], stakeZ()], [0, 1, 0]);
    coilProgress(g, sj.id);
  }
}
// coils wind on one by one during the close-up
function coilProgress(g, id) {
  const n = G.tying && G.tying.id === id ? Math.ceil(Math.min(1, G.tying.t / 0.32) * g.children.length) : g.children.length;
  g.children.forEach((c, i) => { c.visible = i < n; });
}
function drawStakes() {
  const b = G.build;
  for (const st of LEG_STAKES) {
    const m = stakeMeshes[st.id], hits = b.stakes[st.id] || 0;
    m.visible = hits > 0 || jobs.some(j => j.id === st.id);
    const top = stakeTopPos(st)[1];
    m.position.set(st.u, top - LEG_STAKE_LEN, stakeZ());
  }
  for (const g of GUYS) {
    const m = stakeMeshes['A' + g.id], hits = b.anchors[g.id] || 0;
    m.visible = hits > 0 || jobs.some(j => j.id === g.id);
    const a = anchorPos(g);
    m.position.set(a[0], -0.25 * Math.min(hits, ANCHOR_HITS) / ANCHOR_HITS, a[2]);
    m.rotation.x = g.side * 0.35; // anchor stakes lean away from the load
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
  // base holders keep the feet in place while it goes up
  if (holding && ang < 85 && (st === 'raise')) {
    place(people.baseL, [-0.9, 0, z0() - 0.65], 0, 0.25, 0.9);
    place(people.baseR, [0.9, 0, z0() - 0.65], 0, 0.25, 0.9);
  }
  // lifters carry the top until the guy lines take over
  if (holding && sim.target > 0 && sim.target < 55 && ang < 60) {
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
      guyRopes[g.id].set(top, [a[0], 0.32, a[2] - g.side * 0.08], 0.02);
    } else if (con.pull || g.side < 0) {
      const h = sim.pullHand(slotById(g.leg).centre[0]);
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
  $('rope-panel').hidden = G.stage !== 'raise' || !!G.falling;
  $('crew-panel').hidden = G.stage !== 'raise' || !!G.falling;
  if (!G.sim || G.stage !== 'raise') return;
  const ang = G.sim.angle();
  $('gauge-needle').style.transform = `rotate(${Math.max(-95, Math.min(95, ang - 90))}deg)`;
  $('gauge-val').textContent = Math.round(ang) + '°';
  $('gauge-label').textContent = ang < 6 ? 'שוכב' : ang < 82 ? 'עולה' : ang <= 97 ? 'ניצב' : 'עבר את האנך!';
}
function drawInspector(push) {
  const c = G.check;
  if (!c?.running || G.falling || G.replay) { inspector.clear(); buckets.forEach(b => { b.visible = false; }); return; }
  const cs = G.cube?.sim && cubeStage(G.stage) ? G.cube.sim : null;
  const ks = cs ? cs.klafim : [G.sim];
  const tops = ks.map(k => k.topCentre());
  const cx = tops.reduce((a, t) => a + t[0], 0) / tops.length, cz = tops.reduce((a, t) => a + t[2], 0) / tops.length;
  buckets.forEach((b, i) => {
    const k = ks[i];
    b.visible = !!(c.loading && k);
    if (b.visible) { const t = k.topParticle(); const p = k.pos(t); b.position.set(p[0], p[1] - 0.03, p[2]); }
  });
  if (push) {
    // he leans into the top of the structure from the side the push comes from
    const d = new THREE.Vector3(push[0], 0, push[2]).normalize();
    const span = cs ? 1.6 : 1.1;
    inspector.set([cx - d.x * span, 0, cz - d.z * span], Math.atan2(d.x, d.z), 0.35, 1.5);
  } else if (c.loading) {
    inspector.set([cx + 0.7, 0, Math.min(...ks.map(k => k.z0)) - 0.8], 0, 0.1, Math.PI * 0.8);
  } else {
    // stepping back to watch, and walking round between tests
    inspector.set([cx + 2.0, 0, cz - 2.4], Math.atan2(-2.0, 2.4), 0, 0.2);
  }
}
function drawPushArrow(push) {
  if (!push || !G.sim) { pushArrow.visible = false; return; }
  const t = G.sim.topCentre();
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
  const sim = cs || G.sim;
  let push = null;
  if (sim) {
    // the stability check plays faster than real time; physics still steps in small pieces,
    // and the check's clock moves only as far as the physics really stepped
    const warp = G.check?.running && !G.falling ? CHECK_SPEED : 1;
    const wobble = !sim.lettingGo && (G.stage === 'raise' || G.stage === 'anchor');
    if (G.replay) stepReplay(dt);
    else {
      for (let w = 0; w < warp; w += 1) {
        const h = Math.min(1 / 30, dt * Math.min(1, warp - w));
        push = checkPush(h);
        const load = G.check?.loading ? TUNING.loadForce : 0;
        if (cs) cs.step(h, { push, load }); else sim.step(h, { wobble, push, load });
        record(h);
        if (cs) watchCube(h); else watchSim(h);
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
    const showPlan = i === cur && G.stage === 'build' && !stageDone('build');
    const op = blueprint.material.opacity + (showPlan ? 1 : -1) * dt / 0.5;
    blueprint.material.opacity = Math.max(0, Math.min(1, op));
    blueprint.visible = blueprint.material.opacity > 0.01;
    drawPoles(); drawLashings(); drawStakes();
  });
  drawCube(dt);
  drawCrew(); drawTier(); drawGauge(); drawPushArrow(push); drawInspector(push);
  updateJobs(dt);
  for (const a of allActors) a.update(dt);
  collectTargets();
  updateCamera(dt);
  hintTimer += dt;
  if (hintTimer > 0.25) { hintTimer = 0; refreshHint(); $('timer').textContent = fmt(elapsed()); $('tray-count').textContent = G.stage === 'cube' ? `${LV.cube.slots.filter(s => G.cube.build.poles[s.id]).length}/${LV.cube.slots.length} בקובייה` : `${SLOTS.filter(s => G.build.poles[s.id]).length}/6 על השרטוט`; }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
restart();
requestAnimationFrame(frame);

// debug hook for automated tests
window.__game = { get state() { return G; }, get pickerTarget() { return picker.target; }, correctFor, ropeLeft, poleLeft, get LV() { return LV; }, rebuildCube, runCheck, rec, goStage, switchLevel, useKlaf, cubeSegs, cubeJointPos, enterCube, chooseLashing, openPicker, onTarget, SLOTS, JOINTS, camera, toScreen, targets: () => targets };
