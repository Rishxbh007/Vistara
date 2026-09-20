const express = require('express');
const fs = require('fs');
const adLibrary = require('../lib/adLibrary');
const config = require('../lib/config');

const router = express.Router();

/**
 * GET /api/ads/settings
 *
 * Tells the browser how the ad system is configured. The frontend asks this
 * first and hardcodes nothing: when `enabled` is false it never even builds
 * the ad overlay.
 */
router.get('/settings', (req, res) => {
  const available = config.ads.enabled ? adLibrary.list().length : 0;
  res.json({
    enabled: config.ads.enabled && available > 0,
    adsConfigured: config.ads.enabled,
    availableAds: available,
    skipSeconds: config.ads.skipSeconds
  });
});

/**
 * GET /api/ads/next?exclude=<id>
 *
 * Selects one advertisement from the ads/ folder. Returns { ad: null } when
 * ads are switched off or the folder holds no playable video — the client
 * then starts the main video immediately.
 */
router.get('/next', (req, res) => {
  try {
    if (!config.ads.enabled) {
      return res.json({ ad: null, reason: 'ads_disabled', skipSeconds: config.ads.skipSeconds });
    }

    const ad = adLibrary.pick(req.query.exclude);
    if (!ad) {
      return res.json({ ad: null, reason: 'no_ads_available', skipSeconds: config.ads.skipSeconds });
    }

    res.json({ ad: adLibrary.toPublic(ad), skipSeconds: config.ads.skipSeconds });
  } catch (err) {
    console.error('[Ads] next error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/ads — List every discovered ad. Handy for confirming that the
 * files you dropped into ads/ were picked up.
 */
router.get('/', (req, res) => {
  try {
    res.json({
      enabled: config.ads.enabled,
      skipSeconds: config.ads.skipSeconds,
      ads: adLibrary.list().map(adLibrary.toPublic)
    });
  } catch (err) {
    console.error('[Ads] list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/ads/:id/stream
 *
 * Streams the ad file with HTTP range support, so the browser can start
 * playing before the whole file has arrived and can seek within it.
 */
router.get('/:id/stream', (req, res) => {
  try {
    // Even with ads off, an already-open page may finish streaming its ad.
    const ad = adLibrary.get(req.params.id);
    if (!ad) {
      return res.status(404).json({ error: 'Advertisement not found' });
    }

    if (!fs.existsSync(ad.path)) {
      // File removed between discovery and playback.
      adLibrary.invalidate();
      return res.status(404).json({ error: 'Ad video file not found' });
    }

    const fileSize = fs.statSync(ad.path).size;
    const range = req.headers.range;

    const baseHeaders = {
      'Content-Type': ad.mimeType,
      'Accept-Ranges': 'bytes',
      // Ads change when the folder changes; don't let a proxy pin an old one.
      'Cache-Control': 'no-cache'
    };

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (!match) {
        return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
      }

      let start = match[1] === '' ? NaN : parseInt(match[1], 10);
      let end = match[2] === '' ? NaN : parseInt(match[2], 10);

      // Suffix range: "bytes=-500" means the last 500 bytes.
      if (Number.isNaN(start)) {
        if (Number.isNaN(end)) {
          return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
        }
        start = Math.max(0, fileSize - end);
        end = fileSize - 1;
      } else if (Number.isNaN(end)) {
        end = fileSize - 1;
      }

      end = Math.min(end, fileSize - 1);

      if (start >= fileSize || start > end) {
        return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
      }

      const stream = fs.createReadStream(ad.path, { start, end });
      stream.on('error', (err) => {
        console.error('[Ads] stream read error:', err.message);
        res.destroy();
      });

      res.writeHead(206, {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': end - start + 1
      });
      stream.pipe(res);
    } else {
      const stream = fs.createReadStream(ad.path);
      stream.on('error', (err) => {
        console.error('[Ads] stream read error:', err.message);
        res.destroy();
      });

      res.writeHead(200, { ...baseHeaders, 'Content-Length': fileSize });
      stream.pipe(res);
    }
  } catch (err) {
    console.error('[Ads] stream error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
