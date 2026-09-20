require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { initDB } = require('./db/schema');
const config = require('./lib/config');
const adLibrary = require('./lib/adLibrary');

const app = express();
const PORT = config.port;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure upload directories exist
['uploads/videos', 'uploads/thumbnails', 'ads'].forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

// Serve the frontend.
// HTML documents must never be cached by the browser — otherwise a returning
// visitor keeps the old page (and its old ?v= asset links) and never sees
// updates. Versioned CSS/JS (?v=N) can be cached hard because the URL changes
// whenever the file does.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Serve uploaded thumbnails. Videos and ads are NOT served statically —
// they go through the streaming routes so range requests are handled properly.
app.use('/uploads/thumbnails', express.static(path.join(__dirname, 'uploads', 'thumbnails')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/videos', require('./routes/videos'));
app.use('/api/ads', require('./routes/ads'));

// Anything under /api or /uploads that reached this point does not exist.
// Answer with JSON 404 instead of falling through to the HTML page below —
// otherwise a missing media file would be "successfully" served as index.html
// and the browser would report a broken video rather than a missing one.
app.use(['/api', '/uploads'], (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// HTML fallback for page routes (e.g. /watch.html, or / -> index.html)
app.get('*', (req, res) => {
  const safePath = path.normalize(req.path).replace(/^(\.\.[/\\])+/, '');
  const htmlPath = path.join(__dirname, 'public', safePath);

  // Pages must not be cached (see note on express.static above).
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (htmlPath.startsWith(path.join(__dirname, 'public')) &&
      htmlPath.endsWith('.html') &&
      fs.existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }

  // A request for a missing static asset (.css/.js/.png/...) must 404, not
  // silently return HTML — that turns a typo into a confusing MIME error.
  if (path.extname(safePath)) {
    return res.status(404).send('Not found');
  }

  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database then start server
initDB().then(() => {
  const adCount = adLibrary.list().length;

  app.listen(PORT, () => {
    console.log(`\n  🎬  Vistara is running at http://localhost:${PORT}`);
    console.log(`      Ads: ${config.ads.enabled ? 'ON' : 'OFF'}` +
                (config.ads.enabled
                  ? `  ·  ${adCount} ad${adCount === 1 ? '' : 's'} loaded from ads/  ·  skip after ${config.ads.skipSeconds}s`
                  : '  (set ADS_ENABLED=true in .env to enable)'));
    if (config.ads.enabled && adCount === 0) {
      console.log('      ⚠  No playable ad files found in ads/ — videos will start immediately.');
      console.log('         Add an .mp4 to the ads/ folder. See ads/README.md.');
    }
    console.log('');
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
