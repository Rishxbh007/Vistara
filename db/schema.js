const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'streaming.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

/**
 * Initialize the database — must be called before any queries.
 * Returns a promise that resolves with the db instance.
 *
 * Note: advertisements are NOT stored in the database. They are discovered
 * from the `ads/` folder on disk by lib/adLibrary.js, so that adding an ad is
 * just a matter of copying a file in. See ads/README.md.
 */
async function initDB() {
  const SQL = await initSqlJs();

  // Load existing database file or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uploader_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT 'Uncategorized',
      video_path TEXT NOT NULL,
      thumbnail_path TEXT DEFAULT '',
      views INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create indexes (ignore if they already exist)
  try { db.run('CREATE INDEX idx_videos_uploader ON videos(uploader_id)'); } catch (e) {}
  try { db.run('CREATE INDEX idx_videos_category ON videos(category)'); } catch (e) {}

  // --- Migration: drop the legacy ad tables -------------------------------
  // Older versions stored a single hardcoded advertisement row and a
  // one-time "dismiss ad" token per user. Ads now come from the ads/ folder
  // and the one-time dismissal has been removed, so these tables are dead
  // weight. Dropping them keeps existing databases consistent with the code.
  try { db.run('DROP TABLE IF EXISTS ad_dismissals'); } catch (e) {}
  try { db.run('DROP TABLE IF EXISTS advertisements'); } catch (e) {}

  saveDB();
  console.log('[DB] Database initialized successfully');
  return db;
}

/**
 * Save database to disk — called after write operations
 */
function saveDB() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/**
 * Helper: run a query that returns rows (SELECT)
 * Returns an array of objects
 */
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Helper: run a query that returns a single row
 */
function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results[0] || null;
}

/**
 * Helper: run an INSERT/UPDATE/DELETE and save to disk
 * Returns { changes, lastInsertRowid }
 */
function runQuery(sql, params = []) {
  db.run(sql, params);
  const info = db.exec('SELECT last_insert_rowid() as id, changes() as changes');
  const lastInsertRowid = info[0]?.values[0]?.[0] || 0;
  const changes = info[0]?.values[0]?.[1] || 0;
  saveDB();
  return { lastInsertRowid, changes };
}

/**
 * Get the database instance (must call initDB first)
 */
function getDB() {
  return db;
}

module.exports = { initDB, getDB, queryAll, queryOne, runQuery, saveDB };
