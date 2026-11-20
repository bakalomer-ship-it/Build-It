// Scene dressing: renderer, sky, ground, textures, poles, ropes, people.
import * as THREE from 'three';
import { SLOTS, LEVEL, LEG_STAKES } from './level1.js';
import { slotPoint } from './klafSim.js';

export const R = LEVEL.poleRadius;
// poles are drawn a little thicker than the physics radius: chunky, like the reference
export const POLE_LOOK = 1.3;

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
// Omer's reference images (2026-11-15): a warm sand plaza in a clearing ringed by
// dense forest, rocks, a tent and crates; chunky wooden poles with thick rope.
export const PALETTE = {
  skyTop: '#6fb7e6', skyBottom: '#dff1ff',
  grass: '#5e9f36', grassDark: '#477f27', grassLight: '#7dbb47',
  plaza: '#e8bf6a', plazaEdge: '#c79447',
  leaf: [0x4f9a2c, 0x3f8424, 0x66b23a], pine: [0x2f7d32, 0x3b8f3a, 0x276b2b], trunk: 0x7a4a26, rock: 0xa9a49a, moss: 0x6f9e35,
};
// the plaza: bigger than in the reference images (Omer), so many structures fit
export const PLAZA = { w: 30, d: 26, r: 7, cz: 0.5 };
export function makeWorld(scene) {
  scene.background = canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, PALETTE.skyTop); gr.addColorStop(1, PALETTE.skyBottom);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  scene.fog = new THREE.Fog(0x9cc58a, 70, 160);

  const hemi = new THREE.HemisphereLight(0xe4f2ff, 0x6b8a3a, 1.15);
  scene.add(hemi);
  // a warm late-morning sun from the upper left, long soft shadows
  const sun = new THREE.DirectionalLight(0xffe6b8, 2.7);
  sun.position.set(-9, 15, -8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 70 });
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
  const PW = PLAZA.w, PD = PLAZA.d, PR = PLAZA.r;
  const shape = new THREE.Shape();
  shape.moveTo(-PW / 2 + PR, -PD / 2);
  shape.lineTo(PW / 2 - PR, -PD / 2); shape.quadraticCurveTo(PW / 2, -PD / 2, PW / 2, -PD / 2 + PR);
  shape.lineTo(PW / 2, PD / 2 - PR); shape.quadraticCurveTo(PW / 2, PD / 2, PW / 2 - PR, PD / 2);
  shape.lineTo(-PW / 2 + PR, PD / 2); shape.quadraticCurveTo(-PW / 2, PD / 2, -PW / 2, PD / 2 - PR);
  shape.lineTo(-PW / 2, -PD / 2 + PR); shape.quadraticCurveTo(-PW / 2, -PD / 2, -PW / 2 + PR, -PD / 2);
  const sandTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = PALETTE.plaza; g.fillRect(0, 0, w, h);
    // soft packed-sand tiles, as in the reference, plus grit
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? 'rgba(255,240,200,.05)' : 'rgba(160,110,40,.03)';
      g.fillRect(x * w / 4, y * h / 4, w / 4, h / 4);
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.18)' : 'rgba(150,110,60,.14)';
      g.beginPath(); g.arc(rnd() * w, rnd() * h, 0.8 + rnd() * 2.2, 0, Math.PI * 2); g.fill();
    }
  });
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping; sandTex.repeat.set(0.18, 0.18);
  const edge = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), new THREE.MeshStandardMaterial({ color: PALETTE.plazaEdge, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  edge.rotation.x = -Math.PI / 2; edge.position.set(0, 0.001, 0.5); edge.scale.set(1.04, 1.045, 1); edge.receiveShadow = true;
  const plaza = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.002, PLAZA.cz); plaza.receiveShadow = true;
  scene.add(edge, plaza);

  // a dense forest ring around the clearing (instanced, so a phone can draw hundreds of trees)
  const trunkMat = new THREE.MeshStandardMaterial({ color: PALETTE.trunk, roughness: 1 });
  const leafMats = PALETTE.leaf.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }));
  const pineMats = PALETTE.pine.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
  const rockMat = new THREE.MeshStandardMaterial({ color: PALETTE.rock, roughness: 1, flatShading: true });
  const mossMat = new THREE.MeshStandardMaterial({ color: PALETTE.moss, roughness: 1, flatShading: true });
  const edgeDist = (x, z) => { // how far outside the plaza's rounded rectangle a point is
    const dx = Math.max(0, Math.abs(x) - (PW / 2 - PR)), dz = Math.max(0, Math.abs(z - PLAZA.cz) - (PD / 2 - PR));
    return Math.hypot(dx, dz) - PR;
  };
  const spots = { pine: [], round: [] };
  for (let i = 0; i < 2600 && spots.pine.length + spots.round.length < 520; i++) {
    const x = (rnd() - 0.5) * 90, z = PLAZA.cz + (rnd() - 0.5) * 80;
    const e = edgeDist(x, z);
    if (e < 0.8 || e > 26) continue;
    if (e > 6 && rnd() < 0.35) continue; // thinner far away, where the fog takes over
    (rnd() < 0.62 ? spots.pine : spots.round).push([x, z, 0.85 + rnd() * 0.7 + Math.min(0.5, e * 0.03), rnd() * 6]);
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
  const instanced = (geo, mat, list, place) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => { place(it, P, S); Q.setFromAxisAngle(UPV, it[3]); M.compose(P, Q, S); m.setMatrixAt(i, M); });
    m.castShadow = true; m.receiveShadow = true; scene.add(m); return m;
  };
  // pines: a trunk and three stacked cones
  instanced(new THREE.CylinderGeometry(0.14, 0.2, 1.2, 6), trunkMat, spots.pine, ([x, z, sc], p, s) => { p.set(x, 0.6 * sc, z); s.setScalar(sc); });
  [[1.35, 1.6, 1.4], [1.05, 1.4, 2.2], [0.7, 1.2, 2.9]].forEach(([r, h, y], k) => {
    const groups = [[], [], []]; spots.pine.forEach((it, i) => groups[(i + k) % 3].push(it));
    groups.forEach((g, gi) => instanced(new THREE.ConeGeometry(r, h, 8), pineMats[gi], g, ([x, z, sc], p, s) => { p.set(x, y * sc, z); s.setScalar(sc); }));
  });
  // round leafy trees: a trunk and a lumpy crown
  instanced(new THREE.CylinderGeometry(0.16, 0.24, 1.4, 6), trunkMat, spots.round, ([x, z, sc], p, s) => { p.set(x, 0.7 * sc, z); s.setScalar(sc); });
  [[1.1, 2.0, 0], [0.85, 2.6, 0.5], [0.8, 2.3, -0.55]].forEach(([r, y, off], k) => {
    const groups = [[], [], []]; spots.round.forEach((it, i) => groups[(i + k) % 3].push(it));
    groups.forEach((g, gi) => instanced(new THREE.IcosahedronGeometry(r, 1), leafMats[gi], g, ([x, z, sc, a], p, s) => { p.set(x + Math.cos(a) * off * sc, y * sc, z + Math.sin(a) * off * sc); s.setScalar(sc); }));
  });
  // rocks with mossy tops and bushes along the edge of the clearing
  const rocks = [], bushes = [];
  for (let i = 0; i < 400 && rocks.length + bushes.length < 120; i++) {
    const x = (rnd() - 0.5) * (PW + 10), z = PLAZA.cz + (rnd() - 0.5) * (PD + 10), e = edgeDist(x, z);
    if (e < -2.2 || e > 2.5) continue;
    (rnd() < 0.35 ? rocks : bushes).push([x, z, 0.5 + rnd() * 1.1, rnd() * 6]);
  }
  instanced(new THREE.DodecahedronGeometry(0.6, 0), rockMat, rocks, ([x, z, sc], p, s) => { p.set(x, 0.18 * sc, z); s.set(sc * 1.2, sc * 0.75, sc); });
  instanced(new THREE.DodecahedronGeometry(0.5, 0), mossMat, rocks, ([x, z, sc], p, s) => { p.set(x, 0.42 * sc, z); s.set(sc * 1.0, sc * 0.35, sc * 0.85); });
  instanced(new THREE.IcosahedronGeometry(0.5, 1), leafMats[2], bushes, ([x, z, sc], p, s) => { p.set(x, 0.22 * sc, z); s.set(sc, sc * 0.75, sc); });
  // grass tufts scattered on the sand near the edge
  const tufts = [];
  for (let i = 0; i < 900 && tufts.length < 220; i++) {
    const x = (rnd() - 0.5) * PW, z = PLAZA.cz + (rnd() - 0.5) * PD, e = edgeDist(x, z);
    if (e > -0.3 || e < -4) continue;
    tufts.push([x, z, 0.5 + rnd() * 0.6, rnd() * 6]);
  }
  instanced(new THREE.ConeGeometry(0.18, 0.4, 4), leafMats[0], tufts, ([x, z, sc], p, s) => { p.set(x, 0.18 * sc, z); s.setScalar(sc); });

  // camp corner: a tent, crates and a barrel at the edge of the plaza
  const camp = new THREE.Group();
  const canvasMat = new THREE.MeshStandardMaterial({ color: 0x8f8a5a, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
  const tent = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 3.0, 3, 1), canvasMat);
  tent.rotation.z = Math.PI / 2; tent.rotation.y = Math.PI / 2; tent.position.y = 0.62; tent.scale.set(1, 1, 1);
  camp.add(tent);
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xb07a43, roughness: 0.9 });
  const crateEdge = new THREE.MeshStandardMaterial({ color: 0x7a4f27, roughness: 0.9 });
  const crate = (x, z, sz, y = 0) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), [crateMat, crateMat, crateEdge, crateMat, crateMat, crateMat]);
    c.position.set(x, y + sz / 2, z); c.rotation.y = x * 0.7; camp.add(c);
  };
  crate(2.0, 0.6, 0.55); crate(2.5, 0.1, 0.5); crate(2.15, 0.45, 0.42, 0.55); crate(1.4, -1.6, 0.5); crate(1.9, -1.9, 0.45);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.65, 12), new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.8 }));
  barrel.position.set(1.6, 0.33, 1.3); camp.add(barrel);
  camp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  camp.position.set(PW / 2 - 3.2, 0, PLAZA.cz - 3.5); camp.rotation.y = -0.2;
  scene.add(camp);
  return { sun };
}

