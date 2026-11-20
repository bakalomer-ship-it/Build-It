// ALL BLUEPRINT SIZES, IN ONE PLACE.
//
// Real blueprints from the Scouts have not arrived yet, so every number here
// is a placeholder from the design document. When the real drawings come,
// change the numbers in this file only: the drawings on the ground, the
// structure file (תיק מבנה), the poles the player must cut, the physics and
// the scoring all read from here.
//
// Units are metres. "Height" is measured from the ground up the leg.

export const SIZES = {
  // ---- klaf 2×2 (levels 1 and 2) ----
  klaf: {
    legSpacing: 1.8,        // centre to centre of the two legs
    legLength: 2.1,         // 15 cm above the top lashing (מרחק כפיתה)
    bottomHeight: 0.3,      // bottom horizontal, 30 cm above the ground (Omer)
    topHeight: 1.9,         // top horizontal
    horizontalLength: 2.1,  // 1.8 between the legs + 15 cm past each (מרחק כפיתה)
    diagLow: 0.45,          // where each diagonal meets a leg, low end
    diagHigh: 1.75,         // ... high end
    diagLength: 2.6,
    stakeJointHeights: [0.15, 0.55], // leg-to-stake lashings, two per leg
    legStakeLength: 1.0,
    guyStakeLength: 0.6,
    guyDistance: 2.0,       // guy-line stakes stand one klaf-height from the legs (45°)
  },

  // ---- cube 2×2 (level 2): two klafim joined by side poles ----
  cube: {
    depth: 1.8,             // distance between the two klafim, so the cube is as deep as it is wide
    sideBottomHeight: 0.38, // side horizontals, lashed just above / below the klaf horizontals
    sideTopHeight: 1.82,
    sideHorizontalLength: 2.1,
    sideDiagLow: 0.62,      // spatial X (איקס מרחבי) on each side, low and high ends on the legs
    sideDiagHigh: 1.68,
    sideDiagLength: 2.4,
    topDiagLength: 2.7,     // the flat X in the top of each cube (diagonal about 2.4 m)
    linkDiagLength: 2.6,    // the flat X where two cubes meet, across the shared klaf (about 2.3 m)
    innerGuyDistance: 0.75, // inner guy lines are staked inside the cube and come down once it is braced
  },

  // ---- tripod (חצובה) 4 m high (station 3) ----
  // Three legs lashed together near their tops with a כפיתת חצובה while they lie
  // side by side, stood up, and their feet spread into a triangle. Three braces
  // low between the legs keep the feet from sliding apart.
  tripod: {
    legLength: 4.5,
    lashFromTop: 0.25,      // the tripod lashing sits this far below the tops
    height: 4.0,            // the lashing's height once the tripod stands
    footApart: 2.5,         // distance between every two feet (4.25 m of leg then stands 4.0 m high)
    braceHeight: 0.5,       // the braces between the legs, above the ground
    braceLength: 2.6,
    stakeLength: 1.0,
    stakeJointHeight: 0.3,  // each leg is lashed to its stake here
  },

  // ---- carousel (קרוסלה מחנאית) on a 5×5 cube (station 4, Omer 2026-11-18) ----
  // A cube 5 m wide, deep and high. Every face but the gate has a horizontal at
  // 2.5 m with an X above it and an X below it. The gate (the front klaf) has the
  // X above; below, a post from the middle of the 2.5 m horizontal splits the
  // lower half: the right half is the door (no bottom pole), the left half has an X.
  // The roof has one X corner to corner; the carousel's mast hangs from its centre
  // on a rope ring, and the seat (an octagon with a # of four poles inside) hangs
  // from the mast on eight ropes, 0.5 m above the ground.
  carousel: {
    width: 5.0,             // leg to leg, and klaf to klaf
    legLength: 5.0,
    bottomHeight: 0.3,
    midHeight: 2.5,         // Omer: the horizontal at 2.5 m
    topHeight: 4.85,
    horizontalLength: 5.4,
    lowX: [0.5, 2.3],       // where the lower X meets the legs
    highX: [2.75, 4.55],    // ... the upper X
    diagLength: 5.7,
    gateBottomLength: 2.9,  // the gate's bottom pole, under the left half only
    postLength: 2.6,        // the door post, from the ground to just above the 2.5 m horizontal
    gateDiagLength: 3.4,    // the X in the gate's lower left half
    // the side faces, lashed onto the klaf legs just off the klaf's own heights
    sideBottom: 0.38, sideMid: 2.58, sideTop: 4.77,
    sideLowX: [0.65, 2.15], sideHighX: [2.85, 4.35],
    sideDiagLength: 5.5,
    topDiagLength: 7.2,     // the roof X, corner to corner (often two poles joined in real life)
    guyDistance: 5.0,       // guy stakes one klaf-height out (45°)
    innerGuyDistance: 1.5,
    backGripCap: 1100,      // N the back guy holders hold a 5 m klaf with (it is three times as heavy as a 2×2)
    stakeJointHeights: [0.15, 0.55],
    seat: {
      height: 0.5,          // the seat hangs this high above the ground
      radius: 1.5,          // centre to each corner of the octagon (about 3 m across)
      sideLength: 1.5,      // eight poles, each a little longer than a side (1.15 m)
      plusLength: 3.2,      // the four poles of the # inside
      plusGap: 0.12,        // each pair of the # stands this far either side of the mast
      mastLength: 5.4,
      mastFoot: 0.2,        // the mast's foot, above the ground
      ropeHeight: 4.0,      // the hanging ropes leave the mast here
    },
  },
};

// מרחק כפיתה (Omer, 2026-11-20): a lashing needs room on the pole. Every pole
// reaches at least this far past its last lashing at each end, so a pole drawn
// 2 m between lashings is at least 2.3 m long. A lashing closer to a pole's end
// than this cannot be tied.
export const LASH_ALLOW = 0.15;
