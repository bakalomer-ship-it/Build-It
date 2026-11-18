# בונים מחנאות · Build It

A mobile game about Israeli scout pioneering (בנייה מחנאית): lashing wooden poles with rope into real structures, following the real rules, with physics deciding whether they stand.

This repository holds the **web prototype of levels 1 and 2: the 2×2 klaf (קלף 2×2) and the 2×2 cube (קובייה 2×2)**. It runs in a phone browser, in landscape, with touch controls and Hebrew text. The final game is planned in Unity; this prototype exists to test whether the build flow feels right.

## How to play

1. **בניית הקלף.** Everything happens in 3D on the plaza. The klaf drawing lies on the ground at 1:1 and fades away once the klaf is built. Drag a pole (סנדה) from the tray onto a blue line. Scroll the length strip to set its length in 10 cm steps until it matches the drawing. Tap each ring where poles meet and pick one of the four lashings (מרובעת, אלכסונית, מקבילה, חצובה); a short close-up shows it being tied. A wrong lashing type only lowers the score. Lashing guidance appears only in this first structure's tutorial.
2. **בז״נטים.** Tap the stake marks next to the legs. Each tap is one blow of the mallet (למנייה).
3. **הרמה.** Tap the rings at the top of the legs to tie four guy lines (יתרים). No rope is tied to the middle of a pole: the pullers raise the klaf by the two front guy lines. Swipe down to pull, slowly, and stop when the klaf stands upright.
4. **עיגון.** Drive the four guy-line stakes, fix each guy line to its stake with a קיבוע, and lash each leg to its stake.
5. **בדיקה.** Everyone lets go of anything that is not tied, and the klaf is pushed from every side.

**Level 2, the cube.** Tap the level name at the top to switch level, or open the page with `?level=2`. Build and raise a front klaf and a back klaf the same way (their inner guy lines are short, 75 cm, because the other klaf stands there). Then lash the side poles and the spatial Xs (איקסים מרחביים) between them, working from the drawings that lie on the ground beside each side. Once the cube is braced, take the inner guy lines down. The check pushes the cube from every side, then releases all the guy lines: a braced cube must stand by itself. A cube without full Xs on both sides sways over. There is no step guidance after level 1; the structure file (תיק מבנה) is always open to flip through.

**Home screen and the plaza.** The game opens on a home screen. Only "המגרש שלי" works for now; the other modes are marked as coming soon. Each structure is a level on the plaza's path, with its best stars saved on the device; one star opens the next structure. Every structure you pass stays standing on the plaza.

**The building puzzle.**
- *A pile of real poles.* Each level comes with a fixed pile: the lengths its drawings need plus a few that fit nowhere exactly (`stockExtra` in `src/levels.js`). Poles are not cut, so a wrong choice uses up a pole another place needs. Rope is limited too: one per lashing plus `ropeSpare`.
- *The raise crew.* Before pulling, send the level's scouts (`crew`) to the guy lines: pullers on the front ones, holders on the back ones. A line nobody holds lies slack, and the physics shows what follows.
- *The inspection (מסדר).* A מדריך pushes the structure from every side and hangs a bucket of water on the top horizontal. Passing the inspection gives one star; every lashing tied gives two; every lashing type right gives three.

Physics is real, not scripted. A klaf with a missing or half-tied X racks and falls during the raise or the push test. Raising without stakes lets the base slide. Pulling too fast or past upright tears the back guy line out of the holders' hands. Each collapse ends with a card that names the broken rule.

Scoring follows the design document: accuracy is the core score (joints tied, correct lashing type, pole lengths) and time is only a bonus. A missing lashing still gives partial stars: one star passes the level, two stars need every lashing tied, and three stars also need every lashing type right. Hints show one missing or wrong lashing; there is one hint per 10 lashings, and each costs fewer points than a missed lashing.

## Open it on a phone

The game is a static web page with no build step. Open `index.html` through any web server. To host it on GitHub Pages: in the repository go to **Settings → Pages**, choose **Deploy from a branch**, pick the branch and the `/ (root)` folder, and save. The game then lives at `https://bakalomer-ship-it.github.io/build-it/`.

## Placeholder numbers

