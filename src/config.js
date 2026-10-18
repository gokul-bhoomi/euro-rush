// Screen is a 480x270 pixel canvas, scaled up to the TV. Each player gets a 232px wide half.
export const W = 480, H = 270, HW = 232, MID = 16;

// Road: 4 lanes of 32px. Lanes 0-1 = oncoming (left), lanes 2-3 = our direction (right).
export const ROAD_X = 52, LANE = 32, ROAD_W = 128, ROAD_R = ROAD_X + ROAD_W;
export const laneX = (l) => ROAD_X + l * LANE + LANE / 2;

export const STEP = 1 / 60;            // fixed simulation step (seconds)
export const CAR_W = 16, CAR_H = 26;   // player car size
export const CAM_Y = 236;              // screen y of the player's car centre inside its half
export const KMH = 1.5;                // px/s -> km/h shown on the HUD

// World units are pixels; y grows in the driving direction.
export const TUNE = {
  // pull = accel * (1 - v/(vmax+accelHeadroom))^1.5: ~255 km/h after 6s, but the full 330 km/h takes ~20s of clean driving
  maxSpeed: 220, accel: 70, accelHeadroom: 15, brake: 150, drag: 16,
  steer: 80, steerFull: 30,            // full steering once moving faster than steerFull
  // Tyre grip = max sideways acceleration (px/s^2). It fades with speed, so sharp curves taken too fast
  // can't be followed: the car drifts wide. Drifting = tyres saturated above driftSpeed with slip > driftMin;
  // it scrubs off driftScrub of the speed per second.
  grip: 220, gripFade: 0.4, driftMin: 12, driftSpeed: 60, driftScrub: 0.15, kerbMax: 110, wallScrub: 1.2,
  sidewalkMax: 55, overspeedDecel: 90,
  boostMax: 260, boostTime: 3, boostKick: 30,
  knockDecay: 0.02,                    // fraction of sideways knock-back left after 1s
  towTime: 2.5, towPenalty: 10, towHp: 60, invuln: 2,
  hitCd: 0.4, bumpCd: 0.8, finishGrace: 30,
};

export const DMG = {
  headOn: 10, headOnK: 0.1, sideSwipe: 0.5,  // oncoming: base + k*closing speed; glancing hits halve it
  rearEnd: 3, rearEndK: 0.12, nudge: 12,   // nose-to-tail below 12px/s closing speed does no damage
  sideScrape: 3, works: 12, wall: 4,     // wall = sliding into the buildings
  bumpVictim: 6, bumpRammer: 3, rearBump: 3,
};

export const HEAL = { pretzel: 15, doner: 30, croissant: 15, pizza: 30 };

export const VEH = {
  car: { w: 14, h: 24 }, truck: { w: 16, h: 42 }, tram: { w: 18, h: 88 }, bus: { w: 16, h: 46 }, fiat: { w: 12, h: 18 }, vespa: { w: 6, h: 14 },
};

// Riviera Pop palette (chosen in the mockup)
export const PAL = {
  sky: ['#5aa8d6', '#7ebfe0', '#a9d5e6', '#ecd6ad'], sunC: ['#fff4cc', '#f5c542'],
  sil: '#7f78bf', ui: '#efdfc3', ui2: '#dcbf93', text: '#2b1d3d', accent: '#e85d00', dim: '#86688f',
  p1: '#f02a5a', p2: '#0088cc', g1: '#64b350', g2: '#57a345', road: '#62626e',
  tint: 'rgba(80,50,20,0.10)',
};
