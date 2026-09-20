const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, runQuery } = require('../db/schema');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Ensure upload directories exist
const videosDir = path.join(__dirname, '..', 'uploads', 'videos');
const thumbsDir = path.join(__dirname, '..', 'uploads', 'thumbnails');
[videosDir, thumbsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'video') cb(null, videosDir);
    else if (file.fieldname === 'thumbnail') cb(null, thumbsDir);
    else cb(new Error('Unexpected field'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uuidv4() + ext);
  }
});

const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/x-matroska'];
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'video') {
    if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only MP4, WebM, and MKV video files are allowed'));
  } else if (file.fieldname === 'thumbnail') {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and WebP image files are allowed'));
  } else {
    cb(new Error('Unexpected field'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max
});

const uploadFields = upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]);

/**
 * POST /api/videos — Upload a video
 */
router.post('/', requireAuth, (req, res) => {
  uploadFields(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 500MB.' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const { title, description, category } = req.body;

      if (!title || !title.trim()) {
        if (req.files?.video) fs.unlinkSync(req.files.video[0].path);
        if (req.files?.thumbnail) fs.unlinkSync(req.files.thumbnail[0].path);
        return res.status(400).json({ error: 'Video title is required' });
      }

      if (!req.files?.video || req.files.video.length === 0) {
        if (req.files?.thumbnail) fs.unlinkSync(req.files.thumbnail[0].path);
        return res.status(400).json({ error: 'Video file is required' });
      }

      const videoFile = req.files.video[0];
      const thumbnailFile = req.files?.thumbnail?.[0];

      const result = runQuery(
        `INSERT INTO videos (uploader_id, title, description, category, video_path, thumbnail_path)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          title.trim(),
          (description || '').trim(),
          (category || 'Uncategorized').trim(),
          videoFile.filename,
          thumbnailFile ? thumbnailFile.filename : ''
        ]
      );

      const video = queryOne('SELECT * FROM videos WHERE id = ?', [result.lastInsertRowid]);

      res.status(201).json({ message: 'Video uploaded successfully', video });
    } catch (err) {
      console.error('[Videos] Upload error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

/**
 * GET /api/videos — List videos with optional search & category filter
 */
router.get('/', (req, res) => {
  try {
    const { search, category } = req.query;
    let query = `
      SELECT v.*, u.name as uploader_name 
      FROM videos v 
      JOIN users u ON v.uploader_id = u.id
    `;
    const conditions = [];
    const params = [];

    if (search && search.trim()) {
      conditions.push('(v.title LIKE ? OR v.description LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    if (category && category.trim() && category !== 'All') {
      conditions.push('v.category = ?');
      params.push(category.trim());
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY v.created_at DESC';

    const videos = queryAll(query, params);
    res.json({ videos });
  } catch (err) {
    console.error('[Videos] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/videos/categories — Get distinct categories
 */
router.get('/categories', (req, res) => {
  try {
    const categories = queryAll('SELECT DISTINCT category FROM videos ORDER BY category');
    res.json({ categories: categories.map(c => c.category) });
  } catch (err) {
    console.error('[Videos] Categories error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/videos/user/:userId — Get videos by a specific user
 */
router.get('/user/:userId', (req, res) => {
  try {
    const videos = queryAll(
      `SELECT v.*, u.name as uploader_name 
       FROM videos v 
       JOIN users u ON v.uploader_id = u.id
       WHERE v.uploader_id = ?
       ORDER BY v.created_at DESC`,
      [parseInt(req.params.userId)]
    );
    res.json({ videos });
  } catch (err) {
    console.error('[Videos] User videos error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/videos/:id — Get single video detail + increment views
 */
router.get('/:id', (req, res) => {
  try {
    const video = queryOne(
      `SELECT v.*, u.name as uploader_name 
       FROM videos v 
       JOIN users u ON v.uploader_id = u.id
       WHERE v.id = ?`,
      [parseInt(req.params.id)]
    );

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Increment views
    runQuery('UPDATE videos SET views = views + 1 WHERE id = ?', [parseInt(req.params.id)]);
    video.views += 1;

    res.json({ video });
  } catch (err) {
    console.error('[Videos] Detail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/videos/:id/stream — Stream video with HTTP Range Requests
 */
router.get('/:id/stream', (req, res) => {
  try {
    const video = queryOne('SELECT video_path FROM videos WHERE id = ?', [parseInt(req.params.id)]);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const videoPath = path.join(videosDir, video.video_path);
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: 'Video file not found on server' });
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Determine MIME type
    const ext = path.extname(video.video_path).toLowerCase();
    const mimeTypes = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska'
    };
    const contentType = mimeTypes[ext] || 'video/mp4';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
        return;
      }

      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(videoPath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType
      });

      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes'
      });

      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (err) {
    console.error('[Videos] Stream error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/videos/:id — Delete own video
 */
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const video = queryOne('SELECT * FROM videos WHERE id = ?', [parseInt(req.params.id)]);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    if (video.uploader_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own videos' });
    }

    // Delete files from disk
    const videoPath = path.join(videosDir, video.video_path);
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);

    if (video.thumbnail_path) {
      const thumbPath = path.join(thumbsDir, video.thumbnail_path);
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
    }

    // Delete from database
    runQuery('DELETE FROM videos WHERE id = ?', [parseInt(req.params.id)]);

    res.json({ message: 'Video deleted successfully' });
  } catch (err) {
    console.error('[Videos] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
