<?php
if (!defined('SIMGAME')) { http_response_code(403); exit; }

// DB 파일 위치: SIMGAME_DATA_DIR(환경변수/설정) 또는 ./data. 파일명은 추측하기 어려운 랜덤 이름.
function sim_open_db(string $dataDir): PDO {
    if (!is_dir($dataDir) && !@mkdir($dataDir, 0775, true)) {
        throw new GameError('data 폴더를 만들 수 없습니다. 폴더 쓰기 권한을 확인하세요.', 500);
    }
    if (!is_writable($dataDir)) {
        throw new GameError('data 폴더에 쓰기 권한이 없습니다. (FTP에서 data 폴더 권한을 707 또는 755/775로 설정하세요)', 500);
    }
    $found = glob(rtrim($dataDir, '/\\') . '/g_*.sqlite');
    $file = $found ? $found[0] : rtrim($dataDir, '/\\') . '/g_' . bin2hex(random_bytes(12)) . '.sqlite';
    $db = new PDO('sqlite:' . $file, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $db->exec('PRAGMA busy_timeout = 8000; PRAGMA foreign_keys = ON;');
    $db->exec("
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','running','ended')),
      initial_balance INTEGER NOT NULL, tickers TEXT NOT NULL, duration_min INTEGER,
      start_at INTEGER, end_at INTEGER, ended_at INTEGER,
      reason_reveal_mode TEXT NOT NULL DEFAULT 'after_end' CHECK (reason_reveal_mode IN ('after_end','live')),
      sell_reason_required INTEGER NOT NULL DEFAULT 0, frozen_prices TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      nickname TEXT NOT NULL, participant_code TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL, UNIQUE (event_id, participant_code)
    );
    CREATE TABLE IF NOT EXISTS accounts (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, event_id INTEGER NOT NULL,
      cash INTEGER NOT NULL CHECK (cash >= 0), peak_total INTEGER NOT NULL, low_total INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS holdings (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, event_id INTEGER NOT NULL,
      ticker TEXT NOT NULL, quantity INTEGER NOT NULL CHECK (quantity > 0), average_price REAL NOT NULL,
      leverage INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (user_id, ticker)
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id INTEGER NOT NULL, ticker TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('buy','sell')),
      quantity INTEGER NOT NULL, price INTEGER NOT NULL, reason TEXT, realized_pl INTEGER, leverage INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tx_event ON transactions(event_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, created_at);
    CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset INTEGER NOT NULL);
    ");
    // 이미 만들어진 DB(레버리지 도입 전)에는 컬럼을 안전하게 추가한다.
    foreach (['holdings', 'transactions'] as $table) {
        $has = false;
        foreach ($db->query("PRAGMA table_info($table)")->fetchAll() as $c) if ($c['name'] === 'leverage') $has = true;
        if (!$has) $db->exec("ALTER TABLE $table ADD COLUMN leverage INTEGER NOT NULL DEFAULT 1");
    }
    return $db;
}

function sim_price_seed(PDO $db): int {
    $row = $db->query("SELECT value FROM meta WHERE key = 'price_seed'")->fetch();
    if ($row) return (int)$row['value'];
    $seed = unpack('V', random_bytes(4))[1];
    $db->prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('price_seed', ?)")->execute([(string)$seed]);
    $row = $db->query("SELECT value FROM meta WHERE key = 'price_seed'")->fetch();
    return (int)$row['value'];
}
