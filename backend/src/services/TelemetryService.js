const logger = require('../utils/logger');
const trajMath = require('../utils/trajectoryMath');
const metCalc = require('../utils/metCalculator');
const communityApi = require('../fetchers/communityApi');
const horizons = require('../fetchers/horizons');

class TelemetryService {
  constructor({ cache, db, telemetryQueries }) {
    this.cache = cache;
    this.db = db;
    this.telemetryQueries = telemetryQueries;
    this.CACHE_KEY = 'telemetry:current';
    this.CACHE_TTL = 30; // seconds
    this.HISTORY_CACHE_KEY = 'telemetry:history:2h';
  }

  async getCurrent() {
    // 1. Try Redis cache first (< 1ms)
    try {
      const cached = await this.cache.get(this.CACHE_KEY);
      if (cached) {
        return {
          ...cached,
          _cacheSource: 'cache',
          _source: cached._source || 'cache'
        };
      }
    } catch (err) {
      logger.warn({ err }, 'Cache get failed, falling through to fetch');
    }

    // 2. Fetch fresh data
    return await this._fetchFresh();
  }

  async _fetchFresh() {
    const metH = metCalc.getMETHours();

    // Fallback chain: community orbit → Horizons → interpolated mock
    
    // 1. Try community consolidated API
    try {
      const all = await communityApi.getAll();

      const telemetry = this._normalizeIfLiveCommunityPayload(all, metH);
      if (telemetry) {
        telemetry.raw = all;
        await this._saveSnapshot(telemetry);
        return { ...telemetry, _source: 'community-consolidated' };
      }
    } catch (err) {
      logger.warn({ err }, 'Consolidated AROW API fetch failed');
    }

    // 1b. If /api/all is unavailable or incomplete, combine the direct
    // community endpoints so we can still surface live orbital data.
    try {
      const [orbit, systems] = await Promise.all([
        communityApi.getOrbit(),
        communityApi.getArow()
      ]);

      const directPayload = {
        telemetry: orbit,
        arow: systems
      };

      const telemetry = this._normalizeIfLiveCommunityPayload(directPayload, metH);
      if (telemetry) {
        telemetry.raw = directPayload;
        await this._saveSnapshot(telemetry);
        return { ...telemetry, _source: 'community-consolidated' };
      }
    } catch (err) {
      logger.warn({ err }, 'Direct community telemetry fetch failed');
    }

    // 2. Try JPL Horizons
    try {
      const data = await horizons.fetch();
      if (data?.distEarthKm != null) {
        const telemetry = { ...data, metHours: metH };
        await this._saveSnapshot(telemetry);
        return { ...telemetry, _source: 'horizons' };
      }
    } catch (err) {
      logger.warn({ err }, 'JPL Horizons failed');
    }

    // 3. Fallback: Interpolated mock
    const mock = trajMath.interpolateTelemetry(metH);
    const telemetry = {
      ...mock,
      gForce: trajMath.estimateGForce(metH),
      phase: trajMath.detectPhase(metH),
      _source: 'mock'
    };
    
    // Do not save mock to DB snapshots to keep history clean,
    // but cache it for fast delivery.
    await this.cache.set(this.CACHE_KEY, telemetry, this.CACHE_TTL);
    return telemetry;
  }

  _normalizeIfLiveCommunityPayload(all, metH) {
    if (!all) return null;

    const orbit = all?.telemetry || all?.orbit || null;
    const systems = all?.arow || null;

    if (!this._hasCommunityOrbit(orbit) && !this._hasArowSystems(systems)) {
      return null;
    }

    return this._normalizeCommunityResponse(all, metH);
  }

  _hasCommunityOrbit(orbit) {
    if (!orbit) return false;

    return [
      orbit.speedKmH,
      orbit.speedKmh,
      orbit.earthDistKm,
      orbit.distEarthKm,
      orbit.moonDistKm,
      orbit.distMoonKm,
      orbit.altitudeKm,
      orbit.metMs
    ].some(value => Number.isFinite(value));
  }

  _hasArowSystems(systems) {
    if (!systems) return false;

    return Boolean(
      systems.eulerDeg ||
      systems.quaternion ||
      systems.sawAngles ||
      systems.antennaGimbal ||
      systems.rollRate != null ||
      systems.pitchRate != null ||
      systems.yawRate != null ||
      systems.spacecraftMode != null
    );
  }

