const MOCK_TELEMETRY_KEYFRAMES = [
  { metHours: 0,      distEarthKm: 0,       distMoonKm: 384400, speedKmh: 28800, altitudeKm: 0 },
  { metHours: 0.3,    distEarthKm: 185,     distMoonKm: 384215, speedKmh: 28000, altitudeKm: 185 },
  { metHours: 3.5,    distEarthKm: 500,     distMoonKm: 383900, speedKmh: 27500, altitudeKm: 500 },
  { metHours: 12.5,   distEarthKm: 44555,   distMoonKm: 339845, speedKmh: 15000, altitudeKm: 44555 },
  { metHours: 30,     distEarthKm: 55000,   distMoonKm: 329400, speedKmh: 10800, altitudeKm: 55000 },
  { metHours: 48,     distEarthKm: 130000,  distMoonKm: 254400, speedKmh: 5400,  altitudeKm: 130000 },
  { metHours: 72,     distEarthKm: 220000,  distMoonKm: 164400, speedKmh: 4000,  altitudeKm: 220000 },
  { metHours: 96,     distEarthKm: 320000,  distMoonKm: 64400,  speedKmh: 3200,  altitudeKm: 320000 },
  { metHours: 120,    distEarthKm: 378000,  distMoonKm: 8900,   speedKmh: 5800,  altitudeKm: 8900 },
  { metHours: 126,    distEarthKm: 405500,  distMoonKm: 25000,  speedKmh: 4200,  altitudeKm: 405500 },
  { metHours: 144,    distEarthKm: 360000,  distMoonKm: 65000,  speedKmh: 3800,  altitudeKm: 360000 },
  { metHours: 168,    distEarthKm: 270000,  distMoonKm: 155000, speedKmh: 4500,  altitudeKm: 270000 },
  { metHours: 192,    distEarthKm: 150000,  distMoonKm: 280000, speedKmh: 7000,  altitudeKm: 150000 },
  { metHours: 222,    distEarthKm: 8000,    distMoonKm: 376400, speedKmh: 25000, altitudeKm: 8000 },
  { metHours: 225,    distEarthKm: 120,     distMoonKm: 384280, speedKmh: 40000, altitudeKm: 120 },
  { metHours: 226.5,  distEarthKm: 0,       distMoonKm: 384400, speedKmh: 27,    altitudeKm: 0 }
];

const GFORCE_EVENTS = [
  { startMET: -999,  endMET: 0,       gMin: 1.0, gMax: 1.0, label: 'Ground' },
  { startMET: 0,     endMET: 0.035,   gMin: 1.0, gMax: 3.5, label: 'Launch & SRB ascent' },
  { startMET: 0.035, endMET: 0.036,   gMin: 1.0, gMax: 1.0, label: 'SRB separation' },
  { startMET: 0.036, endMET: 0.14,    gMin: 1.0, gMax: 2.5, label: 'Core stage ascent' },
  { startMET: 0.14,  endMET: 0.1433,  gMin: 0.0, gMax: 0.0, label: 'Coast — MECO to ICPS ignition' },
  { startMET: 0.1433, endMET: 0.30,   gMin: 0.5, gMax: 0.5, label: 'ICPS orbital insertion burn' },
  { startMET: 0.83,  endMET: 0.93,    gMin: 0.5, gMax: 0.5, label: 'Perigee raise burn 1' },
  { startMET: 1.83,  endMET: 1.93,    gMin: 0.5, gMax: 0.5, label: 'Perigee raise burn 2' },
  { startMET: 30,    endMET: 30.1,    gMin: 1.3, gMax: 1.3, label: 'Trans-Lunar Injection burn' },
  { startMET: 48,    endMET: 48.01,   gMin: 0.0, gMax: 0.1, label: 'Outbound correction 1' },
  { startMET: 72,    endMET: 72.01,   gMin: 0.0, gMax: 0.1, label: 'Outbound correction 2' },
  { startMET: 102,   endMET: 102.01,  gMin: 0.0, gMax: 0.1, label: 'Outbound correction 3' },
  { startMET: 168,   endMET: 168.01,  gMin: 0.0, gMax: 0.1, label: 'Return correction 1' },
  { startMET: 192,   endMET: 192.01,  gMin: 0.0, gMax: 0.1, label: 'Return correction 2' },
  { startMET: 225,   endMET: 225.5,   gMin: 1.0, gMax: 5.0, label: 'Atmospheric re-entry' }
];

/**
 * Interpolates telemetry between keyframes.
 */
