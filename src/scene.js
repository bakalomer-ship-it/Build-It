// Scene dressing: renderer, sky, ground, textures, poles, ropes, people.
import * as THREE from 'three';
import { SLOTS, LEVEL, LEG_STAKES } from './level1.js';
import { slotPoint } from './klafSim.js';

export const R = LEVEL.poleRadius;

export function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}

function rand(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// The look follows Omer's direction: a friendly, stylized world seen from
// high above (the feel of a mobile base-building game, in a look of our own):
// soft bright colours, a green meadow, a sandy plaza in the middle, round
// cartoon trees. Realism lives in the building rules and the physics.
export const PALETTE = {
  skyTop: '#4fa8e8', skyBottom: '#c9ecff',
  grass: '#79c24a', grassDark: '#5fa83a', grassLight: '#97d665',
  plaza: '#e6cd93', plazaEdge: '#c9a86a',
  leaf: [0x5cb23a, 0x4a9e30, 0x74c445], trunk: 0x8a5a33, rock: 0xb9b2a6,
};
export function makeWorld(scene) {
  scene.background = canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, PALETTE.skyTop); gr.addColorStop(1, PALETTE.skyBottom);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  scene.fog = new THREE.Fog(0xbfe2c8, 50, 120);

  const hemi = new THREE.HemisphereLight(0xd8efff, 0x6f9a45, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.3);
  sun.position.set(-6, 14, -7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  sun.target.position.set(0, 0, 0.5);
  scene.add(sun, sun.target);

  const rnd = rand(7);
  // the meadow
  const grass = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = PALETTE.grass; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = rnd() < 0.5 ? PALETTE.grassDark : PALETTE.grassLight;
      g.globalAlpha = 0.18 + rnd() * 0.15;
      g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 10 + rnd() * 26, 6 + rnd() * 14, rnd() * 3, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 0.5;
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = rnd() < 0.5 ? PALETTE.grassDark : PALETTE.grassLight; g.lineWidth = 2;
      const x = rnd() * w, y = rnd() * h;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - .5) * 4, y - 5 - rnd() * 4); g.stroke();
    }
    g.globalAlpha = 1;
  }, 40);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // the plaza: a soft rounded patch of packed sand where the scouts build
  const PW = 16, PD = 14, PR = 3;
  const shape = new THREE.Shape();
  shape.moveTo(-PW / 2 + PR, -PD / 2);
  shape.lineTo(PW / 2 - PR, -PD / 2); shape.quadraticCurveTo(PW / 2, -PD / 2, PW / 2, -PD / 2 + PR);
  shape.lineTo(PW / 2, PD / 2 - PR); shape.quadraticCurveTo(PW / 2, PD / 2, PW / 2 - PR, PD / 2);
  shape.lineTo(-PW / 2 + PR, PD / 2); shape.quadraticCurveTo(-PW / 2, PD / 2, -PW / 2, PD / 2 - PR);
  shape.lineTo(-PW / 2, -PD / 2 + PR); shape.quadraticCurveTo(-PW / 2, -PD / 2, -PW / 2 + PR, -PD / 2);
  const sandTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = PALETTE.plaza; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.18)' : 'rgba(150,110,60,.14)';
      g.beginPath(); g.arc(rnd() * w, rnd() * h, 0.8 + rnd() * 2.2, 0, Math.PI * 2); g.fill();
    }
  });
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping; sandTex.repeat.set(0.25, 0.25);
  const edge = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), new THREE.MeshStandardMaterial({ color: PALETTE.plazaEdge, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  edge.rotation.x = -Math.PI / 2; edge.position.set(0, 0.001, 0.5); edge.scale.set(1.04, 1.045, 1); edge.receiveShadow = true;
  const plaza = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.002, 0.5); plaza.receiveShadow = true;
  scene.add(edge, plaza);

  // round cartoon trees, bushes and rocks around the plaza
  const trunkMat = new THREE.MeshStandardMaterial({ color: PALETTE.trunk, roughness: 1 });
  const leafMats = PALETTE.leaf.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }));
  const rockMat = new THREE.MeshStandardMaterial({ color: PALETTE.rock, roughness: 1, flatShading: true });
  const away = (x, z) => Math.abs(x) > PW / 2 + 1.2 || Math.abs(z - 0.5) > PD / 2 + 1.2;
  const tree = (x, z, sc) => {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.4, 7), trunkMat); trunk.position.y = 0.7;
    t.add(trunk);
    const n = 2 + (rnd() * 2 | 0);
    for (let k = 0; k < n; k++) {
      const r = 0.9 + rnd() * 0.5;
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMats[(rnd() * 3) | 0]);
      c.position.set((rnd() - .5) * 0.8, 1.7 + k * 0.6 + rnd() * 0.3, (rnd() - .5) * 0.8);
      t.add(c);
    }
    t.traverse(o => { if (o.isMesh) o.castShadow = true; });
    t.scale.setScalar(sc); t.position.set(x, 0, z); t.rotation.y = rnd() * 6;
    scene.add(t);
  };
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, d = 11 + rnd() * 24;
    const x = Math.cos(a) * d * 1.1, z = Math.sin(a) * d + 0.5;
    if (away(x, z)) tree(x, z, 0.9 + rnd() * 0.7);
  }
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, d = 9.5 + rnd() * 10;
    const x = Math.cos(a) * d, z = Math.sin(a) * d + 0.5;
    if (!away(x, z)) continue;
    const bush = rnd() < 0.6;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(bush ? 0.45 + rnd() * 0.3 : 0.3 + rnd() * 0.35, bush ? 1 : 0), bush ? leafMats[(rnd() * 3) | 0] : rockMat);
    m.position.set(x, bush ? 0.25 : 0.1, z); m.scale.y = bush ? 0.8 : 0.6; m.castShadow = true;
    scene.add(m);
  }
  return { sun };
}

