# בונים מחנאות · Build It

A mobile game about Israeli scout pioneering (בנייה מחנאית): lashing wooden poles with rope into real structures, following the real rules, with physics deciding whether they stand.

This repository holds the **web prototype of level 1, the 2×2 klaf (קלף 2×2)**. It runs in a phone browser, in landscape, with touch controls and Hebrew text. The final game is planned in Unity; this prototype exists to test whether the build flow feels right.

## How to play

1. **בניית הקלף.** Everything happens in 3D on the plaza. The klaf drawing lies on the ground at 1:1 and fades away once the klaf is built. Drag a pole (סנדה) from the tray onto a blue line. Scroll the length strip to set its length in 10 cm steps until it matches the drawing. Tap each ring where poles meet and pick one of the four lashings (מרובעת, אלכסונית, מקבילה, חצובה); a short close-up shows it being tied. A wrong lashing type only lowers the score. Lashing guidance appears only in this first structure's tutorial.
2. **בז״נטים.** Tap the stake marks next to the legs. Each tap is one blow of the mallet (למנייה).
3. **הרמה.** Tap the rings at the top of the legs to tie four guy lines (יתרים). No rope is tied to the middle of a pole: the pullers raise the klaf by the two front guy lines. Swipe down to pull, slowly, and stop when the klaf stands upright.
4. **עיגון.** Drive the four guy-line stakes, fix each guy line to its stake with the guy-line lashing, and lash each leg to its stake.
5. **בדיקה.** Everyone lets go of anything that is not tied, and the klaf is pushed from every side.

Physics is real, not scripted. A klaf with a missing or half-tied X racks and falls during the raise or the push test. Raising without stakes lets the base slide. Pulling too fast or past upright tears the back guy line out of the holders' hands. Each collapse ends with a card that names the broken rule.

Scoring follows the design document: accuracy is the core score (joints tied, correct lashing type, pole lengths) and time is only a bonus. A missing lashing still gives partial stars: one star passes the level, two stars need every lashing tied, and three stars also need every lashing type right. Hints show one missing or wrong lashing; there is one hint per 10 lashings, and each costs fewer points than a missed lashing.

## Open it on a phone

The game is a static web page with no build step. Open `index.html` through any web server. To host it on GitHub Pages: in the repository go to **Settings → Pages**, choose **Deploy from a branch**, pick the branch and the `/ (root)` folder, and save. The game then lives at `https://bakalomer-ship-it.github.io/build-it/`.

## Placeholder numbers

Real blueprints have not arrived yet, so every size is an assumption from the design document. They all live in [`src/level1.js`](src/level1.js): legs 2.0 m standing 1.8 m apart, horizontals 2.0 m at 30 cm and 1.9 m above the ground, diagonals 2.6 m forming one X. The physics strengths (how much a diagonal carries before it bows, how hard the guy holders can hold) are tuned by feel in `TUNING` in [`src/klafSim.js`](src/klafSim.js).

## Files

| File | What it does |
| --- | --- |
| `index.html`, `style.css` | Page, Hebrew right-to-left interface |
| `src/main.js` | Game flow, touch controls, stages, scoring, collapse explanations |
| `src/klafSim.js` | Turns the build into a physics model and runs the raise, anchoring and push test |
| `src/physics.js` | Small position-based physics solver (poles, lashings, ropes) |
| `src/level1.js` | The level 1 blueprint data |
| `src/scene.js`, `src/sound.js` | 3D models, the drawing on the ground, sound effects |
| `lib/` | three.js 0.160 (MIT licence), vendored so the page works offline |
| `tools/simtest.mjs` | Checks the physics without a browser: `npm test` |
| `tools/build-single.mjs` | Packs everything into one HTML file: `npm install`, then `npm run build:single` |
