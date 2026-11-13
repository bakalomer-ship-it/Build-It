// Level 1 prototype: build a 2x2 klaf on its drawing, drive the stakes,
// raise it with the rope, anchor it, and pass the push test.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SLOTS, JOINTS, STAKE_JOINTS, LEG_STAKES, GUYS, GUY_DIST, LASHINGS, LASHING_ORDER, LEVEL } from './level1.js';
import { KlafSim, TUNING, jointReachable, slotById, slotParam, slotPoint, klafToWorld } from './klafSim.js';
import {
  R, makeRenderer, makeWorld, makeBlueprintMesh, drawBlueprint, BP, makePoleMesh, placeCylinder,
  makeLashing, placeLashing, placeParallelLashing, RopeViz, makeStake, makeMallet, makePerson, posePerson,
} from './scene.js';
import { sfx } from './sound.js';

const $ = id => document.getElementById(id);
const GAP = 1.9 * R;
const STAGES = [
  { id: 'build', he: 'בניית הקלף' },
  { id: 'stakes', he: 'בז״נטים' },
  { id: 'raise', he: 'הרמה' },
  { id: 'anchor', he: 'עיגון' },
  { id: 'check', he: 'בדיקה' },
];
const LEG_STAKE_HITS = 4, ANCHOR_HITS = 3;
const LEG_STAKE_LEN = 1.0, ANCHOR_LEN = 0.6;

// ---------------- state ----------------
let G;
function freshState() {
  return {
    stage: 'build',
    build: { poles: {}, joints: {}, stakes: {}, guyTop: {}, anchors: {}, stakeJoints: {} },
    selected: null,
    sim: null,
    raisedOnce: false, uprightFor: 0,
    falling: null,
    check: null,
    result: null,
    startedAt: null, endedAt: null,
    lastLength: 2.0,
  };
}
G = freshState();

// ---------------- three.js setup ----------------
const canvas = $('scene');
const renderer = makeRenderer(canvas);
const scene = new THREE.Scene();
makeWorld(scene);
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 1.2;
controls.maxDistance = 16;
controls.target.set(0, 1, 0.4);
controls.enabled = false;

scene.add(makeBlueprintMesh(JOINTS));

// poles: two meshes per slot (diagonals can bow at their centre)
const poleMeshes = {};
SLOTS.forEach((s, i) => {
  const a = makePoleMesh((i % 3) / 2), b = makePoleMesh((i % 3) / 2);
  b.material = a.material;
  scene.add(a, b); a.visible = b.visible = false;
  poleMeshes[s.id] = [a, b];
});
const ghost = makePoleMesh(0);
ghost.material = ghost.material.map(m => { const c = m.clone(); c.transparent = true; c.opacity = 0.55; return c; });
ghost.castShadow = false; ghost.visible = false; scene.add(ghost);
const slotGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.16), new THREE.MeshBasicMaterial({ color: 0xe0a93b, transparent: true, opacity: 0.45, depthWrite: false }));
slotGlow.rotation.x = -Math.PI / 2; slotGlow.visible = false; scene.add(slotGlow);

const lashMeshes = {};
for (const j of [...JOINTS, ...STAKE_JOINTS]) { const g = makeLashing(); g.visible = false; scene.add(g); lashMeshes[j.id] = g; }

const stakeMeshes = {};
for (const st of LEG_STAKES) { const m = makeStake(LEG_STAKE_LEN); m.visible = false; scene.add(m); stakeMeshes[st.id] = m; }
for (const g of GUYS) { const m = makeStake(ANCHOR_LEN); m.visible = false; scene.add(m); stakeMeshes['A' + g.id] = m; }
const mallet = makeMallet(); scene.add(mallet);

const guyRopes = {}; for (const g of GUYS) guyRopes[g.id] = new RopeViz(scene);
const pullRope = new RopeViz(scene, 0.014, 0xc9a35c, 16);
Object.values(guyRopes).forEach(r => r.show(false)); pullRope.show(false);

const people = {
  pull1: makePerson(0), pull2: makePerson(1),
  baseL: makePerson(2), baseR: makePerson(3),
  lift1: makePerson(1), lift2: makePerson(0),
};
for (const g of GUYS) people['guy' + g.id] = makePerson(GUYS.indexOf(g) + 2);
for (const k in people) { people[k].visible = false; scene.add(people[k]); }

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
  return [[add3(klafToWorld(a[0], a[1]), [0, 1, 0], off), add3(klafToWorld(b[0], b[1]), [0, 1, 0], off)]];
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
  return add3(klafToWorld(j.at[0], j.at[1]), [0, 1, 0], off);
}
function legPoint(leg, v) {
  const slot = slotById(leg);
  if (G.sim) {
    const id = G.sim.findParticle(leg, v - slot.centre[1]); if (id == null) return null;
    return add3(G.sim.pos(id), visNormal(), layerOff(slot));
  }
  return add3(klafToWorld(slot.centre[0], v), [0, 1, 0], layerOff(slot));
}
function legTop(leg) {
  const pole = G.build.poles[leg]; if (!pole) return null;
  return legPoint(leg, slotById(leg).centre[1] + pole.length / 2);
}
const stakeZ = -GAP; // leg stakes stand beside the raised legs
function stakeTopPos(st) {
  const hits = G.build.stakes[st.id] || 0;
  return [st.u, LEG_STAKE_LEN - 0.3 * Math.min(hits, LEG_STAKE_HITS) / LEG_STAKE_HITS, stakeZ];
}
function anchorPos(g) { return [slotById(g.leg).centre[0] * 1.05, 0, g.side * GUY_DIST]; }