function interpolateTelemetry(metH) {
  const kf = MOCK_TELEMETRY_KEYFRAMES;
  if (!kf || !kf.length) return null;
  if (metH <= kf[0].metHours) return { ...kf[0], metHours: metH };
  if (metH >= kf[kf.length - 1].metHours) return { ...kf[kf.length - 1], metHours: metH };

  let lo = 0;
  for (let i = 1; i < kf.length; i++) {
    if (kf[i].metHours >= metH) {
      lo = i - 1;
      break;
    }
  }
  const hi = lo + 1;
  const t = (metH - kf[lo].metHours) / (kf[hi].metHours - kf[lo].metHours);

  return {
    metHours: metH,
    distEarthKm: kf[lo].distEarthKm + t * (kf[hi].distEarthKm - kf[lo].distEarthKm),
    distMoonKm:  kf[lo].distMoonKm  + t * (kf[hi].distMoonKm  - kf[lo].distMoonKm),
    speedKmh:    kf[lo].speedKmh    + t * (kf[hi].speedKmh    - kf[lo].speedKmh),
    altitudeKm:  kf[lo].altitudeKm  + t * (kf[hi].altitudeKm  - kf[lo].altitudeKm)
  };
}

/**
 * Estimates G-force based on MET.
 */
function estimateGForce(metH) {
  for (let i = 0; i < GFORCE_EVENTS.length; i++) {
    const e = GFORCE_EVENTS[i];
    if (metH >= e.startMET && metH <= e.endMET) {
      // Linear ramp for launch and re-entry, otherwise static
      if (e.label.includes('ascent') || e.label.includes('re-entry')) {
        const t = (metH - e.startMET) / (e.endMET - e.startMET);
        return e.gMin + t * (e.gMax - e.gMin);
      }
      return e.gMax;
    }
  }
  return 0.0; // Coast
}

/**
 * Vector Utilities
 */
function mag(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function dot(v1, v2) {
  return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
}

/**
 * Computes Range Rate (velocity relative to Earth) in km/s.
 * rangeRate = (pos \cdot vel) / |pos|
 */
function computeRangeRate(pos, vel) {
  if (!pos || !vel) return null;
  const distance = mag(pos);
  if (distance === 0) return 0;
  return dot(pos, vel) / distance;
}

/**
 * Computes Solar Phase Angle (Sun-Spacecraft-Earth angle) in degrees.
 * Simplified Sun position model (Ecliptic approximation).
 */
function computeSolarPhaseAngle(pos, timestamp) {
  if (!pos) return null;
  const date = new Date(timestamp);
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = (date - startOfYear) / (1000 * 60 * 60 * 24);
  const angle = (dayOfYear / 365.25) * 2 * Math.PI;

  // Approximate Sun vector (Earth-Sun)
  const sunPos = {
    x: 149600000 * Math.cos(angle),
    y: 149600000 * Math.sin(angle),
    z: 0
  };

  const spacecraftPos = pos;
  const dotVal = dot(sunPos, spacecraftPos);
  const magProduct = mag(sunPos) * mag(spacecraftPos);
  
  if (magProduct === 0) return 0;
  const cosTheta = Math.max(-1, Math.min(1, dotVal / magProduct));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

/**
 * Converts Cartesian ECI coordinates to Latitude/Longitude (Approximate).
 */
function computeSubSpacecraftPoint(pos) {
  if (!pos) return null;
  const r = mag(pos);
  const latDeg = (Math.asin(pos.z / r) * 180) / Math.PI;
  const lonDeg = (Math.atan2(pos.y, pos.x) * 180) / Math.PI;
  return { latDeg, lonDeg };
}

/**
 * Detects the mission phase based on MET (Mission Elapsed Time) in hours.
 */
function detectPhase(metH) {
  if (metH < 0) return 'prelaunch';
  if (metH < 0.15) return 'launch';
  if (metH < 2) return 'earth-orbit';
  if (metH < 24) return 'high-earth-orbit';
  if (metH < 31) return 'tli';
  if (metH < 110) return 'outbound-coast';
  if (metH < 130) return 'lunar-flyby';
  if (metH < 220) return 'return-coast';
  if (metH < 226) return 'reentry';
  return 'complete';
}

/**
 * Converts a quaternion {w, x, y, z} to Euler angles {roll, pitch, yaw} in degrees.
 */
function quaternionToEuler(q) {
  if (!q) return null;
  const sinr_cosp = 2 * (q.w * q.x + q.y * q.z);
  const cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  const sinp = 2 * (q.w * q.y - q.z * q.x);
  const pitch = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

  const siny_cosp = 2 * (q.w * q.z + q.x * q.y);
  const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  return {
    roll: (roll * 180) / Math.PI,
    pitch: (pitch * 180) / Math.PI,
    yaw: (yaw * 180) / Math.PI
  };
}

module.exports = {
  interpolateTelemetry,
  estimateGForce,
  detectPhase,
  computeRangeRate,
  computeSolarPhaseAngle,
  computeSubSpacecraftPoint,
  quaternionToEuler,
  mag
};
