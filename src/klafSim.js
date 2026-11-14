// Turns the player's build (poles, lashings, stakes, guy lines) into a
// physics world, and runs the raise, anchoring and push test on it.
import { World } from './physics.js';
import { SLOTS, JOINTS, LEVEL, GUYS, GUY_DIST, LEG_STAKES, STAKE_JOINTS } from './level1.js';

// How a klaf sits on the plaza (see levels.js). Level 1: one klaf at z = 0.
export const SOLO_CFG = { z0: 0, frontDist: GUY_DIST, backDist: GUY_DIST, pullDist: GUY_DIST + 1.4, anchorX: { front: 1.05, back: 1.05 }, inner: 0 };

export const TUNING = {
  substeps: 30,
  knee: 4e-4,            // compliance of the square-lashing "stiffness" (racking resistance)
  diagBendCap: 60,       // N a diagonal carries in compression before it bows
  baseHoldCap: 120,      // N base holders can resist without stakes (feet on the ground)
  backGripCap: 340,      // N guy holders can hold before the rope slips out of their hands
  frontGripCap: Infinity, // the pullers do not let go of their own line
  guyCompliance: 2.5e-4, // holders' arms give a little
  gust: 45,              // N uneven-pull / wind wobble at the top while raising
  pushForce: 140,        // N push test at the top
  loadForce: 300,        // N the inspection's bucket of water on the top horizontal (about 30 kg)
  tiedGuyCompliance: 1e-5, // a guy line fixed to its stake stretches very little
  cubeGuyCompliance: 4e-4, // ... but a few centimetres under a push, which the cube's Xs take over
  sideDiagCap: 60,         // N a cube side diagonal carries in compression before its lashings slip
  cubeSwayLimit: 0.25,     // m the cube may lean in the push test before it counts as falling
};

const r = LEVEL.poleRadius;

export function slotById(id) { return SLOTS.find(s => s.id === id); }

// point on a pole slot at distance s from its centre (klaf coords)
export function slotPoint(slot, s) {
  return [slot.centre[0] + slot.dir[0] * s, slot.centre[1] + slot.dir[1] * s];
}
// distance along slot of a klaf-plane point
export function slotParam(slot, pt) {
  return (pt[0] - slot.centre[0]) * slot.dir[0] + (pt[1] - slot.centre[1]) * slot.dir[1];
}

// Can this joint be tied with the poles as placed?
export function jointReachable(joint, poles) {
  for (const sid of [joint.a, joint.b]) {
    const p = poles[sid]; if (!p) return false;
    const s = slotParam(slotById(sid), joint.at);
    if (Math.abs(s) > p.length / 2 - 0.04) return false;
  }
  return true;
}

// klaf plane -> world. angle 0 = lying flat (top towards +z), 90° = standing.
export function klafToWorld(u, v, angleDeg = 0, layer = 0) {
  const a = angleDeg * Math.PI / 180;
  const y = r + v * Math.sin(a);
  const z = v * Math.cos(a);
  return [u, y, z];
}

