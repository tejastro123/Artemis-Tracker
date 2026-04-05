/**
 * Artemis II Mission Tracker — Sonification Radar
 * Audio representation of spacecraft positions using Web Audio API.
 * Zero external dependencies or audio files.
 */

window.artemisAudio = (function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────
  var EARTH_MOON_DIST = 384400;        // km
  var VAN_ALLEN_INNER_START = 1000;     // km from Earth
  var VAN_ALLEN_INNER_END = 12000;
  var VAN_ALLEN_OUTER_START = 13000;
  var VAN_ALLEN_OUTER_END = 60000;
  var HALFWAY_DIST = 192200;            // km from Earth
  var ISS_ALT = 420;                    // km
  var GPS_ALT = 20200;                  // km
  var GEO_ALT = 35786;                  // km
  var EARTH_ORBIT_THRESHOLD = 50000;    // km — switch to earth-orbit view (post-TLI, they're in transit even at 78k km)
  var MOON_ORBIT_THRESHOLD = 50000;     // km — switch to moon-orbit view
  var COMMS_BLACKOUT_DIST = 10000;      // km from Moon for blackout

  // ── State ──────────────────────────────────────────────────────────────
  var ctx = null;            // AudioContext
  var masterGain = null;     // Master volume control
  var droneNodes = [];       // Background drone oscillators + gains
  var sweepNoiseNode = null;   // Sweep noise source
  var sweepNoiseGain = null;
  var sweepNoiseFilter = null;
  var sweepNoisePanner = null;

  // Milestone audio state
  var vanAllenCrackleNode = null;
  var vanAllenCrackleGain = null;
  var vanAllenCrackleFilter = null;
  var isInVanAllen = false;
  var halfwayChimePlayed = false;
  var wasInCommsBlackout = false;

  // Beat loop + effects state
  var beatEnabled = false;
  var beatBuffer = null;       // Decoded AudioBuffer for artemis-beat.wav
  var beatSourceNode = null;   // AudioBufferSourceNode (looping)
  var beatGain = null;         // GainNode for beat volume
  var effectsSendGain = null;  // GainNode tapping off masterGain for FX send
  var reverbNode = null;       // ConvolverNode
  var reverbGain = null;       // GainNode for reverb wet level
  var delayNode = null;        // DelayNode synced to 132 BPM
  var delayFeedback = null;    // GainNode for delay feedback
  var delayGain = null;        // GainNode for delay wet level
  var BEAT_DELAY_TIME = 60 / 132; // ≈ 0.4545s

  var running = false;
  var tickIntervalId = null;  // setInterval ID for main loop (survives background tabs)
  var sweepPosition = 0;     // 0–1 sawtooth
  var sweepDuration = 3;     // seconds per sweep
  var lastFrameTime = 0;

  var volume = 0.6;          // 0–1
  var viewMode = 'earth-orbit'; // 'earth-orbit' | 'earth-moon' | 'moon-orbit'
  var autoView = true;
  var objectToggles = { earth: true, moon: true, orion: true, iss: true, gps: false, geo: false };

  // Smooth transition state between views
  var transitionProgress = 1;   // 0 = just switched, 1 = fully settled
  var transitionFrom = null;    // previous viewMode during transition
  var TRANSITION_DURATION = 1.5; // seconds to blend between views

  // Telemetry interpolation
  var prevTelemetry = null;
  var currTelemetry = null;
  var telemetryTimestamp = 0;
  var TELEMETRY_LERP_MS = 30000; // interpolate over 30s

  // Ping-once-per-sweep tracking
  var pingedThisCycle = { earth: false, moon: false, orion: false, iss: false, gps: false, geo: false };

  // Moon orbit angle for moon-orbit view
  var orionOrbitAngle = 0;

  // Current milestone zone label
  var currentMilestoneZone = '';

  // ── DOM refs ──────────────────────────────────────────────────────────
  var dom = {};

  // ── Helpers ───────────────────────────────────────────────────────────

  function lerp(a, b, t) {
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }

  function getTelemetry() {
    // Fallback: pre-launch defaults so radar always works
    var fallback = { distEarthKm: 0, distMoonKm: 384400, speedKmh: 0, altitudeKm: 0 };
    if (!currTelemetry && !prevTelemetry) return fallback;
    if (!currTelemetry) return prevTelemetry || fallback;
    if (!prevTelemetry) return currTelemetry;
    var elapsed = Date.now() - telemetryTimestamp;
    var t = Math.min(elapsed / TELEMETRY_LERP_MS, 1);
    return {
      distEarthKm: lerp(prevTelemetry.distEarthKm, currTelemetry.distEarthKm, t),
      distMoonKm:  lerp(prevTelemetry.distMoonKm, currTelemetry.distMoonKm, t),
      speedKmh:    lerp(prevTelemetry.speedKmh, currTelemetry.speedKmh, t),
      altitudeKm:  lerp(prevTelemetry.altitudeKm, currTelemetry.altitudeKm, t)
    };
  }

  // ── Logarithmic mapping ──────────────────────────────────────────────

  function logPosition(distanceKm, maxDistKm) {
    // log(1 + d) / log(1 + max) — spreads near-Earth objects, compresses transit
    if (distanceKm <= 0) return 0;
    if (distanceKm >= maxDistKm) return 1;
    return Math.log(1 + distanceKm) / Math.log(1 + maxDistKm);
  }

  // ── Earth-orbit Orion: piecewise mission-significance curve ────────
  // Maps altitude 0–100,000 km to position 0.05–0.95 using segments
  // tuned to where Artemis II crew actually spends time.

  var EARTH_ORBIT_SEGMENTS = [
    // { kmEnd, posEnd } — each segment starts where the previous ended
    // 0-500 km (launch/ascent): fast through, it's brief
    { kmEnd: 500,    posEnd: 0.15 },
    // 500-6,000 km (inner Van Allen belt): meaningful zone
    { kmEnd: 6000,   posEnd: 0.35 },
    // 6,000-35,000 km (climbing to high orbit): crew system checks
    { kmEnd: 35000,  posEnd: 0.55 },
    // 35,000-60,000 km (outer Van Allen / system checks): long dwell
    { kmEnd: 60000,  posEnd: 0.75 },
    // 60,000-100,000 km (departing Earth orbit): transition zone
    { kmEnd: 100000, posEnd: 0.95 }
  ];

  function earthOrbitOrionPosition(altKm) {
    if (altKm <= 0) return 0.05;
    var prevKm = 0;
    var prevPos = 0.05;
    for (var i = 0; i < EARTH_ORBIT_SEGMENTS.length; i++) {
      var seg = EARTH_ORBIT_SEGMENTS[i];
      if (altKm <= seg.kmEnd) {
        var t = (altKm - prevKm) / (seg.kmEnd - prevKm);
        return prevPos + t * (seg.posEnd - prevPos);
      }
      prevKm = seg.kmEnd;
      prevPos = seg.posEnd;
    }
    return 0.95; // beyond 100,000 km
  }

  // ── Z-depth for Orion trajectory ────────────────────────────────────

  function getOrionZ(tel) {
    // In moon-orbit view, Z comes from the orbit angle:
    //   Approaching: z = -1 (in front of listener)
    //   Behind Moon: z = +1 (behind listener)
    //   Returning:   z = -1 (in front again)
    if (viewMode === 'moon-orbit') {
      // Use real Z-position data when available
      if (tel.orionPos && tel.moonPos) {
        // Z component of vector from Moon to Orion (ecliptic Z)
        var dz = tel.orionPos.z - tel.moonPos.z;
        // Positive Z = above ecliptic (behind listener in our model)
        // Normalize: typical Z range is a few thousand km near Moon
        var zNorm = Math.max(-1, Math.min(1, dz / 10000));
        return zNorm;
      }
      return -1; // fallback: in front of listener
    }

    // Earth-Moon Transit: outbound Orion in front, approaching Moon shifts to z=0
    if (viewMode === 'earth-moon') {
      var distMoon = tel.distMoonKm;
      if (distMoon < MOON_ORBIT_THRESHOLD) {
        // Near Moon — shift from -1 toward 0
        var t = 1 - distMoon / MOON_ORBIT_THRESHOLD;
        return lerp(-1, 0, t);
      }
      return -1; // outbound: in front
    }

    // Earth Orbit view: always in front of listener
    return -1;
  }

  // ── Object positions for a single view (normalized 0–1 for sweep) ───
  // KEY PRINCIPLE: Earth is ALWAYS on the left. The whole mission reads left-to-right.

  function getViewPositions(mode, tel) {
    var positions = {};

    if (mode === 'earth-orbit') {
      // Mission-significance layout: objects spread evenly across the sweep
      // so the entire arc has meaningful content (no dead zones).
      // Direction: right = further from Earth
      positions.earth = 0.05;    // hard left anchor
      positions.iss = 0.02;      // ISS: far left, Earth-bound reference
      positions.gps = 0.45;      // GPS orbit: between inner belt and geo
      positions.geo = 0.55;      // Geostationary: near the system check zone
      positions.moon = 0.95;     // far right — quiet ping as distant reference

      // Orion: custom piecewise curve based on mission phases
      positions.orion = earthOrbitOrionPosition(tel.distEarthKm);

    } else if (mode === 'earth-moon') {
      // Earth hard left (SAME as Earth Orbit — seamless transition)
      // Moon hard right. Orion between them, linear scale.
      // Direction: right = closer to Moon
      positions.earth = 0.05;
      positions.moon = 0.95;
      positions.iss = 0.02;      // ISS: far left in transit — it's Earth-bound

      // Orion between Earth and Moon (linear scale of Earth distance)
      // Linear mapping gives proper spatial spread across the transit range
      var orionFrac = Math.max(0, Math.min(1, tel.distEarthKm / EARTH_MOON_DIST));
      positions.orion = 0.05 + orionFrac * 0.9;

    } else {
      // Moon Orbit view: Moon at CENTER, Earth far left (quiet)
      // Orion moves relative to Moon based on orbit angle:
      //   Approaching from Earth side: LEFT of center (0.2–0.5)
      //   At closest approach: near center (0.48–0.52)
      //   Going behind Moon (far side): RIGHT of center (0.5–0.85)
      //   During comms blackout (behind Moon): far right (~0.85), volume drops
      //   Coming back around: swings left through center and beyond
      positions.earth = 0.02;
      positions.moon = 0.50;
      positions.iss = 0.01; // far far left — ISS is Earth-bound, barely audible

      // Real position: compute Orion's angular position relative to Moon
      // using actual vector data when available (from JPL Horizons)
      if (tel.orionPos && tel.moonPos) {
        // Vector from Moon to Orion
        var dx = tel.orionPos.x - tel.moonPos.x;
        var dy = tel.orionPos.y - tel.moonPos.y;
        // Angle from Moon to Orion in the ecliptic plane
        // atan2 gives -PI to PI; map to 0–1 sweep position around Moon at center
        var angle = Math.atan2(dy, dx);
        // Map: Earth side (approaching) = left, far side = right
        // angle ~PI or ~-PI = Earth direction (left), angle ~0 = far side (right)
        positions.orion = Math.max(0.05, Math.min(0.95, 0.50 - 0.45 * (angle / Math.PI)));
      } else {
        // Fallback: position based on distance fraction
        var approachFrac = Math.max(0, Math.min(1, 1 - tel.distMoonKm / EARTH_MOON_DIST));
        positions.orion = Math.max(0.05, 0.10 + approachFrac * 0.40);
      }
    }

    return positions;
  }

  function getObjectPositions(tel) {
    // If mid-transition, blend between old and new view positions
    if (transitionFrom && transitionProgress < 1) {
      var fromPos = getViewPositions(transitionFrom, tel);
      var toPos = getViewPositions(viewMode, tel);
      var t = transitionProgress;
      var blended = {};
      var keys = Object.keys(toPos);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var from = (fromPos[k] !== undefined) ? fromPos[k] : toPos[k];
        blended[k] = lerp(from, toPos[k], t);
      }
      // Include keys only in fromPos (e.g. gps/geo fading out)
      var fromKeys = Object.keys(fromPos);
      for (var j = 0; j < fromKeys.length; j++) {
        if (blended[fromKeys[j]] === undefined) {
          blended[fromKeys[j]] = lerp(fromPos[fromKeys[j]], 1.5, t); // fade off-screen
        }
      }
      return blended;
    }
    return getViewPositions(viewMode, tel);
  }

  // ── Stereo position from normalized position ─────────────────────────

  function panFromPosition(pos) {
    // 0 => -1 (left), 1 => +1 (right)
    return pos * 2 - 1;
  }

  // ── Ping synthesis ───────────────────────────────────────────────────

  function pingEarth(pan, posZ, vol) {
    if (!ctx || !masterGain) return;
    var now = ctx.currentTime;
    var z = (posZ !== undefined) ? posZ : -1;
    var vScale = (vol !== undefined) ? vol : 1;

    // Bird-like chirp — three frequency sweeps (glissando) for organic sound

    var panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 1;
    panner.positionX.setValueAtTime(pan * 10, now);
    panner.positionY.setValueAtTime(0, now);
    panner.positionZ.setValueAtTime(z, now);

    panner.connect(masterGain);

    // Note 1: descending sweep 1800→1200 Hz over 80ms
    var g1 = 0.3 * vScale;
    var t1 = now;
    var osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1800, t1);
    osc1.frequency.exponentialRampToValueAtTime(1200, t1 + 0.08);
    var env1 = ctx.createGain();
    env1.gain.setValueAtTime(0.001, t1);
    env1.gain.linearRampToValueAtTime(g1, t1 + 0.003);
    env1.gain.setValueAtTime(g1, t1 + 0.08);
    env1.gain.exponentialRampToValueAtTime(0.001, t1 + 0.23);
    osc1.connect(env1);
    env1.connect(panner);
    osc1.start(t1);
    osc1.stop(t1 + 0.24);

    // Note 2: descending sweep 2200→1600 Hz over 60ms, starts 100ms after note 1
    var g2 = 0.25 * vScale;
    var t2 = now + 0.1;
    var osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2200, t2);
    osc2.frequency.exponentialRampToValueAtTime(1600, t2 + 0.06);
    var env2 = ctx.createGain();
    env2.gain.setValueAtTime(0.001, t2);
    env2.gain.linearRampToValueAtTime(g2, t2 + 0.003);
    env2.gain.setValueAtTime(g2, t2 + 0.06);
    env2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.21);
    osc2.connect(env2);
    env2.connect(panner);
    osc2.start(t2);
    osc2.stop(t2 + 0.22);

    // Note 3: ascending sweep 2600→3000 Hz over 40ms, starts 180ms after note 1
    var g3 = 0.15 * vScale;
    var t3 = now + 0.18;
    var osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(2600, t3);
    osc3.frequency.exponentialRampToValueAtTime(3000, t3 + 0.04);
    var env3 = ctx.createGain();
    env3.gain.setValueAtTime(0.001, t3);
    env3.gain.linearRampToValueAtTime(g3, t3 + 0.003);
    env3.gain.setValueAtTime(g3, t3 + 0.04);
    env3.gain.exponentialRampToValueAtTime(0.001, t3 + 0.19);
    osc3.connect(env3);
    env3.connect(panner);
    osc3.start(t3);
    osc3.stop(t3 + 0.20);

    // Cleanup after last note finishes
    osc3.onended = function () {
      osc1.disconnect(); osc2.disconnect(); osc3.disconnect();
      env1.disconnect(); env2.disconnect(); env3.disconnect();
      panner.disconnect();
    };
  }

  function pingMoon(pan, posZ, vol) {
    if (!ctx || !masterGain) return;
    var now = ctx.currentTime;
    var z = (posZ !== undefined) ? posZ : -1;
    var vScale = (vol !== undefined) ? vol : 1;

    // Metallic ethereal ring — two detuned triangles through bandpass resonance

    // Bandpass filter for focused metallic resonance
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1100, now);
    bp.Q.setValueAtTime(5, now);

    var panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 1;
    panner.positionX.setValueAtTime(pan * 10, now);
    panner.positionY.setValueAtTime(0, now);
    panner.positionZ.setValueAtTime(z, now);

    bp.connect(panner);
    panner.connect(masterGain);

    // Primary triangle — 1047 Hz
    var envGain = 0.4 * vScale;
    var osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(1047, now);
    var env1 = ctx.createGain();
    env1.gain.setValueAtTime(0.001, now);
    env1.gain.linearRampToValueAtTime(envGain, now + 0.002);
    env1.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    osc1.connect(env1);
    env1.connect(bp);

    // Second triangle — 1051 Hz (4 Hz detuning for slow beating shimmer)
    var osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1051, now);
    var env2 = ctx.createGain();
    env2.gain.setValueAtTime(0.001, now);
    env2.gain.linearRampToValueAtTime(envGain, now + 0.002);
    env2.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    osc2.connect(env2);
    env2.connect(bp);

    var stopTime = now + 1.55;
    osc1.start(now);
    osc1.stop(stopTime);
    osc2.start(now);
    osc2.stop(stopTime);

    osc1.onended = function () {
      osc1.disconnect(); osc2.disconnect();
      env1.disconnect(); env2.disconnect();
      bp.disconnect(); panner.disconnect();
    };
  }

  function pingOrion(pan, speedKmh, behindMoon, posZ) {
    if (!ctx || !masterGain) return;
    var now = ctx.currentTime;
    var z = (posZ !== undefined) ? posZ : -1;

    // NASA Quindar double-beep — two 2525 Hz sine + noise bursts, 80ms each
    var gainLevel = behindMoon ? 0.04 : 0.25;
    var noiseLevel = behindMoon ? 0.02 : 0.1;

    var panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 1;
    panner.positionX.setValueAtTime(pan * 10, now);
    panner.positionY.setValueAtTime(0, now);
    panner.positionZ.setValueAtTime(z, now);
    panner.connect(masterGain);

    // Shared noise buffer for both beeps (~220ms total)
    var noiseBufLen = Math.ceil(ctx.sampleRate * 0.26);
    var noiseBuf = ctx.createBuffer(1, noiseBufLen, ctx.sampleRate);
    var noiseData = noiseBuf.getChannelData(0);
    for (var ni = 0; ni < noiseBufLen; ni++) {
      noiseData[ni] = Math.random() * 2 - 1;
    }

    // ── Beep 1: starts immediately, 80ms ──
    var osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(2525, now);
    var gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(gainLevel, now + 0.002);
    gain1.gain.setValueAtTime(gainLevel, now + 0.078);
    gain1.gain.linearRampToValueAtTime(0.001, now + 0.08);
    osc1.connect(gain1);
    gain1.connect(panner);
    osc1.start(now);
    osc1.stop(now + 0.10);

    var noiseSrc1 = ctx.createBufferSource();
    noiseSrc1.buffer = noiseBuf;
    var noiseBp1 = ctx.createBiquadFilter();
    noiseBp1.type = 'bandpass';
    noiseBp1.frequency.setValueAtTime(2500, now);
    noiseBp1.Q.setValueAtTime(2, now);
    var noiseGain1 = ctx.createGain();
    noiseGain1.gain.setValueAtTime(0.001, now);
    noiseGain1.gain.linearRampToValueAtTime(noiseLevel, now + 0.002);
    noiseGain1.gain.setValueAtTime(noiseLevel, now + 0.078);
    noiseGain1.gain.linearRampToValueAtTime(0.001, now + 0.08);
    noiseSrc1.connect(noiseBp1);
    noiseBp1.connect(noiseGain1);
    noiseGain1.connect(panner);
    noiseSrc1.start(now);
    noiseSrc1.stop(now + 0.10);

    // ── Beep 2: starts at +140ms, 80ms ──
    var t2 = now + 0.14;
    var osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2525, t2);
    var gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.001, t2);
    gain2.gain.linearRampToValueAtTime(gainLevel, t2 + 0.002);
    gain2.gain.setValueAtTime(gainLevel, t2 + 0.078);
    gain2.gain.linearRampToValueAtTime(0.001, t2 + 0.08);
    osc2.connect(gain2);
    gain2.connect(panner);
    osc2.start(t2);
    osc2.stop(t2 + 0.10);

    var noiseSrc2 = ctx.createBufferSource();
    noiseSrc2.buffer = noiseBuf;
    var noiseBp2 = ctx.createBiquadFilter();
    noiseBp2.type = 'bandpass';
    noiseBp2.frequency.setValueAtTime(2500, t2);
    noiseBp2.Q.setValueAtTime(2, t2);
    var noiseGain2 = ctx.createGain();
    noiseGain2.gain.setValueAtTime(0.001, t2);
    noiseGain2.gain.linearRampToValueAtTime(noiseLevel, t2 + 0.002);
    noiseGain2.gain.setValueAtTime(noiseLevel, t2 + 0.078);
    noiseGain2.gain.linearRampToValueAtTime(0.001, t2 + 0.08);
    noiseSrc2.connect(noiseBp2);
    noiseBp2.connect(noiseGain2);
    noiseGain2.connect(panner);
    noiseSrc2.start(t2);
    noiseSrc2.stop(t2 + 0.10);

    // Cleanup after second beep finishes
    osc2.onended = function () {
      osc1.disconnect(); gain1.disconnect();
      noiseSrc1.disconnect(); noiseBp1.disconnect(); noiseGain1.disconnect();
      osc2.disconnect(); gain2.disconnect();
      noiseSrc2.disconnect(); noiseBp2.disconnect(); noiseGain2.disconnect();
      panner.disconnect();
    };
  }


  function pingISS(pan, posZ) {
    if (!ctx || !masterGain) return;
    var now = ctx.currentTime;
    var z = (posZ !== undefined) ? posZ : -1;

    // Quick ascending Doppler pass — three fast rising notes (satellite flyover)

    var panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 1;
    panner.positionX.setValueAtTime(pan * 10, now);
    panner.positionY.setValueAtTime(0, now);
    panner.positionZ.setValueAtTime(z, now);

    panner.connect(masterGain);

    var notes = [
      { freq: 600, offset: 0,     dur: 0.03, gain: 0.2 },
      { freq: 800, offset: 0.025, dur: 0.03, gain: 0.25 },
      { freq: 1000, offset: 0.05, dur: 0.03, gain: 0.15 }
    ];

    var oscs = [];
    var envs = [];

    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      var t = now + n.offset;

      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, t);
      var env = ctx.createGain();
      env.gain.setValueAtTime(0.001, t);
      env.gain.linearRampToValueAtTime(n.gain, t + 0.002);
      env.gain.exponentialRampToValueAtTime(0.001, t + n.dur);
      osc.connect(env);
      env.connect(panner);
      osc.start(t);
      osc.stop(t + n.dur + 0.005);
      oscs.push(osc);
      envs.push(env);
    }

    // Cleanup after last note finishes
    oscs[oscs.length - 1].onended = function () {
      for (var j = 0; j < oscs.length; j++) { oscs[j].disconnect(); envs[j].disconnect(); }
      panner.disconnect();
    };
  }

  function pingGPS(pan, posZ) {
    if (!ctx || !masterGain) return;
    var now = ctx.currentTime;
    var z = (posZ !== undefined) ? posZ : -1;

    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    var panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 1;
    panner.positionX.setValueAtTime(pan * 10, now);
    panner.positionY.setValueAtTime(0, now);
    panner.positionZ.setValueAtTime(z, now);

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain);

    osc.start(now);
    osc.stop(now + 0.12);
    osc.onended = function () {
      osc.disconnect(); gain.disconnect(); panner.disconnect();
    };
  }

  function pingGeo(pan, posZ) {
    if (!ctx || !masterGain) return;
    var now = ctx.currentTime;
    var z = (posZ !== undefined) ? posZ : -1;

    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    var panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 1;
    panner.positionX.setValueAtTime(pan * 10, now);
    panner.positionY.setValueAtTime(0, now);
    panner.positionZ.setValueAtTime(z, now);

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain);

    osc.start(now);
    osc.stop(now + 0.15);
    osc.onended = function () {
      osc.disconnect(); gain.disconnect(); panner.disconnect();
    };
  }

  // ── Milestone audio: Van Allen radiation crackle ─────────────────────

  function startVanAllenCrackle() {
    if (!ctx || !masterGain || vanAllenCrackleNode) return;

    var bufferSize = ctx.sampleRate * 2;
    var noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      // Crackly noise: sparse impulses mixed with white noise
      var impulse = Math.random() < 0.02 ? (Math.random() * 2 - 1) * 3 : 0;
      data[i] = (Math.random() * 2 - 1) * 0.3 + impulse;
    }

    vanAllenCrackleNode = ctx.createBufferSource();
    vanAllenCrackleNode.buffer = noiseBuffer;
    vanAllenCrackleNode.loop = true;

    vanAllenCrackleFilter = ctx.createBiquadFilter();
    vanAllenCrackleFilter.type = 'bandpass';
    vanAllenCrackleFilter.frequency.setValueAtTime(3000, ctx.currentTime);
    vanAllenCrackleFilter.Q.setValueAtTime(1.5, ctx.currentTime);

    vanAllenCrackleGain = ctx.createGain();
    vanAllenCrackleGain.gain.setValueAtTime(0, ctx.currentTime);
    // Fade in over 0.5s
    vanAllenCrackleGain.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.5);

    vanAllenCrackleNode.connect(vanAllenCrackleFilter);
    vanAllenCrackleFilter.connect(vanAllenCrackleGain);
    vanAllenCrackleGain.connect(masterGain);
    vanAllenCrackleNode.start();
  }

  function stopVanAllenCrackle() {
    if (!vanAllenCrackleGain || !vanAllenCrackleNode || !ctx) {
      vanAllenCrackleNode = null;
      vanAllenCrackleGain = null;
      vanAllenCrackleFilter = null;
      return;
    }
    // Fade out over 0.5s then stop
    var now = ctx.currentTime;
    vanAllenCrackleGain.gain.cancelScheduledValues(now);
    vanAllenCrackleGain.gain.setValueAtTime(vanAllenCrackleGain.gain.value, now);
    vanAllenCrackleGain.gain.linearRampToValueAtTime(0, now + 0.5);

    var node = vanAllenCrackleNode;
    var gainNode = vanAllenCrackleGain;
    var filterNode = vanAllenCrackleFilter;
    vanAllenCrackleNode = null;
    vanAllenCrackleGain = null;
    vanAllenCrackleFilter = null;

    setTimeout(function () {
      try {
        node.stop();
        node.disconnect();
        gainNode.disconnect();
        filterNode.disconnect();
      } catch (e) { /* already stopped */ }
    }, 600);
  }

  // ── Milestone audio: Halfway chime ──────────────────────────────────

  function playHalfwayChime() {
    if (!ctx || !masterGain) return;
    var now = ctx.currentTime;

    // Two ascending tones
    var osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(600, now);

    var gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(now);
    osc1.stop(now + 0.5);

    var osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(800, now + 0.2);

    var gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.2, now + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(now + 0.2);
    osc2.stop(now + 0.7);

    osc1.onended = function () { osc1.disconnect(); gain1.disconnect(); };
    osc2.onended = function () { osc2.disconnect(); gain2.disconnect(); };
  }

  // ── Milestone: Comms blackout drone shift ───────────────────────────

  function setDroneBlackoutMode(inBlackout) {
    if (droneNodes.length < 3) return;
    var now = ctx.currentTime;
    if (inBlackout) {
      // Shift drone lower and darker — pull filters down, drop sub-bass
      droneNodes[0].filter.frequency.linearRampToValueAtTime(60, now + 1);
      droneNodes[1].filter.frequency.linearRampToValueAtTime(50, now + 1);
      droneNodes[2].node.frequency.linearRampToValueAtTime(30, now + 1);
    } else {
      // Restore normal drone
      droneNodes[0].filter.frequency.linearRampToValueAtTime(60, now + 1);
      droneNodes[1].filter.frequency.linearRampToValueAtTime(45, now + 1);
      droneNodes[2].node.frequency.linearRampToValueAtTime(40, now + 1);
    }
  }

  // ── Background drone ─────────────────────────────────────────────────

  function startDrone() {
    if (!ctx || !masterGain) return;
    if (droneNodes.length > 0) return; // already running

    var now = ctx.currentTime;
    var bufferSize = ctx.sampleRate * 2;

    // ── Brown noise generator (shared buffer) ──────────────────────
    // Integrate white noise: each sample = prev * 0.99 + random * 0.01
    var brownBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var bd = brownBuffer.getChannelData(0);
    var prev = 0;
    for (var i = 0; i < bufferSize; i++) {
      prev = prev * 0.99 + (Math.random() * 2 - 1) * 0.01;
      bd[i] = prev;
    }
    // Normalize so peaks hit ~1.0
    var peak = 0;
    for (var j = 0; j < bufferSize; j++) {
      var abs = Math.abs(bd[j]);
      if (abs > peak) peak = abs;
    }
    if (peak > 0) {
      for (var k = 0; k < bufferSize; k++) {
        bd[k] /= peak;
      }
    }

    // ── Layer 1: Brown noise through heavy lowpass (deep rumble) ───
    var noise1 = ctx.createBufferSource();
    noise1.buffer = brownBuffer;
    noise1.loop = true;

    var lp1 = ctx.createBiquadFilter();
    lp1.type = 'lowpass';
    lp1.frequency.setValueAtTime(120, now);

    var gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0.08, now);

    var pan1 = ctx.createPanner();
    pan1.panningModel = 'HRTF';
    pan1.distanceModel = 'inverse';
    pan1.refDistance = 1;
    pan1.maxDistance = 10000;
    pan1.rolloffFactor = 1;
    pan1.positionX.setValueAtTime(-3, now);
    pan1.positionY.setValueAtTime(0, now);
    pan1.positionZ.setValueAtTime(-1, now);

    noise1.connect(lp1);
    lp1.connect(gain1);
    gain1.connect(pan1);
    pan1.connect(masterGain);
    noise1.start();

    // ── Layer 2: Brown noise through bandpass at 80 Hz (body) ─────
    var noise2 = ctx.createBufferSource();
    noise2.buffer = brownBuffer;
    noise2.loop = true;

    var bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.setValueAtTime(80, now);
    bp2.Q.setValueAtTime(2, now);

    var gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.08, now);

    var pan2 = ctx.createPanner();
    pan2.panningModel = 'HRTF';
    pan2.distanceModel = 'inverse';
    pan2.refDistance = 1;
    pan2.maxDistance = 10000;
    pan2.rolloffFactor = 1;
    pan2.positionX.setValueAtTime(3, now);
    pan2.positionY.setValueAtTime(0, now);
    pan2.positionZ.setValueAtTime(-1, now);

    noise2.connect(bp2);
    bp2.connect(gain2);
    gain2.connect(pan2);
    pan2.connect(masterGain);
    noise2.start();

    // ── Layer 3: Very subtle detuned sine at 40 Hz (warp core) ────
    var subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(40, now);

    var subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.015, now);

    subOsc.connect(subGain);
    subGain.connect(masterGain);
    subOsc.start();

    droneNodes = [
      { node: noise1, filter: lp1, gain: gain1, pan: pan1 },
      { node: noise2, filter: bp2, gain: gain2, pan: pan2 },
      { node: subOsc, gain: subGain }
    ];
  }

  function stopDrone() {
    for (var i = 0; i < droneNodes.length; i++) {
      try {
        droneNodes[i].node.stop();
        droneNodes[i].node.disconnect();
        if (droneNodes[i].gain) droneNodes[i].gain.disconnect();
        if (droneNodes[i].pan) droneNodes[i].pan.disconnect();
        if (droneNodes[i].filter) droneNodes[i].filter.disconnect();
      } catch (e) { /* already stopped */ }
    }
    droneNodes = [];
  }

  // ── Sweep noise (subtle whoosh following the sweep) ──────────────────

  function startSweepNoise() {
    if (!ctx || !masterGain) return;

    var bufferSize = ctx.sampleRate * 2;
    var noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    sweepNoiseNode = ctx.createBufferSource();
    sweepNoiseNode.buffer = noiseBuffer;
    sweepNoiseNode.loop = true;

    sweepNoiseFilter = ctx.createBiquadFilter();
    sweepNoiseFilter.type = 'bandpass';
    sweepNoiseFilter.frequency.setValueAtTime(1000, ctx.currentTime);
    sweepNoiseFilter.Q.setValueAtTime(2, ctx.currentTime);

    sweepNoiseGain = ctx.createGain();
    sweepNoiseGain.gain.setValueAtTime(0.008, ctx.currentTime);

    sweepNoisePanner = ctx.createPanner();
    sweepNoisePanner.panningModel = 'HRTF';
    sweepNoisePanner.distanceModel = 'inverse';
    sweepNoisePanner.refDistance = 1;
    sweepNoisePanner.maxDistance = 10000;
    sweepNoisePanner.rolloffFactor = 1;
    sweepNoisePanner.positionX.setValueAtTime(-10, ctx.currentTime);
    sweepNoisePanner.positionY.setValueAtTime(0, ctx.currentTime);
    sweepNoisePanner.positionZ.setValueAtTime(-1, ctx.currentTime);

    sweepNoiseNode.connect(sweepNoiseFilter);
    sweepNoiseFilter.connect(sweepNoiseGain);
    sweepNoiseGain.connect(sweepNoisePanner);
    sweepNoisePanner.connect(masterGain);
    sweepNoiseNode.start();
  }

  function stopSweepNoise() {
    try {
      if (sweepNoiseNode) { sweepNoiseNode.stop(); sweepNoiseNode.disconnect(); }
      if (sweepNoiseFilter) sweepNoiseFilter.disconnect();
      if (sweepNoiseGain) sweepNoiseGain.disconnect();
      if (sweepNoisePanner) sweepNoisePanner.disconnect();
    } catch (e) { /* already stopped */ }
    sweepNoiseNode = null;
    sweepNoiseFilter = null;
    sweepNoiseGain = null;
    sweepNoisePanner = null;
  }

  // ── Beat loop + effects chain ─────────────────────────────────────

  function loadBeatBuffer() {
    if (beatBuffer) return; // already loaded
    if (!ctx) return;
    var request = new XMLHttpRequest();
    request.open('GET', 'audio/artemis-beat.wav', true);
    request.responseType = 'arraybuffer';
    request.onload = function () {
      if (!ctx || !request.response) return;
      // High-Fidelity: Check for 404 (HTML error page) before decoding
      var contentType = request.getResponseHeader('Content-Type');
      if (request.status === 404 || (contentType && contentType.indexOf('text/html') !== -1)) {
        console.warn('Audio asset "artemis-beat.wav" not found. Synthesizing high-fidelity heartbeat fallback...');
        beatBuffer = generateArtemisBeatBuffer();
        if (beatEnabled && running && !beatSourceNode) startBeat();
        return;
      }

      ctx.decodeAudioData(request.response, function (buffer) {
        beatBuffer = buffer;
        if (beatEnabled && running && !beatSourceNode) startBeat();
      }, function (err) {
        console.error('Audio decode failed, synthesizing fallback:', err);
        beatBuffer = generateArtemisBeatBuffer();
        if (beatEnabled && running && !beatSourceNode) startBeat();
      });
    };
    request.onerror = function () {
      console.warn('Network error loading audio. Synthesizing fallback...');
      beatBuffer = generateArtemisBeatBuffer();
    };
    request.send();
  }

  /**
   * High-Fidelity: Synthesize a 131 BPM heartbeat pulse buffer.
   * Ensures the mission tracker is self-contained and sounds cinematic.
   */
  function generateArtemisBeatBuffer() {
    if (!ctx) return null;
    var sampleRate = ctx.sampleRate;
    // 131 BPM = 0.458s per beat. 4-beat loop = 1.832s
    var loopLen = 1.832 * sampleRate;
    var buffer = ctx.createBuffer(2, loopLen, sampleRate);

    for (var ch = 0; ch < 2; ch++) {
      var data = buffer.getChannelData(ch);
      for (var b = 0; b < 4; b++) {
        var start = Math.floor(b * 0.458 * sampleRate);
        for (var i = 0; i < sampleRate * 0.2; i++) {
          if (start + i >= loopLen) break;
          // Cinematic "Thump-thump" pulse: sine + decaying noise
          var t = i / sampleRate;
          var env = Math.exp(-t * 15);
          var sine = Math.sin(2 * Math.PI * 55 * t); // 55Hz sub
          var noise = (Math.random() * 2 - 1) * 0.05 * Math.exp(-t * 40);
          data[start + i] = (sine + noise) * env * 0.5;
        }
      }
    }
    return buffer;
  }

  function generateImpulseResponse() {
    // Synthesize a short reverb impulse response (~1.5s, subtle room)
    if (!ctx) return null;
    var sampleRate = ctx.sampleRate;
    var length = sampleRate * 1.5;
    var impulse = ctx.createBuffer(2, length, sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var data = impulse.getChannelData(ch);
      for (var i = 0; i < length; i++) {
        // Exponentially decaying noise
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
    }
    return impulse;
  }

  function startEffectsChain() {
    if (!ctx || !masterGain) return;
    if (effectsSendGain) return; // already running

    var now = ctx.currentTime;

    // Send bus: taps off masterGain for FX processing
    effectsSendGain = ctx.createGain();
    effectsSendGain.gain.setValueAtTime(0.3, now); // subtle send level
    masterGain.connect(effectsSendGain);

    // ── Reverb path ────────────────────────────────────────────
    reverbNode = ctx.createConvolver();
    reverbNode.buffer = generateImpulseResponse();

    reverbGain = ctx.createGain();
    reverbGain.gain.setValueAtTime(0.4, now); // reverb wet level

    effectsSendGain.connect(reverbNode);
    reverbNode.connect(reverbGain);
    reverbGain.connect(ctx.destination);

    // ── Delay path (131 BPM synced) ─────────────────────────────
    delayNode = ctx.createDelay(1.0);
    delayNode.delayTime.setValueAtTime(BEAT_DELAY_TIME, now);

    delayFeedback = ctx.createGain();
    delayFeedback.gain.setValueAtTime(0.4, now); // feedback amount

    delayGain = ctx.createGain();
    delayGain.gain.setValueAtTime(0.3, now); // delay wet level

    effectsSendGain.connect(delayNode);
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode); // feedback loop
    delayNode.connect(delayGain);
    delayGain.connect(ctx.destination);
  }

  function stopEffectsChain() {
    try {
      if (effectsSendGain) { effectsSendGain.disconnect(); }
      if (reverbNode) { reverbNode.disconnect(); }
      if (reverbGain) { reverbGain.disconnect(); }
      if (delayNode) { delayNode.disconnect(); }
      if (delayFeedback) { delayFeedback.disconnect(); }
      if (delayGain) { delayGain.disconnect(); }
    } catch (e) { /* already disconnected */ }
    effectsSendGain = null;
    reverbNode = null;
    reverbGain = null;
    delayNode = null;
    delayFeedback = null;
    delayGain = null;
  }

  var beatWantOn = false;  // user wants beat on — waits for sweep sync

  function startBeatSource() {
    // Create the source node and start it — called only at sweep reset
    if (!ctx || !masterGain || !beatBuffer) return;
    if (beatSourceNode) return; // already running

    var now = ctx.currentTime;
    beatSourceNode = ctx.createBufferSource();
    beatSourceNode.buffer = beatBuffer;
    beatSourceNode.loop = true;

    beatGain = ctx.createGain();
    // Start muted or audible depending on whether user wants it on
    beatGain.gain.setValueAtTime(0, now);
    if (beatWantOn) {
      beatGain.gain.linearRampToValueAtTime(0.18, now + 0.3);
    }

    beatSourceNode.connect(beatGain);
    beatGain.connect(masterGain);
    beatSourceNode.start();

    if (beatWantOn) startEffectsChain();
  }

  function beatFadeIn() {
    if (!beatGain || !ctx) return;
    var now = ctx.currentTime;
    beatGain.gain.cancelScheduledValues(now);
    beatGain.gain.setValueAtTime(beatGain.gain.value, now);
    beatGain.gain.linearRampToValueAtTime(0.18, now + 0.3);
    startEffectsChain();
  }

  function beatFadeOut() {
    if (!beatGain || !ctx) return;
    var now = ctx.currentTime;
    beatGain.gain.cancelScheduledValues(now);
    beatGain.gain.setValueAtTime(beatGain.gain.value, now);
    beatGain.gain.linearRampToValueAtTime(0, now + 0.5);
    stopEffectsChain();
  }

  function destroyBeat() {
    // Full teardown — called when audio system stops
    beatWantOn = false;
    if (beatGain && ctx) {
      try { beatGain.gain.setValueAtTime(0, ctx.currentTime); } catch(e) {}
    }
    var src = beatSourceNode; var g = beatGain;
    beatSourceNode = null; beatGain = null;
    stopEffectsChain();
    setTimeout(function() {
      try { if (src) { src.stop(); src.disconnect(); } if (g) { g.disconnect(); } } catch(e) {}
    }, 100);
  }

  // Kept as startBeat/stopBeat for existing callsites
  function startBeat() {
    beatWantOn = true;
    if (beatSourceNode && beatGain) {
      // Already running (muted) — just fade in, already in sync
      beatFadeIn();
    }
    // If source doesn't exist yet, it'll be created at next sweep reset
  }

  function stopBeat() {
    beatWantOn = false;
    beatFadeOut();
  }

  function setBeatEnabled(enabled) {
    beatEnabled = enabled;
    if (enabled) {
      if (running) {
        if (beatBuffer) {
          startBeat();
        } else if (ctx) {
          loadBeatBuffer();
        }
      }
    } else {
      stopBeat();
    }
  }

  // ── Schedule a full left-to-right sweep ramp ────────────────────────

  function scheduleSweepRamp() {
    if (!sweepNoisePanner || !ctx) return;
    var now = ctx.currentTime;
    sweepNoisePanner.positionX.cancelScheduledValues(now);
    sweepNoisePanner.positionX.setValueAtTime(-10, now);
    sweepNoisePanner.positionX.linearRampToValueAtTime(10, now + sweepDuration);
  }

  // ── Milestone zone detection ────────────────────────────────────────

  function getMilestoneZone(tel) {
    var d = tel.distEarthKm;
    if (d >= VAN_ALLEN_INNER_START && d <= VAN_ALLEN_INNER_END) {
      return 'Inner Van Allen Belt';
    }
    if (d >= VAN_ALLEN_OUTER_START && d <= VAN_ALLEN_OUTER_END) {
      return 'Outer Van Allen Belt';
    }
    if (tel.distMoonKm < COMMS_BLACKOUT_DIST) {
      return 'Comms Blackout';
    }
    // Halfway check: within 5000 km of the halfway point
    if (Math.abs(d - HALFWAY_DIST) < 5000) {
      return 'Halfway to Moon';
    }
    return '';
  }

  function isInsideVanAllen(tel) {
    var d = tel.distEarthKm;
    return (d >= VAN_ALLEN_INNER_START && d <= VAN_ALLEN_INNER_END) ||
           (d >= VAN_ALLEN_OUTER_START && d <= VAN_ALLEN_OUTER_END);
  }

  // ── Main animation loop ──────────────────────────────────────────────

  function tick() {
    if (!running) return;

    var now = performance.now();
    if (lastFrameTime === 0) lastFrameTime = now;
    var dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    // Advance sweep (sawtooth 0→1)
    sweepPosition += dt / sweepDuration;

    // Detect cycle reset
    if (sweepPosition > 1.05) {
      sweepPosition = -0.15; // pause: negative values = dead zone (~0.5s at 3s sweep)
          // Tick sound at cycle start for orientation
          try {
            var tickOsc = ctx.createOscillator();
            var tickGain = ctx.createGain();
            var tickPan = ctx.createPanner();
            tickPan.panningModel = 'HRTF';
            tickPan.distanceModel = 'inverse';
            tickPan.refDistance = 1;
            tickPan.maxDistance = 10000;
            tickPan.rolloffFactor = 1;
            tickPan.positionX.setValueAtTime(-10, ctx.currentTime);
            tickPan.positionY.setValueAtTime(0, ctx.currentTime);
            tickPan.positionZ.setValueAtTime(-1, ctx.currentTime);
            tickOsc.type = 'sine';
            tickOsc.frequency.setValueAtTime(1500, ctx.currentTime);
            tickGain.gain.setValueAtTime(0.08, ctx.currentTime);
            tickGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
            tickOsc.connect(tickGain).connect(tickPan).connect(masterGain);
            tickOsc.start(ctx.currentTime);
            tickOsc.stop(ctx.currentTime + 0.05);
          } catch(e) {}
      // Reset ping flags
      pingedThisCycle.earth = false;
      pingedThisCycle.moon = false;
      pingedThisCycle.orion = false;
      pingedThisCycle.iss = false;
      pingedThisCycle.gps = false;
      pingedThisCycle.geo = false;

      // Keep beat source synced: create at sweep reset if we have a buffer
      if (beatBuffer && !beatSourceNode && running) {
        startBeatSource();
      }
    }

    // Schedule a new sweep ramp when the sweep begins (transition from pause to active)
    if (sweepNoisePanner) {
      if (sweepPosition >= 0 && sweepPosition < dt / sweepDuration + 0.001) {
        scheduleSweepRamp();
        sweepNoiseGain.gain.setValueAtTime(0.02, ctx.currentTime);
      } else if (sweepPosition >= 0) {
        sweepNoiseGain.gain.setValueAtTime(0.02, ctx.currentTime);
      } else {
        sweepNoiseGain.gain.setValueAtTime(0, ctx.currentTime);
      }
    }

    // Get interpolated telemetry
    var tel = getTelemetry();
    if (tel) {
      // Auto-view switching (three-way) with smooth transition
      if (autoView) {
        var newView;
        if (tel.distEarthKm < EARTH_ORBIT_THRESHOLD) {
          newView = 'earth-orbit';
        } else if (tel.distMoonKm < MOON_ORBIT_THRESHOLD) {
          newView = 'moon-orbit';
        } else {
          newView = 'earth-moon';
        }
        if (newView !== viewMode) {
          switchView(newView);
        }
      }

      // Advance transition blend
      if (transitionProgress < 1) {
        transitionProgress = Math.min(1, transitionProgress + dt / TRANSITION_DURATION);
        if (transitionProgress >= 1) {
          transitionFrom = null;
        }
      }

      // Moon-orbit view: use real position data, no animation

      // Get object positions
      var positions = getObjectPositions(tel);

      // Determine if Orion is behind Moon (comms blackout)
      // In moon-orbit view, use Z-depth: behind Moon when z > 0
      var orionZ = getOrionZ(tel);
      var behindMoon = (viewMode === 'moon-orbit') ? (orionZ > 0) : (tel.distMoonKm < COMMS_BLACKOUT_DIST);

      // In moon-orbit view, Orion volume drops when behind Moon (z > 0)
      // This creates the dramatic disappearing-behind-the-Moon effect

      // ── Milestone management ──────────────────────────────────────

      // Van Allen crackle
      var inVanAllen = isInsideVanAllen(tel);
      if (inVanAllen && !isInVanAllen) {
        startVanAllenCrackle();
        isInVanAllen = true;
      } else if (!inVanAllen && isInVanAllen) {
        stopVanAllenCrackle();
        isInVanAllen = false;
      }

      // Halfway chime (play once when crossing the zone)
      if (Math.abs(tel.distEarthKm - HALFWAY_DIST) < 5000 && !halfwayChimePlayed) {
        playHalfwayChime();
        halfwayChimePlayed = true;
      }
      // Reset if we move away (allows replay on return leg)
      if (Math.abs(tel.distEarthKm - HALFWAY_DIST) > 15000) {
        halfwayChimePlayed = false;
      }

      // Comms blackout drone shift
      if (behindMoon && !wasInCommsBlackout) {
        setDroneBlackoutMode(true);
        wasInCommsBlackout = true;
      } else if (!behindMoon && wasInCommsBlackout) {
        setDroneBlackoutMode(false);
        wasInCommsBlackout = false;
      }

      // Update milestone zone
      currentMilestoneZone = getMilestoneZone(tel);

      // ── Ping triggers ─────────────────────────────────────────────

      var triggerWindow = 0.06;

      // View-dependent volumes for Earth and Moon pings
      var EARTH_SWEEP_GAIN = { 'earth-orbit': 0.5, 'earth-moon': 0.25, 'moon-orbit': 0.08 };
      var MOON_SWEEP_GAIN  = { 'earth-orbit': 0.08, 'earth-moon': 0.25, 'moon-orbit': 0.5 };

      // Standard objects present in all views
      var stdObjects = ['earth', 'moon', 'orion', 'iss'];
      var stdPingFns = {
        earth: function (p, z) { pingEarth(p, z, EARTH_SWEEP_GAIN[viewMode] || 0.25); },
        moon: function (p, z) { pingMoon(p, z, MOON_SWEEP_GAIN[viewMode] || 0.25); },
        orion: function (p, z) { pingOrion(p, tel.speedKmh, behindMoon, z); },
        iss: function (p, z) { pingISS(p, z); }
      };

      for (var i = 0; i < stdObjects.length; i++) {
        var obj = stdObjects[i];
        if (!objectToggles[obj]) continue;
        if (pingedThisCycle[obj]) continue;

        var objPos = positions[obj];
        if (objPos === undefined || objPos > 1.1 || objPos < -0.1) continue; // off-screen
        if (sweepPosition >= 0 && Math.abs(sweepPosition - objPos) < triggerWindow) {
          var pan = panFromPosition(objPos);
          var zVal = (obj === 'orion') ? orionZ : -1;
          stdPingFns[obj](pan, zVal);
          pingedThisCycle[obj] = true;
        }
      }

      // Extra orbital objects: GPS, geostationary (visible in earth-orbit and during transitions)
      var extraObjects = ['gps', 'geo'];
      var extraPingFns = {
        gps: function (p, z) { pingGPS(p, z); },
        geo: function (p, z) { pingGeo(p, z); }
      };

      for (var j = 0; j < extraObjects.length; j++) {
        var eObj = extraObjects[j];
        if (!objectToggles[eObj]) continue;
        if (pingedThisCycle[eObj]) continue;

        var ePos = positions[eObj];
        if (ePos === undefined || ePos > 1.1 || ePos < -0.1) continue;
        if (sweepPosition >= 0 && Math.abs(sweepPosition - ePos) < triggerWindow) {
          var ePan = panFromPosition(ePos);
          extraPingFns[eObj](ePan, -1);
          pingedThisCycle[eObj] = true;
        }
      }

      // Update status text
      updateStatus(tel, positions);
    }
  }

  // ── Status text ──────────────────────────────────────────────────────

  function updateStatus(tel, positions) {
    if (!dom.status) return;
    var viewLabels = {
      'earth-orbit': 'Earth Orbit view',
      'earth-moon': 'Earth-Moon view',
      'moon-orbit': 'Moon Orbit view'
    };
    var viewLabel = viewLabels[viewMode] || viewMode;
    var active = [];
    if (objectToggles.earth) active.push('Earth');
    if (objectToggles.moon) active.push('Moon');
    if (objectToggles.orion) active.push('Orion');
    if (objectToggles.iss) active.push('ISS');
    var text = viewLabel + ' — ' + active.join(', ');
    dom.status.textContent = text;

    // Milestone status line
    if (dom.milestoneStatus) {
      dom.milestoneStatus.textContent = currentMilestoneZone
        ? 'Zone: ' + currentMilestoneZone
        : '';
    }
  }

  function switchView(newMode) {
    if (newMode === viewMode) return;
    transitionFrom = viewMode;
    transitionProgress = 0;
    viewMode = newMode;
    updateViewUI();
  }

  function updateViewUI() {
    // Update radio buttons to reflect current view
    if (dom.viewRadios) {
      for (var i = 0; i < dom.viewRadios.length; i++) {
        dom.viewRadios[i].checked = (dom.viewRadios[i].value === viewMode);
      }
    }
  }

  // ── Public API ───────────────────────────────────────────────────────

  function start() {
    if (running) return;
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Configure listener at origin, facing forward (-Z), up is +Y
    var listener = ctx.listener;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(0, ctx.currentTime);
      listener.positionY.setValueAtTime(0, ctx.currentTime);
      listener.positionZ.setValueAtTime(0, ctx.currentTime);
      listener.forwardX.setValueAtTime(0, ctx.currentTime);
      listener.forwardY.setValueAtTime(0, ctx.currentTime);
      listener.forwardZ.setValueAtTime(-1, ctx.currentTime);
      listener.upX.setValueAtTime(0, ctx.currentTime);
      listener.upY.setValueAtTime(1, ctx.currentTime);
      listener.upZ.setValueAtTime(0, ctx.currentTime);
    } else {
      listener.setPosition(0, 0, 0);
      listener.setOrientation(0, 0, -1, 0, 1, 0);
    }

    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume, ctx.currentTime);
    masterGain.connect(ctx.destination);

    startDrone();
    startSweepNoise();
    scheduleSweepRamp();

    // Pre-load beat buffer so it's ready when toggled on
    if (!beatBuffer) loadBeatBuffer();
    // If beat was already enabled before starting, start it now
    if (beatEnabled && beatBuffer) startBeat();

    running = true;
    sweepPosition = 0;
    lastFrameTime = 0;
    pingedThisCycle = { earth: false, moon: false, orion: false, iss: false, gps: false, geo: false };
    halfwayChimePlayed = false;
    wasInCommsBlackout = false;
    isInVanAllen = false;
    currentMilestoneZone = '';

    // Use setInterval instead of requestAnimationFrame so the audio
    // tick keeps running when the browser tab is backgrounded.
    // ~50 Hz is plenty for scheduling Web Audio events ahead of time.
    tickIntervalId = setInterval(tick, 20);

    if (dom.enableBtn) {
      dom.enableBtn.textContent = 'Disable Audio';
      dom.enableBtn.setAttribute('aria-pressed', 'true');
    }
  }

  function stop() {
    running = false;
    if (tickIntervalId !== null) {
      clearInterval(tickIntervalId);
      tickIntervalId = null;
    }
    destroyBeat();
    stopDrone();
    stopSweepNoise();
    stopVanAllenCrackle();

    if (masterGain) {
      try { masterGain.disconnect(); } catch (e) {}
      masterGain = null;
    }
    if (ctx) {
      try { ctx.close(); } catch (e) {}
      ctx = null;
    }

    isInVanAllen = false;
    wasInCommsBlackout = false;
    halfwayChimePlayed = false;
    currentMilestoneZone = '';
    beatBuffer = null; // context closed — buffer must be re-decoded

    if (dom.enableBtn) {
      dom.enableBtn.textContent = 'Enable Audio';
      dom.enableBtn.setAttribute('aria-pressed', 'false');
    }
    if (dom.status) {
      dom.status.textContent = 'Audio disabled';
    }
    if (dom.milestoneStatus) {
      dom.milestoneStatus.textContent = '';
    }
  }

  function updateTelemetry(data) {
    if (!data) return;
    prevTelemetry = currTelemetry || data;
    currTelemetry = {
      distEarthKm: data.distEarthKm || 0,
      distMoonKm: data.distMoonKm || 0,
      speedKmh: data.speedKmh || 0,
      altitudeKm: data.altitudeKm || 0
    };
    telemetryTimestamp = Date.now();
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(volume, ctx.currentTime);
    }
  }

  function setSweepDuration(s) {
    sweepDuration = Math.max(2, Math.min(8, s));
  }

  function setView(mode) {
    if (mode === 'earth-orbit' || mode === 'earth-moon' || mode === 'moon-orbit') {
      switchView(mode);
      autoView = false; // User override — lasts until page refresh
    }
  }

  function toggleAutoView() {
    autoView = !autoView;
    return autoView;
  }

  function setObjectToggle(obj, enabled) {
    if (objectToggles.hasOwnProperty(obj)) {
      objectToggles[obj] = enabled; if (enabled) previewSound(obj);
    }
  }

  // ── UI setup ─────────────────────────────────────────────────────────

  
  // Play a centered preview ping when an object is toggled ON
  function previewSound(objName) {
    if (!ctx || ctx.state !== 'running') return;
    var now = ctx.currentTime;
    switch(objName) {
      case 'earth': pingEarth(0); break;
      case 'moon': pingMoon(0); break;
      case 'orion': pingOrion(0, 20000, false); break;
      case 'iss': pingISS(0); break;
      case 'gps': pingGPS(0, -1); break;
      case 'geo': pingGeo(0, -1); break;
    }
  }

  // ── Trajectory Preview (30-second mission flythrough) ───────────────
  //
  // Keyframes map the 30-second timeline to 3D HRTF positions.
  // X: -10 = hard left (Earth), +10 = hard right (Moon)
  // Z: -1 = in front of listener, +1 = behind listener
  //
  // Timeline:
  //   0-3s   : Earth orbit (circling near Earth)
  //   3-5s   : TLI burn — begin transit
  //   5-16s  : transit to Moon — steady rightward, slight slowdown in middle
  //   16-22s : MOON FLYBY — figure-8 loop, the main event
  //   22-28s : return transit — leftward back toward Earth
  //   28-30s : re-entry and splashdown

  var TRAJECTORY_KEYFRAMES = [
    // Earth orbit phase (0-3s)
    { time: 0.0,  x: -9,   z: -1   },
    { time: 1.0,  x: -8.5, z: -0.5 },
    { time: 2.0,  x: -8,   z: -1   },
    { time: 3.0,  x: -8.5, z: -0.5 },

    // TLI burn (3-5s) — begins moving right
    { time: 3.5,  x: -7,   z: -1   },
    { time: 4.0,  x: -5,   z: -1   },
    { time: 5.0,  x: -3,   z: -1   },

    // Transit to Moon (5-16s) — steady rightward, slight slowdown in middle
    { time: 6.5,  x: -1,   z: -1   },
    { time: 8.0,  x: 1,    z: -1   },
    { time: 10.0, x: 2.5,  z: -1   },  // slight slowdown mid-transit
    { time: 12.0, x: 4.5,  z: -1   },
    { time: 14.0, x: 7,    z: -1   },
    { time: 15.5, x: 8.5,  z: -1   },

    // MOON FLYBY (16-22s) — the main event, figure-8 loop
    { time: 16.0, x: 9,    z: -1   },  // arrive at Moon
    { time: 17.0, x: 9.5,  z: -0.3 },  // passing Moon, z shifting
    { time: 18.0, x: 8,    z: 0.8  },  // swinging BEHIND listener
    { time: 19.0, x: 5,    z: 1    },  // fully behind (max z) — far side
    { time: 20.0, x: 3,    z: 0.8  },  // looping around
    { time: 21.0, x: 6,    z: 0    },  // coming back from behind
    { time: 22.0, x: 8,    z: -0.8 },  // back in front, near Moon again

    // Return transit (22-28s) — leftward
    { time: 23.0, x: 6,    z: -1   },
    { time: 24.0, x: 3,    z: -1   },
    { time: 25.0, x: 0,    z: -1   },
    { time: 26.0, x: -3,   z: -1   },
    { time: 27.0, x: -6,   z: -1   },
    { time: 28.0, x: -8,   z: -1   },

    // Re-entry and splashdown (28-30s)
    { time: 29.0, x: -9,   z: -1   },
    { time: 30.0, x: -9.5, z: -1   }
  ];

  // Pitch keyframes (Hz) — character changes during journey
  var TRAJECTORY_PITCH_KEYFRAMES = [
    { time: 0.0,  hz: 350 },   // near Earth: low, slow orbit
    { time: 3.0,  hz: 360 },
    { time: 5.0,  hz: 400 },   // transit: rising
    { time: 10.0, hz: 460 },
    { time: 15.5, hz: 520 },
    { time: 18.0, hz: 550 },   // Moon flyby: highest pitch
    { time: 20.0, hz: 540 },
    { time: 22.0, hz: 500 },   // return: descending
    { time: 26.0, hz: 420 },
    { time: 29.0, hz: 360 },
    { time: 30.0, hz: 350 }    // back to Earth: low again
  ];

  // Interpolate keyframes at a given time
  function interpKeyframes(keyframes, t, prop) {
    if (t <= keyframes[0].time) return keyframes[0][prop];
    if (t >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1][prop];
    for (var i = 0; i < keyframes.length - 1; i++) {
      var k0 = keyframes[i];
      var k1 = keyframes[i + 1];
      if (t >= k0.time && t <= k1.time) {
        var frac = (t - k0.time) / (k1.time - k0.time);
        return k0[prop] + (k1[prop] - k0[prop]) * frac;
      }
    }
    return keyframes[keyframes.length - 1][prop];
  }

  var previewPlaying = false;
  var previewTimeout = null;
  var previewWhooshCount = 0; // alternates L→R / R→L

  // ── Stereo whoosh for view transitions ────────────────────────────
  function playWhoosh(audioCtx, destNode) {
    if (!audioCtx || !destNode) return;
    var now = audioCtx.currentTime;
    var dur = 0.4;

    // White noise burst
    var bufLen = Math.ceil(audioCtx.sampleRate * dur);
    var buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < bufLen; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    var src = audioCtx.createBufferSource();
    src.buffer = buf;

    // Bandpass filter sweeping 500→3000 Hz
    var bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(2, now);
    bp.frequency.setValueAtTime(500, now);
    bp.frequency.exponentialRampToValueAtTime(3000, now + dur);

    // Gain envelope
    var gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
    gain.gain.setValueAtTime(0.15, now + dur * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    // Stereo panner — alternate direction each whoosh
    var panner = audioCtx.createStereoPanner();
    var leftToRight = (previewWhooshCount % 2 === 0);
    panner.pan.setValueAtTime(leftToRight ? -1 : 1, now);
    panner.pan.linearRampToValueAtTime(leftToRight ? 1 : -1, now + dur);
    previewWhooshCount++;

    src.connect(bp);
    bp.connect(gain);
    gain.connect(panner);
    panner.connect(destNode);
    src.start(now);
    src.stop(now + dur + 0.01);
    src.onended = function () {
      src.disconnect(); bp.disconnect(); gain.disconnect(); panner.disconnect();
    };
  }

  // ── Aria-live announcement for screen readers ──────────────────────
  function speakAnnouncement(text) {
    if (!dom.previewStatus) return;
    dom.previewStatus.textContent = text;
  }

  // ── Preview view-switch helper ────────────────────────────────────
  function previewSwitchView(newMode, audioCtx, destNode) {
    switchView(newMode);
    playWhoosh(audioCtx, destNode);
  }

  function playTrajectoryPreview() {
    if (previewPlaying) return;
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Ensure we have a master gain for the preview
    var previewMaster = ctx.createGain();
    previewMaster.gain.setValueAtTime(volume, ctx.currentTime);
    previewMaster.connect(ctx.destination);

    // Start background drone if not already running (needs masterGain)
    if (droneNodes.length === 0) {
      if (!masterGain) {
        masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(volume, ctx.currentTime);
        masterGain.connect(ctx.destination);
      }
      startDrone();
    }

    previewPlaying = true;
    previewWhooshCount = 0;
    if (dom.previewBtn) {
      dom.previewBtn.textContent = 'Playing preview\u2026';
      dom.previewBtn.disabled = true;
    }

    // Mute normal radar sweep during preview
    var wasRunning = running;
    var savedMasterGain = null;
    if (wasRunning && masterGain) {
      savedMasterGain = masterGain.gain.value;
      masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    }

    // Save previous auto-view state and disable it during preview
    var savedAutoView = autoView;
    autoView = false;

    var now = ctx.currentTime;
    var DURATION = 30;

    // ── Set initial view to Earth Orbit ────────────────────────────
    switchView('earth-orbit');

    // ── View-dependent ping volumes ───────────────────────────────────
    // Earth ping: loud when near Earth, faint when near Moon
    // Moon ping: loud when near Moon, faint when near Earth
    var EARTH_PING_GAIN = { 'earth-orbit': 0.5, 'earth-moon': 0.25, 'moon-orbit': 0.08 };
    var MOON_PING_GAIN  = { 'earth-orbit': 0.08, 'earth-moon': 0.25, 'moon-orbit': 0.5 };

    function getEarthPingVol() { return EARTH_PING_GAIN[viewMode] || 0.25; }
    function getMoonPingVol()  { return MOON_PING_GAIN[viewMode] || 0.25; }

    // ── Repeating reference pings during preview ───────────────────────
    // Earth pings every 1.5s, Moon pings every 1.5s offset by 0.75s
    // Both use current view positions so they track view switches
    var earthPingInterval = setInterval(function () {
      var positions = getViewPositions(viewMode, currentSimTel);
      var earthPos = positions.earth;
      if (earthPos !== undefined && earthPos >= -0.1 && earthPos <= 1.1) {
        pingEarth(panFromPosition(earthPos), -1, getEarthPingVol());
      }
    }, 1500);

    var moonPingTimeout = setTimeout(function () {
      // Fire first Moon ping after 0.75s, then repeat every 1.5s
      (function fireMoonPing() {
        var positions = getViewPositions(viewMode, currentSimTel);
        var moonPos = positions.moon;
        if (moonPos !== undefined && moonPos >= -0.1 && moonPos <= 1.1) {
          pingMoon(panFromPosition(moonPos), -1, getMoonPingVol());
        }
      })();
      moonPingInterval = setInterval(function () {
        var positions = getViewPositions(viewMode, currentSimTel);
        var moonPos = positions.moon;
        if (moonPos !== undefined && moonPos >= -0.1 && moonPos <= 1.1) {
          pingMoon(panFromPosition(moonPos), -1, getMoonPingVol());
        }
      }, 1500);
    }, 750);
    var moonPingInterval = null;

    // ── Moving Orion rocket engine noise ────────────────────────────────
    var tonePanner = ctx.createPanner();
    tonePanner.panningModel = 'HRTF';
    tonePanner.distanceModel = 'inverse';
    tonePanner.refDistance = 1;
    tonePanner.maxDistance = 10000;
    tonePanner.rolloffFactor = 1;
    tonePanner.connect(previewMaster);

    // White noise buffer (2 seconds, looping)
    var noiseBufLen = ctx.sampleRate * 2;
    var noiseBuf = ctx.createBuffer(1, noiseBufLen, ctx.sampleRate);
    var noiseData = noiseBuf.getChannelData(0);
    for (var ni = 0; ni < noiseBufLen; ni++) {
      noiseData[ni] = Math.random() * 2 - 1;
    }
    var noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuf;
    noiseSource.loop = true;

    // Bandpass filter — center frequency mapped to mission phase
    var bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.Q.setValueAtTime(4, now);
    // Schedule center frequency ramps for each phase:
    //   Earth orbit (0-3s): 250 Hz
    //   Transit (3-16s): 300 → 500 Hz
    //   Moon flyby (16-22s): peaks at 800 Hz
    //   Return (22-28s): 500 → 300 Hz
    //   Re-entry (28-30s): 250 Hz
    bandpass.frequency.setValueAtTime(250, now);
    bandpass.frequency.linearRampToValueAtTime(250, now + 3);
    bandpass.frequency.linearRampToValueAtTime(300, now + 3.01);
    bandpass.frequency.linearRampToValueAtTime(500, now + 16);
    bandpass.frequency.linearRampToValueAtTime(800, now + 19);
    bandpass.frequency.linearRampToValueAtTime(800, now + 22);
    bandpass.frequency.linearRampToValueAtTime(500, now + 22.01);
    bandpass.frequency.linearRampToValueAtTime(300, now + 28);
    bandpass.frequency.linearRampToValueAtTime(250, now + 28.01);
    bandpass.frequency.linearRampToValueAtTime(250, now + 30);

    // Lowpass filter to cut harshness
    var lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(2000, now);

    var toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0.25, now);

    // Connect: noiseSource → bandpass → lowpass → toneGain → tonePanner → previewMaster
    noiseSource.connect(bandpass);
    bandpass.connect(lowpass);
    lowpass.connect(toneGain);
    toneGain.connect(tonePanner);

    noiseSource.start(now);
    noiseSource.stop(now + DURATION + 0.1);

    // ── Per-frame position update loop ────────────────────────────────
    // Instead of pre-scheduling positions, update each frame based on
    // the CURRENTLY ACTIVE VIEW's coordinate system.

    // Simulated telemetry: map preview time (0-30s) to mission distances
    function getPreviewTelemetry(previewTime) {
      // Mission distance keyframes (time → distEarthKm)
      // 0-5s: Earth orbit, 0-100,000 km
      // 5-16s: transit, 100,000-334,400 km (near Moon)
      // 16-22s: moon flyby, ~50,000 km from Moon (334,400-384,400 from Earth)
      // 22-28s: return transit, 334,400-100,000 km
      // 28-30s: Earth re-entry, 100,000-0 km
      var distEarth;
      if (previewTime <= 5) {
        // Earth orbit: 0 → 100,000 km
        distEarth = (previewTime / 5) * EARTH_ORBIT_THRESHOLD;
      } else if (previewTime <= 16) {
        // Transit outbound: 100,000 → 334,400 km
        var transitFrac = (previewTime - 5) / 11;
        distEarth = EARTH_ORBIT_THRESHOLD + transitFrac * (EARTH_MOON_DIST - MOON_ORBIT_THRESHOLD - EARTH_ORBIT_THRESHOLD);
      } else if (previewTime <= 22) {
        // Moon flyby: 334,400 → 384,400 → 334,400 km (closest at 19s)
        var flybyFrac = (previewTime - 16) / 6;
        var flybyMid = 0.5; // closest at midpoint (19s)
        if (flybyFrac <= flybyMid) {
          // Approaching: 334,400 → 384,400
          distEarth = (EARTH_MOON_DIST - MOON_ORBIT_THRESHOLD) + (flybyFrac / flybyMid) * MOON_ORBIT_THRESHOLD;
        } else {
          // Departing: 384,400 → 334,400
          distEarth = EARTH_MOON_DIST - ((flybyFrac - flybyMid) / (1 - flybyMid)) * MOON_ORBIT_THRESHOLD;
        }
      } else if (previewTime <= 28) {
        // Return transit: 334,400 → 100,000 km
        var returnFrac = (previewTime - 22) / 6;
        distEarth = (EARTH_MOON_DIST - MOON_ORBIT_THRESHOLD) - returnFrac * (EARTH_MOON_DIST - MOON_ORBIT_THRESHOLD - EARTH_ORBIT_THRESHOLD);
      } else {
        // Re-entry: 100,000 → 0 km
        var reentryFrac = (previewTime - 28) / 2;
        distEarth = EARTH_ORBIT_THRESHOLD * (1 - reentryFrac);
      }

      var distMoon = EARTH_MOON_DIST - distEarth;
      return {
        distEarthKm: Math.max(0, distEarth),
        distMoonKm: Math.max(0, distMoon),
        speedKmh: 20000,
        altitudeKm: Math.max(0, distEarth)
      };
    }

    var previewStartTime = performance.now();
    var previewAnimId = null;
    // Shared simulated telemetry — updated each frame, read by reference pings
    var currentSimTel = getPreviewTelemetry(0);
    var prevOrionZ = -1; // track Z for crossing detection
    var prevOrionPan = 0; // track pan for position-triggered announcements

    function previewAnimFrame(timestamp) {
      if (!previewPlaying) return;

      var elapsed = (timestamp - previewStartTime) / 1000;
      if (elapsed > DURATION) return;

      // Update orionOrbitAngle during moon-orbit phase (seconds 16-22)
      // Non-linear mapping: slow at closest approach (17-18) and behind-Moon (19-20),
      // faster during transitions. Uses keyframed angle for dramatic pacing.
      if (elapsed >= 16 && elapsed <= 22) {
        // Keyframes: time → orbitAngle (radians)
        // -PI/2 = approaching from left, 0 = closest approach (center),
        // PI/2 = behind Moon (far right), PI = emerging, 3PI/2 = departing left
        var FLYBY_ANGLE_KF = [
          { time: 16, angle: -Math.PI / 2 },         // approaching from left
          { time: 17, angle: -Math.PI / 8 },          // nearing center, slowing down
          { time: 18, angle: 0 },                      // closest approach — center, sin=0, Z=boundary
          { time: 18.5, angle: Math.PI / 6 },          // passing behind Moon, Z goes positive
          { time: 19, angle: Math.PI / 3 },            // behind Moon
          { time: 20, angle: Math.PI / 2 },            // peak behind — comms blackout zone, sin=1
          { time: 21, angle: Math.PI * 0.85 },         // emerging from behind
          { time: 22, angle: Math.PI * 1.25 }          // departing left of Moon
        ];
        orionOrbitAngle = interpKeyframes(FLYBY_ANGLE_KF, elapsed, 'angle');
      }

      // Get simulated telemetry for current preview time
      var simTel = getPreviewTelemetry(elapsed);
      currentSimTel = simTel; // share with reference ping intervals

      // Get Orion's position in the CURRENT view's coordinate system
      var positions = getViewPositions(viewMode, simTel);
      var orionPos = positions.orion;
      if (orionPos === undefined) orionPos = 0.5;

      // Convert normalized position (0-1) to HRTF X coordinate (-10 to +10)
      var xVal = panFromPosition(orionPos) * 10;

      // Z-depth: use orbital angle in moon-orbit view, keyframes otherwise
      var zVal;
      if (viewMode === 'moon-orbit') {
        zVal = getOrionZ(simTel);
      } else {
        zVal = interpKeyframes(TRAJECTORY_KEYFRAMES, elapsed, 'z');
      }

      tonePanner.positionX.setValueAtTime(xVal, ctx.currentTime);
      tonePanner.positionZ.setValueAtTime(zVal, ctx.currentTime);
      tonePanner.positionY.setValueAtTime(0, ctx.currentTime);

      // Gain: full volume except fade in at start and fade out at end
      var gainVal = 0.25;
      if (elapsed < 0.5) {
        gainVal = 0.25 * (elapsed / 0.5);
      } else if (elapsed > 29.5) {
        gainVal = 0.25 * ((DURATION - elapsed) / 0.5);
      }
      // Slight volume dip when behind listener (z > 0) for realism
      if (zVal > 0) {
        gainVal *= (1 - zVal * 0.4);
      }
      toneGain.gain.setValueAtTime(Math.max(0.001, gainVal), ctx.currentTime);

      // ── Position-triggered announcements during moon-orbit view ────
      if (viewMode === 'moon-orbit') {
        // 'Approaching the Moon' — Orion pan crosses 0.4 heading toward center
        if (!announced.approaching && orionPos >= 0.4 && prevOrionPan < 0.4) {
          speakAnnouncement('Approaching the Moon.');
          announced.approaching = true;
        }
        // 'Closest approach' — Orion within 0.05 of Moon center (0.50)
        if (!announced.closest && Math.abs(orionPos - 0.50) < 0.05) {
          speakAnnouncement('Closest approach to the Moon.');
          announced.closest = true;
        }
        // 'Going behind the Moon. Communications blackout.' — Z crosses 0 going positive
        if (!announced.blackout && zVal > 0 && prevOrionZ <= 0) {
          speakAnnouncement('Going behind the Moon. Communications blackout.');
          announced.blackout = true;
        }
        // 'Signal reacquired' — Z crosses 0 going negative after being positive
        if (!announced.reacquired && announced.blackout && zVal <= 0 && prevOrionZ > 0) {
          speakAnnouncement('Signal reacquired.');
          announced.reacquired = true;
        }
      }

      // 'Halfway to the Moon' — Orion crosses 0.5 pan position in transit view
      if (viewMode === 'earth-moon' && !announced.halfway && orionPos >= 0.5 && prevOrionPan < 0.5) {
        speakAnnouncement('Halfway to the Moon.');
        announced.halfway = true;
      }

      prevOrionZ = zVal;
      prevOrionPan = orionPos;

      previewAnimId = requestAnimationFrame(previewAnimFrame);
    }

    previewAnimId = requestAnimationFrame(previewAnimFrame);

    // ── View switches + whoosh + speech announcements ─────────────────
    // Keep refs to scheduled timeouts so we can clean up if needed
    var scheduledTimeouts = [];

    function scheduleEvent(delaySec, fn) {
      var tid = setTimeout(fn, delaySec * 1000);
      scheduledTimeouts.push(tid);
    }

    // Announcement flags — position-triggered announcements fire once
    var announced = {
      earthOrbit: false,
      tli: false,
      transit: false,
      halfway: false,
      moonOrbit: false,
      approaching: false,
      closest: false,
      blackout: false,
      reacquired: false,
      departing: false,
      returnTransit: false,
      reentry: false,
      splashdown: false
    };

    // Second 0: 'Earth orbit' (immediate)
    speakAnnouncement('Earth orbit');
    announced.earthOrbit = true;

    // Second 3: 'Trans-lunar injection. Departing Earth orbit.' (time-based, pre-transit)
    scheduleEvent(3, function () {
      if (!announced.tli) {
        speakAnnouncement('Trans-lunar injection. Departing Earth orbit.');
        announced.tli = true;
      }
    });

    // Second 5: switch to Earth-Moon Transit view + whoosh + speech
    scheduleEvent(5, function () {
      previewSwitchView('earth-moon', ctx, previewMaster);
      if (!announced.transit) {
        speakAnnouncement('Transit view. En route to the Moon.');
        announced.transit = true;
      }
    });

    // Halfway: triggered when Orion pan crosses 0.5 in transit view (see previewAnimFrame)

    // Second 16: switch to Moon Orbit view + whoosh
    scheduleEvent(16, function () {
      previewSwitchView('moon-orbit', ctx, previewMaster);
      if (!announced.moonOrbit) {
        speakAnnouncement('Moon orbit view.');
        announced.moonOrbit = true;
      }
    });

    // Moon flyby announcements are position-triggered in previewAnimFrame:
    // - 'Approaching the Moon' — Orion pan crosses 0.4 in moon-orbit view
    // - 'Closest approach' — Orion within 0.05 of Moon position (0.50)
    // - 'Going behind the Moon. Communications blackout.' — Z crosses 0 going positive
    // - 'Signal reacquired' — Z crosses 0 going negative again
    // - 'Departing Moon orbit' — when leaving moon-orbit view

    // Second 22: switch to Earth-Moon Transit view + whoosh + speech
    scheduleEvent(22, function () {
      if (!announced.departing) {
        speakAnnouncement('Departing Moon orbit.');
        announced.departing = true;
      }
      previewSwitchView('earth-moon', ctx, previewMaster);
      setTimeout(function () {
        speakAnnouncement('Transit view. Returning to Earth.');
        announced.returnTransit = true;
      }, 500);
    });

    // Second 28: switch to Earth Orbit view + whoosh + speech
    scheduleEvent(28, function () {
      previewSwitchView('earth-orbit', ctx, previewMaster);
      if (!announced.reentry) {
        speakAnnouncement('Earth orbit view. Re-entry.');
        announced.reentry = true;
      }
    });

    // Second 30: 'Splashdown. Mission complete.'
    scheduleEvent(30, function () {
      if (!announced.splashdown) {
        speakAnnouncement('Splashdown. Mission complete.');
        announced.splashdown = true;
      }
    });

    // ── Cleanup after preview ends ────────────────────────────────────
    noiseSource.onended = function () {
      noiseSource.disconnect();
      bandpass.disconnect();
      lowpass.disconnect();
      toneGain.disconnect();
      tonePanner.disconnect();
      previewMaster.disconnect();
    };

    previewTimeout = setTimeout(function () {
      previewPlaying = false;
      previewTimeout = null;

      // Stop per-frame position update loop
      if (previewAnimId) {
        cancelAnimationFrame(previewAnimId);
        previewAnimId = null;
      }

      // Clear aria-live announcement
      if (dom.previewStatus) {
        dom.previewStatus.textContent = '';
      }

      // Stop repeating Earth/Moon pings
      clearInterval(earthPingInterval);
      clearTimeout(moonPingTimeout);
      if (moonPingInterval) clearInterval(moonPingInterval);

      // Clear any straggler timeouts
      for (var i = 0; i < scheduledTimeouts.length; i++) {
        clearTimeout(scheduledTimeouts[i]);
      }

      // Stop the background drone that was started for the preview
      stopDrone();

      if (dom.previewBtn) {
        dom.previewBtn.textContent = 'Preview full trajectory (30s)';
        dom.previewBtn.disabled = false;
      }

      // Restore auto-view state
      autoView = savedAutoView;
      // autoView restored — no checkbox to update

      // Restore normal radar volume
      if (wasRunning && masterGain) {
        try {
          masterGain.gain.linearRampToValueAtTime(
            savedMasterGain != null ? savedMasterGain : volume,
            ctx.currentTime + 0.3
          );
        } catch (e) { /* ctx may have closed */ }
      }
    }, (DURATION + 0.5) * 1000);
  }

