import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'crypto-valuation.db')

type SqliteDatabase = Database.Database

declare global {
  var __cryptoValuationDb: SqliteDatabase | undefined
}

function createDatabase(): SqliteDatabase {
  const directory = path.dirname(DB_PATH)
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true })
  }

  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  applySchema(db)
  return db
}

export function getDb(): SqliteDatabase {
  if (!global.__cryptoValuationDb) {
    global.__cryptoValuationDb = createDatabase()
  }
  return global.__cryptoValuationDb
}

export function applySchema(db: SqliteDatabase = getDb()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS protocols_raw (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      defillama_id TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL,
      name TEXT,
      display_name TEXT,
      protocol_type TEXT,
      category TEXT,
      chains TEXT,
      logo TEXT,
      gecko_id TEXT,
      cmc_id TEXT,
      module TEXT,
      methodology_url TEXT,
      has_label_breakdown INTEGER DEFAULT 0,
      parent_protocol TEXT,
      linked_protocols TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS protocols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      name TEXT,
      display_name TEXT,
      logo TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(slug)
    );

    CREATE TABLE IF NOT EXISTS protocol_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      metric_type TEXT NOT NULL,
      date TEXT NOT NULL,
      value_usd REAL NOT NULL,
      breakdown_json TEXT,
      source_ts INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(slug, metric_type, date),
      FOREIGN KEY(slug) REFERENCES protocols(slug) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_protocol_metrics_protocol_metric_date
      ON protocol_metrics(slug, metric_type, date);

    CREATE TABLE IF NOT EXISTS ingest_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL,
      note TEXT,
      items_fetched INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ingest_cursors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      metric_type TEXT NOT NULL,
      last_date TEXT,
      UNIQUE(slug, metric_type),
      FOREIGN KEY(slug) REFERENCES protocols(slug) ON DELETE CASCADE
    );

  `)

  ensureTrackedProtocolSchema(db)
}

function ensureTrackedProtocolSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracked_protocols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(slug)
    );
  `)

  const columns = db.prepare(`PRAGMA table_info('tracked_protocols')`).all() as { name: string }[]
  const columnNames = new Set(columns.map((col) => col.name))

  // SQLite 不允许在 ALTER TABLE 中使用非常量默认值，新增列后统一回填当前时间。
  if (!columnNames.has('created_at')) {
    db.prepare('ALTER TABLE tracked_protocols ADD COLUMN created_at DATETIME').run()
  }
  if (!columnNames.has('last_read_at')) {
    db.prepare('ALTER TABLE tracked_protocols ADD COLUMN last_read_at DATETIME').run()
  }

  db.prepare('UPDATE tracked_protocols SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)').run()
  db.prepare('UPDATE tracked_protocols SET last_read_at = COALESCE(last_read_at, CURRENT_TIMESTAMP)').run()
  db.prepare('CREATE INDEX IF NOT EXISTS idx_tracked_protocols_last_read_at ON tracked_protocols(last_read_at)').run()
}

export function runInTransaction<T>(fn: (db: SqliteDatabase) => T, db: SqliteDatabase = getDb()): T {
  const tx = db.transaction(fn)
  return tx(db)
}

export { DB_PATH }
