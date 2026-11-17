// Decorating the plaza (Omer, 2026-11-17). Scout things made the way scouts make
// them, from poles and rope, which the player earns with stars and places on the
// plaza by dragging. Stars are never spent: each item opens when the player's star
// total reaches its number. The tribe's own flag (name, emblem, colours) flies on
// the mast, and its name is on the gate and the totem.
// Nothing may stand on the building ground or where finished structures are kept.
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
function gate(tick, tribe) {
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
  board(g, 3.2, 0.7, tribe.name ? `שבט ${tribe.name}` : 'ברוכים הבאים למחנה', [0, H - 0.7, -0.16], Math.PI, 0.5);
  bunting(g, [-half, H - 1.2, -0.12], [half, H - 1.2, -0.12], 11, 0.3);
  return g;
}
// ---- the flag mast: a tall pole on a lashed base, with guy lines ----
function mast(tick, tribe) {
  const g = new THREE.Group(), H = 6.2;
  stick(g, [0, 0, 0], [0, H, 0], 0.06);
  for (const d of [0, 120, 240]) {
    const a = d * Math.PI / 180, f = [Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0];
    stick(g, f, [Math.cos(a) * 0.05, 1.7, Math.sin(a) * 0.05], 0.05);
    stick(g, [Math.cos(a) * 2.6, 0.05, Math.sin(a) * 2.6], [0, 4.2, 0], 0.012, rope);
    stick(g, [Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6], [Math.cos(a) * 2.75, 0.3, Math.sin(a) * 2.75], 0.035, woodDark);
  }
  knot(g, [0, 1.7, 0], 0.11); knot(g, [0, 4.2, 0], 0.07);
  // the tribe's flag, waving
  const tex = textTexture(330, 240, (c, W, Hh) => drawFlag(c, W, Hh, tribe));
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


// ---------------- the tribe: name, emblem and colours ----------------
export const EMBLEMS = [
  ['lily', 'שושנה'], ['tent', 'אוהל'], ['fire', 'מדורה'], ['tree', 'עץ'], ['compass', 'מצפן'], ['knot', 'קשר'],
];
export const COLOURS = ['#1f4fb4', '#2f7d32', '#c8452c', '#e0a93b', '#6b3fa0', '#3b2410', '#0f8a8a', '#f4f1e6'];
export const DEFAULT_TRIBE = { name: '', emblem: 'lily', c1: '#2f7d32', c2: '#f4f1e6' };
// an emblem drawn in colour `col`, centred at (x, y), about 2R across
export function drawEmblem(c, kind, x, y, R, col) {
  c.save(); c.translate(x, y); c.fillStyle = col; c.strokeStyle = col; c.lineJoin = 'round'; c.lineCap = 'round';
  if (kind === 'lily') {
    c.beginPath(); c.moveTo(0, -R); c.bezierCurveTo(R * 0.45, -R * 0.45, R * 0.3, R * 0.05, 0, R * 0.25); c.bezierCurveTo(-R * 0.3, R * 0.05, -R * 0.45, -R * 0.45, 0, -R); c.fill();
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * R * 0.12, R * 0.1);
      c.bezierCurveTo(s * R * 0.35, -R * 0.55, s * R * 1.05, -R * 0.55, s * R * 0.95, -R * 0.1);
      c.bezierCurveTo(s * R * 0.9, R * 0.1, s * R * 0.6, R * 0.15, s * R * 0.55, R * 0.02);
      c.bezierCurveTo(s * R * 0.62, R * 0.32, s * R * 0.35, R * 0.38, s * R * 0.12, R * 0.3); c.fill();
    }
    c.fillRect(-R * 0.55, R * 0.25, R * 1.1, R * 0.16);
    c.beginPath(); c.moveTo(-R * 0.18, R * 0.45); c.lineTo(R * 0.18, R * 0.45); c.lineTo(0, R); c.fill();
  } else if (kind === 'tent') {
    c.beginPath(); c.moveTo(0, -R * 0.9); c.lineTo(R, R * 0.75); c.lineTo(-R, R * 0.75); c.closePath(); c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.moveTo(0, -R * 0.05); c.lineTo(R * 0.32, R * 0.75); c.lineTo(-R * 0.32, R * 0.75); c.closePath(); c.fill();
    c.globalCompositeOperation = 'source-over';
    c.lineWidth = R * 0.1; c.beginPath(); c.moveTo(0, -R * 0.9); c.lineTo(0, -R * 1.05); c.stroke();
  } else if (kind === 'fire') {
    c.beginPath(); c.moveTo(0, -R);
    c.bezierCurveTo(R * 0.25, -R * 0.45, R * 0.85, -R * 0.2, R * 0.6, R * 0.35); c.bezierCurveTo(R * 0.45, R * 0.65, R * 0.15, R * 0.6, 0, R * 0.6);
    c.bezierCurveTo(-R * 0.15, R * 0.6, -R * 0.45, R * 0.65, -R * 0.6, R * 0.35); c.bezierCurveTo(-R * 0.75, 0, -R * 0.35, -R * 0.2, -R * 0.2, -R * 0.55);
    c.bezierCurveTo(-R * 0.1, -R * 0.3, R * 0.05, -R * 0.55, 0, -R); c.fill();
    c.lineWidth = R * 0.16;
    c.beginPath(); c.moveTo(-R * 0.85, R * 0.95); c.lineTo(R * 0.85, R * 0.7); c.moveTo(R * 0.85, R * 0.95); c.lineTo(-R * 0.85, R * 0.7); c.stroke();
  } else if (kind === 'tree') {
    for (const [w, y0, y1] of [[0.55, -R, -R * 0.25], [0.75, -R * 0.55, R * 0.2], [0.95, -R * 0.1, R * 0.6]]) {
      c.beginPath(); c.moveTo(0, y0); c.lineTo(w * R, y1); c.lineTo(-w * R, y1); c.closePath(); c.fill();
    }
    c.fillRect(-R * 0.12, R * 0.6, R * 0.24, R * 0.4);
  } else if (kind === 'compass') {
    c.lineWidth = R * 0.1; c.beginPath(); c.arc(0, 0, R * 0.92, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? R * 0.22 : R * 0.8; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fill();
  } else if (kind === 'knot') {
    c.lineWidth = R * 0.2;
    c.beginPath(); c.ellipse(-R * 0.3, 0, R * 0.55, R * 0.38, 0, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.ellipse(R * 0.3, 0, R * 0.55, R * 0.38, 0, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(-R, R * 0.7); c.lineTo(-R * 0.6, R * 0.25); c.moveTo(R, -R * 0.7); c.lineTo(R * 0.6, -R * 0.25); c.stroke();
  }
  c.restore();
}
// the tribe's flag: its colour, a band at the hoist, the emblem and the name
export function drawFlag(c, W, H, t) {
  c.fillStyle = t.c1; c.fillRect(0, 0, W, H);
  c.fillStyle = t.c2; c.fillRect(0, 0, W * 0.09, H);
  drawEmblem(c, t.emblem, W * 0.55, t.name ? H * 0.42 : H * 0.5, H * (t.name ? 0.27 : 0.32), t.c2);
  if (t.name) {
    c.fillStyle = t.c2; c.font = `800 ${Math.round(H * 0.15)}px Rubik, Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl';
    c.fillText(`שבט ${t.name}`, W * 0.55, H * 0.84, W * 0.85);
  }
}

// ---------------- more things to put on the plaza ----------------
const canvasMat = new THREE.MeshStandardMaterial({ color: 0x8f8a5a, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
function tent(tick, tribe, big = false) {
  const g = new THREE.Group(), k = big ? 1.6 : 1;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.05 * k, 1.05 * k, 2.4 * k, 3, 1), canvasMat);
  m.rotation.z = Math.PI / 2; m.rotation.y = Math.PI / 2; m.position.y = 0.52 * k; g.add(m);
  stick(g, [0, 0, -1.25 * k], [0, 1.65 * k, -1.25 * k], 0.035); stick(g, [0, 0, 1.25 * k], [0, 1.65 * k, 1.25 * k], 0.035);
  for (const s of [-1, 1]) { stick(g, [0, 1.6 * k, s * 1.25 * k], [0, 0.05, s * 2.0 * k], 0.01, rope); stick(g, [0, 0, s * 2.0 * k], [0, 0.25, s * 2.08 * k], 0.025, woodDark); }
  if (big) { // a pennant of the tribe on top
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshStandardMaterial({ map: textTexture(150, 100, (c, W, Hh) => drawFlag(c, W, Hh, tribe)), side: THREE.DoubleSide }));
    stick(g, [0, 1.6 * k, -1.25 * k], [0, 2.4 * k, -1.25 * k], 0.025); f.position.set(0.3, 2.25 * k, -1.25 * k); g.add(f);
  }
  return g;
}
function flowers() {
  const g = new THREE.Group(), cols = [0xe2593f, 0xf2b632, 0xf4f1e6, 0x9b59d0, 0xff8ac0];
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 0), white); s.position.set(Math.cos(a) * 0.85, 0.06, Math.sin(a) * 0.85); s.scale.y = 0.7; g.add(s); }
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.8, 0.06, 18), new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 })); soil.position.y = 0.03; g.add(soil);
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4, r = 0.15 + (i % 4) * 0.15, x = Math.cos(a) * r, z = Math.sin(a) * r;
    stick(g, [x, 0.05, z], [x, 0.3, z], 0.012, new THREE.MeshStandardMaterial({ color: 0x3f8424 }));
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.7, flatShading: true }));
    f.position.set(x, 0.32, z); g.add(f);
  }
  return g;
}
function tree() {
  const g = new THREE.Group();
  stick(g, [0, 0, 0], [0, 1.6, 0], 0.16, new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 1 }));
  for (const [r, x, y, z, c] of [[1.0, 0, 2.2, 0, 0x4f9a2c], [0.75, 0.55, 2.0, 0.2, 0x66b23a], [0.7, -0.5, 1.95, -0.2, 0x3f8424], [0.6, 0.1, 2.8, 0.1, 0x66b23a]]) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true })); m.position.set(x, y, z); g.add(m);
  }
  return g;
}
function stonePath() {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 0), white);
    m.position.set(s * (0.75 + 0.04 * Math.sin(i * 7.3)), 0.08, -1.5 + i * 0.6); m.rotation.set(i, i * 1.7, 0); m.scale.y = 0.7; g.add(m);
  }
  return g;
}
function buntingPoles(tick, tribe) {
  const g = new THREE.Group();
  for (const x of [-1.5, 1.5]) { stick(g, [x, 0, 0], [x, 2.4, 0], 0.045); knot(g, [x, 2.3, 0], 0.06); }
  bunting(g, [-1.5, 2.3, 0], [1.5, 2.3, 0], 9, 0.35);
  return g;
}
// מתלה נעליים: an A-frame at each end and bars that the shoes hang on
function shoeRack() {
  const g = new THREE.Group(), L = 1.0;
  for (const x of [-L, L]) { stick(g, [x, 0, -0.45], [x, 1.1, 0], 0.04); stick(g, [x, 0, 0.45], [x, 1.1, 0], 0.04); knot(g, [x, 1.05, 0], 0.06); }
  for (const [y, z] of [[1.05, 0], [0.55, -0.24], [0.55, 0.24]]) stick(g, [-L - 0.1, y, z], [L + 0.1, y, z], 0.035);
  const shoe = new THREE.BoxGeometry(0.12, 0.09, 0.26), cols = [0x3b2410, 0x2c4a7a, 0x7a2c2c, 0x2c2c2c];
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(shoe, new THREE.MeshStandardMaterial({ color: cols[i % 4], roughness: 0.8 })); m.position.set(-0.7 + i * 0.28, 0.48, i % 2 ? 0.3 : -0.3); m.rotation.x = (i % 2 ? -1 : 1) * 0.9; g.add(m); }
  return g;
}
// מתקן כלים: a lashed stand with a slatted top where the dishes dry
function dishRack() {
  const g = new THREE.Group();
  for (const x of [-0.8, 0.8]) for (const z of [-0.35, 0.35]) stick(g, [x, 0, z], [x, 1.25, z], 0.04);
  for (const z of [-0.35, 0.35]) { stick(g, [-0.95, 0.8, z], [0.95, 0.8, z], 0.035); stick(g, [-0.95, 1.2, z], [0.95, 1.2, z], 0.035); }
  for (let i = -3; i <= 3; i++) stick(g, [i * 0.22, 0.83, -0.42], [i * 0.22, 0.83, 0.42], 0.025, woodDark);
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 14), white); m.rotation.z = Math.PI / 2; m.position.set(-0.5 + i * 0.25, 0.97, 0); g.add(m); }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.5, roughness: 0.4 })); pot.position.set(0.5, 1.33, 0); g.add(pot);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.18, 14), new THREE.MeshStandardMaterial({ color: 0x5f86b8, roughness: 0.5 })); basin.position.set(0, 0.09, 0); g.add(basin);
  return g;
}
// סככה: four poles, a lashed frame and a canvas roof for shade
function shelter() {
  const g = new THREE.Group(), w = 1.6, d = 1.3;
  const P = [[-w, -d, 2.5], [w, -d, 2.5], [w, d, 2.0], [-w, d, 2.0]];
  for (const [x, z, h] of P) { stick(g, [x, 0, z], [x, h, z], 0.06); knot(g, [x, h - 0.15, z], 0.07); }
  for (let i = 0; i < 4; i++) { const [x1, z1, h1] = P[i], [x2, z2, h2] = P[(i + 1) % 4]; stick(g, [x1, h1 - 0.15, z1], [x2, h2 - 0.15, z2], 0.045); }
  stick(g, [-w, 0.4, d], [w, 1.8, d], 0.04); stick(g, [w, 0.4, d], [-w, 1.8, d], 0.04);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(2 * w + 0.4, Math.hypot(2 * d + 0.4, 0.5)), canvasMat);
  roof.position.set(0, 2.32, 0); roof.rotation.x = -Math.PI / 2 - Math.atan2(0.5, 2 * d); g.add(roof);
  return g;
}
// עמוד שבט: a tall carved pole with the tribe's emblem on top
function totem(tick, tribe) {
  const g = new THREE.Group();
  const cols = [0x9a6a3a, 0xc8452c, 0xe0a93b, 0x2f7d32, 0x9a6a3a];
  cols.forEach((c, i) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3 - i * 0.02, 0.32 - i * 0.02, 0.62, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true })); m.position.y = 0.31 + i * 0.62; g.add(m); });
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 0.3), wood); w.position.set(s * 0.6, 2.6, 0); w.rotation.z = s * 0.25; g.add(w); }
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 24), [wood, new THREE.MeshStandardMaterial({ map: textTexture(256, 256, (c, W) => { c.fillStyle = tribe.c1; c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, 7); c.fill(); drawEmblem(c, tribe.emblem, W / 2, W / 2, W * 0.32, tribe.c2); }) }), wood]);
  disc.rotation.x = Math.PI / 2; disc.position.set(0, 3.55, 0.05); g.add(disc);
  if (tribe.name) board(g, 1.2, 0.3, `שבט ${tribe.name}`, [0, 0.95, 0.34], 0, 0.55);
  return g;
}

// The catalogue. stars: the star total that opens it. r: about how much ground it takes.
// many: it can be put on the plaza more than once.
export const ITEMS = [
  { id: 'flag', he: 'דגל השבט', stars: 1, r: 2.3, make: mast, tribe: true },
  { id: 'bunting', he: 'שרשרת דגלונים', stars: 1, r: 1.6, make: buntingPoles, many: true },
  { id: 'flowers', he: 'ערוגת פרחים', stars: 1, r: 1.0, make: flowers, many: true },
  { id: 'tree', he: 'עץ', stars: 2, r: 1.1, make: tree, many: true },
  { id: 'path', he: 'שביל אבנים לבנות', stars: 2, r: 1.6, make: stonePath, many: true },
  { id: 'fire', he: 'מעגל מדורה', stars: 2, r: 2.6, make: campfire },
  { id: 'tent', he: 'אוהל סיירת', stars: 3, r: 2.0, make: tent, many: true },
  { id: 'table', he: 'שולחן מחנאות', stars: 3, r: 1.3, make: table, many: true },
  { id: 'shoes', he: 'מתלה נעליים', stars: 4, r: 1.2, make: shoeRack },
  { id: 'sign', he: 'שלט הכוונה', stars: 4, r: 0.8, make: signpost },
  { id: 'dishes', he: 'מתקן כלים', stars: 5, r: 1.1, make: dishRack },
  { id: 'gate', he: 'שער המחנה', stars: 5, r: 2.4, make: gate, tribe: true },
  { id: 'stack', he: 'ערימת סנדות וחבלים', stars: 6, r: 1.9, make: stack },
  { id: 'shelter', he: 'סככה', stars: 6, r: 2.0, make: shelter },
  { id: 'tower', he: 'מגדל תצפית', stars: 7, r: 1.9, make: tower },
  { id: 'totem', he: 'עמוד שבט', stars: 8, r: 0.9, make: totem, tribe: true },
  { id: 'bigtent', he: 'אוהל גדול', stars: 9, r: 3.0, make: (t, tr) => tent(t, tr, true), tribe: true },
];
const item = id => ITEMS.find(q => q.id === id);

// where nothing may stand: the building ground in the middle, the spots of finished
// structures, and the camp corner (tent and crates) that is always there
export const KEEP_CLEAR = {
  build: { x0: -5.2, x1: 5.2, z0: -4.8, z1: 8.2 },
  spots: [[-9, 6.5, 3.2], [8.5, 7, 3.6], [-9.5, -5.5, 3.2], [11.8, -3.2, 2.6]],
};
function freeSpot(x, z, r, others) {
  const PW = PLAZA.w / 2 - 0.8, PD = PLAZA.d / 2 - 0.8, cz = PLAZA.cz;
  if (Math.abs(x) > PW - r * 0.5 || Math.abs(z - cz) > PD - r * 0.5) return false;
  const corner = Math.hypot(Math.max(0, Math.abs(x) - (PLAZA.w / 2 - PLAZA.r)), Math.max(0, Math.abs(z - cz) - (PLAZA.d / 2 - PLAZA.r)));
  if (corner > PLAZA.r - 0.6) return false;
  const B = KEEP_CLEAR.build;
  if (x > B.x0 - r * 0.6 && x < B.x1 + r * 0.6 && z > B.z0 - r * 0.6 && z < B.z1 + r * 0.6) return false;
  if (KEEP_CLEAR.spots.some(([sx, sz, sr]) => Math.hypot(x - sx, z - sz) < sr + r * 0.6)) return false;
  if (others.some(o => Math.hypot(x - o.x, z - o.z) < (r + item(o.id).r) * 0.65)) return false;
  return true;
}

// ---------------- the plaza's decoration: kept on this device ----------------
const KEY = 'buildit.plaza';
function load() { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && Array.isArray(d.placed)) return { tribe: { ...DEFAULT_TRIBE, ...d.tribe }, placed: d.placed.filter(p => item(p.id)) }; } catch { /* no storage here */ } return { tribe: { ...DEFAULT_TRIBE }, placed: [] }; }
function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* private mode: lasts this visit */ } }

// ctx: { scene, camera, controls, canvas, stars(), allOpen, onExit() }
export function makeDecor(ctx) {
  const { scene, camera, controls, canvas } = ctx;
  const data = load();
  const root = new THREE.Group(); scene.add(root);
  const live = new Map(); // uid -> { group, ticks }
  let uidN = Date.now() % 100000;
  function build(p) {
    const old = live.get(p.uid); if (old) root.remove(old.group);
    const ticks = [], g = item(p.id).make(ticks, data.tribe);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.decorUid = p.uid; } });
    g.position.set(p.x, 0, p.z); g.rotation.y = p.yaw || 0;
    root.add(g); live.set(p.uid, { group: g, ticks });
  }
  data.placed.forEach(p => { p.uid ??= ++uidN; build(p); });
  const rebuildTribe = () => data.placed.forEach(p => { if (item(p.id).tribe) build(p); });

  // ---- the decorating screen ----
  const ui = document.createElement('div'); ui.id = 'decor-ui'; ui.hidden = true;
  ui.innerHTML = `
    <div class="dc-top"><button type="button" class="tool primary" id="dc-done">סיום</button>
      <div class="dc-title"><b>קישוט המגרש</b><span id="dc-stars"></span></div></div>
    <aside class="dc-list side side-end" id="dc-list"></aside>
    <div class="dc-sel" id="dc-sel" hidden><span id="dc-sel-name"></span>
      <button type="button" class="tool" id="dc-rot">סיבוב ⟳</button>
      <button type="button" class="tool" id="dc-tribe" hidden>עריכת הדגל</button>
      <button type="button" class="tool ghost" id="dc-del">הסרה מהמגרש</button></div>
    <div class="dc-hint" id="dc-hint"></div>`;
  document.getElementById('app').appendChild(ui);
  const $ = id => document.getElementById(id);
  // the building ground, outlined on the sand while decorating
  const zone = new THREE.Group(); zone.visible = false; scene.add(zone);
  {
    const B = KEEP_CLEAR.build, mat = new THREE.MeshBasicMaterial({ color: 0xc8452c, transparent: true, opacity: 0.55, depthWrite: false });
    const bar = (x1, z1, x2, z2) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(x2 - x1, z2 - z1) + 0.12, 0.12), mat); m.rotation.set(-Math.PI / 2, 0, -Math.atan2(z2 - z1, x2 - x1)); m.position.set((x1 + x2) / 2, 0.02, (z1 + z2) / 2); zone.add(m); };
    bar(B.x0, B.z0, B.x1, B.z0); bar(B.x1, B.z0, B.x1, B.z1); bar(B.x1, B.z1, B.x0, B.z1); bar(B.x0, B.z1, B.x0, B.z0);
    for (const [x, z, r] of KEEP_CLEAR.spots) { const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.08, r, 40), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); zone.add(m); }
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.9), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: textTexture(600, 108, (c, W, H) => { c.clearRect(0, 0, W, H); c.fillStyle = 'rgba(200,69,44,.9)'; c.font = '800 64px Rubik, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl'; c.fillText('שטח הבנייה', W / 2, H / 2); }) }));
    lbl.rotation.set(-Math.PI / 2, 0, Math.PI); lbl.position.set(0, 0.03, KEEP_CLEAR.build.z0 + 0.8); zone.add(lbl);
  }
  let active = false, sel = null, drag = null;
  const stars = () => ctx.stars();
  const open = it => ctx.allOpen || stars() >= it.stars;
  function renderList() {
    $('dc-stars').textContent = `★ ${stars()}` + (ctx.allOpen ? ' · גרסת בדיקה: הכול פתוח' : '');
    $('dc-list').innerHTML = ITEMS.map(it => {
      const on = data.placed.some(p => p.id === it.id), ok = open(it);
      const state = !ok ? `<span class="dc-lock">★ ${it.stars}</span>` : on && !it.many ? '<span class="dc-on">על המגרש</span>' : '<span class="dc-add">+</span>';
      return `<button type="button" class="dc-item${ok ? '' : ' locked'}${on && !it.many ? ' placed' : ''}" data-id="${it.id}"><span class="dc-nm">${it.he}</span>${state}</button>`;
    }).join('');
  }
  function hint(t) { $('dc-hint').innerHTML = t; }
  function select(uid) {
    if (sel != null) live.get(sel)?.group.traverse(o => { if (o.isMesh && o.material.emissive && o.userData.lit) { o.material = o.userData.lit; delete o.userData.lit; } });
    sel = uid;
    const p = data.placed.find(q => q.uid === uid);
    $('dc-sel').hidden = !p;
    if (!p) return hint('בחרו פריט ברשימה כדי להוסיף אותו, או גררו פריט על המגרש כדי להזיז אותו');
    $('dc-sel-name').textContent = item(p.id).he;
    $('dc-tribe').hidden = !item(p.id).tribe;
    live.get(uid).group.traverse(o => { if (o.isMesh && o.material.emissive && !Array.isArray(o.material)) { o.userData.lit = o.material; o.material = o.material.clone(); o.material.emissive.setHex(0x5a3a00); } });
    hint('גררו כדי להזיז. אי אפשר להניח על <b>שטח הבנייה</b> המסומן באדום');
  }
  function add(it) {
    if (!open(it)) return hint(`<b>${it.he}</b> נפתח כשיש לכם ${it.stars} כוכבים. כוכבים מקבלים במבנים של המגרש שלי`);
    const have = data.placed.find(p => p.id === it.id);
    if (have && !it.many) { select(have.uid); return; }
    // the free spot nearest to where the camera looks
    const t = controls.target; let best = null;
    for (let r = 0; r < 16 && !best; r += 0.8) for (let a = 0; a < 24 && !best; a++) {
      const x = Math.round((t.x + Math.cos(a / 24 * Math.PI * 2) * r) * 10) / 10, z = Math.round((t.z + Math.sin(a / 24 * Math.PI * 2) * r) * 10) / 10;
      if (freeSpot(x, z, it.r, data.placed)) best = { x, z };
    }
    if (!best) return hint('<b>אין מקום פנוי למה שבחרתם.</b> הזיזו או הסירו פריטים אחרים');
    const p = { id: it.id, uid: ++uidN, x: best.x, z: best.z, yaw: 0 };
    data.placed.push(p); build(p); save(data); renderList(); select(p.uid);
    if (it.tribe && !data.tribe.name) editTribe();
  }
  $('dc-list').addEventListener('click', e => { const b = e.target.closest('.dc-item'); if (b) add(item(b.dataset.id)); });
  $('dc-rot').addEventListener('click', () => { const p = data.placed.find(q => q.uid === sel); if (!p) return; p.yaw = ((p.yaw || 0) + Math.PI / 4) % (Math.PI * 2); live.get(p.uid).group.rotation.y = p.yaw; save(data); });
  $('dc-del').addEventListener('click', () => { const i = data.placed.findIndex(q => q.uid === sel); if (i < 0) return; root.remove(live.get(sel).group); live.delete(sel); data.placed.splice(i, 1); save(data); select(null); renderList(); });
  $('dc-tribe').addEventListener('click', () => editTribe());
  $('dc-done').addEventListener('click', () => exit());

  // ---- the tribe editor ----
  const card = document.createElement('div'); card.className = 'modal'; card.id = 'tribe-card'; card.hidden = true;
  document.getElementById('app').appendChild(card);
  function editTribe() {
    const t = { ...data.tribe };
    card.innerHTML = `<div class="card tribe-card" role="dialog" aria-modal="true">
      <div class="eyebrow">דגל השבט</div>
      <div class="tribe-grid"><div class="tribe-form">
        <label class="tribe-name">שם השבט<input id="tb-name" maxlength="14" placeholder="למשל: אלון" value=""></label>
        <div class="tribe-row" id="tb-emb">${EMBLEMS.map(([k, he]) => `<button type="button" data-k="${k}" title="${he}" aria-label="${he}"><canvas width="64" height="64"></canvas></button>`).join('')}</div>
        <div class="tribe-lbl">צבע הדגל</div><div class="tribe-row sw" id="tb-c1">${COLOURS.map(c => `<button type="button" data-c="${c}" style="background:${c}" aria-label="צבע"></button>`).join('')}</div>
        <div class="tribe-lbl">צבע הסמל</div><div class="tribe-row sw" id="tb-c2">${COLOURS.map(c => `<button type="button" data-c="${c}" style="background:${c}" aria-label="צבע"></button>`).join('')}</div>
      </div><canvas id="tb-prev" width="330" height="240"></canvas></div>
      <div class="card-actions"><button type="button" class="tool primary" id="tb-ok">שמירה</button><button type="button" class="tool" id="tb-cancel">ביטול</button></div></div>`;
    card.hidden = false;
    const name = card.querySelector('#tb-name'); name.value = t.name;
    const draw = () => {
      drawFlag(card.querySelector('#tb-prev').getContext('2d'), 330, 240, t);
      card.querySelectorAll('#tb-emb button').forEach(b => { const c = b.firstChild.getContext('2d'); c.clearRect(0, 0, 64, 64); drawEmblem(c, b.dataset.k, 32, 32, 22, b.dataset.k === t.emblem ? '#3b2410' : '#8a7a60'); b.classList.toggle('on', b.dataset.k === t.emblem); });
      card.querySelectorAll('#tb-c1 button').forEach(b => b.classList.toggle('on', b.dataset.c === t.c1));
      card.querySelectorAll('#tb-c2 button').forEach(b => b.classList.toggle('on', b.dataset.c === t.c2));
    };
    draw(); document.fonts?.ready?.then(draw);
    name.addEventListener('input', () => { t.name = name.value.trim(); draw(); });
    card.querySelector('#tb-emb').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { t.emblem = b.dataset.k; draw(); } });
    card.querySelector('#tb-c1').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { t.c1 = b.dataset.c; if (t.c2 === t.c1) t.c2 = t.c1 === '#f4f1e6' ? '#3b2410' : '#f4f1e6'; draw(); } });
    card.querySelector('#tb-c2').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.c !== t.c1) { t.c2 = b.dataset.c; draw(); } });
    card.querySelector('#tb-ok').addEventListener('click', () => { data.tribe = { ...t, name: t.name.slice(0, 14) }; save(data); rebuildTribe(); card.hidden = true; if (sel != null) select(sel); });
    card.querySelector('#tb-cancel').addEventListener('click', () => { card.hidden = true; });
  }

  // ---- dragging things on the plaza ----
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), nd = new THREE.Vector2();
  const at = e => { nd.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(nd, camera); };
  const ground = e => { at(e); const v = new THREE.Vector3(); return ray.ray.intersectPlane(plane, v) ? v : null; };
  canvas.addEventListener('pointerdown', e => {
    if (!active) return;
    at(e);
    const hit = ray.intersectObjects(root.children, true).find(h => h.object.userData.decorUid != null);
    if (!hit) { drag = { none: true, x: e.clientX, y: e.clientY }; return; }
    const uid = hit.object.userData.decorUid, p = data.placed.find(q => q.uid === uid), g0 = ground(e);
    select(uid);
    drag = { uid, p, dx: p.x - g0.x, dz: p.z - g0.z, from: { x: p.x, z: p.z }, ok: true };
    controls.enabled = false;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* fine without it */ }
  });
  canvas.addEventListener('pointermove', e => {
    if (!active || !drag || drag.none) return;
    const g = ground(e); if (!g) return;
    const x = Math.round((g.x + drag.dx) * 10) / 10, z = Math.round((g.z + drag.dz) * 10) / 10;
    drag.ok = freeSpot(x, z, item(drag.p.id).r, data.placed.filter(q => q.uid !== drag.uid));
    drag.p.x = x; drag.p.z = z; live.get(drag.uid).group.position.set(x, drag.ok ? 0 : 0.15, z);
    hint(drag.ok ? 'משחררים כדי להניח כאן' : '<b>אי אפשר כאן:</b> זה שטח הבנייה, מקום של מבנה, או צמוד מדי לפריט אחר');
  });
  const up = e => {
    if (!active || !drag) return;
    if (drag.none) { if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) select(null); drag = null; return; }
    const d = drag; drag = null; controls.enabled = true;
    if (!d.ok) { d.p.x = d.from.x; d.p.z = d.from.z; }
    live.get(d.uid).group.position.set(d.p.x, 0, d.p.z);
    save(data); select(d.uid);
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  function enter() {
    active = true; ui.hidden = false; zone.visible = true; document.getElementById('app').classList.add('decorating');
    camera.position.set(17, 27, -24); controls.target.set(0, 0, 1); camera.lookAt(controls.target); controls.enabled = true; controls.update();
    renderList(); select(null);
  }
  function exit() { active = false; ui.hidden = true; zone.visible = false; card.hidden = true; select(null); document.getElementById('app').classList.remove('decorating'); ctx.onExit(); }
  return {
    get active() { return active; },
    enter, exit,
    tick(t) { for (const v of live.values()) for (const f of v.ticks) f(t); },
  };
}