// ---------------- UI: stage chips ----------------
const stagesEl = $('stages');
STAGES.forEach((s, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.dataset.stage = s.id;
  b.innerHTML = `<span class="n">${i + 1}</span><span class="lbl">${s.he}</span>`;
  b.addEventListener('click', () => goStage(s.id));
  stagesEl.appendChild(b);
});
function stageDone(id) {
  const b = G.build;
  if (id === 'build') return SLOTS.every(s => b.poles[s.id]) && JOINTS.every(j => b.joints[j.id]);
  if (id === 'stakes') return LEG_STAKES.every(s => (b.stakes[s.id] || 0) >= LEG_STAKE_HITS);
  if (id === 'raise') return G.raisedOnce;
  if (id === 'anchor') return G.sim && GUYS.every(g => G.sim.guys[g.id]?.tied) && STAKE_JOINTS.every(s => b.stakeJoints[s.id]);
  if (id === 'check') return !!G.result;
  return false;
}
function refreshChips() {
  for (const el of stagesEl.children) {
    el.classList.toggle('on', el.dataset.stage === G.stage);
    el.classList.toggle('done', stageDone(el.dataset.stage));
  }
}

// ---------------- stage changes ----------------
function goStage(id) {
  if (G.falling) return;
  if (id === 'build' && G.sim && G.sim.angle() > 12 && !G.falling) {
    return confirmCard('להוריד את הקלף לקרקע?', 'כדי לשנות סנדות צריך להשכיב את הקלף חזרה על השרטוט. הבז״נטים נשארים במקומם.', 'להוריד', () => { lowerKlaf(); goStage('build'); });
  }
  if (id === 'build' && G.sim) lowerKlaf();
  if (id !== 'build') { selectPole(null); if (!G.sim) startSim(); }
  G.stage = id;
  closePicker();
  $('tray').hidden = id !== 'build';
  $('rope-panel').hidden = id !== 'raise';
  if (id !== 'build') $('length-panel').hidden = true;
  setCameraMode(id === 'build' ? 'top' : 'orbit');
  refreshChips(); refreshActions(); refreshHint();
}
function startSim() {
  G.sim = new KlafSim(G.build);
  G.uprightFor = 0;
}
function lowerKlaf() {
  G.sim = null; G.raisedOnce = false; G.check = null; G.result = null;
  G.build.stakeJoints = {};
  pushArrow.visible = false;
}