function init() {
    var panel = document.getElementById('audio-radar-panel');
    if (!panel) return;

    dom.enableBtn = document.getElementById('audio-enable-btn');
    dom.volumeSlider = document.getElementById('audio-volume');
    dom.volumeLabel = document.getElementById('audio-volume-label');
    dom.sweepSlider = document.getElementById('audio-sweep-speed');
    dom.sweepLabel = document.getElementById('audio-sweep-label');
    dom.viewRadios = panel.querySelectorAll('input[name="sonification-view"]');
    dom.status = document.getElementById('audio-status');
    dom.milestoneStatus = document.getElementById('audio-milestone-status');
    dom.previewBtn = document.getElementById('audio-preview-btn');
    dom.previewStatus = document.getElementById('preview-status');

    // Autoview is ON by default — no checkbox needed
    autoView = true;

    // Enable/Disable button
    if (dom.enableBtn) {
      dom.enableBtn.addEventListener('click', function () {
        if (running) {
          stop();
        } else {
          start();
        }
      });
    }

    // Preview trajectory button
    if (dom.previewBtn) {
      dom.previewBtn.addEventListener('click', function () {
        playTrajectoryPreview();
      });
    }

    // Volume slider
    if (dom.volumeSlider) {
      dom.volumeSlider.addEventListener('input', function () {
        var v = parseFloat(this.value) / 100;
        setVolume(v);
        if (dom.volumeLabel) dom.volumeLabel.textContent = this.value + '%';
        this.setAttribute('aria-valuenow', this.value);
      });
    }

    // Sweep speed slider
    if (dom.sweepSlider) {
      dom.sweepSlider.addEventListener('input', function () {
        var s = parseFloat(this.value);
        setSweepDuration(s);
        if (dom.sweepLabel) dom.sweepLabel.textContent = s.toFixed(1) + 's';
        this.setAttribute('aria-valuenow', this.value);
      });
    }

    // View radio buttons — selecting a radio manually sets the view and disables auto for this session
    if (dom.viewRadios) {
      for (var r = 0; r < dom.viewRadios.length; r++) {
        dom.viewRadios[r].addEventListener('change', function () {
          if (this.checked) {
            setView(this.value);
          }
        });
      }
    }

    // Object toggles
    var toggleIds = {
      'audio-obj-earth': 'earth',
      'audio-obj-moon': 'moon',
      'audio-obj-orion': 'orion',
      'audio-obj-iss': 'iss',
      'audio-obj-gps': 'gps',
      'audio-obj-geo': 'geo'
    };
    var keys = Object.keys(toggleIds);
    for (var i = 0; i < keys.length; i++) {
      (function (elId, objKey) {
        var cb = document.getElementById(elId);
        if (cb) {
          cb.addEventListener('change', function () {
            setObjectToggle(objKey, this.checked);
          });
        }
      })(keys[i], toggleIds[keys[i]]);
    }

    // Beat checkbox
    var beatCb = document.getElementById('audio-beat');
    if (beatCb) {
      beatCb.addEventListener('change', function () {
        setBeatEnabled(this.checked);
      });
    }

    // Sound preview buttons in the help panel
    var previewBtns = panel.querySelectorAll('.btn--preview-sound');
    for (var pb = 0; pb < previewBtns.length; pb++) {
      previewBtns[pb].addEventListener('click', function () {
        var soundName = this.getAttribute('data-sound');
        playPreviewSound(soundName);
      });
    }
  }

  /** Play a single sound at center for the help panel preview buttons */
  function playPreviewSound(soundName) {
    // Ensure audio context exists
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    if (!masterGain) {
      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(volume, ctx.currentTime);
      masterGain.connect(ctx.destination);
    }

    switch (soundName) {
      case 'earth': pingEarth(0, -1, 1); break;
      case 'moon': pingMoon(0, -1, 1); break;
      case 'orion': pingOrion(0, 20000, false, -1); break;
      case 'iss': pingISS(0, -1); break;
      case 'sweep':
        // Play a short sweep noise burst at center
        var now = ctx.currentTime;
        var bufLen = Math.ceil(ctx.sampleRate * 0.5);
        var buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var si = 0; si < bufLen; si++) d[si] = Math.random() * 2 - 1;
        var src = ctx.createBufferSource();
        src.buffer = buf;
        var bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(800, now);
        bp.frequency.linearRampToValueAtTime(2000, now + 0.5);
        bp.Q.setValueAtTime(2, now);
        var gn = ctx.createGain();
        gn.gain.setValueAtTime(0.08, now);
        gn.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        src.connect(bp); bp.connect(gn); gn.connect(masterGain);
        src.start(now); src.stop(now + 0.55);
        src.onended = function () { src.disconnect(); bp.disconnect(); gn.disconnect(); };
        break;
    }
  }

  return {
    init: init,
    start: start,
    stop: stop,
    isRunning: function () { return running; },
    updateTelemetry: updateTelemetry,
    setVolume: setVolume,
    setSweepDuration: setSweepDuration,
    setView: setView,
    toggleAutoView: toggleAutoView,
    setObjectToggle: setObjectToggle,
    setBeatEnabled: setBeatEnabled,
    playTrajectoryPreview: playTrajectoryPreview
  };
})();
