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
  renderer.toneMappingExposure = 1.05;
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

export function makeWorld(scene) {
  scene.background = canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#7fb0dc'); gr.addColorStop(0.55, '#c3dbea'); gr.addColorStop(1, '#efe7d2');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  scene.fog = new THREE.Fog(0xe4e2d2, 28, 75);

  const hemi = new THREE.HemisphereLight(0xdbe9ff, 0x8a7350, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(-5, 11, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  sun.target.position.set(0, 0, 0.5);
  scene.add(sun, sun.target);

  // the plaza: packed sand with tufts of dry grass
  const rnd = rand(7);
  const sand = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#cdb88e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 150 + rnd() * 70 | 0;
      g.fillStyle = `rgba(${v},${v * 0.86 | 0},${v * 0.62 | 0},${0.25 + rnd() * 0.3})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = `rgba(${110 + rnd() * 40 | 0},${120 + rnd() * 30 | 0},${60 + rnd() * 20 | 0},.55)`;
      const x = rnd() * w, y = rnd() * h;
      for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - .5) * 10, y - 4 - rnd() * 8); g.stroke(); }
    }
  }, 14);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: sand, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // a ring of pines around the plaza
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4f33, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4d6b3a, roughness: 1, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2 + rnd() * 0.2, d = 17 + rnd() * 14;
    const t = new THREE.Group();
    const hgt = 4 + rnd() * 4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, hgt * 0.5, 6), trunkMat);
    trunk.position.y = hgt * 0.25;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.4 + rnd(), hgt * 0.75, 7), leafMat);
    crown.position.y = hgt * 0.62;
    t.add(trunk, crown);
    t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d + 1);
    scene.add(t);
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
  const m = new THREE.Mesh(new THREE.PlaneGeometry(BP.span, BP.span), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
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
export function makeMallet() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.55, 8), new THREE.MeshStandardMaterial({ color: 0xb08a5a }));
  handle.position.y = 0.275;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0x6d4c2c }));
  head.rotation.z = Math.PI / 2; head.position.y = 0.56;
  g.add(handle, head);
  g.visible = false;
  return g;
}

// ---------- people ----------
const skin = new THREE.MeshStandardMaterial({ color: 0xc89a74, roughness: 0.8 });
const shirt = new THREE.MeshStandardMaterial({ color: 0xc7b285, roughness: 0.9 });
const pants = new THREE.MeshStandardMaterial({ color: 0x3e4b5e, roughness: 0.9 });
const hair = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 1 });
const scarfColors = [0x2f63b0, 0xb23a2e, 0x2e7d4f, 0x6a3fa0];
export function makePerson(i = 0) {
  const g = new THREE.Group();
  const scarf = new THREE.MeshStandardMaterial({ color: scarfColors[i % scarfColors.length] });
  const legGeo = new THREE.CapsuleGeometry(0.065, 0.62, 4, 8);
  const lL = new THREE.Mesh(legGeo, pants); lL.position.set(-0.09, 0.43, 0);
  const lR = new THREE.Mesh(legGeo, pants); lR.position.set(0.09, 0.43, 0);
  const torso = new THREE.Group(); torso.position.y = 0.82;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.36, 4, 10), shirt); body.position.y = 0.3; body.scale.z = 0.7;
  const sc = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), scarf); sc.position.set(0, 0.5, 0.11); sc.rotation.x = Math.PI;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), skin); head.position.y = 0.73;
  const hr = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair); hr.position.y = 0.745; hr.rotation.x = -0.25;
  const armGeo = new THREE.CapsuleGeometry(0.045, 0.5, 4, 8);
  const aL = new THREE.Group(); aL.position.set(-0.2, 0.55, 0);
  const aR = new THREE.Group(); aR.position.set(0.2, 0.55, 0);
  for (const a of [aL, aR]) { const m = new THREE.Mesh(armGeo, shirt); m.position.y = -0.27; m.castShadow = true; a.add(m); }
  torso.add(body, sc, head, hr, aL, aR);
  g.add(lL, lR, torso);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { torso, aL, aR };
  return g;
}
// lean: + forward; reach: arm angle forward (0 down, PI/2 straight ahead, PI up)
export function posePerson(p, lean = 0, reach = 0.3) {
  const { torso, aL, aR } = p.userData;
  torso.rotation.x = lean;
  aL.rotation.x = -reach; aR.rotation.x = -reach;
}