// ---------------- camera ----------------
let camMode = 'top', camTween = null;
function topCamPose() {
  const w = window.innerWidth, h = window.innerHeight, aspect = w / h;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const usable = Math.max(0.4, (w - 250) / w);
  const needH = 3.5, needW = 3.0;
  const dist = Math.max(needH / (2 * t), needW / (usable * aspect * 2 * t));
  return { pos: new THREE.Vector3(0.0, dist, 1.1), target: new THREE.Vector3(0.0, 0, 1.1), up: new THREE.Vector3(0, 0, 1) };
}
function setCameraMode(mode) {
  if (mode === camMode && camTween == null) return;
  const from = { pos: camera.position.clone(), q: camera.quaternion.clone() };
  let to;
  if (mode === 'top') {
    const p = topCamPose();
    const tmp = new THREE.PerspectiveCamera(); tmp.position.copy(p.pos); tmp.up.copy(p.up); tmp.lookAt(p.target);
    to = { pos: p.pos, q: tmp.quaternion.clone() };
    controls.enabled = false;
  } else {
    controls.target.set(0, 0.95, 0.3);
    const pos = new THREE.Vector3(3.6, 2.6, -5.4);
    const tmp = new THREE.PerspectiveCamera(); tmp.position.copy(pos); tmp.up.set(0, 1, 0); tmp.lookAt(controls.target);
    to = { pos, q: tmp.quaternion.clone() };
  }
  camMode = mode;
  camTween = { t: 0, from, to, mode };
}
function updateCamera(dt) {
  if (camTween) {
    camTween.t = Math.min(1, camTween.t + dt / 0.7);
    const k = camTween.t < 0.5 ? 2 * camTween.t ** 2 : 1 - (-2 * camTween.t + 2) ** 2 / 2;
    camera.position.lerpVectors(camTween.from.pos, camTween.to.pos, k);
    camera.quaternion.slerpQuaternions(camTween.from.q, camTween.to.q, k);
    if (camTween.t >= 1) {
      if (camTween.mode === 'orbit') { camera.up.set(0, 1, 0); controls.enabled = true; controls.update(); }
      camTween = null;
    }
    return;
  }
  if (camMode === 'orbit') controls.update();
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (camMode === 'top' && !camTween) { const p = topCamPose(); camera.position.copy(p.pos); camera.up.copy(p.up); camera.lookAt(p.target); }
}
window.addEventListener('resize', resize);
resize();
{ const p = topCamPose(); camera.position.copy(p.pos); camera.up.copy(p.up); camera.lookAt(p.target); }

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
  if (!busy) {
    // klaf lashings: tie (ring) or change (on the coil)
    for (const j of JOINTS) {
      if (!jointReachable(j, b.poles)) continue;
      const p = jointPos(j); if (!p) continue;
      T.push({ kind: b.joints[j.id] ? 'lashed' : 'joint', id: j.id, pos: p, show: !b.joints[j.id] });
    }
    // leg stakes
    if (st !== 'build') for (const s of LEG_STAKES) {
      if ((b.stakes[s.id] || 0) >= LEG_STAKE_HITS) continue;
      if (sim && sim.angle() > 8) continue;
      T.push({ kind: 'stake', id: s.id, pos: [s.u, 0.12, stakeZ], show: true });
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
      } else if (sim.guys[g.id] && !sim.guys[g.id].tied && sim.angle() > 70) {
        T.push({ kind: 'guyTie', id: g.id, pos: [a[0], 0.4, a[2]], show: true });
      }
    }
    if (sim && sim.angle() > 70 && st !== 'build') for (const sj of STAKE_JOINTS) {
      const stake = LEG_STAKES.find(s => s.leg === sj.leg);
      if ((b.stakes[stake.id] || 0) < LEG_STAKE_HITS || !b.poles[sj.leg]) continue;
      const p = legPoint(sj.leg, sj.v); if (!p) continue;
      const mid = [(p[0] + stake.u) / 2, p[1], (p[2] + stakeZ) / 2];
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
    s.material.map = t.kind === 'stake' || t.kind === 'anchor' ? markerTex.stake : (t.kind === 'guyTop' || t.kind === 'guyTie') ? markerTex.guy : markerTex.lash;
    const pulse = 1 + 0.12 * Math.sin(performance.now() / 260);
    const base = camMode === 'top' ? 0.055 : 0.05;
    s.scale.setScalar(base * pulse);
    if (picker.target && picker.target.id === t.id) s.scale.setScalar(base * 1.5);
  }
  for (let i = k; i < markerPool.length; i++) markerPool[i].visible = false;
}
function pickTarget(x, y) {
  let best = null, bd = 34;
  for (const t of targets) {
    const sp = toScreen(t.pos); if (!sp) continue;
    const d = Math.hypot(sp[0] - x, sp[1] - y);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}
function pickPole(x, y) {
  let best = null, bd = 26;
  for (const s of SLOTS) {
    const segs = poleSegs(s.id); if (!segs) continue;
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
  if (moved < 10 && performance.now() - down.t < 600) onTap(e.clientX, e.clientY);
  down = null;
});
function onTap(x, y) {
  if (G.falling) return;
  const t = pickTarget(x, y);
  if (t) return onTarget(t, x, y);
  if (G.stage === 'build') {
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
    case 'stake': {
      b.stakes[t.id] = (b.stakes[t.id] || 0) + 1;
      hammer(LEG_STAKES.find(s => s.id === t.id).u, stakeZ, stakeTopPos(LEG_STAKES.find(s => s.id === t.id))[1]);
      if (b.stakes[t.id] >= LEG_STAKE_HITS && G.sim && G.sim.angle() < 8) startSim(); // feet now rest against the stakes
      break;
    }
    case 'anchor': {
      b.anchors[t.id] = (b.anchors[t.id] || 0) + 1;
      const a = anchorPos(GUYS.find(g => g.id === t.id));
      hammer(a[0], a[2], ANCHOR_LEN - 0.25 * b.anchors[t.id] / ANCHOR_HITS);
      break;
    }
    case 'guyTop': {
      b.guyTop[t.id] = true;
      G.sim?.addGuy(GUYS.find(g => g.id === t.id));
      sfx.lash();
      break;
    }
    case 'guyTie': {
      G.sim.tieGuy(t.id); sfx.lash();
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
  running: '<svg viewBox="0 0 26 22"><path d="M1 5h24" stroke="currentColor" stroke-width="3"/><path d="M5 2v18M11 2v18M17 2v18M23 2v18" stroke="currentColor" stroke-width="2"/><path d="M2 9l22 0" stroke="#e0a93b" stroke-width="2"/></svg>',
  tripod: '<svg viewBox="0 0 26 22"><path d="M13 2L4 21M13 2v19M13 2l9 19" stroke="currentColor" stroke-width="3"/><circle cx="13" cy="5" r="3.5" fill="none" stroke="#e0a93b" stroke-width="2"/></svg>',
};
for (const id of LASHING_ORDER) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.dataset.type = id;
  btn.innerHTML = lashIcon[id] + `<span>${LASHINGS[id].he}</span>`;
  btn.addEventListener('click', () => chooseLashing(id));
  $('picker-opts').appendChild(btn);
}
$('picker-untie').addEventListener('click', () => {
  const t = picker.target; if (!t) return;
  if (t.kind === 'lashed') delete G.build.joints[t.id];
  closePicker(); refreshAll();
});
function jointLabel(t) {
  if (t.kind.startsWith('stake')) { const sj = STAKE_JOINTS.find(s => s.id === t.id); return `${slotById(sj.leg).he} אל הבז״נט`; }
  const j = JOINTS.find(q => q.id === t.id);
  const name = id => slotById(id).he.replace(/ \(.*\)/, '');
  return `${name(j.a)} × ${name(j.b)}`;
}
function openPicker(t, x, y) {
  picker.target = t;
  const el = picker.el;
  el.hidden = false;
  const cur = t.kind === 'lashed' ? G.build.joints[t.id] : t.kind === 'stakeLashed' ? G.build.stakeJoints[t.id] : null;
  $('picker-title').textContent = (cur ? 'החלפת כפיתה · ' : 'בחרו כפיתה · ') + jointLabel(t);
  for (const btn of $('picker-opts').children) btn.classList.toggle('cur', btn.dataset.type === cur);
  $('picker-untie').hidden = !(t.kind === 'lashed' && G.stage === 'build');
  const w = el.offsetWidth, h = el.offsetHeight;
  const W = window.innerWidth, H = window.innerHeight;
  let left = x - w / 2, top = y + 28;
  if (top + h > H - 50) top = y - h - 28;
  left = Math.max(8, Math.min(W - w - 8, left)); top = Math.max(50, Math.min(H - h - 8, top));
  el.style.left = left + 'px'; el.style.top = top + 'px';
}
function closePicker() { picker.el.hidden = true; picker.target = null; }
function chooseLashing(type) {
  const t = picker.target; if (!t) return;
  const b = G.build;
  if (t.kind === 'joint' || t.kind === 'lashed') {
    b.joints[t.id] = type;
    G.sim?.addJoint(JOINTS.find(j => j.id === t.id));
  } else {
    const fresh = !b.stakeJoints[t.id];
    b.stakeJoints[t.id] = type;
    if (fresh) G.sim?.tieStakeJoint(STAKE_JOINTS.find(s => s.id === t.id));
  }
  sfx.lash();
  closePicker(); refreshAll();
}

// ---------------- pole tray (drag a pole onto the drawing) ----------------
const trayPole = $('tray-pole');
let drag = null;
trayPole.addEventListener('pointerdown', e => {
  sfx.unlock(); startClock();
  trayPole.setPointerCapture(e.pointerId);
  drag = { slot: null };
  closePicker();
});
trayPole.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = groundAt(e.clientX, e.clientY);
  if (!p) return;
  const slot = nearestSlot(p.x, p.z);
  drag.slot = slot;
  const len = G.lastLength;
  if (slot) {
    const a = slotPoint(slot, -len / 2), b = slotPoint(slot, len / 2);
    placeCylinder(ghost, [a[0], 0.2, a[1]], [b[0], 0.2, b[1]]);
    const pa = slotPoint(slot, -slot.length / 2), pb = slotPoint(slot, slot.length / 2);
    slotGlow.visible = true;
    slotGlow.position.set((pa[0] + pb[0]) / 2, 0.01, (pa[1] + pb[1]) / 2);
    slotGlow.scale.set(slot.length, 1, 1);
    slotGlow.rotation.set(-Math.PI / 2, 0, Math.atan2(slot.dir[1], slot.dir[0]));
  } else {
    placeCylinder(ghost, [p.x - len / 2, 0.2, p.z], [p.x + len / 2, 0.2, p.z]);
    slotGlow.visible = false;
  }
});
function endDrag() {
  if (!drag) return;
  ghost.visible = false; slotGlow.visible = false;
  if (drag.slot) {
    G.build.poles[drag.slot.id] = { length: G.lastLength };
    sfx.thud();
    selectPole(drag.slot.id);
  } else if (drag.slot === null && drag.moved) {
    flashHint('שחררו את הסנדה על אחד הקווים הכחולים בשרטוט');
  }
  drag = null; refreshAll();
}
trayPole.addEventListener('pointerup', endDrag);
trayPole.addEventListener('pointercancel', () => { drag = null; ghost.visible = false; slotGlow.visible = false; });
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
function selectPole(sid) {
  if (G.selected) poleMeshes[G.selected].forEach(m => m.material[0].emissive?.setHex(0x000000));
  G.selected = sid;
  $('length-panel').hidden = !sid || G.stage !== 'build';
  if (sid) {
    poleMeshes[sid].forEach(m => m.material[0].emissive.setHex(0x5a3a00));
    updateLengthPanel();
  }
  refreshHint();
}
function updateLengthPanel() {
  const sid = G.selected; if (!sid) return;
  const slot = slotById(sid), pole = G.build.poles[sid];
  $('lp-name').textContent = slot.he;
  $('lp-value').textContent = pole.length.toFixed(1);
  $('lp-plan').textContent = slot.length.toFixed(1);
  $('lp-value').style.color = Math.abs(pole.length - slot.length) < 0.05 ? '#9be37f' : '';
}
function changeLength(steps) {
  const sid = G.selected; if (!sid || !steps) return;
  const pole = G.build.poles[sid];
  const nl = Math.round(Math.max(1.0, Math.min(4.0, pole.length + steps * 0.1)) * 10) / 10;
  if (nl === pole.length) return;
  pole.length = nl; G.lastLength = nl;
  // a lashing falls off if the pole no longer reaches the joint
  for (const j of JOINTS) if (G.build.joints[j.id] && !jointReachable(j, G.build.poles)) delete G.build.joints[j.id];
  sfx.tick();
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
    delete G.build.poles[sid];
    for (const j of JOINTS) if (j.a === sid || j.b === sid) delete G.build.joints[j.id];
    selectPole(null); refreshAll();
  });
}