// ---------- the blueprint drawing (שרטוט קלף) ----------
export const BP = { size: 1024, span: 2.9, u0: 0, v0: 1.2 };
// the sheet's size for a 2×2 klaf; a bigger klaf (the carousel's 5 m klafim) gets a bigger sheet at the same 1:1 scale
export const BP_BASE = { span: 2.9, v0: 1.2 };
export function setBlueprintSize(span, v0) { BP.span = span; BP.v0 = v0; }
// Seen from above (and from the pullers), +u is on the left, so the
// drawing is mirrored relative to the klaf's own u axis.
function bx(u) { return BP.size / 2 - (u - BP.u0) * BP.size / BP.span; }
function by(v) { return BP.size / 2 - (v - BP.v0) * BP.size / BP.span; }

export function drawBlueprint(g, opts = {}) {
  const S = BP.size, k = S / BP.span;
  g.save();
  g.fillStyle = '#f5f2e6'; g.fillRect(0, 0, S, S);
  // grid every 10 cm, heavier every 50 cm
  const nGrid = Math.ceil(BP.span / 0.2) + 1;
  for (let i = -nGrid; i <= nGrid; i++) {
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
    const upright = slot.id.startsWith('leg') || slot.id === 'post';
    let off = upright ? (slot.centre[0] > 0 ? -44 : 44) : (slot.id === 'topH' || slot.id === 'midH' ? -30 : slot.id === 'botH' ? 34 : 0);
    if (upright) mx += off; else my += off;
    g.save(); g.translate(mx, my);
    let rot = ang; if (rot > Math.PI / 2) rot -= Math.PI; if (rot < -Math.PI / 2) rot += Math.PI;
    if (slot.id.startsWith('diag')) g.rotate(rot); else if (upright) g.rotate(-Math.PI / 2);
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
  // measured from the plan itself: leg to leg, the legs' height, the bottom pole's height
  const legs = SLOTS.filter(q => q.id.startsWith('leg'));
  // (leaning legs, as in an A, are measured at their ends)
  const ends = legs.flatMap(q => [slotPoint(q, -q.length / 2), slotPoint(q, q.length / 2)]);
  const half = legs.length ? Math.max(...ends.map(p => Math.abs(p[0]))) : 1.0;
  const high = legs.length ? Math.max(...ends.map(p => p[1])) : 2.0;
  const botV = SLOTS.find(q => q.id === 'botH')?.centre[1] ?? 0.3, midV = SLOTS.find(q => q.id === 'midH')?.centre[1];
  const fmt = v => `${(Math.round(v * 10) / 10).toFixed(1)} מ׳`;
  const dimY = by(high + 0.32);
  arrowLine(g, bx(-half), dimY, bx(half), dimY);
  g.textAlign = 'center'; g.fillText(`רוחב ${fmt(2 * half)}`, (bx(-half) + bx(half)) / 2, dimY - 12);
  const dimX = bx(-half - 0.22);
  arrowLine(g, dimX, by(0), dimX, by(high));
  g.save(); g.translate(dimX + 30, by(high / 2)); g.rotate(Math.PI / 2); g.fillText(`גובה ${fmt(high)}`, 0, 0); g.restore();
  const dimX2 = bx(half + 0.2);
  arrowLine(g, dimX2, by(0), dimX2, by(botV));
  g.textAlign = 'left'; g.fillText(`${Math.round(botV * 100)} ס״מ`, dimX2 + 10, by(botV / 2) + 8);
  if (midV != null) {
    const dimX3 = bx(half + 0.45);
    arrowLine(g, dimX3, by(0), dimX3, by(midV));
    g.save(); g.translate(dimX3 - 12, by(midV / 2)); g.rotate(Math.PI / 2); g.textAlign = 'center'; g.fillText(fmt(midV), 0, 0); g.restore();
  }

  // title block
  const tbW = 330, tbH = 104, tx = 24, ty = S - tbH - 24;
  g.fillStyle = 'rgba(245,242,230,.95)'; g.fillRect(tx, ty, tbW, tbH);
  g.strokeStyle = '#2f63b0'; g.lineWidth = 3; g.strokeRect(tx, ty, tbW, tbH);
  g.fillStyle = '#1d2318'; g.textAlign = 'right'; g.direction = 'rtl';
  g.font = '800 30px Rubik, Arial'; g.fillText(opts.title || 'קלף 2×2 · שרטוט קלף', tx + tbW - 14, ty + 40);
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
  m.userData = { canvas: c, tex, joints };
  // redraw once the web font has arrived
  if (document.fonts?.ready) document.fonts.ready.then(() => { drawBlueprint(c.getContext('2d'), { joints: m.userData.joints, title: m.userData.title }); tex.needsUpdate = true; });
  return m;
}
// draw the current plan on a klaf's sheet again, at the sheet size in BP
export function redrawBlueprint(m, joints, title) {
  Object.assign(m.userData, { joints, title });
  drawBlueprint(m.userData.canvas.getContext('2d'), { joints, title });
  m.userData.tex.needsUpdate = true;
  const k = BP.span / BP_BASE.span;
  m.scale.set(k, k, 1);
  m.position.x = BP.u0;
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
  const m = new THREE.Mesh(new THREE.CylinderGeometry(R * POLE_LOOK, R * POLE_LOOK, 1, 14, 1), [side, end, end]);
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
// snug on the pole: the rope's inner edge just touches the drawn wood
const coilGeo = new THREE.TorusGeometry(R * POLE_LOOK + 0.011, 0.014, 6, 18);
const Z = new THREE.Vector3(0, 0, 1);
export function makeLashing() {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(coilGeo, ropeMat); t.castShadow = true; g.add(t); }
  return g;
}
// coils around pole A on both sides of pole B, and around B on both sides of A.
// p is between the two poles; sep runs from there to pole A's axis (B's is the other way),
// so each coil sits on its own pole instead of hanging in the gap between them
export function placeLashing(g, p, dA, dB, sep = [0, 0, 0]) {
  const P = new THREE.Vector3(...p), A = new THREE.Vector3(...dA).normalize(), B = new THREE.Vector3(...dB).normalize();
  const S = new THREE.Vector3(...sep);
  const offs = [[A, B, -1], [A, B, 1], [A, B, -1.7], [B, A, -1], [B, A, 1], [B, A, 1.7]];
  g.children.forEach((t, i) => {
    const [axis, along, s] = offs[i];
    t.position.copy(P).addScaledVector(along, s * 0.075).addScaledVector(S, axis === A ? 1 : -1);
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
// Small, stocky scouts with big heads and green caps (Omer's reference images),
// about 1.4 m tall: roughly two thirds of a 2 m klaf leg.
const cap = new THREE.MeshStandardMaterial({ color: 0x3f7d2c, roughness: 0.85 });
export function makePerson(i = 0, { noCap = false } = {}) {
  const g = new THREE.Group();
  const scarf = new THREE.MeshStandardMaterial({ color: scarfColors[i % scarfColors.length] });
  const legGeo = new THREE.CapsuleGeometry(0.085, 0.42, 4, 8);
  // legs hang from hip pivots so they can swing while walking
  const lL = new THREE.Group(); lL.position.set(-0.1, 0.62, 0);
  const lR = new THREE.Group(); lR.position.set(0.1, 0.62, 0);
  for (const l of [lL, lR]) { const m = new THREE.Mesh(legGeo, pants); m.position.y = -0.3; l.add(m); }
  const torso = new THREE.Group(); torso.position.y = 0.62;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.26, 4, 10), shirt); body.position.y = 0.3; body.scale.z = 0.8;
  const sc = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 6), scarf); sc.position.set(0, 0.46, 0.15); sc.rotation.x = Math.PI;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 12), skin); head.position.y = 0.82;
  const hr = new THREE.Mesh(new THREE.SphereGeometry(0.237, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair); hr.position.y = 0.84; hr.rotation.x = -0.25;
  torso.add(body, sc, head, hr);
  if (!noCap) {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.245, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), cap); crown.position.y = 0.87;
    const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), cap);
    peak.position.set(0, 0.9, 0.16); peak.scale.z = 1.1;
    torso.add(crown, peak);
  }
  const armGeo = new THREE.CapsuleGeometry(0.06, 0.36, 4, 8);
  const aL = new THREE.Group(); aL.position.set(-0.25, 0.5, 0);
  const aR = new THREE.Group(); aR.position.set(0.25, 0.5, 0);
  for (const a of [aL, aR]) { const m = new THREE.Mesh(armGeo, shirt); m.position.y = -0.2; m.castShadow = true; a.add(m); }
  torso.add(aL, aR);
  g.add(lL, lR, torso);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { torso, aL, aR, lL, lR };
  const outer = new THREE.Group();
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
  const D = cube.depth, span = cube.span ?? D, LH = cube.height ?? 2.0;
  // a bigger cube (the carousel's 5×5) gets a bigger sheet at the same scale
  const big = D - 1.8;
  const spanZ = SIDE.spanZ + (span - D) + big, hMax = SIDE.hMax + (LH - 2.0), hMin = SIDE.hMin;
  const H = hMax - hMin, W = Math.round(SIDE.px * spanZ / SIDE.spanZ), Hp = Math.round(SIDE.px * H / SIDE.spanZ);
  c.width = W; c.height = Hp;
  const g = c.getContext('2d');
  const zMin = span / 2 - spanZ / 2, k = W / spanZ;
  // seen from outside the side: on the left side +z runs right, on the right side it runs left
  const cx = z => side > 0 ? (z - zMin) * k : (zMin + spanZ - z) * k;
  const cy = h => (hMax - h) * k;
  g.fillStyle = '#f5f2e6'; g.fillRect(0, 0, W, Hp);
  for (let i = -Math.ceil(spanZ * 5) - 1; i <= Math.max(30, Math.ceil(hMax * 10)); i++) {
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
    g.fillRect(cx(z) - r * k, cy(LH), 2 * r * k, LH * k); g.strokeRect(cx(z) - r * k, cy(LH), 2 * r * k, LH * k);
    g.fillStyle = '#6b5f50'; g.fillText(`רגל ה${klafNames[i]}`, cx(z), cy(LH) - 14);
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
    const off = s.kind === 'h' ? (s.centre[1] > 1 ? -26 : 32) : 0; // (labels sit above the upper poles, below the bottom one)
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
    const hc = (hMax + hMin) / 2, x0 = SIDE.x0 + ((cube.legX ?? 0.9) - 0.9);
    mesh.position.set(side * (x0 + (hc - hMin)), 0.006, span / 2);
    mesh.scale.set(spanZ / SIDE.spanZ, 1, H / (SIDE.hMax - SIDE.hMin));
    mesh.rotation.set(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
  }
}