// ---------- the blueprint drawing (שרטוט קלף) ----------
export const BP = { size: 1024, span: 2.9, u0: 0, v0: 1.2 };
// Seen from above (and from the pullers), +u is on the left, so the
// drawing is mirrored relative to the klaf's own u axis.
function bx(u) { return BP.size / 2 - (u - BP.u0) * BP.size / BP.span; }
function by(v) { return BP.size / 2 - (v - BP.v0) * BP.size / BP.span; }

export function drawBlueprint(g, opts = {}) {
  const S = BP.size, k = S / BP.span;
  g.save();
  g.fillStyle = '#f5f2e6'; g.fillRect(0, 0, S, S);
  // grid every 10 cm, heavier every 50 cm
  for (let i = -20; i <= 20; i++) {
    const m = i * 0.1;
    g.strokeStyle = i % 5 === 0 ? 'rgba(47,99,176,.22)' : 'rgba(47,99,176,.08)';
    g.lineWidth = i % 5 === 0 ? 2 : 1;
    g.beginPath(); g.moveTo(bx(m), 0); g.lineTo(bx(m), S); g.stroke();
    g.beginPath(); g.moveTo(0, by(BP.v0 + m)); g.lineTo(S, by(BP.v0 + m)); g.stroke();
  }
  // ground line
  g.strokeStyle = '#8a6a43'; g.lineWidth = 4; g.setLineDash([18, 10]);
  g.beginPath(); g.moveTo(30, by(0)); g.lineTo(S - 30, by(0)); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#8a6a43'; g.font = '600 26px Rubik, Arial'; g.textAlign = 'right'; g.direction = 'rtl';
  g.fillText('קו הקרקע', S - 36, by(0) + 34);

  // poles
  for (const slot of SLOTS) {
    const a = slotPoint(slot, -slot.length / 2), b = slotPoint(slot, slot.length / 2);
    const ax = bx(a[0]), ay = by(a[1]), bxx = bx(b[0]), byy = by(b[1]);
    const ang = Math.atan2(byy - ay, bxx - ax);
    const w = R * 2 * k;
    g.save(); g.translate(ax, ay); g.rotate(ang);
    const len = Math.hypot(bxx - ax, byy - ay);
    g.fillStyle = slot.id.startsWith('diag') ? 'rgba(47,99,176,.10)' : 'rgba(47,99,176,.16)';
    g.strokeStyle = '#2f63b0'; g.lineWidth = 3;
    g.beginPath(); g.rect(0, -w / 2, len, w); g.fill(); g.stroke();
    g.restore();
    // length label
    const mid = slotPoint(slot, slot.id.startsWith('diag') ? (slot.id === 'diagA' ? 0.62 : -0.62) : (slot.id.startsWith('leg') ? 0.15 : -0.35));
    let mx = bx(mid[0]), my = by(mid[1]);
    let off = slot.id.startsWith('leg') ? (slot.centre[0] > 0 ? -44 : 44) : (slot.id === 'topH' ? -30 : slot.id === 'botH' ? 34 : 0);
    if (slot.id.startsWith('leg')) mx += off; else my += off;
    g.save(); g.translate(mx, my);
    let rot = ang; if (rot > Math.PI / 2) rot -= Math.PI; if (rot < -Math.PI / 2) rot += Math.PI;
    if (slot.id.startsWith('diag')) g.rotate(rot); else if (slot.id.startsWith('leg')) g.rotate(-Math.PI / 2);
    g.font = '700 30px Rubik, Arial'; g.textAlign = 'center'; g.direction = 'ltr';
    const label = slot.length.toFixed(1) + ' מ׳';
    g.fillStyle = 'rgba(245,242,230,.9)'; const tw = g.measureText(label).width;
    g.fillRect(-tw / 2 - 6, -24, tw + 12, 32);
    g.fillStyle = '#2f63b0'; g.fillText(label, 0, 2);
    g.restore();
  }
  // joints
  if (opts.joints) for (const j of opts.joints) {
    g.fillStyle = '#f5f2e6'; g.strokeStyle = '#2f63b0'; g.lineWidth = 4;
    g.beginPath(); g.arc(bx(j.at[0]), by(j.at[1]), 11, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  // stake marks next to the feet
  for (const st of LEG_STAKES) {
    const x = bx(st.u), y = by(0);
    g.fillStyle = '#c0392b';
    g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x - 10, y + 26); g.lineTo(x + 10, y + 26); g.closePath(); g.fill();
  }
  g.fillStyle = '#c0392b'; g.font = '600 22px Rubik, Arial'; g.textAlign = 'center'; g.direction = 'rtl';
  g.fillText('בז״נט', bx(LEG_STAKES[0].u), by(0) + 52);
  g.fillText('בז״נט', bx(LEG_STAKES[1].u), by(0) + 52);

  // dimensions
  g.strokeStyle = '#555'; g.fillStyle = '#444'; g.lineWidth = 2; g.font = '500 24px Rubik, Arial'; g.direction = 'rtl';
  const dimY = by(2.32);
  arrowLine(g, bx(-1.0), dimY, bx(1.0), dimY);
  g.textAlign = 'center'; g.fillText('רוחב 2.0 מ׳', S / 2, dimY - 12);
  const dimX = bx(-1.22);
  arrowLine(g, dimX, by(0), dimX, by(2.0));
  g.save(); g.translate(dimX + 30, by(1.0)); g.rotate(Math.PI / 2); g.fillText('גובה 2.0 מ׳', 0, 0); g.restore();
  const dimX2 = bx(1.2);
  arrowLine(g, dimX2, by(0), dimX2, by(0.3));
  g.textAlign = 'left'; g.fillText('30 ס״מ', dimX2 + 10, by(0.15) + 8);

  // title block
  const tbW = 330, tbH = 104, tx = 24, ty = S - tbH - 24;
  g.fillStyle = 'rgba(245,242,230,.95)'; g.fillRect(tx, ty, tbW, tbH);
  g.strokeStyle = '#2f63b0'; g.lineWidth = 3; g.strokeRect(tx, ty, tbW, tbH);
  g.fillStyle = '#1d2318'; g.textAlign = 'right'; g.direction = 'rtl';
  g.font = '800 30px Rubik, Arial'; g.fillText('קלף 2×2 · שרטוט קלף', tx + tbW - 14, ty + 40);
  g.font = '500 21px Rubik, Arial'; g.fillStyle = '#4a4a3a';
  g.fillText('מבנה צופי · קנה מידה 1:1', tx + tbW - 14, ty + 70);
  g.fillText('מידות זמניות עד לקבלת שרטוט אמיתי', tx + tbW - 14, ty + 94);
  g.restore();
}
function arrowLine(g, x1, y1, x2, y2) {
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  for (const [x, y, d] of [[x1, y1, 1], [x2, y2, -1]]) {
    g.beginPath(); g.moveTo(x, y);
    g.lineTo(x + d * 14 * Math.cos(a) - 7 * Math.sin(a), y + d * 14 * Math.sin(a) + 7 * Math.cos(a));
    g.lineTo(x + d * 14 * Math.cos(a) + 7 * Math.sin(a), y + d * 14 * Math.sin(a) - 7 * Math.cos(a));
    g.closePath(); g.fillStyle = '#555'; g.fill();
  }
}

export function makeBlueprintMesh(joints) {
  const c = document.createElement('canvas'); c.width = c.height = BP.size;
  drawBlueprint(c.getContext('2d'), { joints });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(BP.span, BP.span), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
  m.rotation.set(-Math.PI / 2, 0, Math.PI);
  m.position.set(BP.u0, 0.004, BP.v0);
  m.receiveShadow = true;
  // redraw once the web font has arrived
  if (document.fonts?.ready) document.fonts.ready.then(() => { drawBlueprint(c.getContext('2d'), { joints }); tex.needsUpdate = true; });
  return m;
}

// ---------- poles ----------
let barkTex = null, endTex = null;
function woodTextures() {
  if (barkTex) return;
  const rnd = rand(3);
  barkTex = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#9a7a52'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 1) {
      const v = rnd();
      g.fillStyle = `rgba(${90 + v * 70 | 0},${68 + v * 50 | 0},${42 + v * 30 | 0},${0.35 + rnd() * 0.4})`;
      g.fillRect(x, 0, 1 + (rnd() * 2 | 0), h);
    }
    for (let i = 0; i < 40; i++) { // knots
      g.fillStyle = 'rgba(70,50,30,.5)';
      g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 2 + rnd() * 3, 5 + rnd() * 6, 0, 0, Math.PI * 2); g.fill();
    }
  });
  endTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#d9b98a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(140,100,60,.6)';
    for (let r = 4; r < 32; r += 4) { g.beginPath(); g.arc(32, 32, r, 0, Math.PI * 2); g.stroke(); }
  });
}