  _normalizeCommunityResponse(all, metH) {
    const orbit = all?.telemetry || all?.orbit || null;
    const systems = all?.arow || null;
    const stateVector = all?.stateVector || null;
    const moonPos = all?.moonPosition || null;

    // If the community API provides a high-precision MET, use it
    const liveMetH = (orbit?.metMs != null) ? (orbit.metMs / 3600000) : metH;

    const data = {
      // Orbital (from /api/all or defaults)
      distEarthKm: orbit?.earthDistKm || orbit?.distEarthKm || 0,
      distMoonKm:  orbit?.moonDistKm  || orbit?.distMoonKm  || 0,
      speedKmh:    orbit?.speedKmH    || orbit?.speedKmh    || 0,
      altitudeKm:  orbit?.altitudeKm  || 0,
      periapsisKm: orbit?.periapsisKm || 0,
      apoapsisKm:  orbit?.apoapsisKm  || 0,
      gForce:      orbit?.gForce      || systems?.gForce    || trajMath.estimateGForce(liveMetH),
      
      // Meta
      metHours:    liveMetH,
      phase:       trajMath.detectPhase(liveMetH),
      timestamp:   orbit?.timestamp || systems?.timestamp || new Date().toISOString(),
      _source:     'community-consolidated',
      
      // Systems telemetry (from /arow)
      attitude: systems?.eulerDeg ? {
        roll: systems.eulerDeg.roll,
        pitch: systems.eulerDeg.pitch,
        yaw: systems.eulerDeg.yaw
      } : (systems?.quaternion ? trajMath.quaternionToEuler(systems.quaternion) : null),
      
      angularRates: (systems?.rollRate != null || systems?.rollRateFallback != null) ? {
        roll: systems.rollRate ?? systems.rollRateFallback,
        pitch: systems.pitchRate ?? systems.pitchRateFallback,
        yaw: systems.yawRate ?? systems.yawRateFallback
      } : null,

      solarArrays: systems?.sawAngles ? {
        array1: systems.sawAngles.saw1,
        array2: systems.sawAngles.saw2,
        array3: systems.sawAngles.saw3,
        array4: systems.sawAngles.saw4
      } : null,

      antennaGimbals: systems?.antennaGimbal ? {
        ant1Az: systems.antennaGimbal.az1,
        ant1El: systems.antennaGimbal.el1,
        ant2Az: systems.antennaGimbal.az2,
        ant2El: systems.antennaGimbal.el2
      } : null,

      scMode: (typeof systems?.spacecraftMode === 'string') 
        ? parseInt(systems.spacecraftMode, 16) 
        : (systems?.spacecraftMode || orbit?.scMode || null)
    };

    // ── High-Fidelity Derived Math ──────────────────────────────────────────
    // If we have state vector, compute Range Rate and Sub-Spacecraft Point
    if (stateVector?.position) {
      const pos = stateVector.position;
      const vel = stateVector.velocity;

      data.rangeRateKms = trajMath.computeRangeRate(pos, vel);
      data.solarPhaseAngleDeg = trajMath.computeSolarPhaseAngle(pos, data.timestamp);
      
      const ssp = trajMath.computeSubSpacecraftPoint(pos);
      data.latDeg = ssp?.latDeg || null;
      data.lonDeg = ssp?.lonDeg || null;
      
      // Inject for Earth View component
      data.orionPos = pos;
    } else {
      data.rangeRateKms = null;
      data.solarPhaseAngleDeg = null;
    }

    // Capture Moon position for apparent size
    if (moonPos) {
      data.moonPos = moonPos;
    }

    return data;
  }

  async _saveSnapshot(telemetry) {
    try {
      await this.cache.set(this.CACHE_KEY, telemetry, this.CACHE_TTL);
      
      // Persist to DB if it's from a real source
      if (telemetry._source !== 'mock') {
        await this.telemetryQueries.insertSnapshot(telemetry);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to save telemetry snapshot');
    }
  }

  async getHistory(hours = 2) {
    try {
      const cached = await this.cache.get(this.HISTORY_CACHE_KEY);
      if (cached) return cached;
      
      // Fetch from DB
      const history = await this.telemetryQueries.getHistory(hours);
      
      // Cache history for 5 minutes
      if (history.length > 0) {
        await this.cache.set(this.HISTORY_CACHE_KEY, history, 300);
      }
      
      return history;
    } catch (err) {
      logger.error({ err }, 'Failed to get telemetry history');
      return [];
    }
  }
}

module.exports = TelemetryService;