export class KlafSim {
  // world: pass a shared World to put several klafim (and the cube's side poles) in one simulation
  constructor(build, cfg = SOLO_CFG, world = null) {
    this.build = build;
    this.cfg = cfg;
    this.z0 = cfg.z0;
    const W = this.world = world || new World();
    this.poleParticles = {};   // slotId -> [{id, s}]
    this.jointCons = {};
    this.events = [];
    this.phase = 'ground';
    const pts = {};

    for (const slot of SLOTS) {
      const pole = build.poles[slot.id];
      if (!pole) continue;
      const half = pole.length / 2;
      const ss = new Set([-half, half]);
      for (const j of JOINTS) {
        if (j.a !== slot.id && j.b !== slot.id) continue;
        const s = slotParam(slot, j.at);
        if (Math.abs(s) <= half - 0.04) ss.add(round(s));
      }
      if (slot.id.startsWith('leg')) {
        for (const sj of STAKE_JOINTS) if (sj.leg === slot.id) { const s = sj.v - slot.centre[1]; if (Math.abs(s) <= half) ss.add(round(s)); }
        // points where the cube's side poles are lashed on (only in the cube's
        // shared world; extra points on a lone klaf would only soften its legs)
        for (const v of world ? cfg.extraLegV || [] : []) { const s = v - slot.centre[1]; if (Math.abs(s) <= half - 0.04) ss.add(round(s)); }
      }
      if (slot.id === 'topH' || slot.id.startsWith('diag')) ss.add(0);
      const list = [...ss].sort((x, y) => x - y);
      const mass = pole.length * LEVEL.kgPerMetre / list.length;
      const parts = list.map(s => {
        const [u, v] = slotPoint(slot, s);
        const pos = this.kw(u, v);
        if (slot.id.startsWith('diag') && Math.abs(s) < 1e-6) pos[1] += slot.id === 'diagA' ? 0.002 : -0.002;
        const id = W.addParticle(pos, mass, r);
        W.p[id].tag = slot.id;
        return { id, s };
      });
      this.poleParticles[slot.id] = parts;
      if (slot.id.startsWith('diag')) {
        // two rigid halves hinged at the centre, plus a bending limit
        const lo = parts.filter(q => q.s <= 1e-6), hi = parts.filter(q => q.s >= -1e-6);
        rigidAll(W, lo); rigidAll(W, hi);
        W.add('buckle', parts[0].id, parts[parts.length - 1].id, { cap: TUNING.diagBendCap, tag: 'bend:' + slot.id });
      } else {
        rigidAll(W, parts);
      }
    }

    // lashings in the klaf
    for (const j of JOINTS) if (build.joints[j.id]) this.addJoint(j, true);

    // feet of the legs: hinge on the stakes, or held only by people's feet
    this.feet = {};
    for (const st of LEG_STAKES) {
      const parts = this.poleParticles[st.leg]; if (!parts) continue;
      const foot = parts[0].id;
      const pos = [...W.p[foot].x];
      const anchor = W.addParticle(pos, 0);
      const driven = (build.stakes[st.id] || 0) >= 1;
      this.feet[st.leg] = driven
        ? W.add('weld', foot, anchor, { tag: 'foot:' + st.leg })
        : W.add('slide', foot, anchor, { cap: TUNING.baseHoldCap, origin: pos, tag: 'foot:' + st.leg });
    }

    // No rope on the middle of a pole: the pullers raise the klaf by the
    // front guy lines, the same lines that are later fixed to their stakes.
    this.target = 0;

    // guy lines tied to the top before the raise, held by people
    this.guys = {};
    for (const g of GUYS) if (build.guyTop[g.id] && this.manned(g)) this.addGuy(g);
    this.stakeCons = {};
    this.flat = true;
    this.collectFrame();
    const prev = W.onSubstep;
    W.onSubstep = h => { if (prev) prev(h); if (this.flat) this.keepFlat(); };
  }
  // klaf plane -> world, for this klaf's place on the plaza
  kw(u, v, angleDeg = 0) { const p = klafToWorld(u, v, angleDeg); p[2] += this.z0; return p; }
  guyDist(side) { return side > 0 ? this.cfg.backDist : this.cfg.frontDist; }
  anchorPos(g) {
    const u = slotById(g.leg).centre[0];
    return [u * this.cfg.anchorX[g.side > 0 ? 'back' : 'front'], 0, this.z0 + g.side * this.guyDist(g.side)];
  }
  // where the pullers' hands are, behind the front guy-line stake
  pullHand(u) { return [u * 1.1, 1.0, this.z0 - this.cfg.pullDist]; }

  // Put a klaf that was already raised and anchored straight back up, as it
  // stood (used to rebuild the cube's simulation, and after going back to an
  // earlier stage). Rotates every pole point from lying flat to upright.
  standUp() {
    const W = this.world;
    for (const sid in this.poleParticles) for (const q of this.poleParticles[sid]) {
      const P = W.p[q.id], v = P.x[2] - this.z0, h = P.x[1] - r;
      P.x = [P.x[0], r + v, this.z0 - h]; P.prev = [...P.x]; P.v = [0, 0, 0];
    }
    this.target = 90;
    this.flat = true;
    const b = this.build;
    for (const g of GUYS) if (b.guyTop[g.id] && (this.manned(g) || b.guyTies[g.id])) { this.addGuy(g); if (b.guyTies[g.id]) this.tieGuy(g.id); }
    for (const sj of STAKE_JOINTS) if (b.stakeJoints[sj.id]) this.tieStakeJoint(sj);
    for (const g of GUYS) if (b.guyOff?.[g.id] && this.guys[g.id]) { this.guys[g.id].active = false; this.guys[g.id].removed = true; }
  }

