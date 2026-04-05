const config = require('../config');

/**
 * Calculates Mission Elapsed Time (MET) in fractional hours.
 */
function getMETHours() {
  const now = Date.now();
  const launch = config.CONSTANTS.LAUNCH_EPOCH_UTC.getTime();
  return (now - launch) / 3600000;
}

/**
 * Formats MET as a string (e.g., "MET 02d 14h 33m 12s").
 */
function formatMET(metHours) {
  const isPreLaunch = metHours < 0;
  const totalSec = Math.abs(Math.floor(metHours * 3600));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');

  const prefix = isPreLaunch ? 'L- ' : 'MET ';
  let parts = prefix;
  if (d > 0) parts += d + 'd ';
  parts += `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  return parts;
}

module.exports = {
  getMETHours,
  formatMET,
};
