// The scouts on the plaza. Every character is an Actor: the game says where
// it is wanted (and in what pose), and the actor walks there, does the job,
// and walks back off when it is no longer wanted.
//
// CREW.waitAtSide: Omer is considering having the scouts always wait at the
// side of the plaza for instructions. Set it to true and idle scouts stand
// in a row at the side instead of walking off the plaza.
import * as THREE from 'three';
import { makePerson, posePerson, walkPose } from './scene.js';

export const CREW = { waitAtSide: false, speed: 7 };
const SIDE_X = 2.9;   // the waiting row, beside the drawing (left on screen)
const OFF_X = 9;      // where scouts walk off to (out of the camera's view)

export class Actor {
  constructor(scene, i, look = {}) {
    this.mesh = makePerson(i, look);
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.home = new THREE.Vector3(SIDE_X, 0, -1.6 + (i % 9) * 0.5);
    this.pos = this.idleSpot().clone();
    this.want = null;
    this.phase = i * 1.3;
    this.away = true;    // off the plaza and hidden
    this.busy = null;    // a job holding this scout (pole carry, post driving)
  }
  idleSpot() { return CREW.waitAtSide ? this.home : new THREE.Vector3(OFF_X, 0, this.home.z); }
  // pos: [x, y, z] (y below 0 means kneeling); yaw faces +z at 0
  set(pos, yaw = 0, lean = 0, reach = 0.3, opts = {}) {
    this.want = { pos: new THREE.Vector3(pos[0], pos[1] || 0, pos[2]), yaw, lean, reach, carry: opts.carry ?? null, snap: !!opts.snap };
  }
  clear() { this.want = null; }
  arrived() {
    if (!this.want) return false;
    return Math.hypot(this.want.pos.x - this.pos.x, this.want.pos.z - this.pos.z) < 0.03;
  }
  // where the hands are, roughly (for ropes and carried poles)
  hands(height = 0.62) {
    const yaw = this.mesh.rotation.y;
    return [this.pos.x + Math.sin(yaw) * 0.28, height, this.pos.z + Math.cos(yaw) * 0.28];
  }
  update(dt) {
    const w = this.want;
    if (w && this.away) {
      // coming onto the plaza: walk in from the idle spot, or step straight in for a close-up
      this.pos.copy(w.snap ? w.pos : this.idleSpot()); this.pos.y = 0;
      this.away = false;
    }
    const target = w ? w.pos : this.idleSpot();
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const m = this.mesh;
    if (dist > 0.03) {
      const step = Math.min(dist, CREW.speed * dt);
      this.pos.x += dx / dist * step; this.pos.z += dz / dist * step;
      this.phase += step * 5.5;
      m.visible = true;
      m.position.set(this.pos.x, 0, this.pos.z);
      m.rotation.y = Math.atan2(dx, dz);
      walkPose(m, this.phase, w ? w.carry : null);
      return;
    }
    if (w) {
      m.visible = true;
      m.position.set(this.pos.x, w.pos.y, this.pos.z);
      m.rotation.y = w.yaw;
      posePerson(m, w.lean, w.reach);
      return;
    }
    // idle
    if (CREW.waitAtSide) {
      m.visible = true;
      m.position.set(this.pos.x, 0, this.pos.z);
      m.rotation.y = -Math.PI / 2; // facing the work
      posePerson(m, 0, 0.15);
    } else {
      m.visible = false;
      this.away = true;
    }
  }
}

export function makeCrew(scene, n) {
  const list = [];
  for (let i = 0; i < n; i++) list.push(new Actor(scene, i));
  return list;
}
// a free scout for a job, nearest the spot first
export function freeActors(pool, k, near) {
  const free = pool.filter(a => !a.busy && !a.want);
  if (free.length < k) return null;
  if (near) free.sort((a, b) => a.pos.distanceTo(near) - b.pos.distanceTo(near));
  return free.slice(0, k);
}