  // Poles held by two or more lashings form the frame. A lashed frame keeps
  // itself flat (poles clamped on each other); it can still rack in its own
  // plane, which is exactly what the X stops.
  collectFrame() {
    const count = {};
    for (const j of JOINTS) if (this.jointCons[j.id]) { count[j.a] = (count[j.a] || 0) + 1; count[j.b] = (count[j.b] || 0) + 1; }
    this.frameIds = [];
    for (const sid in this.poleParticles) {
      if ((count[sid] || 0) >= 2) for (const q of this.poleParticles[sid]) this.frameIds.push(q.id);
    }
  }
  keepFlat() {
    const L = this.poleParticles.legL, R = this.poleParticles.legR;
    if (!L || !R || this.frameIds.length < 6) return;
    const P = this.world.p;
    const a = P[L[0].id].x, b = P[R[0].id].x;
    const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const c = [0, 0, 0];
    for (const id of this.frameIds) { const x = P[id].x; c[0] += x[0]; c[1] += x[1]; c[2] += x[2]; }
    c[0] /= this.frameIds.length; c[1] /= this.frameIds.length; c[2] /= this.frameIds.length;
    const m = (c[0] + c[1] + c[2]) * 0 ; // keep linters quiet
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const up = [c[0] - mid[0], c[1] - mid[1], c[2] - mid[2]];
    let n = cross(ax, up); const nl = Math.hypot(n[0], n[1], n[2]); if (nl < 1e-6) return;
    n = [n[0] / nl, n[1] / nl, n[2] / nl];
    this.normal = n;
    for (const id of this.frameIds) {
      const q = P[id]; if (q.w === 0) continue;
      const x = q.x;
      const d = (x[0] - mid[0]) * n[0] + (x[1] - mid[1]) * n[1] + (x[2] - mid[2]) * n[2] + m;
      const k = 0.5;
      x[0] -= n[0] * d * k; x[1] -= n[1] * d * k; x[2] -= n[2] * d * k;
    }
  }

  addJoint(j, quiet = false) {
    if (this.jointCons[j.id] || !jointReachable(j, this.build.poles)) return false;
    const W = this.world;
    const pa = this.findParticle(j.a, slotParam(slotById(j.a), j.at));
    const pb = this.findParticle(j.b, slotParam(slotById(j.b), j.at));
    if (pa == null || pb == null) return false;
    this.jointCons[j.id] = W.add('weld', pa, pb, { tag: j.id });
    if (j.correct === 'square') {
      // a square lashing resists a little rotation, like a real one
      const na = this.neighbour(j.a, pa), nb = this.neighbour(j.b, pb);
      if (na != null && nb != null) W.add('rigid', na, nb, { compliance: TUNING.knee, tag: 'knee:' + j.id });
    }
    if (!quiet) this.collectFrame();
    return true;
  }