// ---------- the top drawing (מבט על) ----------
// The flat Xs at the 2 m level, seen from above: the klafim as grey lines, the
// top side poles they rest on, and the diagonals to add (blue). It lies on the
// ground in front of the structure, turned like the structure itself.
const TOP = { w: 2.8, px: 1024 };
export function makeTopSheet() {
  const c = document.createElement('canvas');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
  m.receiveShadow = true;
  m.userData = { canvas: c, tex };
  return m;
}
export function drawTopSheet(mesh, cube, klafNames, canvas = null) {
  const c = canvas || mesh.userData.canvas;
  const D = cube.depth, span = cube.span ?? D, depth = span + 1.0, LX = cube.legX ?? 0.9, TW = TOP.w + 2 * (LX - 0.9), W = TOP.px, k = W / TW, Hp = Math.round(depth * k);
  c.width = W; c.height = Hp;
  const g = c.getContext('2d');
  // seen from above with the front klaf at the bottom: +x (the left side) on the left
  const cx = x => (TW / 2 - x) * k, cy = z => (span + 0.5 - z) * k;
  g.fillStyle = '#f5f2e6'; g.fillRect(0, 0, W, Hp);
  for (let i = -Math.ceil(TW * 5) - 1; i <= Math.ceil(depth * 10) + 1; i++) {
    g.strokeStyle = i % 5 === 0 ? 'rgba(47,99,176,.22)' : 'rgba(47,99,176,.08)'; g.lineWidth = i % 5 === 0 ? 2 : 1;
    g.beginPath(); g.moveTo(cx(i * 0.1), 0); g.lineTo(cx(i * 0.1), Hp); g.stroke();
    g.beginPath(); g.moveTo(0, cy(i * 0.1)); g.lineTo(W, cy(i * 0.1)); g.stroke();
  }
  const r = R, bar = (a, b, fill, stroke) => {
    const ax = cx(a[0]), ay = cy(a[2]), bx = cx(b[0]), by = cy(b[2]);
    const ang = Math.atan2(by - ay, bx - ax), len = Math.hypot(bx - ax, by - ay), w = 2 * r * k;
    g.save(); g.translate(ax, ay); g.rotate(ang); g.fillStyle = fill; g.strokeStyle = stroke; g.lineWidth = 3;
    g.beginPath(); g.rect(0, -w / 2, len, w); g.fill(); g.stroke(); g.restore();
    return ang;
  };
  g.font = '700 24px Rubik, Arial'; g.textAlign = 'center'; g.direction = 'rtl';
  // the klafim (their top horizontals) and the top side poles, already there (grey)
  klafNames.forEach((name, i) => {
    bar([LX + 0.2, 0, i * D], [-LX - 0.2, 0, i * D], 'rgba(120,110,95,.35)', 'rgba(90,80,70,.7)');
    g.fillStyle = '#6b5f50'; g.fillText(name, cx(0), cy(i * D) + (i === 0 ? 40 : -18));
  });
  const topY = Math.max(...cube.slots.filter(q => q.kind === 'h' && q.side).map(q => q.centre[1]));
  for (const s of cube.slots.filter(q => q.kind === 'h' && q.side && q.centre[1] >= topY - 0.01)) {
    const h = s.length / 2;
    bar([s.centre[0], 0, s.centre[2] - h], [s.centre[0], 0, s.centre[2] + h], 'rgba(120,110,95,.25)', 'rgba(90,80,70,.55)');
  }
  // the flat Xs to add (blue), with their lengths
  for (const s of cube.slots.filter(q => q.side === 0)) {
    const h = s.length / 2;
    const a = [s.centre[0] - s.dir[0] * h, 0, s.centre[2] - s.dir[2] * h], b = [s.centre[0] + s.dir[0] * h, 0, s.centre[2] + s.dir[2] * h];
    let rot = bar(a, b, 'rgba(47,99,176,.12)', '#2f63b0');
    if (rot > Math.PI / 2) rot -= Math.PI; if (rot < -Math.PI / 2) rot += Math.PI;
    const t = s.id.includes('xA') ? 0.27 : 0.73, x = cx(a[0] + (b[0] - a[0]) * t), y = cy(a[2] + (b[2] - a[2]) * t);
    g.save(); g.translate(x, y); g.rotate(rot); g.font = '700 26px Rubik, Arial'; g.direction = 'ltr'; g.textAlign = 'center';
    const text = `${s.length.toFixed(1)} מ׳`, tw = g.measureText(text).width;
    g.fillStyle = 'rgba(245,242,230,.92)'; g.fillRect(-tw / 2 - 6, -22, tw + 12, 30); g.fillStyle = '#2f63b0'; g.fillText(text, 0, 2); g.restore();
  }
  for (const j of cube.joints.filter(q => q.side === 0)) {
    g.fillStyle = '#f5f2e6'; g.strokeStyle = '#2f63b0'; g.lineWidth = 4;
    g.beginPath(); g.arc(cx(j.at[0]), cy(j.at[2]), 11, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  g.font = '700 30px Rubik, Arial'; g.fillStyle = '#2f63b0'; g.direction = 'rtl';
  g.fillText(cube.sheetTitle || 'שרטוט מבט על · בגובה 2 מ׳', W / 2, Hp - 16);
  g.font = '500 22px Rubik, Arial'; g.fillStyle = '#444';
  g.fillText('צד שמאל', cx(LX + 0.3), 30); g.fillText('צד ימין', cx(-LX - 0.3), 30);
  if (mesh) {
    mesh.userData.tex.needsUpdate = true;
    // in front of the front klaf, past the front guy stakes' row
    mesh.scale.set(TW, 1, depth);
    mesh.rotation.set(0, Math.PI, 0); // its +x drawn on the left, as the pullers see it
    mesh.position.set(0, 0.006, -(depth / 2 + (cube.topSheetGap ?? 2.9)));
  }
}

// ---------- the carousel's seat drawing ----------
// The seat (an octagon with a # inside) is built lying on its drawing, on the
// ground in the middle of the cube, at 1:1, as a klaf is.
export function makeSeatSheet(seat, centre, size = 3.9) {
  const px = 1024, k = px / size;
  const c = document.createElement('canvas'); c.width = c.height = px;
  const draw = () => {
    const g = c.getContext('2d');
    // seen from above, from the front: +x on the left (as the pullers see it), +z up the sheet
    const cx = x => px / 2 - (x - centre[0]) * k, cy = z => px / 2 - (z - centre[1]) * k;
    g.fillStyle = '#f5f2e6'; g.fillRect(0, 0, px, px);
    for (let i = -20; i <= 20; i++) {
      g.strokeStyle = i % 5 === 0 ? 'rgba(47,99,176,.22)' : 'rgba(47,99,176,.08)'; g.lineWidth = i % 5 === 0 ? 2 : 1;
      g.beginPath(); g.moveTo(cx(centre[0] + i * 0.1), 0); g.lineTo(cx(centre[0] + i * 0.1), px); g.stroke();
      g.beginPath(); g.moveTo(0, cy(centre[1] + i * 0.1)); g.lineTo(px, cy(centre[1] + i * 0.1)); g.stroke();
    }
    const w = 2 * R * k;
    for (const sl of seat.slots) {
      const h = sl.length / 2, a = [sl.centre[0] - sl.dir[0] * h, sl.centre[2] - sl.dir[2] * h], b = [sl.centre[0] + sl.dir[0] * h, sl.centre[2] + sl.dir[2] * h];
      const ax = cx(a[0]), ay = cy(a[1]), bx2 = cx(b[0]), by2 = cy(b[1]), ang = Math.atan2(by2 - ay, bx2 - ax), len = Math.hypot(bx2 - ax, by2 - ay);
      g.save(); g.translate(ax, ay); g.rotate(ang);
      g.fillStyle = sl.plus ? 'rgba(47,99,176,.10)' : 'rgba(47,99,176,.16)'; g.strokeStyle = '#2f63b0'; g.lineWidth = 3;
      g.beginPath(); g.rect(0, -w / 2, len, w); g.fill(); g.stroke(); g.restore();
    }
    // lengths: one label for the octagon's sides, one for the # (they are all alike)
    const label = (x, y, text) => { g.font = '700 28px Rubik, Arial'; g.direction = 'ltr'; g.textAlign = 'center'; const tw = g.measureText(text).width;
      g.fillStyle = 'rgba(245,242,230,.92)'; g.fillRect(x - tw / 2 - 6, y - 22, tw + 12, 30); g.fillStyle = '#2f63b0'; g.fillText(text, x, y + 2); };
    const o = seat.slots.find(q => q.oct === 7), p = seat.slots.find(q => q.plus === 'x');
    if (o) label(cx(o.centre[0]) + 50, cy(o.centre[2]), `${o.length.toFixed(1)} מ׳`);
    if (p) label(cx(p.centre[0] - 1.0), cy(p.centre[2]) + 30, `${p.length.toFixed(1)} מ׳`);
    for (const j of seat.joints) {
      g.fillStyle = '#f5f2e6'; g.strokeStyle = '#2f63b0'; g.lineWidth = 4;
      g.beginPath(); g.arc(cx(j.at[0]), cy(j.at[2]), 10, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    // the mast's place in the middle square
    g.strokeStyle = '#c0392b'; g.lineWidth = 3; g.setLineDash([8, 6]);
    g.beginPath(); g.arc(cx(centre[0]), cy(centre[1]), R * k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#1d2318'; g.font = '800 30px Rubik, Arial'; g.textAlign = 'center'; g.direction = 'rtl';
    g.fillText('מושב הקרוסלה · מבט על', px / 2, px - 70);
    g.font = '500 22px Rubik, Arial'; g.fillStyle = '#4a4a3a';
    g.fillText('מתומן של 8 סנדות, ובתוכו # של 4 סנדות. התורן עובר בריבוע האמצעי', px / 2, px - 38);
  };
  draw();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(size, size); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
  m.rotation.y = Math.PI; // its +x drawn on the left
  m.position.set(centre[0], 0.006, centre[1]);
  m.receiveShadow = true; m.visible = false;
  if (document.fonts?.ready) document.fonts.ready.then(() => { draw(); tex.needsUpdate = true; });
  m.userData = { canvas: c, draw };
  return m;
}

// ---------- free build: the ground grid a klaf is designed on ----------
// No drawing to follow: a squared sheet with the foot line, the middle line
// and the heights marked. grid: { uMax, vMin, vMax } in metres.
export function makeFreeGrid(grid) {
  const W = 2 * grid.uMax + 0.4, H = grid.vMax - grid.vMin + 0.1, k = 256; // px per metre
  const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
  const g = c.getContext('2d');
  const cx = u => (W / 2 - u) * k, cy = v => (grid.vMax + 0.1 - v) * k;
  g.fillStyle = '#f5f2e6'; g.fillRect(0, 0, c.width, c.height);
  for (let i = -Math.round(grid.uMax * 10); i <= Math.round(grid.uMax * 10); i++) {
    g.strokeStyle = i % 10 === 0 ? 'rgba(47,99,176,.34)' : i % 5 === 0 ? 'rgba(47,99,176,.2)' : 'rgba(47,99,176,.08)';
    g.lineWidth = i % 5 === 0 ? 2 : 1;
    g.beginPath(); g.moveTo(cx(i / 10), cy(grid.vMax)); g.lineTo(cx(i / 10), cy(0)); g.stroke();
  }
  for (let i = 0; i <= Math.round(grid.vMax * 10); i++) {
    g.strokeStyle = i % 10 === 0 ? 'rgba(47,99,176,.34)' : i % 5 === 0 ? 'rgba(47,99,176,.2)' : 'rgba(47,99,176,.08)';
    g.lineWidth = i % 5 === 0 ? 2 : 1;
    g.beginPath(); g.moveTo(cx(-grid.uMax), cy(i / 10)); g.lineTo(cx(grid.uMax), cy(i / 10)); g.stroke();
  }
  // the middle of the klaf
  g.strokeStyle = 'rgba(47,99,176,.45)'; g.lineWidth = 3; g.setLineDash([14, 12]);
  g.beginPath(); g.moveTo(cx(0), cy(grid.vMax)); g.lineTo(cx(0), cy(0)); g.stroke();
  // the foot line: legs stand here
  g.strokeStyle = '#8a6a43'; g.lineWidth = 6; g.setLineDash([22, 12]);
  g.beginPath(); g.moveTo(cx(-grid.uMax), cy(0)); g.lineTo(cx(grid.uMax), cy(0)); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#8a6a43'; g.font = '700 30px Rubik, Arial'; g.textAlign = 'center'; g.direction = 'rtl';
  g.fillText('קו הרגליים: כאן עומדות רגלי הקלף', cx(0), cy(0) + 44);
  g.fillStyle = '#2f63b0'; g.font = '700 28px Rubik, Arial'; g.textAlign = 'left';
  for (let m = 1; m <= Math.floor(grid.vMax); m++) g.fillText(`${m} מ׳`, cx(grid.uMax) - 78, cy(m) - 8);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
  m.rotation.set(-Math.PI / 2, 0, Math.PI);
  m.position.set(0, 0.004, (grid.vMax + 0.1 + grid.vMin - 0.0) / 2 + (H - (grid.vMax + 0.1 - grid.vMin)) / 2);
  m.receiveShadow = true; m.visible = false;
  return m;
}

// ---------- tripod (חצובה) ----------
// The sheet the three legs are laid on: three lines side by side, and where the
// tripod lashing goes. plan: { slots, lashV, legLength } in the klaf-plane (u across, v along).
const TRI_SHEET = { uMax: 0.8, v0: -0.3, v1: 4.9, k: 200 };
function drawTripodSheet(c, plan) {
  const S = TRI_SHEET, W = 2 * S.uMax, H = S.v1 - S.v0;
  c.width = Math.round(W * S.k); c.height = Math.round(H * S.k);
  const g = c.getContext('2d');
  const cx = u => (S.uMax - u) * S.k, cy = v => (S.v1 - v) * S.k;
  g.fillStyle = '#f5f2e6'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i <= Math.round(H * 10); i++) {
    const v = S.v0 + i / 10;
    g.strokeStyle = Math.round(v * 10) % 10 === 0 ? 'rgba(47,99,176,.3)' : 'rgba(47,99,176,.08)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, cy(v)); g.lineTo(c.width, cy(v)); g.stroke();
  }
  // the feet line
  g.strokeStyle = '#8a6a43'; g.lineWidth = 5; g.setLineDash([18, 10]);
  g.beginPath(); g.moveTo(10, cy(0)); g.lineTo(c.width - 10, cy(0)); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#8a6a43'; g.font = '700 24px Rubik, Arial'; g.textAlign = 'center'; g.direction = 'rtl';
  g.fillText('כאן הרגליים', cx(0), cy(0) + 34);
  for (const s of plan.slots) {
    const w = R * 2 * S.k;
    g.fillStyle = 'rgba(47,99,176,.16)'; g.strokeStyle = '#2f63b0'; g.lineWidth = 3;
    g.beginPath(); g.rect(cx(s.centre[0]) - w / 2, cy(s.centre[1] + s.length / 2), w, s.length * S.k); g.fill(); g.stroke();
  }
  // the lashing: a band across the three
  g.strokeStyle = '#c8452c'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(cx(0.3), cy(plan.lashV)); g.lineTo(cx(-0.3), cy(plan.lashV)); g.stroke();
  g.fillStyle = '#c8452c'; g.font = '700 24px Rubik, Arial'; g.textAlign = 'left';
  g.fillText(`${Math.round((plan.legLength - plan.lashV) * 100)} ס״מ מהראש`, cx(0.36) - 4, cy(plan.lashV) + 9);
  g.fillStyle = '#2f63b0'; g.textAlign = 'right';
  g.fillText(`${plan.legLength.toFixed(1)} מ׳`, cx(-0.3) + 0, cy(plan.legLength / 2));
}
export function makeTripodSheet(plan) {
  const S = TRI_SHEET, c = document.createElement('canvas');
  drawTripodSheet(c, plan);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * S.uMax, S.v1 - S.v0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
  m.rotation.set(-Math.PI / 2, 0, Math.PI);
  m.userData.z = (S.v0 + S.v1) / 2;
  m.position.set(0, 0.004, m.userData.z);
  m.receiveShadow = true; m.visible = false;
  if (document.fonts?.ready) document.fonts.ready.then(() => { drawTripodSheet(c, plan); tex.needsUpdate = true; });
  return m;
}
// The tripod's page in the structure file: seen from the side and from above, with its sizes.
export function drawTripodFolder(c, T) {
  c.width = 1024; c.height = 760;
  const g = c.getContext('2d');
  g.fillStyle = '#f5f2e6'; g.fillRect(0, 0, c.width, c.height);
  g.direction = 'rtl';
  const k = 130;
  const pole = (x1, y1, x2, y2, w = 9) => { g.strokeStyle = '#2f63b0'; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  const dim = (x1, y1, x2, y2, text, dx = 0, dy = -10) => {
    g.strokeStyle = '#8a6a43'; g.lineWidth = 2; g.setLineDash([8, 6]);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#6b4423'; g.font = '700 24px Rubik, Arial'; g.textAlign = 'center';
    g.fillText(text, (x1 + x2) / 2 + dx, (y1 + y2) / 2 + dy);
  };
  const title = (t, x, y) => { g.fillStyle = '#2b2b22'; g.font = '800 28px Rubik, Arial'; g.textAlign = 'center'; g.fillText(t, x, y); };
  // ---- from the side ----
  const gx = 300, gy = 680, rad = T.footApart / Math.sqrt(3), s = T.legLength - T.lashFromTop;
  title('מבט מהצד', gx, 50);
  g.strokeStyle = '#8a6a43'; g.lineWidth = 4; g.beginPath(); g.moveTo(gx - 250, gy); g.lineTo(gx + 250, gy); g.stroke();
  const ax = gx, ay = gy - T.height * k;
  // two legs in front (their feet half a side each way), one behind
  for (const fx of [-T.footApart / 2, T.footApart / 2, 0]) {
    const d = [ax - (gx + fx * k), ay - gy], l = Math.hypot(d[0], d[1]), e = T.lashFromTop * k * (l / (s * k));
    pole(gx + fx * k, gy, ax + d[0] / l * e, ay + d[1] / l * e, fx ? 9 : 6);
  }
  g.strokeStyle = '#c8452c'; g.lineWidth = 7; g.beginPath(); g.arc(ax, ay, 16, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#c8452c'; g.font = '700 22px Rubik, Arial'; g.textAlign = 'right'; g.fillText('כפיתה אחת סביב שלוש הרגליים', ax - 28, ay - 8);
  // braces
  const bh = T.braceHeight * k, bw = (T.footApart / 2) * (1 - T.braceHeight / T.height) * k;
  pole(gx - bw - 22, gy - bh, gx + bw + 22, gy - bh, 7);
  dim(gx + 235, gy, gx + 235, ay, `גובה ${T.height.toFixed(1)} מ׳`, -62, 0);
  dim(gx - bw, gy - bh - 26, gx + bw, gy - bh - 26, `חיזוק בגובה ${Math.round(T.braceHeight * 100)} ס״מ`, 0, -10);
  dim(gx - T.footApart / 2 * k, gy + 26, gx + T.footApart / 2 * k, gy + 26, `${T.footApart.toFixed(1)} מ׳ בין רגל לרגל`, 0, 30);
  // ---- from above ----
  const tx = 770, ty = 330, kt = 110;
  title('מבט מלמעלה', tx, 50);
  const F = [210, 90, 330].map(d => [tx + rad * kt * Math.cos(d * Math.PI / 180), ty - rad * kt * Math.sin(d * Math.PI / 180)]);
  for (const f of F) pole(f[0], f[1], tx, ty, 8);
  const q = 1 - T.braceHeight / T.height;
  const Bp = F.map(f => [tx + (f[0] - tx) * q, ty + (f[1] - ty) * q]);
  for (let i = 0; i < 3; i++) { const a = Bp[i], b = Bp[(i + 1) % 3], d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]); pole(a[0] - d[0] / l * 20, a[1] - d[1] / l * 20, b[0] + d[0] / l * 20, b[1] + d[1] / l * 20, 6); }
  for (const f of F) { g.fillStyle = '#8a6a43'; g.beginPath(); g.arc(f[0], f[1], 9, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#c8452c'; g.lineWidth = 6; g.beginPath(); g.arc(tx, ty, 13, 0, Math.PI * 2); g.stroke();
  dim(F[0][0], F[0][1] + 34, F[2][0], F[2][1] + 34, `${T.footApart.toFixed(1)} מ׳`, 0, 30);
  g.fillStyle = '#2b2b22'; g.font = '500 22px Rubik, Arial'; g.textAlign = 'center';
  ['שלוש רגליים במרחקים שווים', 'שלושה חיזוקים, אחד בין כל שתי רגליים', 'בז״נט ליד כל רגל, והרגל כפותה אליו'].forEach((t, i) => g.fillText(t, tx, 560 + i * 34));
}
