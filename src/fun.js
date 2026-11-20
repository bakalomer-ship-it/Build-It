// "Juice": the small effects that make building feel good. A ring that snaps
// tight round each new lashing, dust when a klaf lands, a camera shake, confetti
// and big stars at the inspection. Nothing here changes the game's rules or
// physics; it only shows what already happened.
import * as THREE from 'three';
import { sfx, buzz } from './sound.js';

const app = () => document.getElementById('app');

export function makeFun(scene) {
  // ---- a ring that closes round a fresh lashing, and a puff of rope fibres ----
  const ringGeo = new THREE.RingGeometry(0.8, 1, 32);
  const pops = [];
  function pop(pos, { color = 0xffd36b, size = 0.5, dur = 0.35 } = {}) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(pos[0], pos[1], pos[2]);
    m.renderOrder = 5;
    scene.add(m);
    pops.push({ m, t: 0, dur, size, shrink: true });
  }
  // dust puffs on the ground (a klaf landing, a stake going in)
  const dustMat = new THREE.MeshBasicMaterial({ color: 0xd9c49a, transparent: true, opacity: 0.6, depthWrite: false });
  const dustGeo = new THREE.SphereGeometry(1, 8, 6);
  function dust(pos, n = 8, spread = 0.6) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(dustGeo, dustMat.clone());
      const a = Math.random() * Math.PI * 2, r = spread * (0.4 + Math.random() * 0.6);
      m.position.set(pos[0] + Math.cos(a) * r * 0.3, 0.05, pos[2] + Math.sin(a) * r * 0.3);
      m.userData.v = [Math.cos(a) * r * 1.6, 0.4 + Math.random() * 0.5, Math.sin(a) * r * 1.6];
      scene.add(m);
      pops.push({ m, t: 0, dur: 0.6 + Math.random() * 0.3, size: 0.06 + Math.random() * 0.06, dust: true });
    }
  }

  // ---- camera shake: added just before drawing and taken off right after ----
  let shakeT = 0, shakeAmp = 0;
  const off = new THREE.Vector3();
  function shake(amp = 0.05, dur = 0.3) { shakeAmp = Math.max(shakeAmp * (shakeT > 0 ? 1 : 0), amp); shakeT = Math.max(shakeT, dur); }

  // ---- combo: lashings tied one after another (only the rhythm, never whether they are right) ----
  let lastTie = 0, combo = 0;
  function lashed(pos) {
    const now = performance.now();
    combo = now - lastTie < 4500 ? combo + 1 : 0;
    lastTie = now;
    sfx.cinch(combo);
    if (pos) pop(pos, { size: 0.42 + Math.min(combo, 6) * 0.03 });
    buzz(12);
    if (combo >= 2 && pos) bubble(pos, combo >= 5 ? 'קצב מעולה!' : `×${combo + 1}`);
  }
  // a short word floating up from a point in the world
  const bubbles = [];
  function bubble(pos, text, cls = '') {
    const el = document.createElement('div'); el.className = 'fun-bubble ' + cls; el.textContent = text;
    app().appendChild(el);
    bubbles.push({ el, pos: [...pos], t: 0 });
  }

  // ---- confetti: DOM pieces falling over the screen ----
  const CONF = ['#e0a93b', '#e2593f', '#3f7d2c', '#2f7fe0', '#f4f1e6', '#8a52d0'];
  function confetti(n = 70) {
    const box = document.createElement('div'); box.className = 'confetti';
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = CONF[i % CONF.length];
      p.style.animationDelay = (Math.random() * 0.5) + 's';
      p.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
      p.style.setProperty('--dx', (Math.random() * 2 - 1) * 18 + 'vw');
      p.style.setProperty('--rot', (Math.random() * 900 - 450) + 'deg');
      box.appendChild(p);
    }
    app().appendChild(box);
    setTimeout(() => box.remove(), 3400);
  }

  // ---- the big stars across the top of the screen during the inspection ----
  let starBar = null;
  function starsShow(labels) {
    starsHide();
    starBar = document.createElement('div'); starBar.className = 'fun-stars';
    starBar.innerHTML = `<div class="fs-row">${[0, 1, 2].map(i => `<span class="fs-star" data-i="${i}">★</span>`).join('')}</div><div class="fs-label"></div>`;
    app().appendChild(starBar);
    starBar._labels = labels;
  }
  function starOn(i, label) {
    if (!starBar) return;
    const s = starBar.querySelector(`[data-i="${i}"]`); if (s) s.classList.add('on');
    starBar.querySelector('.fs-label').innerHTML = label || '';
    sfx.star(i); buzz(25);
  }
  function starLabel(html, bad = false) {
    if (!starBar) return;
    const l = starBar.querySelector('.fs-label'); l.innerHTML = html; l.classList.toggle('bad', bad);
  }
  function starsHide() { if (starBar) { starBar.remove(); starBar = null; } }

  const tmp = new THREE.Vector3();
  return {
    pop, dust, shake, lashed, bubble, confetti, starsShow, starOn, starLabel, starsHide,
    // a klaf (or tripod) reaching upright
    landed(pos) { sfx.land(); shake(0.06, 0.35); if (pos) dust([pos[0], 0, pos[2]], 10, 1.2); buzz(30); },
    collapse(pos) { shake(0.16, 0.7); if (pos) dust([pos[0], 0, pos[2]], 16, 2.2); },
    tick(dt, camera, toScreen) {
      for (let i = pops.length - 1; i >= 0; i--) {
        const q = pops[i]; q.t += dt;
        const k = Math.min(1, q.t / q.dur);
        if (q.dust) {
          const v = q.m.userData.v;
          q.m.position.x += v[0] * dt; q.m.position.y += v[1] * dt; q.m.position.z += v[2] * dt;
          v[1] -= 0.6 * dt;
          q.m.scale.setScalar(q.size * (1 + k * 2.2));
          q.m.material.opacity = 0.55 * (1 - k);
        } else {
          // the ring starts wide and loose, and snaps in tight
          const e = 1 - Math.pow(1 - k, 3);
          q.m.scale.setScalar(q.size * (1.8 - 1.5 * e));
          q.m.material.opacity = 0.95 * (1 - k * k);
          q.m.quaternion.copy(camera.quaternion);
        }
        if (k >= 1) { scene.remove(q.m); q.m.material.dispose(); pops.splice(i, 1); }
      }
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]; b.t += dt;
        const sp = toScreen([b.pos[0], b.pos[1] + 0.3 + b.t * 0.6, b.pos[2]]);
        if (sp) { b.el.style.left = sp[0] + 'px'; b.el.style.top = sp[1] + 'px'; }
        b.el.style.opacity = String(Math.max(0, 1 - Math.max(0, b.t - 0.5) / 0.4));
        if (b.t > 0.9) { b.el.remove(); bubbles.splice(i, 1); }
      }
      if (shakeT > 0) shakeT = Math.max(0, shakeT - dt); else shakeAmp = 0;
    },
    preRender(camera) {
      if (shakeT <= 0) { off.set(0, 0, 0); return; }
      const a = shakeAmp * Math.min(1, shakeT / 0.25);
      off.set((Math.random() * 2 - 1) * a, (Math.random() * 2 - 1) * a, (Math.random() * 2 - 1) * a);
      camera.position.add(off);
    },
    postRender(camera) { camera.position.sub(off); off.set(0, 0, 0); tmp.set(0, 0, 0); },
  };
}
