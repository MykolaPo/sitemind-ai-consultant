const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'sitemind.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    api_key TEXT NOT NULL,
    widget_title TEXT DEFAULT 'AI-Консультант',
    widget_welcome TEXT DEFAULT 'Здравствуйте! Помогу подобрать товар, уточнить актуальную цену и условия доставки.',
    widget_color TEXT DEFAULT '#0284c7',
    widget_bg TEXT DEFAULT '#ffffff',
    widget_shape TEXT DEFAULT 'rounded',
    widget_avatar TEXT DEFAULT '',
    widget_position TEXT DEFAULT 'bottom-right',
    language TEXT DEFAULT 'ru',
    system_prompt TEXT DEFAULT 'Отвечай кратко, вежливо и строго по подтверждённым данным из базы знаний и Live API.',
    strict_mode INTEGER DEFAULT 1,
    price_api_url TEXT DEFAULT '',
    price_api_offline INTEGER DEFAULT 0,
    token_budget INTEGER DEFAULT 500000,
    tokens_used INTEGER DEFAULT 0,
    llm_provider TEXT DEFAULT 'local',
    llm_model TEXT DEFAULT '',
    llm_api_key TEXT DEFAULT '',
    llm_base_url TEXT DEFAULT '',
    auto_sync_hours INTEGER DEFAULT 24,
    owner_id TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS knowledge_docs (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_url TEXT DEFAULT '',
    raw_content TEXT NOT NULL,
    chunk_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'indexed',
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    doc_id TEXT NOT NULL REFERENCES knowledge_docs(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding_json TEXT NOT NULL,
    tokens_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS faqs (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    source_label TEXT DEFAULT 'FAQ',
    hits INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS live_products (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'Общее',
    price REAL NOT NULL,
    old_price REAL DEFAULT NULL,
    currency TEXT DEFAULT '€',
    stock INTEGER DEFAULT 0,
    url TEXT DEFAULT '',
    description TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dialogs (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    language TEXT DEFAULT 'ru',
    channel TEXT DEFAULT 'widget',
    needs_human INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    dialog_id TEXT NOT NULL REFERENCES dialogs(id) ON DELETE CASCADE,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    sources_json TEXT DEFAULT '[]',
    model_used TEXT DEFAULT '',
    cache_hit INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    needs_human INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS unanswered_questions (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    dialog_id TEXT DEFAULT '',
    resolved INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS response_cache (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    query_hash TEXT NOT NULL,
    query_text TEXT NOT NULL,
    answer TEXT NOT NULL,
    sources_json TEXT DEFAULT '[]',
    hits INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(site_id, query_hash)
  );

  CREATE TABLE IF NOT EXISTS confirmed_actions (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    dialog_id TEXT DEFAULT '',
    action_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT DEFAULT 'confirmed',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Safe migrations for existing DBs
for (const col of [
  "ALTER TABLE sites ADD COLUMN widget_bg TEXT DEFAULT '#ffffff'",
  "ALTER TABLE sites ADD COLUMN widget_shape TEXT DEFAULT 'rounded'",
  "ALTER TABLE sites ADD COLUMN widget_avatar TEXT DEFAULT ''",
  "ALTER TABLE sites ADD COLUMN llm_provider TEXT DEFAULT 'local'",
  "ALTER TABLE sites ADD COLUMN llm_model TEXT DEFAULT ''",
  "ALTER TABLE sites ADD COLUMN llm_api_key TEXT DEFAULT ''",
  "ALTER TABLE sites ADD COLUMN llm_base_url TEXT DEFAULT ''",
  "ALTER TABLE sites ADD COLUMN auto_sync_hours INTEGER DEFAULT 24",
  "ALTER TABLE sites ADD COLUMN owner_id TEXT DEFAULT ''",
]) {
  try { db.exec(col); } catch (_e) {}
}

function genId(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

module.exports = { db, genId };