// ---------------- rope pull ----------------
{
  const pad = $('rp-pad'); let on = false, lastY = 0, ropeOff = 0;
  pad.addEventListener('pointerdown', e => { sfx.unlock(); startClock(); on = true; lastY = e.clientY; pad.setPointerCapture(e.pointerId); });
  pad.addEventListener('pointermove', e => {
    if (!on || !G.sim || G.falling) return;
    const dy = e.clientY - lastY; lastY = e.clientY;
    if (dy <= 0) return;
    ropeOff += dy;
    $('rp-rope').style.backgroundPosition = `0 ${ropeOff}px`;
    G.sim.pullTo(G.sim.target + dy * 0.16);
  });
  pad.addEventListener('pointerup', () => { on = false; });
  pad.addEventListener('pointercancel', () => { on = false; });
}

// ---------------- hammer ----------------
let malletAnim = null;
function hammer(x, z, topY) {
  sfx.hammer();
  mallet.visible = true;
  malletAnim = { t: 0, x, z, y: topY };
}
function updateMallet(dt) {
  if (!malletAnim) return;
  malletAnim.t += dt;
  const k = malletAnim.t / 0.35;
  const swing = k < 0.5 ? -1.2 + 2.4 * k : 0 - (k - 0.5) * 1.6;
  mallet.position.set(malletAnim.x + 0.62, malletAnim.y - 0.55, malletAnim.z);
  mallet.rotation.set(0, 0, 1.0 + swing);
  if (k >= 1) { mallet.visible = false; malletAnim = null; }
}

