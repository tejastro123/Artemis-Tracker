/**
 * Artemis II Mission Tracker — Static Data & Mock Telemetry
 * Contains crew bios, spacecraft specs, mission timeline, and fallback telemetry.
 */

// ── Launch epoch (April 1 2026, 18:24 EDT = 22:24 UTC) ────────────────────
var LAUNCH_EPOCH_UTC = new Date('2026-04-01T22:35:12Z');

// ── Mission State Buffers (Internal use by app.js) ────────────────────────
var TIMELINE = [];
var UNTIMED_ACTIVITIES = {};

// ── Crew ───────────────────────────────────────────────────────────────────
var CREW = [
  {
    name: 'Reid Wiseman',
    role: 'Commander',
    agency: 'NASA',
    photo: null,
    bio: 'U.S. Navy test pilot and former Chief of the Astronaut Office. Flew to the ISS on Expedition 41 in 2014, logging 165 days in space. Born in Baltimore, Maryland. Holds a B.S. from Rensselaer Polytechnic Institute and an M.S. in Systems Engineering from Johns Hopkins University. At 50, the oldest person to leave low Earth orbit since Apollo.'
  },
  {
    name: 'Victor Glover',
    role: 'Pilot',
    agency: 'NASA',
    photo: null,
    bio: 'U.S. Navy fighter pilot with over 3,500 flight hours across 40+ aircraft, including 24 combat missions. Piloted SpaceX Crew Dragon on its first operational flight to the ISS (2020–21), spending 168 days in orbit and completing four spacewalks. The first person of color to travel beyond low Earth orbit.'
  },
  {
    name: 'Christina Koch',
    role: 'Mission Specialist',
    agency: 'NASA',
    photo: null,
    bio: 'Electrical engineer who holds the record for the longest single spaceflight by a woman — 328 days aboard the ISS (2019–20). Participated in the first all-female spacewalk with Jessica Meir. Born in Grand Rapids, Michigan, raised in Jacksonville, North Carolina. The first woman to travel beyond low Earth orbit.'
  },
  {
    name: 'Jeremy Hansen',
    role: 'Mission Specialist',
    agency: 'CSA',
    photo: null,
    bio: 'Canadian Forces CF-18 fighter pilot, combat operations officer with NORAD, and physicist. Holds a B.Sc. in Space Science (honours) from the Royal Military College of Canada. Selected by the Canadian Space Agency in 2009. This is his first spaceflight — and he becomes the first non-U.S. citizen to travel beyond low Earth orbit.'
  }
];

// ── Spacecraft specs ───────────────────────────────────────────────────────
var SPACECRAFT = {
  orion: {
    name: 'Orion "Integrity"',
    description: 'NASA\'s deep-space crew capsule, designed to carry astronauts farther than any spacecraft built for humans has ever flown.',
    specs: [
      { label: 'Crew capacity', value: '4 astronauts' },
      { label: 'Cabin volume', value: '9.0 m\u00B3 (316 ft\u00B3) — ~2.25 m\u00B3 per crew member' },
      { label: 'Diameter', value: '5.02 m (16 ft 6 in)' },
      { label: 'Length (crew module)', value: '3.3 m (10 ft 10 in)' },
      { label: 'Duration (undocked)', value: 'Up to 21 days' },
      { label: 'Duration (docked)', value: 'Up to 6 months' }
    ]
  },
  heatShield: {
    name: 'Heat Shield',
    description: 'The largest ablative heat shield ever built. It protects the crew module during re-entry at speeds up to 40,000 km/h.',
    specs: [
      { label: 'Diameter', value: '5.0 m (16.5 ft)' },
      { label: 'Material', value: 'Avcoat ablator' },
      { label: 'Peak temperature', value: '~2,760 \u00B0C (~5,000 \u00B0F)' },
      { label: 'Re-entry speed', value: '~40,000 km/h (~25,000 mph)' }
    ]
  },
  lifeSupport: {
    name: 'Environmental Control & Life Support (ECLSS)',
    description: 'Regenerable systems that keep four astronauts alive in deep space for up to three weeks.',
    specs: [
      { label: 'Atmosphere', value: '78% N\u2082 / 21% O\u2082 — sea-level mix' },
      { label: 'Cabin pressure', value: '101.3 kPa (14.7 psi)' },
      { label: 'Cabin temperature', value: '~18–27 \u00B0C (65–80 \u00B0F)' },
      { label: 'CO\u2082 scrubbing', value: 'Regenerable amine swing-bed system' },
      { label: 'Water recycling', value: 'Humidity condensate recovery' },
      { label: 'Thermal control', value: 'Active fluid loops + radiator panels' }
    ]
  },
  esm: {
    name: 'European Service Module (ESM-2)',
    description: 'Built by Airbus for ESA, the service module provides propulsion, electrical power, thermal control, and consumables (air and water).',
    specs: [
      { label: 'Dimensions', value: '~4 m diameter \u00D7 4 m height' },
      { label: 'Mass (fuelled)', value: '~13,000 kg (28,660 lb)' },
      { label: 'Main engine', value: 'Aerojet Rocketdyne AJ10 (OMS-E), 26.7 kN' },
      { label: 'Auxiliary thrusters', value: '8 \u00D7 490 N + 24 \u00D7 220 N RCS' },
      { label: 'Solar arrays', value: '4 wings, 19 m span, 11.2 kW' },
      { label: 'Consumables', value: 'O\u2082, N\u2082, and up to 240 L of water' }
    ]
  },
  sls: {
    name: 'Space Launch System (SLS) Block 1',
    description: 'The most powerful rocket ever flown. Generates nearly 40 MN (8.8 million lbf) of thrust at liftoff.',
    specs: [
      { label: 'Height', value: '98 m (322 ft)' },
      { label: 'Liftoff mass', value: '~2,600,000 kg (5,700,000 lb)' },
      { label: 'Liftoff thrust', value: '~39.1 MN (8.8 million lbf)' },
      { label: 'Core stage engines', value: '4 \u00D7 RS-25' },
      { label: 'Solid boosters', value: '2 \u00D7 5-segment SRB' },
      { label: 'Upper stage', value: 'ICPS (Interim Cryogenic Propulsion Stage)' }
    ]
  }
};

