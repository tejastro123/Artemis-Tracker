const logger = require('../utils/logger');

class DSNXmlFetcher {
  constructor() {
    this.URL = 'https://eyes.nasa.gov/dsn/data/dsn.xml';
  }

  async fetch() {
    try {
      const resp = await fetch(this.URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'application/xml, text/xml, */*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      if (!resp.ok) return null;
      return await resp.text();
    } catch (err) {
      logger.error({ err }, 'DSN XML fetch failed');
      return null;
    }
  }

  /**
   * High-Fidelity DSN XML Parser.
   * Extracts stations, dishes, signals, and targets for Orion.
   */
  parse(xml) {
    const dishes = [];
    try {
      const ARTEMIS_TARGETS = ['EM-1', 'EM1', 'EM2', 'Artemis II', 'ARTEMIS', 'ORION', 'AS2'];
      
      // 1. Split by station to track the context
      const stationBlocks = xml.split('<station ');
      stationBlocks.shift(); // Remove content before first <station>

      for (const block of stationBlocks) {
        // Extract station name
        const stationMatch = block.match(/friendlyName="([^"]+)"/);
        const stationName = stationMatch ? stationMatch[1] : 'Unknown Station';

        // Extract dishes within this station
        const dishMatches = block.matchAll(/<dish name="([^"]+)" azimuthAngle="([^"]*)" elevationAngle="([^"]*)" windSpeed="([^"]*)"[^>]*>([\s\S]*?)<\/dish>/g);
        
        for (const dm of dishMatches) {
          const dishName = dm[1];
          const az = parseFloat(dm[2]) || 0;
          const el = parseFloat(dm[3]) || 0;
          const content = dm[5];

          // Check if this dish is tracking Orion
          const targetMatches = content.matchAll(/<target name="([^"]+)"[^>]*uplegRange="([^"]*)" downlegRange="([^"]*)" rtlt="([^"]*)"/g);
          
          for (const tm of targetMatches) {
            const targetName = tm[1].toUpperCase();
            if (ARTEMIS_TARGETS.includes(targetName)) {
              // Found Orion! Extract signals
              const signalMatch = content.match(/<downSignal active="true" dataRate="([^"]*)" band="([^"]*)"/);
              const dataRate = signalMatch ? parseFloat(signalMatch[1]) : 0;
              const band = signalMatch ? signalMatch[2] : 'S';
              const range = parseFloat(tm[3]) || 0;
              const rtlt = parseFloat(tm[4]) || 0;

              dishes.push({
                name: dishName,
                station: stationName,
                az,
                el,
                dataRate,
                band,
                range,
                rtlt,
                target: tm[1]
              });
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'DSN XML parsing failed');
    }
    return dishes;
  }
}

module.exports = new DSNXmlFetcher();