export function makePoleMesh(tint = 0) {
  woodTextures();
  const side = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.9, color: new THREE.Color().setHSL(0.09, 0.25, 0.78 + tint * 0.08) });
  const end = new THREE.MeshStandardMaterial({ map: endTex, roughness: 0.8 });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1, 14, 1), [side, end, end]);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
export function placeCylinder(mesh, a, b) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  tmpV.subVectors(vb, va);
  const len = tmpV.length();
  if (len < 1e-5) { mesh.visible = false; return; }
  mesh.visible = true;
  mesh.position.copy(va).addScaledVector(tmpV, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, tmpV.normalize());
  mesh.scale.set(1, len, 1);
}

// ---------- lashing coils ----------
const ropeMat = new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 0.95 });
const coilGeo = new THREE.TorusGeometry(R + 0.012, 0.011, 6, 18);
const Z = new THREE.Vector3(0, 0, 1);
export function makeLashing() {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(coilGeo, ropeMat); t.castShadow = true; g.add(t); }
  return g;
}
// coils around pole A on both sides of pole B, and around B on both sides of A
export function placeLashing(g, p, dA, dB) {
  const P = new THREE.Vector3(...p), A = new THREE.Vector3(...dA).normalize(), B = new THREE.Vector3(...dB).normalize();
  const offs = [[A, B, -1], [A, B, 1], [A, B, -1.7], [B, A, -1], [B, A, 1], [B, A, 1.7]];
  g.children.forEach((t, i) => {
    const [axis, along, s] = offs[i];
    t.position.copy(P).addScaledVector(along, s * 0.055);
    t.quaternion.setFromUnitVectors(Z, axis);
    t.scale.setScalar(1);
  });
}
export function placeParallelLashing(g, a, b, dir) {
  const P = new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(0.5);
  const D = new THREE.Vector3(...dir).normalize();
  g.children.forEach((t, i) => {
    t.position.copy(P).addScaledVector(D, (i - 2.5) * 0.025);
    t.quaternion.setFromUnitVectors(Z, D);
    t.scale.set(1.9, 1.9, 1);
  });
}

