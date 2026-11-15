// The cube (level 2): two klafim that were raised and anchored, put back up
// in one shared physics world, joined by the side poles the player lashes
// on, and braced by the spatial Xs (איקסים מרחביים).
import { World } from './physics.js';
import { KlafSim, TUNING, slotById } from './klafSim.js';
import { LEVEL, GUYS } from './level1.js';

const r = LEVEL.poleRadius;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const along = (c, d, s) => [c[0] + d[0] * s, c[1] + d[1] * s, c[2] + d[2] * s];

export function cubeSlotParam(slot, p) { return dot(sub(p, slot.centre), slot.dir); }
export function cubeSlotPoint(slot, s) { return along(slot.centre, slot.dir, s); }
// can this cube joint be tied with the side poles as placed?
export function cubeJointReachable(j, cube, poles) {
  for (const sid of j.b ? [j.a, j.b] : [j.a]) {
    const p = poles[sid]; if (!p) return false;
    const slot = cube.slots.find(s => s.id === sid);
    if (Math.abs(cubeSlotParam(slot, j.at)) > p.length / 2 - 0.04) return false;
  }
  return true;
}

export class CubeSim {
  // klafim: [{ build, cfg }]; cube: the level's cube plan; build: { poles, joints }
  constructor(klafim, cube, build) {
    this.cube = cube;
    this.build = build;
    const W = this.world = new World();
    W.iterations = 4; // the load runs through many lashings in a row: solve them more than once
    this.klafim = klafim.map(k => { const s = new KlafSim(k.build, k.cfg, W); s.standUp(); return s; });
    // guy lines are real ropes: they stretch under load, so a cube without its
    // spatial Xs sways on them, while a braced cube stays put
    for (const k of this.klafim) for (const g in k.guys) if (k.guys[g].tied) k.guys[g].compliance = TUNING.cubeGuyCompliance;
    this.poleParticles = {};
    this.jointCons = {};
    const mass = LEVEL.kgPerMetre;
    for (const slot of cube.slots) {
      const pole = build.poles[slot.id]; if (!pole) continue;
      const half = pole.length / 2;
      const ss = new Set([-half, half]);
      for (const j of cube.joints) {
        if (j.a !== slot.id && j.b !== slot.id) continue;
        const s = cubeSlotParam(slot, j.at);
        if (Math.abs(s) <= half - 0.04) {
          ss.add(Math.round(s * 1000) / 1000);
          // a point a little way in from each square lashing, for its corner stiffness
          if (j.correct === 'square') ss.add(Math.round((s - Math.sign(s) * 0.3) * 1000) / 1000);
        }
      }
      if (slot.kind === 'd') ss.add(0);
      const list = [...ss].sort((a, b) => a - b);
      const parts = list.map(s => {
        const pos = cubeSlotPoint(slot, s);
        if (slot.kind === 'd' && Math.abs(s) < 1e-6) pos[0] += slot.id.includes('dA') ? 0.002 : -0.002;
        const id = W.addParticle(pos, pole.length * mass / list.length, r);
        W.p[id].tag = slot.id;
        return { id, s };
      });
      this.poleParticles[slot.id] = parts;
      // until a side pole is lashed at two points, scouts hold it in its place
      for (const q of parts) { const P = W.p[q.id]; P.heldW = P.w; P.w = 0; }
      // side poles are straight and stiff; the cube's bracing comes from the spatial Xs
      rigidAll(W, parts);
    }
    this.braces = {};
    for (const j of cube.joints) if (build.joints[j.id]) this.addJoint(j);
    this.releaseHeld();
    // joined into a cube, the klafim are held square by the side poles, not by keeping themselves flat
    if (cube.unflatten !== false) for (const k of this.klafim) k.flat = false;
  }