// ---------------- action buttons and hints ----------------
function refreshActions() {
  const el = $('actions'); el.innerHTML = '';
  const add = (label, fn, primary = true) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tool' + (primary ? ' primary' : '');
    b.textContent = label; b.addEventListener('click', fn); el.appendChild(b);
  };
  if (G.falling || G.check?.running) return;
  if (G.stage === 'build' && SLOTS.every(s => G.build.poles[s.id]) && Object.keys(G.build.joints).length >= 1 && stageDone('build')) add('המשך לבז״נטים', () => goStage('stakes'));
  if (G.stage === 'stakes' && stageDone('stakes')) add('המשך להרמה', () => goStage('raise'));
  if (G.stage === 'anchor' && G.raisedOnce) add('לבדיקת היציבות', () => goStage('check'));
  if (G.stage === 'check' && !G.check) add('התחלת בדיקת יציבות', runCheck);
}
let flashUntil = 0;
function flashHint(html) { $('hint-text').innerHTML = html; flashUntil = performance.now() + 2600; }
function hintText() {
  const b = G.build, sim = G.sim;
  if (G.falling) return '<b>הקלף קורס…</b>';
  const nPoles = SLOTS.filter(s => b.poles[s.id]).length;
  const nJ = JOINTS.filter(j => b.joints[j.id]).length;
  switch (G.stage) {
    case 'build': {
      if (G.selected) {
        const sl = slotById(G.selected), p = b.poles[G.selected];
        if (Math.abs(p.length - sl.length) > 0.05) return `גללו את <b>פס האורך</b> עד שהסנדה תהיה באורך שבשרטוט (${sl.length.toFixed(1)} מ׳)`;
      }
      if (nPoles < 6) return `גררו <b>סנדה</b> מהמגש אל קו כחול בשרטוט · סנדות ${nPoles}/6`;
      if (nJ < 9) return `הקישו על <b>טבעת</b> במפגש סנדות ובחרו כפיתה · כפיתות ${nJ}/9`;
      return 'הקלף מוכן על הקרקע. המשיכו ל<b>דפיקת בז״נטים</b>';
    }
    case 'stakes': {
      const d = LEG_STAKES.filter(s => (b.stakes[s.id] || 0) >= LEG_STAKE_HITS).length;
      if (d < 2) return `הקישו על מקום הבז״נט ליד כל רגל, וכל הקשה היא מכת <b>למנייה</b> · בז״נטים ${d}/2`;
      return 'הבז״נטים בפנים. המשיכו ל<b>הרמה</b>';
    }
    case 'raise': {
      if (!sim) return '';
      const ang = sim.angle();
      const g = GUYS.filter(q => b.guyTop[q.id]).length;
      if (ang < 6 && g < 4) return `קשרו <b>יתרים</b> לראש הקלף: הקישו על הטבעות בראשי הרגליים · יתרים ${g}/4`;
      if (ang < 6) return 'החליקו את החבל <b>למטה</b> כדי למשוך. לאט ובשליטה';
      if (ang < 80) return 'ממשיכים למשוך, לאט ובשליטה…';
      if (ang <= 97) return '<b>עצרו!</b> הקלף ניצב';
      return '<b>הקלף עובר את האנך!</b>';
    }
    case 'anchor': {
      if (!G.raisedOnce) return 'קודם מרימים את הקלף (שלב 3)';
      const a = GUYS.filter(q => (b.anchors[q.id] || 0) >= ANCHOR_HITS).length;
      const t = GUYS.filter(q => sim?.guys[q.id]?.tied).length;
      const s = STAKE_JOINTS.filter(q => b.stakeJoints[q.id]).length;
      return `עגנו את הקלף: בז״נטי יתרים ${a}/4 · יתרים קשורים ${t}/4 · כפיתות רגל לבז״נט ${s}/4`;
    }
    case 'check':
      if (G.check?.running) return G.check.label || 'בדיקת יציבות…';
      if (!G.raisedOnce) return 'אין עדיין מה לבדוק: קודם מרימים את הקלף';
      return 'בבדיקה כולם עוזבים את מה שלא קשור, ודוחפים את הקלף מכל הכיוונים';
  }
  return '';
}
function refreshHint() { if (performance.now() > flashUntil) $('hint-text').innerHTML = hintText(); }
function refreshAll() { refreshChips(); refreshActions(); refreshHint(); }

// ---------------- clock ----------------
function startClock() { if (!G.startedAt) G.startedAt = performance.now(); }
function elapsed() { if (!G.startedAt) return 0; return ((G.endedAt || performance.now()) - G.startedAt) / 1000; }
function fmt(sec) { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; }

// ---------------- the push test ----------------
function runCheck() {
  if (!G.raisedOnce || !G.sim) return infoCard('אין עדיין מה לבדוק', 'קודם בונים את הקלף, דופקים בז״נטים ומרימים אותו.');
  G.sim.letGo();
  G.check = { t: 0, running: true, label: 'כולם עוזבים…' };
  refreshAll();
}
const PUSHES = [
  { from: 1.5, to: 3.5, f: [1, 0, 0], label: 'דוחפים את הקלף <b>שמאלה</b>' },
  { from: 4.0, to: 6.0, f: [-1, 0, 0], label: 'דוחפים את הקלף <b>ימינה</b>' },
  { from: 6.5, to: 7.7, f: [0, 0, 0.7], label: 'דוחפים <b>אחורה</b>' },
  { from: 8.2, to: 9.4, f: [0, 0, -0.7], label: 'דוחפים <b>קדימה</b>' },
];
function checkPush(dt) {
  const c = G.check; if (!c?.running) return null;
  c.t += dt;
  let push = null;
  c.label = 'כולם עוזבים…';
  for (const p of PUSHES) if (c.t >= p.from && c.t <= p.to) {
    const k = Math.min(1, (c.t - p.from) / 0.5, (p.to - c.t) / 0.3);
    push = p.f.map(v => v * TUNING.pushForce * Math.max(0, k));
    c.label = p.label;
  }
  if (c.t > 10.2) { c.running = false; finish(); }
  return push;
}