// ---------- ropes ----------
export class RopeViz {
  constructor(scene, radius = 0.011, color = 0xd2b06c, n = 10) {
    this.mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    this.geo = new THREE.CylinderGeometry(radius, radius, 1, 6, 1);
    this.segs = [];
    for (let i = 0; i < n; i++) { const m = new THREE.Mesh(this.geo, this.mat); m.castShadow = true; scene.add(m); this.segs.push(m); }
    this.visible = true;
  }
  set(a, b, sag = 0.02) {
    const n = this.segs.length;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
    }
    for (let i = 0; i < n; i++) placeCylinder(this.segs[i], pts[i], pts[i + 1]);
    this.show(true);
  }
  show(v) { if (this.visible === v) return; this.visible = v; for (const s of this.segs) s.visible = v; }
}

// ---------- stakes and mallet ----------
const stakeMat = new THREE.MeshStandardMaterial({ color: 0x8c6c45, roughness: 0.9 });
export function makeStake(len) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, len, 10), stakeMat);
  body.castShadow = true; body.position.y = len / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.09, 10), stakeMat);
  tip.rotation.x = Math.PI; tip.position.y = -0.045;
  g.add(body, tip);
  g.userData.len = len;
  return g;
}
// הלמנייה: a steel tube post driver with a handle on each side
export function makeDriver() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x2f6b45, roughness: 0.45, metalness: 0.5 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.62, 16, 1, true), steel);
  tube.position.y = 0.31;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.03, 16), steel);
  cap.position.y = 0.62;
  g.add(tube, cap);
  for (const sx of [-1, 1]) {
    // each handle: two short arms out from the tube and a grip bar
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.4, 8), steel);
    bar.position.set(sx * 0.17, 0.3, 0);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 8), steel);
    top.rotation.z = Math.PI / 2; top.position.set(sx * 0.115, 0.5, 0);
    const bot = top.clone(); bot.position.y = 0.1;
    g.add(bar, top, bot);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.visible = false;
  return g;
}