  // is someone on this guy line? (the player sends a scout to each line; with no crew plan, everyone is)
  manned(g) { const c = this.build.crew; return !c || c[g.id] != null || !!this.build.guyTies[g.id]; }
  // nobody on the line: it lies slack
  dropGuy(gid) { const con = this.guys[gid]; if (!con || con.tied) return; con.active = false; delete this.guys[gid]; }
  addGuy(g) {
    if (this.guys[g.id]) return false;
    const W = this.world;
    const parts = this.poleParticles[g.leg]; if (!parts) return false;
    const top = parts[parts.length - 1].id;
    const u = slotById(g.leg).centre[0];
    let con;
    if (g.side > 0) {
      // back guy line: holders pay it out and stop the klaf at upright
      // the holders pay the line out from a full klaf-height back, even when
      // its stake will stand closer (the cube's inner guy lines)
      const d = Math.max(this.guyDist(g.side), GUY_DIST);
      const holder = W.addParticle([u, 0.05, this.z0 + g.side * d], 0);
      const vertical = Math.hypot(LEVEL.height + r - 0.05, d);
      con = W.add('grip', top, holder, { rest: vertical + 0.03, compliance: TUNING.guyCompliance, cap: TUNING.backGripCap, tag: g.id });
    } else {
      // front guy line: the pullers' line, they stand behind its stake
      const holder = W.addParticle(this.pullHand(u), 0);
      con = W.add('grip', top, holder, { compliance: 5e-5, cap: TUNING.frontGripCap, tag: g.id });
      con.rest += 0.02;
      con.pull = true;
    }
    con.held = true;
    this.guys[g.id] = con;
    return true;
  }

  findParticle(sid, s) {
    const parts = this.poleParticles[sid]; if (!parts) return null;
    let best = null, bd = 0.03;
    for (const q of parts) { const d = Math.abs(q.s - s); if (d < bd) { bd = d; best = q.id; } }
    return best;
  }
  neighbour(sid, pid) {
    const parts = this.poleParticles[sid];
    const k = parts.findIndex(q => q.id === pid);
    const cand = [parts[k - 1], parts[k + 1]].filter(Boolean);
    if (!cand.length) return null;
    const s0 = parts[k].s;
    // pick the neighbour nearer the pole's middle, so the brace sits inside the corner
    cand.sort((a, b) => Math.abs(a.s) - Math.abs(b.s));
    return Math.abs(cand[0].s - s0) > 0.6 ? null : cand[0].id;
  }
  topParticle() {
    const t = this.poleParticles.topH;
    if (t) return t.find(q => Math.abs(q.s) < 1e-6).id;
    for (const leg of ['legL', 'legR']) { const p = this.poleParticles[leg]; if (p) return p[p.length - 1].id; }
    return null;
  }
  pos(id) { return this.world.p[id].x; }

  // where the top of the klaf is
  topCentre() {
    const ids = ['legL', 'legR'].map(l => this.poleParticles[l]).filter(Boolean).map(p => p[p.length - 1].id);
    if (!ids.length) { const t = this.topParticle(); return t == null ? [0, 0, 0] : this.pos(t); }
    const c = [0, 0, 0];
    for (const id of ids) { const x = this.pos(id); c[0] += x[0] / ids.length; c[1] += x[1] / ids.length; c[2] += x[2] / ids.length; }
    return c;
  }
  // raise angle in degrees (0 flat, 90 standing, >90 tipping over the pullers)
  angle() {
    const t = this.topCentre();
    return Math.atan2(t[1] - r, t[2] - this.z0) * 180 / Math.PI;
  }
  // sideways lean of the legs (racking), metres at the top
  rack() {
    let m = 0;
    for (const leg of ['legL', 'legR']) {
      const p = this.poleParticles[leg]; if (!p) continue;
      m = Math.max(m, Math.abs(this.pos(p[p.length - 1].id)[0] - this.pos(p[0].id)[0]));
    }
    return m;
  }
  baseSlid() {
    let m = 0;
    for (const k in this.feet) m = Math.max(m, this.feet[k].slid || 0);
    return m;
  }

  // The pullers walk the front guy lines in. We express the pull as the angle
  // the lines would bring the top to, so each swipe raises the klaf evenly.
  pullLines() { return Object.values(this.guys).filter(c => c.pull && c.held && c.active); }
  canPull() { return this.pullLines().length > 0; }
  pullTo(angleDeg) {
    const lines = this.pullLines();
    if (!lines.length) return;
    this.target = Math.min(angleDeg, 105);
    for (const con of lines) {
      const top = this.pos(con.i), h = this.pos(con.j);
      const p = this.kw(top[0], LEVEL.height, this.target);
      const want = Math.hypot(p[0] - h[0], p[1] - h[1], p[2] - h[2]) + 0.02;
      con.rest = Math.min(con.rest, want);
    }
  }

