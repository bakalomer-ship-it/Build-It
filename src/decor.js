// The camp around the building ground: scout things made the way scouts make them,
// from poles and rope. A gate with bunting, a path edged with whitewashed stones, a
// flag mast, a lookout tower, a campfire circle, a camp table, a pole stack and a
// signpost. Everything stands at the edges of the plaza, away from where structures
// are built and from the corners where finished structures are kept.
import * as THREE from 'three';
import { PLAZA } from './scene.js';

const wood = new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.9 });
const woodDark = new THREE.MeshStandardMaterial({ color: 0x6f4722, roughness: 0.95 });
const rope = new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 0.95 });
const white = new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.9, flatShading: true });
const stone = new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 1, flatShading: true });
const cyl = new THREE.CylinderGeometry(1, 1, 1, 7);
const UP = new THREE.Vector3(0, 1, 0), V = new THREE.Vector3();

// a pole from a to b
function stick(g, a, b, r = 0.055, mat = wood) {
  const m = new THREE.Mesh(cyl, mat);
  V.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = V.length();
  m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(UP, V.normalize());
  m.scale.set(r, len, r);
  g.add(m); return m;
}
// rope coils where two poles are lashed
function knot(g, p, r = 0.075) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), rope);
  m.position.set(...p); m.scale.set(1, 1.25, 1); g.add(m); return m;
}
function textTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const paint = () => draw(c.getContext('2d'), w, h);
  paint();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (document.fonts?.ready) document.fonts.ready.then(() => { paint(); t.needsUpdate = true; });
  return t;
}
const board = (g, w, h, text, pos, rotY = 0, size = 0.62) => {
  const tex = textTexture(512, Math.round(512 * h / w), (c, W, H) => {
    c.fillStyle = '#b98850'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(90,55,20,.35)'; c.lineWidth = 3;
    for (let y = H / 3; y < H; y += H / 3) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.strokeStyle = '#5a3716'; c.lineWidth = 10; c.strokeRect(5, 5, W - 10, H - 10);
    c.fillStyle = '#3b2410'; c.font = `800 ${Math.round(H * size)}px Rubik, Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl';
    c.fillText(text, W / 2, H / 2 + 4);
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), [woodDark, woodDark, woodDark, woodDark, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })]);
  m.position.set(...pos); m.rotation.y = rotY; g.add(m); return m;
};
const BUNTING = [0xd9482b, 0xf2b632, 0x2f7d32, 0x2f63b0, 0xf4f1e6];
// a string of little triangular flags from a to b, sagging in the middle
function bunting(g, a, b, n = 9, sag = 0.35) {
  const pt = k => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - sag * 4 * k * (1 - k), a[2] + (b[2] - a[2]) * k];
  for (let i = 0; i < n; i++) stick(g, pt(i / n), pt((i + 1) / n), 0.012, rope);
  const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]) - Math.PI / 2;
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, 0, -0.32, 0], 3)); tri.computeVertexNormals();
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(tri, new THREE.MeshStandardMaterial({ color: BUNTING[i % BUNTING.length], roughness: 0.8, side: THREE.DoubleSide }));
    m.position.set(...pt((i + 0.5) / n)); m.rotation.y = yaw; g.add(m);
  }
}

// ---- the camp gate: two lashed towers, a beam, a sign and bunting ----
function gate() {
  const g = new THREE.Group(), H = 3.6, half = 2.6;
  for (const s of [-1, 1]) {
    const x0 = s * half, x1 = s * (half + 0.9);
    stick(g, [x0, 0, 0], [x0, H, 0], 0.07); stick(g, [x1, 0, 0], [x1 - s * 0.25, H - 0.5, 0], 0.07);
    stick(g, [x0, 0.5, 0], [x1 - s * 0.2, 2.6, 0], 0.05); stick(g, [x1 - s * 0.03, 0.5, 0], [x0, 2.6, 0], 0.05);
    stick(g, [x0 - s * 0.15, 0.45, 0.07], [x1 + s * 0.15, 0.45, 0.07], 0.05); stick(g, [x0 - s * 0.15, 2.7, 0.07], [x1 + s * 0.1, 2.7, 0.07], 0.05);
    for (const p of [[x0, 0.45, 0.04], [x1, 0.45, 0.04], [x0, 2.7, 0.04], [x1 - s * 0.2, 2.7, 0.04], [x0, H - 0.25, 0]]) knot(g, p);
  }
  stick(g, [-half - 0.5, H - 0.25, -0.08], [half + 0.5, H - 0.25, -0.08], 0.065);
  stick(g, [-half - 0.3, H - 1.15, -0.08], [half + 0.3, H - 1.15, -0.08], 0.05);
  board(g, 3.2, 0.7, 'ברוכים הבאים למחנה', [0, H - 0.7, -0.16], Math.PI, 0.5);
  bunting(g, [-half, H - 1.2, -0.12], [half, H - 1.2, -0.12], 11, 0.3);
  return g;
}
// ---- the flag mast: a tall pole on a lashed base, with guy lines ----
function mast(tick) {
  const g = new THREE.Group(), H = 6.2;
  stick(g, [0, 0, 0], [0, H, 0], 0.06);
  for (const d of [0, 120, 240]) {
    const a = d * Math.PI / 180, f = [Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0];
    stick(g, f, [Math.cos(a) * 0.05, 1.7, Math.sin(a) * 0.05], 0.05);
    stick(g, [Math.cos(a) * 2.6, 0.05, Math.sin(a) * 2.6], [0, 4.2, 0], 0.012, rope);
    stick(g, [Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6], [Math.cos(a) * 2.75, 0.3, Math.sin(a) * 2.75], 0.035, woodDark);
  }
  knot(g, [0, 1.7, 0], 0.11); knot(g, [0, 4.2, 0], 0.07);
  // the flag: blue and white, waving
  const tex = textTexture(330, 240, (c, W, Hh) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, Hh);
    c.fillStyle = '#1f4fb4'; c.fillRect(0, Hh * 0.12, W, Hh * 0.13); c.fillRect(0, Hh * 0.75, W, Hh * 0.13);
    c.strokeStyle = '#1f4fb4'; c.lineWidth = 9; c.lineJoin = 'miter';
    const cx = W / 2, cy = Hh / 2, R = Hh * 0.17;
    for (const flip of [1, -1]) { c.beginPath(); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 * flip + i * 2 * Math.PI / 3; c[i ? 'lineTo' : 'moveTo'](cx + R * Math.cos(a), cy + R * Math.sin(a)); } c.closePath(); c.stroke(); }
  });
  const geo = new THREE.PlaneGeometry(1.65, 1.2, 12, 4);
  const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }));
  flag.position.set(0.9, H - 0.75, 0); flag.castShadow = true; g.add(flag);
  const base = geo.attributes.position.array.slice();
  tick.push(t => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = base[i * 3] + 0.825; p.setZ(i, Math.sin(x * 4.2 - t * 4.5) * 0.11 * x + Math.sin(x * 2 - t * 2.3) * 0.05 * x); }
    p.needsUpdate = true;
  });
  // a pennant under it
  const pen = new THREE.BufferGeometry();
  pen.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.22, 0, 0, -0.22, 0, 0.95, 0, 0], 3)); pen.computeVertexNormals();
  const pm = new THREE.Mesh(pen, new THREE.MeshStandardMaterial({ color: 0x2f7d32, roughness: 0.8, side: THREE.DoubleSide }));
  pm.position.set(0.07, H - 1.75, 0); g.add(pm);
  tick.push(t => { pm.rotation.y = Math.sin(t * 2.6) * 0.3; });
  return g;
}
// ---- the lookout tower ----
function tower() {
  const g = new THREE.Group(), H = 5.2, a = 1.0, top = 0.75, deck = 3.6;
  const leg = (sx, sz, y) => { const k = y / H; return [sx * (a - (a - top) * k), y, sz * (a - (a - top) * k)]; };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) stick(g, leg(sx, sz, 0), leg(sx, sz, H), 0.075);
  corners.forEach(([sx, sz], i) => {
    const [nx, nz] = corners[(i + 1) % 4];
    for (const y of [0.5, deck, deck + 1.0]) { stick(g, leg(sx, sz, y), leg(nx, nz, y), 0.05); knot(g, leg(sx, sz, y), 0.08); }
    stick(g, leg(sx, sz, 0.6), leg(nx, nz, deck - 0.15), 0.045); stick(g, leg(nx, nz, 0.6), leg(sx, sz, deck - 0.15), 0.045);
  });
  // the deck, and a roof of canvas
  for (let i = -3; i <= 3; i++) stick(g, [i * 0.25, deck + 0.07, -0.95], [i * 0.25, deck + 0.07, 0.95], 0.05, woodDark);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.9, 4), new THREE.MeshStandardMaterial({ color: 0x8f8a5a, roughness: 0.95, flatShading: true }));
  roof.position.y = H + 0.4; roof.rotation.y = Math.PI / 4; g.add(roof);
  // the ladder
  const l0 = [-0.25, 0, -1.55], l1 = [-0.25, deck, -0.92], r0 = [0.25, 0, -1.55], r1 = [0.25, deck, -0.92];
  stick(g, l0, l1, 0.04); stick(g, r0, r1, 0.04);
  for (let i = 1; i <= 9; i++) { const k = i / 10; stick(g, [-0.3, deck * k, -1.55 + 0.63 * k], [0.3, deck * k, -1.55 + 0.63 * k], 0.03); }
  return g;
}
// ---- the campfire circle ----
function campfire(tick) {
  const g = new THREE.Group();
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2, s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), stone);
    s.position.set(Math.cos(a) * 0.78, 0.1, Math.sin(a) * 0.78); s.rotation.set(a, a * 2, 0); s.scale.y = 0.75; g.add(s);
  }
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; stick(g, [Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5], [Math.cos(a) * -0.06, 0.75, Math.sin(a) * -0.06], 0.055, woodDark); }
  const flames = [[0.32, 0.95, 0xff8a1e], [0.22, 0.75, 0xffc531], [0.13, 0.5, 0xfff0a0]].map(([r, h, c], i) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.92 }));
    m.position.y = 0.25 + h / 2; m.userData = { h, i }; g.add(m); return m;
  });
  tick.push(t => flames.forEach(m => {
    const k = 1 + 0.16 * Math.sin(t * (9 + m.userData.i * 3.1) + m.userData.i) + 0.08 * Math.sin(t * 17.3 + m.userData.i * 2);
    m.scale.set(1 + 0.08 * Math.sin(t * 11 + m.userData.i), k, 1); m.position.y = 0.25 + m.userData.h * k / 2; m.rotation.y = t * (1 + m.userData.i);
  }));
  // log benches around it
  for (const d of [20, 110, 200, 290]) {
    const a = d * Math.PI / 180, c = [Math.cos(a) * 2.1, 0, Math.sin(a) * 2.1], tx = -Math.sin(a), tz = Math.cos(a);
    stick(g, [c[0] - tx * 0.95, 0.36, c[2] - tz * 0.95], [c[0] + tx * 0.95, 0.36, c[2] + tz * 0.95], 0.15, woodDark);
    for (const k of [-0.6, 0.6]) stick(g, [c[0] + tx * k - Math.cos(a) * 0.22, 0.1, c[2] + tz * k - Math.sin(a) * 0.22], [c[0] + tx * k + Math.cos(a) * 0.22, 0.1, c[2] + tz * k + Math.sin(a) * 0.22], 0.11, wood);
  }
  // a pot hanging over the fire from a tripod
  for (const d of [90, 210, 330]) { const a = d * Math.PI / 180; stick(g, [Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05], [Math.cos(a) * -0.06, 1.95, Math.sin(a) * -0.06], 0.04); }
  knot(g, [0, 1.85, 0], 0.09);
  stick(g, [0, 1.8, 0], [0, 1.25, 0], 0.01, rope);
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, Math.PI * 0.35), new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.6, metalness: 0.4 }));
  pot.position.y = 1.2; g.add(pot);
  return g;
}
// ---- a camp table with two benches, lashed from poles ----
function table() {
  const g = new THREE.Group(), L = 2.0;
  for (const z of [-L / 2 + 0.2, L / 2 - 0.2]) {
    stick(g, [-0.95, 0, z], [0.35, 0.95, z], 0.05); stick(g, [0.95, 0, z], [-0.35, 0.95, z], 0.05);
    stick(g, [-1.05, 0.42, z + 0.06], [1.05, 0.42, z + 0.06], 0.045); knot(g, [0, 0.68, z], 0.08);
  }
  for (let i = -3; i <= 3; i++) stick(g, [i * 0.1, 0.93, -L / 2], [i * 0.1, 0.93, L / 2], 0.05, i % 2 ? wood : woodDark);
  for (const x of [-0.95, 0.95]) for (const dx of [-0.08, 0.08]) stick(g, [x + dx, 0.47, -L / 2], [x + dx, 0.47, L / 2], 0.05, woodDark);
  return g;
}
// ---- spare poles on bearers, and coils of rope ----
function stack() {
  const g = new THREE.Group();
  for (const z of [-1.1, 1.1]) stick(g, [-0.6, 0.07, z], [0.6, 0.07, z], 0.07, woodDark);
  [[-0.36, 0.2], [-0.12, 0.2], [0.12, 0.2], [0.36, 0.2], [-0.24, 0.4], [0, 0.4], [0.24, 0.4], [-0.12, 0.6], [0.12, 0.6]].forEach(([x, y], i) => stick(g, [x, y, -1.7 - (i % 3) * 0.12], [x, y, 1.7 + (i % 2) * 0.2], 0.058, i % 3 ? wood : woodDark));
  for (const [x, z, n] of [[1.2, -0.6, 4], [1.45, 0.2, 3], [1.05, 0.75, 5]]) for (let i = 0; i < n; i++) {
    const c = new THREE.Mesh(new THREE.TorusGeometry(0.24 - i * 0.012, 0.035, 6, 16), rope);
    c.rotation.x = Math.PI / 2; c.position.set(x, 0.04 + i * 0.06, z); g.add(c);
  }
  return g;
}
// ---- a signpost ----
function signpost() {
  const g = new THREE.Group();
  stick(g, [0, 0, 0], [0, 2.5, 0], 0.06);
  board(g, 1.25, 0.3, 'מגרש בנייה ←', [0.2, 2.2, 0.07], 0, 0.6);
  board(g, 1.05, 0.3, '→ מדורה', [-0.15, 1.82, 0.07], 0.25, 0.6);
  board(g, 1.05, 0.3, 'מגדל תצפית ←', [0.15, 1.44, 0.07], -0.2, 0.55);
  return g;
}

// Returns a function to call every frame with the time in seconds (the flag and the fire move).
export function makeDecor(scene) {
  const tick = [], all = new THREE.Group();
  const put = (g, x, z, yaw = 0) => { g.position.set(x, 0, z); g.rotation.y = yaw; all.add(g); return g; };
  const zFar = PLAZA.cz + PLAZA.d / 2, zNear = PLAZA.cz - PLAZA.d / 2;
  put(gate(), 0, zFar - 0.4);
  // the way in from the gate, edged with whitewashed stones
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), white);
    m.position.set(s * (1.5 + 0.04 * Math.sin(i * 7.3)), 0.09, zFar - 0.9 - i * 0.62); m.rotation.set(i, i * 1.7, 0); m.scale.y = 0.7; all.add(m);
  }
  put(mast(tick), -5.2, zFar - 2.6);
  put(tower(), PLAZA.w / 2 - 2.2, zFar - 2.4, 0.5);
  put(campfire(tick), PLAZA.w / 2 - 4.4, zNear + 3.3);
  put(table(), -PLAZA.w / 2 + 2.6, 0.6, 0.15);
  put(stack(), PLAZA.w / 2 - 2.6, 2.2, -0.1);
  put(signpost(), 3.4, zFar - 1.6, Math.PI + 0.3);
  // a ring of whitewashed stones round the foot of the flag mast
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), white); m.position.set(-5.2 + Math.cos(a) * 1.25, 0.07, zFar - 2.6 + Math.sin(a) * 1.25); m.scale.y = 0.7; all.add(m); }
  // bunting from the gate to the mast and to the tower
  bunting(all, [-2.6, 3.5, zFar - 0.4], [-5.2, 4.2, zFar - 2.6], 9, 0.4);
  all.traverse(o => { if (o.isMesh && o.material !== rope) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(all);
  return t => { for (const f of tick) f(t); };
}
