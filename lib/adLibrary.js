/**
 * Ad Library — filesystem-backed advertisement discovery.
 *
 * Drop video files into the `ads/` folder at the project root and they become
 * advertisements automatically. No database rows, no code changes, no restart.
 *
 * Optional metadata (nice titles, advertiser names, click-through links and
 * selection weights) can be supplied in `ads/ads.config.json`. Anything not
 * described there still works — the library falls back to sensible defaults
 * derived from the filename.
 *
 * See ads/README.md for the full documentation.
 */

const fs = require('fs');
const path = require('path');

const ADS_DIR = path.join(__dirname, '..', 'ads');
const CONFIG_FILE = path.join(ADS_DIR, 'ads.config.json');

/** Video containers a browser <video> element can realistically play. */
const SUPPORTED_EXTENSIONS = ['.mp4', '.m4v', '.webm', '.ogv', '.ogg'];

const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.ogg': 'video/ogg'
};

/* ------------------------------------------------------------------ *
 * Internal cache
 * ------------------------------------------------------------------ */

let cache = { ads: [], signature: null, checkedAt: 0 };

/** Re-scan at most this often (ms). Keeps per-request stat() cost negligible. */
const RESCAN_INTERVAL_MS = 2000;

/**
 * Turn a filename into a stable, URL-safe id.
 *   "Vistara Premium (30s).mp4"  ->  "vistara-premium-30s"
 */
function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/\.[^.]+$/, '')          // strip extension
    .replace(/[^a-z0-9]+/g, '-')      // non-alphanumerics -> hyphen
    .replace(/^-+|-+$/g, '')          // trim hyphens
    .slice(0, 80) || 'ad';
}

/**
 * Turn a filename into a human-readable fallback title.
 *   "cloudnine-hosting.mp4"  ->  "Cloudnine Hosting"
 */
function titleize(name) {
  const base = String(name).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  return base
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Advertisement';
}

/**
 * Read ads/ads.config.json if it exists. Never throws — a malformed config
 * degrades to "no metadata" rather than taking the whole ad system down.
 */
function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return { ads: {} };
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ads: parsed && typeof parsed.ads === 'object' && parsed.ads ? parsed.ads : {} };
  } catch (err) {
    console.warn(`[AdLibrary] Could not parse ads/ads.config.json (${err.message}). ` +
                 'Using filename-derived defaults instead.');
    return { ads: {} };
  }
}

/**
 * Build a signature of the ads folder so we can detect additions, removals,
 * replacements and config edits without a restart.
 */
function folderSignature() {
  if (!fs.existsSync(ADS_DIR)) return 'missing';
  let parts = [];
  try {
    for (const file of fs.readdirSync(ADS_DIR).sort()) {
      const full = path.join(ADS_DIR, file);
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (!st.isFile()) continue;
      parts.push(`${file}:${st.size}:${st.mtimeMs}`);
    }
  } catch {
    return 'error';
  }
  return parts.join('|');
}

/**
 * Scan the ads folder and merge in optional config metadata.
 */
function scan() {
  if (!fs.existsSync(ADS_DIR)) {
    try {
      fs.mkdirSync(ADS_DIR, { recursive: true });
    } catch { /* ignore */ }
    return [];
  }

  const config = readConfig();
  const seenIds = new Set();
  const ads = [];

  let files;
  try {
    files = fs.readdirSync(ADS_DIR).sort();
  } catch (err) {
    console.error('[AdLibrary] Could not read ads folder:', err.message);
    return [];
  }

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) continue;     // skips README.md, ads.config.json, etc.
    if (file.startsWith('.')) continue;                    // skip hidden/partial files

    const full = path.join(ADS_DIR, file);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size === 0) continue;

    // Per-file metadata may be keyed by exact filename or by slug.
    const slug = slugify(file);
    const meta = config.ads[file] || config.ads[slug] || {};

    if (meta.enabled === false) continue;                  // explicitly disabled in config

    // Guarantee unique ids even if two filenames slugify identically.
    let id = slug;
    let n = 2;
    while (seenIds.has(id)) id = `${slug}-${n++}`;
    seenIds.add(id);

    const weight = Number(meta.weight);

    ads.push({
      id,
      file,
      title: typeof meta.title === 'string' && meta.title.trim() ? meta.title.trim() : titleize(file),
      advertiser: typeof meta.advertiser === 'string' ? meta.advertiser.trim() : '',
      clickUrl: typeof meta.clickUrl === 'string' ? meta.clickUrl.trim() : '',
      weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
      size: stat.size,
      mimeType: MIME_TYPES[ext] || 'video/mp4',
      path: full
    });
  }

  return ads;
}

/**
 * Return all available ads, re-scanning the folder when it has changed.
 */
function list() {
  const now = Date.now();
  if (now - cache.checkedAt < RESCAN_INTERVAL_MS) return cache.ads;

  const signature = folderSignature();
  cache.checkedAt = now;

  if (signature !== cache.signature) {
    cache = { ads: scan(), signature, checkedAt: now };
    console.log(`[AdLibrary] ${cache.ads.length} ad(s) available: ` +
                (cache.ads.map(a => a.file).join(', ') || '(none)'));
  }

  return cache.ads;
}

/**
 * Look an ad up by its id. Returns null when unknown.
 * Ids always come from our own scan, so no user-supplied path ever reaches
 * the filesystem.
 */
function get(id) {
  if (!id) return null;
  return list().find(ad => ad.id === String(id)) || null;
}

/**
 * Select one ad using weighted random selection.
 *
 * `excludeId` lets the caller avoid serving the same ad twice in a row when
 * more than one ad is available.
 */
function pick(excludeId) {
  const all = list();
  if (all.length === 0) return null;
  if (all.length === 1) return all[0];

  let pool = all;
  if (excludeId) {
    const filtered = all.filter(ad => ad.id !== String(excludeId));
    if (filtered.length > 0) pool = filtered;
  }

  const totalWeight = pool.reduce((sum, ad) => sum + ad.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const ad of pool) {
    roll -= ad.weight;
    if (roll <= 0) return ad;
  }
  return pool[pool.length - 1];
}

/**
 * Public shape of an ad — what the browser is allowed to see.
 * Deliberately omits the absolute filesystem path.
 */
function toPublic(ad) {
  if (!ad) return null;
  return {
    id: ad.id,
    title: ad.title,
    advertiser: ad.advertiser,
    clickUrl: ad.clickUrl,
    mimeType: ad.mimeType,
    streamUrl: `/api/ads/${encodeURIComponent(ad.id)}/stream`
  };
}

/** Force the next list() call to re-scan. Used by tests. */
function invalidate() {
  cache = { ads: [], signature: null, checkedAt: 0 };
}

module.exports = {
  ADS_DIR,
  SUPPORTED_EXTENSIONS,
  list,
  get,
  pick,
  toPublic,
  invalidate
};