// ---------------- collapse watch ----------------
function watchSim(dt) {
  const sim = G.sim; if (!sim || G.falling) return;
  const ang = sim.angle(), top = sim.topCentre();
  if (ang > 82 && ang < 98) { G.uprightFor += dt; if (G.uprightFor > 1.0 && !G.raisedOnce) { G.raisedOnce = true; sfx.ok(); if (G.stage === 'raise') setTimeout(() => G.stage === 'raise' && !G.falling && goStage('anchor'), 900); refreshAll(); } }
  else G.uprightFor = 0;
  let kind = null;
  if (sim.baseSlid() > 0.35) kind = 'slid';
  else if (sim.rack() > 0.42) kind = 'rack';
  else if (ang > 122) kind = 'over';
  else if (G.raisedOnce && (top[1] < 1.4 || ang < 55)) kind = 'down';
  if (kind) {
    G.falling = { kind, t: 0, explain: explain(kind) };
    sim.flat = false;
    sfx.crash();
    closePicker(); refreshAll();
  }
}
function xComplete() {
  const b = G.build;
  const has = (d, j1, j2) => b.poles[d] && b.joints[j1] && b.joints[j2] && jointReachable(JOINTS.find(j => j.id === j1), b.poles) && jointReachable(JOINTS.find(j => j.id === j2), b.poles);
  return { A: has('diagA', 'J5', 'J6'), B: has('diagB', 'J7', 'J8') };
}
function explain(kind) {
  const sim = G.sim, b = G.build;
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
    return { rule: 'כל קלף צריך איקס מלא, כפי שהוא מופיע בשרטוט', detail };
  };
  if (kind === 'slid' || (!stakesIn && sim.baseSlid() > 0.2))
    return { rule: 'בז״נטים נדפקים ליד הרגליים לפני שמרימים את הקלף', detail: 'בלי בז״נטים, החבל גרר את רגלי הקלף על הקרקע והקלף לא נשאר במקומו.' };
  const cornerRule = { rule: 'כל פינה של הקלף נכפתת', detail: `חסרות ${corners} כפיתות בפינות הקלף, המסגרת התעקמה, והמחזיקים לא הצליחו להחזיק אותה.` };
  if (grip && (!x.A || !x.B)) return xRule();
  if (grip && corners) return cornerRule;
  if (grip)
    return { rule: 'מרימים לאט ובשליטה, ועוצרים כשהקלף ניצב', detail: `המשיכה הייתה חזקה מדי: ה${GUYS.find(g => g.id === grip.tag).he} נקרע מידי המחזיקים, והקלף עבר את האנך ונפל לכיוון המושכים.` };
  if (kind === 'over' && backGuys < 2)
    return { rule: 'קושרים 4 יתרים לראש הקלף לפני ההרמה', detail: 'בלי היתרים האחוריים אין מי שיעצור את הקלף כשהוא מגיע לאנך, והוא המשיך ונפל.' };
  if (kind === 'rack') {
    if (!x.A || !x.B) return xRule();
    if (corners) return cornerRule;
    return { rule: 'כל כפיתה בשרטוט נושאת עומס', detail: 'הקלף התעקם. בדקו בשרטוט שכל המפגשים כפותים.' };
  }
  if (G.check || sim.lettingGo) {
    const untied = GUYS.filter(g => !sim.guys[g.id]?.tied).length;
    if (untied) return { rule: 'לא עוזבים את הקלף לפני שכל 4 היתרים קשורים לבז״נטים', detail: `${untied} יתרים לא היו קשורים לבז״נט, וכשהמחזיקים עזבו הקלף נפל.` };
    if (!x.A || !x.B) return xRule();
    if (!stakesIn) return { rule: 'רגלי הקלף עומדות ליד בז״נטים ונכפתות אליהם', detail: 'בלי בז״נטים רגלי הקלף החליקו בבדיקת הדחיפה.' };
    return { rule: 'הקלף לא עמד בבדיקת הדחיפה', detail: 'בדקו את הכפיתות ואת היתרים ונסו שוב.' };
  }
  if (!x.A || !x.B) return xRule();
  if (kind === 'over') return { rule: 'עוצרים את המשיכה כשהקלף ניצב', detail: 'הקלף עבר את האנך ונפל לכיוון המושכים.' };
  return { rule: 'הקלף נפל', detail: 'בדקו שכל הכפיתות קשורות ושהיתרים מוחזקים.' };
}

// ---------------- results ----------------
function score() {
  const b = G.build;
  const all = [...JOINTS.map(j => [j, b.joints[j.id]]), ...STAKE_JOINTS.map(j => [j, b.stakeJoints[j.id]])];
  const total = all.length;
  const tied = all.filter(([, t]) => t).length;
  const correct = all.filter(([j, t]) => t === j.correct).length;
  const polesOk = SLOTS.filter(s => b.poles[s.id] && Math.abs(b.poles[s.id].length - s.length) < 0.05).length;
  const accuracy = Math.round(50 * tied / total + 30 * correct / total + 20 * polesOk / SLOTS.length);
  const sec = elapsed();
  const bonus = sec <= LEVEL.targetTimeSec ? 10 : 0;
  let stars = 1;
  if (tied === total) stars = 2;
  if (tied === total && correct === total && accuracy >= LEVEL.threeStarScore) stars = 3;
  // where the missing joints are: drawing sheet and height band, never the joint itself
  const groups = {};
  for (const [j, t] of all) if (!t) {
    const key = j.leg ? 'מפת בסיסים (רגליים לבז״נטים)' : `שרטוט הקלף, ${j.at[1] < 1.0 ? 'גובה 0–1 מ׳' : 'גובה 1–2 מ׳'}`;
    groups[key] = (groups[key] || 0) + 1;
  }
  return { total, tied, correct, polesOk, accuracy, bonus, sec, sum: accuracy + bonus, stars, groups, wrong: tied - correct };
}
function finish() {
  G.endedAt = performance.now();
  pushArrow.visible = false;
  const s = G.result = score();
  sfx.ok();
  const stars = [1, 2, 3].map(i => `<span class="${i <= s.stars ? 'on' : ''}">★</span>`).join('');
  const missing = Object.entries(s.groups).map(([k, n]) => `<li>${n === 1 ? 'כפיתה אחת חסרה' : `${n} כפיתות חסרות`}: ${k}</li>`).join('');
  showModal(`
    <div class="eyebrow">הקלף עמד בבדיקה</div>
    <h2>${s.stars === 3 ? 'בנייה מושלמת!' : 'עברתם את השלב'}</h2>
    <div class="stars">${stars}</div>
    <div class="score-grid">
      <span>כפיתות קשורות</span><b>${s.tied}/${s.total}</b>
      <span>סוג כפיתה נכון</span><b>${s.correct}/${s.total}</b>
      <span>סנדות באורך שבשרטוט</span><b>${s.polesOk}/${SLOTS.length}</b>
      <span>דיוק</span><b>${s.accuracy}</b>
      <span>בונוס זמן (${fmt(s.sec)})</span><b>+${s.bonus}</b>
      <span class="total">סה״כ</span><b class="total">${s.sum}</b>
    </div>
    ${missing ? `<p><b>איפה לחפש:</b></p><ul>${missing}</ul>` : ''}
    ${s.wrong ? `<p>${s.wrong === 1 ? 'כפיתה אחת קשורה' : `${s.wrong} כפיתות קשורות`} בסוג לא נכון. זה מוריד ניקוד, אבל לא מפיל את המבנה.</p>` : ''}
    ${s.stars < 3 ? '<p>אפשר לחזור, להשלים ולתקן, ולשפר את הכוכבים.</p>' : ''}
  `, [
    s.stars < 3 ? ['להשלים ולתקן', () => { closeModal(); G.check = null; G.result = null; G.endedAt = null; goStage('anchor'); }, true] : null,
    ['לבנות מחדש', restart, s.stars === 3],
  ].filter(Boolean));
  refreshAll();
}
function restart() {
  closeModal();
  G = freshState();
  for (const k in poleMeshes) poleMeshes[k].forEach(m => m.material[0].emissive.setHex(0));
  $('timer').textContent = '0:00';
  goStage('build');
  refreshAll();
}

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
  showModal(`
    <div class="eyebrow">מבחן מציאות</div>
    <h2>הקלף קרס</h2>
    <div class="rule">${e.rule}</div>
    <p>${e.detail}</p>
  `, [['חזרה לבנייה', () => {
    closeModal(); G.falling = null; G.check = null; lowerKlaf(); setPolesOpacity(1); goStage('build');
  }, true]]);
}
function setPolesOpacity(o) {
  for (const k in poleMeshes) for (const m of poleMeshes[k]) for (const mat of m.material) { mat.transparent = o < 1; mat.opacity = o; }
  for (const k in lashMeshes) lashMeshes[k].visible = lashMeshes[k].visible && o > 0.05;
}