  // fix the guy line to its stake (the special guy-line-to-stake lashing)
  tieGuy(gid) {
    const g = GUYS.find(q => q.id === gid);
    if (!this.guys[gid]) this.addGuy(g); // a line nobody held can still be fixed to its stake
    const con = this.guys[gid]; if (!con) return false;
    const sp = this.anchorPos(g); sp[1] = 0.3;
    const stake = this.world.addParticle(sp, 0);
    const a = this.pos(con.i);
    con.j = stake;
    con.kind = 'rope'; con.cap = Infinity; con.compliance = TUNING.tiedGuyCompliance; con.held = false; con.tied = true; con.pull = false;
    con.rest = Math.max(Math.hypot(a[0] - sp[0], a[1] - sp[1], a[2] - sp[2]), 0.5);
    con.active = true;
    return true;
  }

  tieStakeJoint(sj) {
    const leg = this.poleParticles[sj.leg]; if (!leg) return;
    const stake = LEG_STAKES.find(s => s.leg === sj.leg);
    if ((this.build.stakes[stake.id] || 0) < 1) return;
    const pid = this.findParticle(sj.leg, sj.v - slotById(sj.leg).centre[1]); if (pid == null) return;
    const sp = this.world.addParticle([stake.u, sj.v + r, this.z0], 0);
    this.stakeCons[sj.id] = this.world.add('rigid', pid, sp, { rest: 0.09, compliance: 2e-4, tag: sj.id });
  }

  // final check: everyone lets go of what is not tied
  letGo() {
    this.lettingGo = true;
    for (const k in this.guys) { const c = this.guys[k]; if (!c.tied) { c.active = false; c.released = true; } }
    for (const k in this.feet) if (this.feet[k].kind === 'slide') this.feet[k].cap = 40;
  }

  brokenGrip() { return Object.values(this.guys).find(c => c.broke); }

  step(dt, extra = {}) {
    this.forces(extra);
    this.world.step(Math.min(dt, 1 / 30), TUNING.substeps);
  }
  // the people's forces on this klaf this frame (wobble, lifters, push test)
  forces(extra = {}) {
    const W = this.world;
    const ang = this.angle();
    // uneven pull and wind: a gentle side-to-side wobble once the klaf is up
    if (extra.wobble && ang > 35) {
      const f = TUNING.gust * Math.sin(W.time * 2 * Math.PI / 2.4) * Math.min(1, (ang - 35) / 30);
      for (const leg of ['legL', 'legR']) {
        const p = this.poleParticles[leg]; if (p) W.applyForce(p[p.length - 1].id, [f / 2, 0, 0]);
      }
    }
    // lifters (מרימים) carry the top by hand up to about shoulder height,
    // then the guy lines take over
    if (this.target > 0 && this.target <= 55 && !this.lettingGo) {
      for (const leg of ['legL', 'legR']) {
        const p = this.poleParticles[leg]; if (!p) continue;
        const id = p[p.length - 1].id, q = W.p[id];
        const goal = this.kw(q.x[0], LEVEL.height, Math.min(this.target, 50));
        const f = [0, 1, 2].map(k => 900 * (goal[k] - q.x[k]) - 120 * q.v[k]);
        const fl = Math.hypot(...f), cap = 420;
        if (fl > cap) for (let k = 0; k < 3; k++) f[k] *= cap / fl;
        W.applyForce(id, f);
      }
    }
    if (extra.push) {
      const t = this.topParticle();
      if (t != null) W.applyForce(t, extra.push);
    }
    // the inspection's load: a bucket of water hung from the middle of the top horizontal
    if (extra.load) {
      const t = this.topParticle();
      if (t != null) W.applyForce(t, [0, -extra.load, 0]);
    }
  }
  // height of the point the load hangs from
  loadY() { const t = this.topParticle(); return t == null ? 0 : this.pos(t)[1]; }
}

function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function round(x) { return Math.round(x * 1000) / 1000; }
function rigidAll(W, parts) {
  for (let a = 0; a < parts.length; a++)
    for (let b = a + 1; b < parts.length; b++)
      W.add('rigid', parts[a].id, parts[b].id, { tag: 'pole' });
}
