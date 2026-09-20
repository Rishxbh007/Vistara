/**
 * Central application configuration.
 *
 * Everything here is driven by environment variables (see .env), so you can
 * change behaviour without touching any code. Restart the server after editing
 * .env for changes to take effect.
 */

/**
 * Parse a boolean-ish environment variable.
 * Accepts: true/false, 1/0, yes/no, on/off (case-insensitive).
 */
function envBool(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const v = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on', 'enabled'].includes(v)) return true;
  if (['false', '0', 'no', 'off', 'disabled'].includes(v)) return false;
  return fallback;
}

/**
 * Parse an integer environment variable, clamped to [min, max].
 */
function envInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  if (typeof min === 'number' && n < min) return min;
  if (typeof max === 'number' && n > max) return max;
  return n;
}

const config = {
  port: envInt(process.env.PORT, 3000, 1, 65535),

  jwtSecret: process.env.JWT_SECRET || 'vistara_jwt_secret_2024_btech',

  ads: {
    /**
     * Master ON/OFF switch for the whole advertisement system.
     * ADS_ENABLED=false  -> no ad, no countdown, no Skip Ad button.
     *                       The main video starts immediately.
     * ADS_ENABLED=true   -> an ad is selected from ads/ and played first.
     */
    enabled: envBool(process.env.ADS_ENABLED, true),

    /**
     * How many seconds the viewer must watch before "Skip Ad" becomes active.
     * Set to 0 to make Skip Ad available immediately.
     */
    skipSeconds: envInt(process.env.AD_SKIP_SECONDS, 5, 0, 60)
  }
};

module.exports = config;