// ── Event enrichment detail (keyed by event id) ──────────────────────────
// Contains only detail text and links. Timeline structure comes from schedule.json.
var EVENT_DETAILS = {
  "launch-team-stations": {
    "detail": "Over 100 console positions in Firing Room 1 are staffed by engineers and controllers who will monitor every system on SLS and Orion through the multi-day countdown."
  },
  "countdown-clock-begins": {
    "detail": "The countdown clock is managed from Firing Room 1 in the Launch Control Center. Artemis Launch Director Charlie Blackwell-Thompson — the first woman to hold the role — oversees the multi-day sequence that includes several planned holds."
  },
  "orion-power-up": {
    "detail": "Orion’s avionics, life support, navigation, and communication systems are brought online sequentially. Ground controllers verify telemetry links between the spacecraft and the Launch Control Center."
  },
  "core-stage-power-up": {
    "detail": "The core stage flight computer begins executing its built-in test sequences, verifying communication with the four RS-25 engines and all vehicle systems."
  },
  "recovery": {
    "detail": "Recovery takes about 60–90 minutes from splashdown to crew on the ship. After the capsule is stabilised by divers, the crew exits through the side hatch onto an inflatable platform, then is hoisted via helicopter to the USS Portland. The ship’s medical team performs initial health assessments: cardiovascular checks, vestibular (balance) testing, blood draws, and radiation dosimetry badge collection. After 10 days in microgravity, the crew may experience some disorientation and muscle weakness. The Orion capsule is also recovered: craned onto the ship’s well deck for return to port and post-flight analysis."
  }
};

// ── Fallback events (used when GitHub fetch fails) ──────────────────────────
// Baked-in copy of timeline events. schedule.json is the source of truth.
var FALLBACK_EVENTS = [
  {
    "id": "launch",
    "metHours": 0,
    "phase": "launch",
    "title": "Liftoff",
    "summary": "SLS liftoff from LC-39B at Kennedy Space Center. Nearly 40 MN of thrust pushes the crew toward orbit."
  },
  {
    "id": "tli",
    "metHours": 30,
    "phase": "translunar",
    "title": "Translunar Injection",
    "summary": "Mission's critical engine burn to leave Earth orbit and enter a trajectory toward the Moon."
  },
  {
    "id": "closest-approach",
    "metHours": 120,
    "phase": "lunar",
    "title": "Lunar Closest Approach",
    "summary": "The crew fly within 4,000 nautical miles of the Lunar far side, reaching the furthest distance from Earth."
  },
  {
    "id": "splashdown",
    "metHours": 226,
    "phase": "recovery",
    "title": "Splashdown",
    "summary": "The Orion crew module enters the Pacific Ocean off the coast of San Diego, marking mission completion."
  }
];

// ── Comms blackout windows ───────────────────────────────────────────────
// Times when Orion is behind the Moon and cannot communicate with Earth.
var COMMS_BLACKOUT_WINDOWS = [
  { startMET: 128, endMET: 128.7, reason: 'Orion is behind the Moon' },
  { startMET: 225.5, endMET: 225.6, reason: 'Re-entry plasma blackout' }
];

// ── Phase labels and order (used by app.js) ───────────────────────────────
// PHASE_LABELS: maps phase keys to human-readable labels
// PHASE_ORDER: defines the canonical order of phases for timeline rendering
var PHASE_LABELS = {
  'prelaunch': 'Pre-Launch',
  'launch': 'Launch',
  'earth-orbit': 'Earth Orbit',
  'translunar': 'Trans-Lunar',
  'outbound-coast': 'Outbound Coast',
  'lunar': 'Lunar Flyby',
  'lunar-flyby': 'Lunar Flyby',
  'return-coast': 'Return Coast',
  'reentry': 'Re-entry',
  'recovery': 'Recovery',
  'postmission': 'Post-Mission'
};

var PHASE_ORDER = [
  'prelaunch',
  'launch',
  'earth-orbit',
  'translunar',
  'outbound-coast',
  'lunar',
  'lunar-flyby',
  'return-coast',
  'reentry',
  'recovery',
  'postmission'
];
