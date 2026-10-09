import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','running','ended')),
      initial_balance INTEGER NOT NULL,
      tickers TEXT NOT NULL,
      duration_min INTEGER,
      start_at INTEGER,
      end_at INTEGER,
      ended_at INTEGER,
      reason_reveal_mode TEXT NOT NULL DEFAULT 'after_end' CHECK (reason_reveal_mode IN ('after_end','live')),
      sell_reason_required INTEGER NOT NULL DEFAULT 0,
      frozen_prices TEXT,
      created_at INTEGER NOT NULL
    );
    -- 개인정보는 닉네임 + 랜덤 참가 코드만 저장한다. 토큰은 해시로만 저장.
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      nickname TEXT NOT NULL,
      participant_code TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      UNIQUE (event_id, participant_code)
    );
    CREATE TABLE IF NOT EXISTS accounts (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      event_id INTEGER NOT NULL,
      cash INTEGER NOT NULL CHECK (cash >= 0),
      peak_total INTEGER NOT NULL,
      low_total INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS holdings (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      average_price REAL NOT NULL,
      leverage INTEGER NOT NULL DEFAULT 1,
      side TEXT NOT NULL DEFAULT 'long',
      PRIMARY KEY (user_id, ticker)
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('buy','sell')),
      quantity INTEGER NOT NULL,
      price INTEGER NOT NULL,
      reason TEXT,
      realized_pl INTEGER,
      leverage INTEGER NOT NULL DEFAULT 1,
      effect TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tx_event ON transactions(event_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, created_at);
  `);
  // 이미 만들어진 DB(레버리지 도입 전)에는 컬럼을 안전하게 추가한다.
  const addCol = (table, col, ddl) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
  };
  addCol('holdings', 'leverage', 'INTEGER NOT NULL DEFAULT 1');
  addCol('transactions', 'leverage', 'INTEGER NOT NULL DEFAULT 1');
  addCol('holdings', 'side', "TEXT NOT NULL DEFAULT 'long'"); // 매수 포지션(long) / 매도 포지션(short)
  addCol('transactions', 'effect', 'TEXT'); // open / close / flip / liquidation
  return db;
}

// 가격 시드는 DB에 한 번 만들어 저장한다 (소스코드만 봐서는 가격을 예측할 수 없게)
export function getPriceSeed(db) {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'price_seed'").get();
  if (row) return Number(row.value);
  const seed = randomBytes(4).readUInt32LE(0);
  db.prepare("INSERT INTO meta (key, value) VALUES ('price_seed', ?)").run(String(seed));
  return seed;
}
