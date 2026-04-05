const logger = require('../utils/logger');
const donki = require('../fetchers/donki');
const metCalc = require('../utils/metCalculator');

class WeatherService {
  constructor({ cache, weatherQueries }) {
    this.cache = cache;
    this.weatherQueries = weatherQueries;
    this.donki = donki;
    this.CACHE_KEY = 'weather:current';
    this.CACHE_TTL = 900; // 15 minutes — matches DONKI update cadence
  }

  async getCurrent() {
    try {
      const cached = await this.cache.get(this.CACHE_KEY);
      if (cached) return cached;

      // Cache miss: Try DB fallback
      if (this.weatherQueries) {
        const latest = await this.weatherQueries.getLatest();
        if (latest) {
          // Re-cache for future requests
          await this.cache.set(this.CACHE_KEY, latest, this.CACHE_TTL);
          return { ...latest, _source: 'db-fallback' };
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Weather cache read or DB fallback failed');
    }

    return await this._fetchAndCache();
  }

  async _fetchAndCache() {
    // High-Fidelity: Fetch mission-synchronized solar data from /api/all
    // DONKI is still used for the broader event historical list
    const metH = metCalc.getMETHours();
    const [all, flares, cmes, storms, sep] = await Promise.allSettled([
      fetch(`https://artemis.cdnspace.ca/api/all`).then(r => r.json()),
      this.donki.getSolarFlares(),
      this.donki.getCMEs(),
      this.donki.getGeomagneticStorms(),
      this.donki.getSEPEvents(),
    ]);

    const liveSolar = (all.status === 'fulfilled' && all.value.solar) ? all.value.solar : null;

    const data = {
      live: liveSolar,
      flares: flares.status === 'fulfilled' ? flares.value : [],
      cme: cmes.status === 'fulfilled' ? cmes.value : [],
      storms: storms.status === 'fulfilled' ? storms.value : [],
      sep: sep.status === 'fulfilled' ? sep.value : [],
      queriedAt: new Date().toISOString(),
    };

    data.summary = this._buildSummary(data.flares, data.cme, data.storms, data.sep, liveSolar, metH);
    
    // Archival of raw mission data
    data.raw = {
      flares: flares.status === 'fulfilled' ? flares.value : null,
      cme: cmes.status === 'fulfilled' ? cmes.value : null,
      storms: storms.status === 'fulfilled' ? storms.value : null,
      sep: sep.status === 'fulfilled' ? sep.value : null
    };

    try {
      await this.cache.set(this.CACHE_KEY, data, this.CACHE_TTL);
      if (this.weatherQueries) {
        await this.weatherQueries.insertSnapshot(data);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to persist weather data');
    }

    return data;
  }

  _buildSummary(flares = [], cmes = [], storms = [], sep = [], liveSolar = null, metH = 0) {
    const highestFlare = liveSolar?.xrayClass || this._getHighestFlare(flares);
    const liveKp = liveSolar?.kpIndex != null ? liveSolar.kpIndex : 0;
    const highestKp = Math.max(...storms.flatMap(s =>
      (s.allKpIndex || []).map(k => parseFloat(k.kpIndex) || 0)
    ), liveKp);
 
    let status = 'nominal';
    if (sep.length > 0 || (highestFlare && highestFlare.charAt(0) === 'X') || liveSolar?.radiationRisk === 'high') {
      status = 'severe';
    } else if (highestKp >= 5 || (highestFlare && highestFlare.charAt(0) === 'M') || liveSolar?.radiationRisk === 'medium') {
      status = 'elevated';
    }

    // High-Fidelity: Mission-specific radiation dose monitor
    const radiationDose = this._computeRadiationDose(metH, liveSolar);

    return {
      status,
      highestFlare,
      highestKp,
      liveKp,
      xrayFlux: liveSolar?.xrayFlux || null,
      radiationRisk: liveSolar?.radiationRisk || 'low',
      protonFlux: {
        '1MeV': liveSolar?.protonFlux1MeV || 0,
        '10MeV': liveSolar?.protonFlux10MeV || 0,
        '100MeV': liveSolar?.protonFlux100MeV || 0
      },
      radiationDose,
      flareCount: flares.length,
      cmeCount: cmes.length,
      stormCount: storms.length,
      sepCount: sep.length,
      latestFlare: flares[0] || null,
      earthDirectedCMEs: cmes.filter(c =>
        c.cmeAnalyses?.some(a => a.type === 'S' || a.type === 'C')
      ),
    };
  }

  _computeRadiationDose(metH, liveSolar) {
    // 1. GCR (Galactic Cosmic Rays) - Relatively constant
    // 2.39 mSv total estimated for mission
    const totalMissionH = 215; // ~9 days
    const gcrTotal = 2.39;
    const gcrProgress = Math.min(1, metH / totalMissionH);
    const gcrCurrent = metH > 0 ? (gcrTotal * gcrProgress) : 0;

    // 2. Van Allen Belt Transit - One-time exposures
    // Inbound/Outbound spikes totaling ~5 mSv
    let beltDose = 0;
    if (metH > 2 && metH < 6) {
      // Outbound transit
      beltDose = 2.5 * ((metH - 2) / 4);
    } else if (metH >= 6) {
      beltDose = 2.5; // Outbound complete
    }
    // Note: Artemis II doesn't re-enter belts until return phase (MET 210+)
    if (metH > 210 && metH < 215) {
      beltDose += 2.5 * ((metH - 210) / 5);
    } else if (metH >= 215) {
      beltDose = 5.0; // Both transits complete
    }

    // 3. Solar Events (SEP) - Dynamic based on risk
    const solarDose = liveSolar?.radiationRisk === 'high' ? (metH / 24) * 0.5 : 0;

    const missionTotal = gcrCurrent + beltDose + solarDose;
    const dailyRate = 0.7 + (liveSolar?.kpIndex || 0) * 0.05; // Base 0.7 mSv, plus storm factor

    return {
      dailyRate: dailyRate.toFixed(2),
      missionTotal: missionTotal.toFixed(2),
      gcr: gcrCurrent.toFixed(2),
      beltTransit: beltDose.toFixed(2),
      solarEvents: solarDose.toFixed(2),
      annualLimitPct: ((missionTotal / 500) * 100).toFixed(2)
    };
  }

  _getHighestFlare(flares) {
    const flareClasses = ['X', 'M', 'C', 'B', 'A'];
    let highest = null;
    let highestIndex = 6;

    for (const f of flares) {
      if (!f.classType) continue;
      const cls = f.classType.charAt(0).toUpperCase();
      const idx = flareClasses.indexOf(cls);
      if (idx !== -1 && idx < highestIndex) {
        highestIndex = idx;
        highest = f.classType;
      } else if (idx !== -1 && idx === highestIndex) {
        const val = parseFloat(f.classType.substring(1));
        const highestVal = parseFloat((highest || 'A0').substring(1));
        if (val > highestVal) {
          highest = f.classType;
        }
      }
    }
    return highest;
  }
}

module.exports = WeatherService;