  slot(id) { return this.cube.slots.find(s => s.id === id); }
  findParticle(sid, s) {
    const parts = this.poleParticles[sid]; if (!parts) return null;
    let best = null, bd = 0.03;
    for (const q of parts) { const d = Math.abs(q.s - s); if (d < bd) { bd = d; best = q.id; } }
    return best;
  }
  pos(id) { return this.world.p[id].x; }
  // the leg point of a klaf where a side pole is lashed
  legParticle(j) {
    const k = this.klafim[j.klaf];
    const leg = k.poleParticles[j.leg]; if (!leg) return null;
    return k.findParticle(j.leg, j.v - slotById(j.leg).centre[1]);
  }
  addJoint(j) {
    if (this.jointCons[j.id] || !cubeJointReachable(j, this.cube, this.build.poles)) return false;
    const W = this.world;
    const pa = this.findParticle(j.a, cubeSlotParam(this.slot(j.a), j.at));
    const pb = j.b ? this.findParticle(j.b, cubeSlotParam(this.slot(j.b), j.at)) : this.legParticle(j);
    if (pa == null || pb == null) return false;
    const diag = this.slot(j.a).kind === 'd';
    // a diagonal's lashings only hold it in place; what braces the cube is the
    // diagonal running from leg to leg, added below once both its ends are lashed
    this.jointCons[j.id] = W.add('weld', pa, pb, { tag: j.id, compliance: diag ? 2e-3 : 0 });
    if (diag && !j.b) this.addBrace(j.a);
    this.releaseHeld();
    if (j.correct === 'square' && !j.b) {
      // a square lashing resists a little rotation, like a real one
      const parts = this.poleParticles[j.a];
      const k = parts.findIndex(q => q.id === pa);
      const n = parts[k + (parts[k].s < 0 ? 1 : -1)];
      const kl = this.klafim[j.klaf].poleParticles[j.leg];
      const m = kl.findIndex(q => q.id === pb);
      const legN = kl[m + (m > 0 ? -1 : 1)];
      const near = (a, b) => a && b && Math.abs(a.s - b.s) < 0.6;
      if (near(n, parts[k]) && near(legN, kl[m])) W.add('rigid', n.id, legN.id, { compliance: TUNING.knee, tag: 'knee:' + j.id });
    }
    return true;
  }
  // A diagonal lashed to a leg at both ends braces the side: it holds
  // firmly when it is pulled, but its lashings slip when it is pushed hard
  // (diagonals are weak in compression), so a side needs a full X.
  addBrace(sid) {
    if (this.braces[sid]) return;
    const ends = this.cube.joints.filter(q => q.a === sid && !q.b && this.jointCons[q.id]);
    if (ends.length < 2) return;
    const [p1, p2] = ends.map(q => this.legParticle(q));
    if (p1 == null || p2 == null) return;
    this.braces[sid] = this.world.add('buckle', p1, p2, { cap: TUNING.sideDiagCap, tag: 'brace:' + sid });
  }
  // A structure built against the plan doesn't pass the check: its Xs work loose.
  // The braces stop holding and the diagonals' lashings go slack (they stay on, but
  // no longer stiffen anything), so the structure racks on its corner lashings.
  unbrace() {
    for (const id in this.braces) this.braces[id].active = false;
    for (const j of this.cube.joints) {
      const con = this.jointCons[j.id];
      if (con && this.slot(j.a).kind === 'd') con.compliance = TUNING.looseCompliance;
    }
    this.unbraced = true;
  }
  // the last part of the check: the outer guy lines come down too, and a
  // braced cube has to stand by itself on its staked legs
  releaseAllGuys() { for (const k of this.klafim) for (const g in k.guys) { k.guys[g].active = false; k.guys[g].released = true; } }
  // inner guy lines come down once the cube is braced
  removeGuy(k, gid) {
    const con = this.klafim[k].guys[gid]; if (!con) return;
    con.active = false; con.removed = true;
  }
  letGo() { for (const k of this.klafim) k.letGo(); this.lettingGo = true; this.releaseHeld(true); }
  // a side pole lashed at two points (or everything, when the scouts let go) is on its own
  releaseHeld(all = false) {
    for (const sid in this.poleParticles) {
      const n = this.cube.joints.filter(j => (j.a === sid || j.b === sid) && this.jointCons[j.id]).length;
      if (!all && n < 2) continue;
      for (const q of this.poleParticles[sid]) { const P = this.world.p[q.id]; if (P.heldW != null) { P.w = P.heldW; P.heldW = null; P.prev = [...P.x]; } }
    }
  }

  // the cube leaning forward or back as a whole (the side faces racking)
  sway() {
    let m = 0;
    for (const k of this.klafim) for (const leg of ['legL', 'legR']) {
      const p = k.poleParticles[leg]; if (!p) continue;
      m = Math.max(m, Math.abs(this.pos(p[p.length - 1].id)[2] - this.pos(p[0].id)[2]));
    }
    return m;
  }
  rack() { return Math.max(...this.klafim.map(k => k.rack())); }
  baseSlid() { return Math.max(...this.klafim.map(k => k.baseSlid())); }
  lowestTop() { return Math.min(...this.klafim.map(k => k.topCentre()[1])); }
  brokenGrip() { for (const k of this.klafim) { const g = k.brokenGrip(); if (g) return g; } return null; }

  step(dt, extra = {}) {
    // the push test pushes the top of the whole cube: half on each klaf
    const push = extra.push ? extra.push.map(v => v / this.klafim.length) : null;
    for (const k of this.klafim) k.forces({ push, load: extra.load });
    this.world.step(Math.min(dt, 1 / 30), TUNING.substeps);
  }
}

function rigidAll(W, parts) {
  for (let a = 0; a < parts.length; a++)
    for (let b = a + 1; b < parts.length; b++)
      W.add('rigid', parts[a].id, parts[b].id, { tag: 'pole' });
}
export { GUYS };
