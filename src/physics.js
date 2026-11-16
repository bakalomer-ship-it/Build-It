// Small XPBD (extended position based dynamics) solver.
// Poles are chains of particles held rigid by distance constraints; lashings,
// ropes and stakes are extra constraints between particles. Static particles
// (invMass 0) stand for stakes and people's hands.

export const GRAVITY = -9.81;

export class World {
  constructor() {
    this.p = [];          // particles
    this.c = [];          // constraints
    this.forces = [];     // {i, f:[x,y,z]} external forces applied this frame
    this.groundY = 0;
    this.time = 0;
    this.damping = 0.6;   // 1/s, mild air and rope friction
    this.mu = 0.7;        // ground friction (share of a sliding step that the ground takes away)
    this.iterations = 1;  // constraint passes per substep (more for big structures with long load paths)
  }

  addParticle(pos, mass, radius = 0.04) {
    const id = this.p.length;
    this.p.push({
      x: [...pos], prev: [...pos], v: [0, 0, 0],
      w: mass > 0 ? 1 / mass : 0, r: radius, tag: null,
    });
    return id;
  }

  // kinds:
  //  'rigid'  : distance kept exactly (wood)
  //  'rope'   : only resists stretching (max length)
  //  'ratchet': rope that a person keeps reeling in (rest only shrinks)
  //  'buckle' : rigid in tension, gives way above `cap` newtons in compression
  //  'grip'   : rope held by hands, lets go above `cap` newtons
  //  'weld'   : two particles kept at the same point (a lashing)
  //  'slide'  : weld whose static end is dragged along above `cap` (friction)
  add(kind, i, j, opts = {}) {
    const a = this.p[i].x, b = this.p[j].x;
    const rest = opts.rest ?? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const con = {
      kind, i, j, rest, compliance: opts.compliance ?? 0, cap: opts.cap ?? Infinity,
      active: true, force: 0, peak: 0, broke: false, tag: opts.tag ?? null,
      slid: 0, origin: opts.origin ?? null,
    };
    this.c.push(con);
    return con;
  }

  applyForce(i, f) { this.forces.push({ i, f }); }

  step(dt, substeps = 30) {
    const h = dt / substeps;
    const P = this.p;
    const damp = Math.exp(-this.damping * h);
    for (let s = 0; s < substeps; s++) {
      for (const q of P) {
        if (q.w === 0) continue;
        q.v[1] += GRAVITY * h;
        q.v[0] *= damp; q.v[1] *= damp; q.v[2] *= damp;
      }
      for (const { i, f } of this.forces) {
        const q = P[i]; if (q.w === 0) continue;
        q.v[0] += f[0] * q.w * h; q.v[1] += f[1] * q.w * h; q.v[2] += f[2] * q.w * h;
      }
      for (const q of P) {
        q.prev[0] = q.x[0]; q.prev[1] = q.x[1]; q.prev[2] = q.x[2];
        if (q.w === 0) continue;
        q.x[0] += q.v[0] * h; q.x[1] += q.v[1] * h; q.x[2] += q.v[2] * h;
      }
      for (const con of this.c) con.acc = 0; // capped constraints give way per substep, however many passes
      for (let it = 0; it < this.iterations; it++) for (const con of this.c) if (con.active) this.solve(con, h);
      if (this.onSubstep) this.onSubstep(h);
      // ground contact with friction
      for (const q of P) {
        if (q.w === 0) continue;
        const floor = this.groundY + q.r;
        if (q.x[1] < floor) {
          q.x[1] = floor;
          const mu = this.mu;
          q.x[0] = q.prev[0] + (q.x[0] - q.prev[0]) * (1 - mu);
          q.x[2] = q.prev[2] + (q.x[2] - q.prev[2]) * (1 - mu);
        }
      }
      for (const q of P) {
        if (q.w === 0) continue;
        q.v[0] = (q.x[0] - q.prev[0]) / h;
        q.v[1] = (q.x[1] - q.prev[1]) / h;
        q.v[2] = (q.x[2] - q.prev[2]) / h;
      }
    }
    this.forces.length = 0;
    this.time += dt;
  }

  solve(con, h) {
    const A = this.p[con.i], B = this.p[con.j];
    const wSum = A.w + B.w;
    if (wSum === 0) return;
    const alpha = con.compliance / (h * h);
    const dx = A.x[0] - B.x[0], dy = A.x[1] - B.x[1], dz = A.x[2] - B.x[2];
    const d = Math.hypot(dx, dy, dz);

    if (con.kind === 'weld' || con.kind === 'slide') {
      if (d < 1e-9) { con.force = 0; return; }
      let dl = d / (wSum + alpha);            // magnitude of correction impulse
      let force = dl / (h * h);
      if (con.kind === 'slide' && force > con.cap) {
        // static end gets dragged: the base slides over the ground
        // B is the static hold point; A only gets pulled back by `cap`,
        // and the hold point follows A for the rest of the way.
        const keep = con.cap * h * h;
        const excess = Math.max(0, d - keep * A.w);
        const ux = dx / d, uz = dz / d;
        B.x[0] += ux * excess; B.x[2] += uz * excess;
        B.prev[0] = B.x[0]; B.prev[2] = B.x[2];
        con.slid = Math.hypot(B.x[0] - con.origin[0], B.x[2] - con.origin[2]);
        dl = keep; force = con.cap;
      }
      con.force = force;
      const nx = dx / d, ny = dy / d, nz = dz / d;
      A.x[0] -= nx * dl * A.w; A.x[1] -= ny * dl * A.w; A.x[2] -= nz * dl * A.w;
      B.x[0] += nx * dl * B.w; B.x[1] += ny * dl * B.w; B.x[2] += nz * dl * B.w;
      return;
    }

    if (d < 1e-9) return;
    let C = d - con.rest;
    if ((con.kind === 'rope' || con.kind === 'grip') && C <= 0) { con.force = 0; return; }
    if (con.kind === 'ratchet') {
      if (C < 0) { con.rest = d; con.force = 0; return; }
    }
    let dl = -C / (wSum + alpha);
    let force = Math.abs(dl) / (h * h);
    if (con.kind === 'buckle' && C < 0) {
      // in compression the pole carries at most `cap` newtons, then bows
      const left = Math.max(0, con.cap * h * h - con.acc);
      if (Math.abs(dl) > left) { dl = left * Math.sign(dl); force = con.cap; }
      con.acc += Math.abs(dl);
    }
    // smoothed force reading
    con.force = con.force * 0.9 + force * 0.1;
    if (con.force > con.peak) con.peak = con.force;
    if ((con.kind === 'grip' || con.kind === 'ratchet') && con.force > con.cap) {
      con.active = false; con.broke = true; return;
    }
    const nx = dx / d, ny = dy / d, nz = dz / d;
    A.x[0] += nx * dl * A.w; A.x[1] += ny * dl * A.w; A.x[2] += nz * dl * A.w;
    B.x[0] -= nx * dl * B.w; B.x[1] -= ny * dl * B.w; B.x[2] -= nz * dl * B.w;
  }
}