// ---------- people ----------
const skin = new THREE.MeshStandardMaterial({ color: 0xe8b48a, roughness: 0.7 });
const shirt = new THREE.MeshStandardMaterial({ color: 0xd9bf82, roughness: 0.85 });
const pants = new THREE.MeshStandardMaterial({ color: 0xa08a5a, roughness: 0.9 }); // khaki uniform
const hair = new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 1 });
const scarfColors = [0x2f7fe0, 0xe0473a, 0x2fae5f, 0x8a52d0];
export function makePerson(i = 0) {
  const g = new THREE.Group();
  const scarf = new THREE.MeshStandardMaterial({ color: scarfColors[i % scarfColors.length] });
  const legGeo = new THREE.CapsuleGeometry(0.065, 0.62, 4, 8);
  // legs hang from hip pivots so they can swing while walking
  const lL = new THREE.Group(); lL.position.set(-0.09, 0.8, 0);
  const lR = new THREE.Group(); lR.position.set(0.09, 0.8, 0);
  for (const l of [lL, lR]) { const m = new THREE.Mesh(legGeo, pants); m.position.y = -0.37; l.add(m); }
  const torso = new THREE.Group(); torso.position.y = 0.82;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.32, 4, 10), shirt); body.position.y = 0.3; body.scale.z = 0.75;
  const sc = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), scarf); sc.position.set(0, 0.5, 0.11); sc.rotation.x = Math.PI;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), skin); head.position.y = 0.78;
  const hr = new THREE.Mesh(new THREE.SphereGeometry(0.157, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair); hr.position.y = 0.8; hr.rotation.x = -0.25;
  const armGeo = new THREE.CapsuleGeometry(0.045, 0.5, 4, 8);
  const aL = new THREE.Group(); aL.position.set(-0.2, 0.55, 0);
  const aR = new THREE.Group(); aR.position.set(0.2, 0.55, 0);
  for (const a of [aL, aR]) { const m = new THREE.Mesh(armGeo, shirt); m.position.y = -0.27; m.castShadow = true; a.add(m); }
  torso.add(body, sc, head, hr, aL, aR);
  g.add(lL, lR, torso);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { torso, aL, aR, lL, lR };
  const outer = new THREE.Group();
  g.scale.setScalar(0.9); // about 1.5 m tall next to a 2 m klaf
  outer.add(g);
  outer.userData = g.userData;
  return outer;
}
// lean: + forward; reach: arm angle forward (0 down, PI/2 straight ahead, PI up)
export function posePerson(p, lean = 0, reach = 0.3) {
  const { torso, aL, aR, lL, lR } = p.userData;
  torso.rotation.x = lean;
  aL.rotation.x = -reach; aR.rotation.x = -reach;
  lL.rotation.x = 0; lR.rotation.x = 0;
}
// one frame of a walk cycle
export function walkPose(p, phase, carry = null) {
  const { torso, aL, aR, lL, lR } = p.userData;
  const s = Math.sin(phase);
  lL.rotation.x = s * 0.5; lR.rotation.x = -s * 0.5;
  torso.rotation.x = 0.06;
  if (carry != null) { aL.rotation.x = aR.rotation.x = -carry; }
  else { aL.rotation.x = -s * 0.45; aR.rotation.x = s * 0.45; }
}

