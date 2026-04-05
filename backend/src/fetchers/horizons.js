const logger = require('../utils/logger');
const config = require('../config');

/**
 * JPL Horizons API fetcher for Orion (Artemis II).
 * In a real scenario, this involves querying the JPL Horizons system with specific target IDs.
 */
class HorizonsFetcher {
  constructor() {
    this.URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';
    // Target IDs (example for Artemis II / Orion)
    this.TARGET_ID = '-1000'; // Placeholder for Orion
    this.CENTER_ID = '500@399'; // Earth center
  }

  async fetch() {
    try {
      // In a real implementation, we'd build the full query string:
      // ?format=json&COMMAND='${this.TARGET_ID}'&CENTER='${this.CENTER_ID}'&START_TIME='now'&STOP_TIME='now+1m'&STEP_SIZE='1m'&QUANTITIES='1,19,20'
      // For this implementation, we will mock the response structure but hitting the real API if needed.
      // Since JPL Horizons requires precise parameters, we'll return a structured mock if the API call fails or for this exercise.
      
      const params = new URLSearchParams({
        format: 'json',
        COMMAND: "'-1000'",
        CENTER: "'500@399'",
        MAKE_EPHEM: 'YES',
        TABLE_TYPE: 'VECTORS',
        START_TIME: 'now',
        STOP_TIME: 'now + 1 hour',
        STEP_SIZE: '1 hour',
        OUT_UNITS: 'KM-S',
        REF_PLANE: 'ECLIPTIC',
        VEC_TABLE: '3'
      });

      const resp = await fetch(`${this.URL}?${params.toString()}`);

      if (!resp.ok) {
        logger.warn('JPL Horizons API returned non-OK status');
        return null;
      }

      const data = await resp.json();
      // Parse data.result and extract distance/speed
      // For this demo, we'll return a structured object as defined in the plan
      return this._parseResult(data);
    } catch (err) {
      logger.error({ err }, 'JPL Horizons fetch failed');
      return null;
    }
  }

  _parseResult(data) {
    if (!data || !data.result) return null;
    
    const result = data.result;
    
    // JPL Horizons Vector Table 3 format (X, Y, Z, VX, VY, VZ, LT, RANGE, RANGE_RATE)
    // Example: 2026-Apr-05 09:37:40  -1.17112E+05 -3.11209E+05 -2.88164E+04 -9.11024E-01 -8.05471E-01 -7.12515E-01 1.04506E+00 3.33762E+05 8.13732E-01
    
    // Find the data block between $$SOE and $$EOE
    const soeMatch = result.match(/\$\$SOE([\s\S]+?)\$\$EOE/);
    if (!soeMatch) return null;
    
    const lines = soeMatch[1].trim().split('\n');
    if (lines.length === 0) return null;
    
    // Use the first line (current timestamp requested)
    const line = lines[0].trim();
    // Split by multiple spaces
    const parts = line.split(/\s+/);
    
    // Vector Table 3 columns:
    // 0: Date (2026-Apr-05)
    // 1: Time (09:37:40)
    // 2: X, 3: Y, 4: Z
    // 5: VX, 6: VY, 7: VZ
    // 8: LT
    // 9: RANGE (Distance Earth)
    // 10: RANGE_RATE (Speed relative to Earth)
    
    if (parts.length < 11) return null;
    
    const distEarthKm = parseFloat(parts[9]);
    const rangeRateKmS = parseFloat(parts[10]);
    
    // Calculate Speed from velocity vectors (VX, VY, VZ) — Absolute Magnitude
    const vx = parseFloat(parts[5]);
    const vy = parseFloat(parts[6]);
    const vz = parseFloat(parts[7]);
    const speedKmS = Math.sqrt(vx*vx + vy*vy + vz*vz);
    
    return {
      distEarthKm: distEarthKm,
      speedKmH: speedKmS * 3600,
      rangeRateKms: rangeRateKmS,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new HorizonsFetcher();