Real blueprints have not arrived yet, so every size is an assumption from the design document. They all live in one place, [`src/blueprints.js`](src/blueprints.js), so the real numbers can be swapped in later: legs 2.0 m standing 1.8 m apart, horizontals 2.0 m at 30 cm and 1.9 m above the ground, diagonals 2.6 m forming one X; the cube is 1.8 m deep with 2.0 m side poles and 2.4 m side diagonals. Releasing every guy line at the end of the cube check is an assumption (the rule only says the inner guy lines come down); it is the `release` time in the cube check in `src/main.js`. The physics strengths (how much a diagonal carries before it bows, how hard the guy holders can hold) are tuned by feel in `TUNING` in [`src/klafSim.js`](src/klafSim.js).

## Station 4: the carousel (קרוסלה מחנאית), 2026-11-18

Omer's plan: a 5×5×5 cube. Every face except the gate has a horizontal at 2.5 m with an X above and an X below it. The gate is the front klaf: an X above the 2.5 m horizontal, and below it a door post from the middle of that horizontal down to the ground; the right half (seen from the front) is the door with no bottom pole, the left half has an X. The roof is one X from corner to corner. Everything is in `src/carousel.js`; the sizes are in `SIZES.carousel` in `src/blueprints.js`.

1. Build the gate klaf and the back klaf on their drawings, then drive stakes, raise and anchor each one (6 crew, guy lines at 45°, five metres out).
2. Join them: on each side a bottom, middle and top pole and two spatial Xs, and the roof X. Take the inner guy lines down.
3. **בניית המושב.** On the drawing in the middle of the cube: an octagon of eight 1.4 m poles with a # of four 3.2 m poles inside it (a pair each way), all lashed.
4. **תליית הקרוסלה.** Six scouts lift the seat to 0.5 m. Put the 5.4 m mast through the #'s middle square, hang it from the roof X's centre on a rope ring (so it turns), lash it to the two lengthwise poles of the #, and tie eight hanging ropes from the mast to the octagon's corners.
5. **מסדר.** The frame is pushed from every side and all guy lines come down (as for the cube). Then eight scouts get on in pairs, the crew spins the carousel, and the מדריך pushes the seat sideways. A corner lashing missing lets a pole drop under the riders, a hanging rope missing lets a corner sink, and a seat not lashed to the mast swings into it.

The seat and mast are their own small physics world (`CarouselSim`), hung from a point that follows the frame's roof X; a share of their weight (`CAR_TUNING.frameShare`) is put back on the roof X. The back guy holders of a 5 m klaf hold more than for a 2×2 (`backGripCap`). `npm test` runs `tools/carouseltest.mjs` as well.

## Files

| File | What it does |
| --- | --- |
| `index.html`, `style.css` | Page, Hebrew right-to-left interface |
| `src/main.js` | Game flow, touch controls, stages, scoring, collapse explanations |
| `src/klafSim.js` | Turns the build into a physics model and runs the raise, anchoring and push test |
| `src/physics.js` | Small position-based physics solver (poles, lashings, ropes) |
| `src/blueprints.js` | All blueprint sizes (placeholders) |
| `src/level1.js`, `src/levels.js` | The klaf plan and the level list (level 2's cube plan) |
| `src/cubeSim.js` | Joins two klafim into the cube and tests its bracing |
| `src/scene.js`, `src/sound.js` | 3D models, the drawing on the ground, sound effects |
| `lib/` | three.js 0.160 (MIT licence), vendored so the page works offline |
| `src/carousel.js` | The carousel: its two klafim, the sides and roof, the seat, and the seat's physics |
| `tools/simtest.mjs`, `tools/cubetest.mjs`, `tools/tripodtest.mjs`, `tools/carouseltest.mjs` | Check the physics without a browser: `npm test` |
| `tools/build-single.mjs` | Packs everything into one HTML file: `npm install`, then `npm run build:single` |

## Spatial Xs and the look (2026-11-15)

- Every cube needs an איקס מרחבי on both side faces and one lying flat in its top; the 2×4 base also needs one at 2 m across the shared klaf (`flatX`, `topX`, `linkX` in `src/levels.js`). The top view has its own drawing sheet.
- Beyond a single klaf, the structure is tested only in the final check. If any required X is missing or not fully lashed, the Xs that were built work loose when the guy lines come down (`CubeSim.unbrace`), and the structure falls with the rule explained.
- A klaf can be raised only with all 6 crew assigned and at their posts.
- Look follows Omer's reference images: a larger sand plaza in a forest clearing, a narrow-lens three-quarter camera, stocky scouts in green caps, wooden UI panels.