// ---------------- structure folder (תיק מבנה) ----------------
const FOLDER_TABS = [
  ['drawing', 'שרטוט הקלף'], ['poles', 'רשימת סנדות'], ['order', 'סדר עבודה'], ['lashings', 'איזו כפיתה איפה'],
];
function openFolder(tab = 'drawing') {
  const tabs = $('folder-tabs'); tabs.innerHTML = '';
  for (const [id, he] of FOLDER_TABS) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = he; b.className = id === tab ? 'on' : '';
    b.addEventListener('click', () => openFolder(id)); tabs.appendChild(b);
  }
  const body = $('folder-body'); body.innerHTML = '';
  if (tab === 'drawing') {
    const c = document.createElement('canvas'); c.width = c.height = BP.size;
    drawBlueprint(c.getContext('2d'), { joints: JOINTS });
    body.appendChild(c);
  } else if (tab === 'poles') {
    body.innerHTML = `<table><thead><tr><th>סנדה</th><th>כמות</th><th>אורך</th></tr></thead><tbody>
      <tr><td>רגליים</td><td>2</td><td>2.0 מ׳</td></tr>
      <tr><td>רוחב (תחתון 30 ס״מ מעל הקרקע, עליון בגובה 1.9 מ׳)</td><td>2</td><td>2.0 מ׳</td></tr>
      <tr><td>אלכסונים (איקס)</td><td>2</td><td>2.6 מ׳</td></tr>
      <tr><td>בז״נטים לרגליים</td><td>2</td><td>1.0 מ׳</td></tr>
      <tr><td>בז״נטים ליתרים</td><td>4</td><td>0.6 מ׳</td></tr></tbody></table>
      <p class="note">המידות זמניות, עד שיגיעו שרטוטים אמיתיים.</p>`;
  } else if (tab === 'order') {
    body.innerHTML = `<ol>
      <li>בונים את הקלף שוכב על הקרקע, על גבי השרטוט.</li>
      <li>דופקים בז״נט ליד כל רגל, במקום שבו הרגליים יעמדו.</li>
      <li>קושרים 4 יתרים לראש הקלף.</li>
      <li>מרימים: המרימים מגביהים את הראש, והמושכים מושכים בחבל לאט ובשליטה עד שהקלף ניצב.</li>
      <li>דופקים בז״נטי יתרים כגובה הקלף מהרגליים (45°) וקושרים אליהם את היתרים.</li>
      <li>כופתים כל רגל לבז״נט שלה בשתי כפיתות.</li>
      <li>בדיקת יציבות: עוזבים ודוחפים מכל הכיוונים.</li></ol>`;
  } else {
    body.innerHTML = `<table><thead><tr><th>מפגש</th><th>כפיתה</th></tr></thead><tbody>
      <tr><td>שתי סנדות בזווית ישרה (רוחב על רגל)</td><td>כפיתה מרובעת</td></tr>
      <tr><td>סנדות בזווית אחרת (אלכסון על רגל, מרכז האיקס)</td><td>כפיתה מוצלבת</td></tr>
      <tr><td>סנדות זו לצד זו (רגל לבז״נט)</td><td>כפיתה מקבילה</td></tr>
      <tr><td>כמה סנדות מקבילות על תמיכה אחת (משטח)</td><td>כפיתה רצה</td></tr>
      <tr><td>שלוש סנדות קשורות בראש</td><td>כפיתת חצובה</td></tr></tbody></table>
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

// ---------------- per-frame drawing ----------------
function drawPoles() {
  for (const s of SLOTS) {
    const [m0, m1] = poleMeshes[s.id];
    const segs = poleSegs(s.id);
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
    g.visible = !G.falling || G.falling.t < 2.2;
    placeLashing(g, p, poleDir(j.a), poleDir(j.b));
  }
  for (const sj of STAKE_JOINTS) {
    const g = lashMeshes[sj.id];
    if (!b.stakeJoints[sj.id] || !G.sim || !G.sim.stakeCons[sj.id]) { g.visible = false; continue; }
    const p = legPoint(sj.leg, sj.v); if (!p) { g.visible = false; continue; }
    const st = LEG_STAKES.find(s => s.leg === sj.leg);
    g.visible = !G.falling || G.falling.t < 2.2;
    placeParallelLashing(g, p, [st.u, p[1], stakeZ], [0, 1, 0]);
  }
}
function drawStakes() {
  const b = G.build;
  for (const st of LEG_STAKES) {
    const m = stakeMeshes[st.id], hits = b.stakes[st.id] || 0;
    m.visible = hits > 0;
    const top = stakeTopPos(st)[1];
    m.position.set(st.u, top - LEG_STAKE_LEN, stakeZ);
  }
  for (const g of GUYS) {
    const m = stakeMeshes['A' + g.id], hits = b.anchors[g.id] || 0;
    m.visible = hits > 0;
    const a = anchorPos(g);
    m.position.set(a[0], -0.25 * Math.min(hits, ANCHOR_HITS) / ANCHOR_HITS, a[2]);
    m.rotation.x = g.side * 0.35; // anchor stakes lean away from the load
  }
}
function drawCrew() {
  const sim = G.sim, st = G.stage;
  for (const k in people) people[k].visible = false;
  for (const k in guyRopes) guyRopes[k].show(false);
  pullRope.show(false);
  if (!sim || (G.falling && G.falling.t > 2.2)) return;
  const ang = sim.angle();
  const holding = !sim.lettingGo;
  // pull rope and pullers
  if (sim.rope?.active && (st === 'raise' || st === 'anchor' || st === 'check')) {
    const t = sim.poleParticles.topH ? jointPosOf('topH', 0) : legTop('legL');
    const hand = sim.pos(sim.hand);
    if (t) pullRope.set(t, hand, sim.rope.force > 5 ? 0.02 : 0.25);
    const lean = sim.rope.force > 30 ? -0.35 : -0.1;
    place(people.pull1, [0.18, 0, hand[2] - 0.15], 0, lean, 1.2);
    place(people.pull2, [-0.15, 0, hand[2] - 0.75], 0, lean, 1.1);
  }
  // base holders keep the feet in place while it goes up
  if (holding && ang < 85 && (st === 'raise')) {
    place(people.baseL, [-0.9, 0, -0.65], 0, 0.25, 0.9);
    place(people.baseR, [0.9, 0, -0.65], 0, 0.25, 0.9);
  }
  // lifters carry the top until the rope takes over
  if (holding && sim.target > 0 && sim.target < 55 && ang < 60) {
    const tp = sim.topCentre();
    const reach = Math.min(Math.PI * 0.9, 0.6 + ang / 40);
    place(people.lift1, [0.5, 0, tp[2] + 0.3], Math.PI, 0.15, reach);
    place(people.lift2, [-0.5, 0, tp[2] + 0.3], Math.PI, 0.15, reach);
  }
  // guy lines
  for (const g of GUYS) {
    const con = sim.guys[g.id]; if (!con || !con.active) continue;
    const top = legTop(g.leg); if (!top) continue;
    const a = anchorPos(g);
    if (con.tied) {
      guyRopes[g.id].set(top, [a[0], 0.32, a[2] - g.side * 0.08], 0.02);
    } else {
      const holder = [a[0] * 1.15, 0, g.side * (GUY_DIST + 0.55)];
      place(people['guy' + g.id], holder, g.side > 0 ? Math.PI : 0, -0.15, 1.0);
      guyRopes[g.id].set(top, [holder[0], 1.05, holder[2] - g.side * 0.35], con.force > 5 ? 0.03 : 0.3);
    }
  }
}
function jointPosOf(sid, s) {
  const id = G.sim.findParticle(sid, s); if (id == null) return null;
  return add3(G.sim.pos(id), visNormal(), layerOff(slotById(sid)));
}
function place(p, pos, rotY, lean, reach) {
  p.visible = true; p.position.set(...pos); p.rotation.y = rotY; posePerson(p, lean, reach);
}
function drawGauge() {
  $('rope-panel').hidden = G.stage !== 'raise' || !!G.falling;
  if (!G.sim || G.stage !== 'raise') return;
  const ang = G.sim.angle();
  $('gauge-needle').style.transform = `rotate(${Math.max(-95, Math.min(95, ang - 90))}deg)`;
  $('gauge-val').textContent = Math.round(ang) + '°';
  $('gauge-label').textContent = ang < 6 ? 'שוכב' : ang < 82 ? 'עולה' : ang <= 97 ? 'ניצב' : 'עבר את האנך!';
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
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const sim = G.sim;
  let push = null;
  if (sim) {
    push = checkPush(dt);
    const wobble = !sim.lettingGo && (G.stage === 'raise' || G.stage === 'anchor');
    sim.step(dt, { wobble, push });
    watchSim(dt);
    if (G.falling) {
      G.falling.t += dt;
      if (G.falling.t > 2.2 && G.falling.t - dt <= 2.2) setPolesOpacity(0.35);
      if (G.falling.t > 2.6 && !G.falling.shown) { G.falling.shown = true; setPolesOpacity(0); collapseCard(); }
    }
  }
  drawPoles(); drawLashings(); drawStakes(); drawCrew(); drawGauge(); drawPushArrow(push);
  updateMallet(dt);
  collectTargets();
  updateCamera(dt);
  hintTimer += dt;
  if (hintTimer > 0.25) { hintTimer = 0; refreshHint(); $('timer').textContent = fmt(elapsed()); $('tray-count').textContent = `${SLOTS.filter(s => G.build.poles[s.id]).length}/6 על השרטוט`; }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
goStage('build');
requestAnimationFrame(frame);

// debug hook for automated tests
window.__game = { get state() { return G; }, goStage, chooseLashing, openPicker, onTarget, SLOTS, JOINTS, camera, toScreen, targets: () => targets };
