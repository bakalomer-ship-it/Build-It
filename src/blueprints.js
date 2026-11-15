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
    legLength: 2.0,
    bottomHeight: 0.3,      // bottom horizontal, 30 cm above the ground (Omer)
    topHeight: 1.9,         // top horizontal
    horizontalLength: 2.0,
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
    sideHorizontalLength: 2.0,
    sideDiagLow: 0.62,      // spatial X (איקס מרחבי) on each side, low and high ends on the legs
    sideDiagHigh: 1.68,
    sideDiagLength: 2.4,
    topDiagLength: 2.6,     // the flat X in the top of each cube (diagonal about 2.4 m)
    linkDiagLength: 2.4,    // the flat X where two cubes meet, across the shared klaf (about 2.3 m)
    innerGuyDistance: 0.75, // inner guy lines are staked inside the cube and come down once it is braced
  },
};