// ---------- the cube's side drawings (level 2) ----------
// Each side of the cube has its own drawing, lying on the ground just outside
// that side (as if the side were folded down flat): the two klaf legs, the
// side poles that join them, and the spatial X, seen from outside.
const SIDE = { spanZ: 3.0, hMin: -0.25, hMax: 2.45, x0: 1.15, px: 1024 };
export function makeSideSheet() {
  const c = document.createElement('canvas');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(SIDE.spanZ, SIDE.hMax - SIDE.hMin); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
  m.receiveShadow = true;
  m.userData = { canvas: c, tex };
  return m;
}
// draw a side's drawing; with a mesh, also place the mesh beside that side
export function drawSideSheet(mesh, cube, side, klafNames, canvas = null) {
  const c = canvas || mesh.userData.canvas;
  // a longer structure (several cubes in a row) gets a longer sheet at the same scale
  const D = cube.depth, span = cube.span ?? D, spanZ = SIDE.spanZ + (span - D);
  const H = SIDE.hMax - SIDE.hMin, W = Math.round(SIDE.px * spanZ / SIDE.spanZ), Hp = Math.round(SIDE.px * H / SIDE.spanZ);
  c.width = W; c.height = Hp;
  const g = c.getContext('2d');
  const zMin = span / 2 - spanZ / 2, k = W / spanZ;
  // seen from outside the side: on the left side +z runs right, on the right side it runs left
  const cx = z => side > 0 ? (z - zMin) * k : (zMin + spanZ - z) * k;
  const cy = h => (SIDE.hMax - h) * k;
  g.fillStyle = '#f5f2e6'; g.fillRect(0, 0, W, Hp);
  for (let i = -30; i <= 30; i++) {
    const m = i * 0.1;
    g.strokeStyle = i % 5 === 0 ? 'rgba(47,99,176,.22)' : 'rgba(47,99,176,.08)'; g.lineWidth = i % 5 === 0 ? 2 : 1;
    g.beginPath(); g.moveTo(cx(span / 2 + m), 0); g.lineTo(cx(span / 2 + m), Hp); g.stroke();
    g.beginPath(); g.moveTo(0, cy(m + 1)); g.lineTo(W, cy(m + 1)); g.stroke();
  }
  g.strokeStyle = '#8a6a43'; g.lineWidth = 4; g.setLineDash([18, 10]);
  g.beginPath(); g.moveTo(20, cy(0)); g.lineTo(W - 20, cy(0)); g.stroke(); g.setLineDash([]);
  // the klaf legs, already standing (grey)
  const r = R;
  g.font = '700 24px Rubik, Arial'; g.textAlign = 'center'; g.direction = 'rtl';
  klafNames.map((_, i) => i * D).forEach((z, i) => {
    g.fillStyle = 'rgba(120,110,95,.35)'; g.strokeStyle = 'rgba(90,80,70,.7)'; g.lineWidth = 3;
    g.fillRect(cx(z) - r * k, cy(2.0), 2 * r * k, 2.0 * k); g.strokeRect(cx(z) - r * k, cy(2.0), 2 * r * k, 2.0 * k);
    g.fillStyle = '#6b5f50'; g.fillText(`רגל ה${klafNames[i]}`, cx(z), cy(2.0) - 14);
  });
  // the side poles to add (blue), with their lengths
  const label = (x, y, text, rot = 0) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.font = '700 26px Rubik, Arial'; g.direction = 'ltr'; g.textAlign = 'center';
    const tw = g.measureText(text).width; g.fillStyle = 'rgba(245,242,230,.92)'; g.fillRect(-tw / 2 - 6, -22, tw + 12, 30);
    g.fillStyle = '#2f63b0'; g.fillText(text, 0, 2); g.restore();
  };
  for (const s of cube.slots.filter(q => q.side === side)) {
    const a = [s.centre[2] - s.dir[2] * s.length / 2, s.centre[1] - s.dir[1] * s.length / 2 - r];
    const b = [s.centre[2] + s.dir[2] * s.length / 2, s.centre[1] + s.dir[1] * s.length / 2 - r];
    const ax = cx(a[0]), ay = cy(a[1]), bx2 = cx(b[0]), by2 = cy(b[1]);
    const ang = Math.atan2(by2 - ay, bx2 - ax), len = Math.hypot(bx2 - ax, by2 - ay), w = 2 * r * k;
    g.save(); g.translate(ax, ay); g.rotate(ang);
    g.fillStyle = s.kind === 'd' ? 'rgba(47,99,176,.10)' : 'rgba(47,99,176,.16)'; g.strokeStyle = '#2f63b0'; g.lineWidth = 3;
    g.beginPath(); g.rect(0, -w / 2, len, w); g.fill(); g.stroke(); g.restore();
    let rot = ang; if (rot > Math.PI / 2) rot -= Math.PI; if (rot < -Math.PI / 2) rot += Math.PI;
    const t = s.kind === 'd' ? (s.id.includes('dA') ? 0.3 : 0.7) : 0.5;
    const off = s.kind === 'h' ? (s.centre[1] > 1 ? -26 : 32) : 0;
    label(ax + (bx2 - ax) * t, ay + (by2 - ay) * t + off, `${s.length.toFixed(1)} מ׳`, s.kind === 'd' ? rot : 0);
  }
  for (const j of cube.joints.filter(q => q.side === side)) {
    g.fillStyle = '#f5f2e6'; g.strokeStyle = '#2f63b0'; g.lineWidth = 4;
    g.beginPath(); g.arc(cx(j.at[2]), cy(j.at[1] - r), 11, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  // heights of the side poles on the legs
  g.fillStyle = '#444'; g.font = '500 22px Rubik, Arial'; g.direction = 'rtl'; g.textAlign = 'center';
  const hs = [...new Set(cube.joints.filter(q => q.side === side && !q.b).map(q => Math.round((q.at[1] - r) * 100)))].sort((a, b) => a - b);
  const zOut = span + 0.32;
  for (const h of hs) g.fillText(`${h} ס״מ`, cx(zOut) + (side > 0 ? 18 : -18), cy(h / 100) + 8);
  g.font = '700 30px Rubik, Arial'; g.fillStyle = '#2f63b0';
  g.fillText(`שרטוט ${side > 0 ? 'הצד השמאלי' : 'הצד הימני'} · מבט מבחוץ`, W / 2, Hp - 24);
  if (mesh) {
    mesh.userData.tex.needsUpdate = true;
    const hc = (SIDE.hMax + SIDE.hMin) / 2;
    mesh.position.set(side * (SIDE.x0 + (hc - SIDE.hMin)), 0.006, span / 2);
    mesh.scale.set(spanZ / SIDE.spanZ, 1, 1);
    mesh.rotation.set(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
  }
}
