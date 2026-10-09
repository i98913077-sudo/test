<?php
declare(strict_types=1);
// SAFE INVEST API (PHP판). 모든 요청은 api.php?r=<경로> 로 들어온다. (서버 설정/리라이트 불필요)
define('SIMGAME', 1);
ob_start(); // 설정/코드 파일 앞의 BOM·공백 등 뜻하지 않은 출력이 JSON을 깨뜨리지 않게 버퍼링

function discard_output(): void { while (ob_get_level() > 0) ob_end_clean(); }

ini_set('display_errors', '0');
ini_set('serialize_precision', '-1');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

function out(int $status, $data): void {
    discard_output();
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

if (PHP_VERSION_ID < 80100) out(500, ['error' => '이 게임은 PHP 8.1 이상이 필요합니다. (현재 ' . PHP_VERSION . ') 호스팅 관리 화면에서 PHP 버전을 올려주세요.']);
foreach (['pdo_sqlite', 'mbstring'] as $ext) {
    if (!extension_loaded($ext)) out(500, ['error' => "PHP 확장 모듈 {$ext} 이(가) 필요합니다. 호스팅 관리 화면에서 켜거나 고객센터에 문의하세요."]);
}

require __DIR__ . '/lib/util.php';
require __DIR__ . '/lib/market.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/game.php';

const MAX_BODY = 16384;
const APP_VERSION = '2026.10.09-leverage';

try {
    $cfg = require __DIR__ . '/config.php';
    $adminPassword = getenv('SIMGAME_ADMIN_PASSWORD') ?: (string)($cfg['admin_password'] ?? '');
    $dataDir = getenv('SIMGAME_DATA_DIR') ?: (string)($cfg['data_dir'] ?? (__DIR__ . '/data'));
    $volatility = (float)($cfg['demo_volatility'] ?? 1.0);
    if (isset($_SERVER['HTTP_X_SIM_NOW']) && getenv('SIMGAME_TEST') === '1') $GLOBALS['SIM_NOW'] = (int)$_SERVER['HTTP_X_SIM_NOW']; // 테스트 전용 시계

    $db = sim_open_db($dataDir);
    $market = new Market(sim_price_seed($db), $volatility);
    $game = new Game($db, $market);

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $route = trim((string)($_GET['r'] ?? ''), '/');
    $token = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? ''); // Authorization 헤더는 일부 호스팅이 걸러내므로 커스텀 헤더 사용
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $now = sim_now_ms();

    // ---- 요청 빈도 제한 (DB 기반; 학교 공유 IP를 고려해 넉넉하게) ----
    $limited = function (string $key, int $max, int $windowMs) use ($db, $now): bool {
        $db->exec('BEGIN IMMEDIATE');
        try {
            $st = $db->prepare('SELECT n, reset FROM rate_limits WHERE k=?');
            $st->execute([$key]);
            $row = $st->fetch();
            if (!$row || (int)$row['reset'] <= $now) {
                $db->prepare('INSERT OR REPLACE INTO rate_limits (k, n, reset) VALUES (?,?,?)')->execute([$key, 1, $now + $windowMs]);
                $n = 1;
            } else {
                $n = (int)$row['n'] + 1;
                $db->prepare('UPDATE rate_limits SET n=? WHERE k=?')->execute([$n, $key]);
            }
            if (random_int(1, 50) === 1) $db->prepare('DELETE FROM rate_limits WHERE reset <= ?')->execute([$now]);
            $db->exec('COMMIT');
            return $n > $max;
        } catch (Throwable $e) { $db->exec('ROLLBACK'); throw $e; }
    };

    $body = function (): array {
        $raw = (string)stream_get_contents(fopen('php://input', 'r'), MAX_BODY + 1);
        if (strlen($raw) > MAX_BODY) throw new GameError('요청이 너무 큽니다.', 413);
        if ($raw === '') return [];
        $v = json_decode($raw, true);
        if (!is_array($v) || (array_is_list($v) && $v !== [])) throw new GameError('JSON 형식이 올바르지 않습니다.');
        return $v;
    };
    $needAuth = function () use ($game, $token): array {
        $a = $game->authenticate($token);
        if (!$a) throw new GameError('참가 정보가 없거나 만료되었습니다. 다시 참가해주세요.', 401);
        return $a;
    };
    $isAdmin = function () use ($db, $token, $now): bool {
        if (strlen($token) < 16) return false;
        $st = $db->prepare('SELECT expires FROM admin_sessions WHERE token_hash=?');
        $st->execute([hash('sha256', $token)]);
        $row = $st->fetch();
        return $row && (int)$row['expires'] > $now;
    };
    $needAdmin = function () use ($isAdmin): void { if (!$isAdmin()) throw new GameError('관리자 인증이 필요합니다.', 401); };
    $must = function (string $expected) use ($method): void {
        if ($method !== $expected) throw new GameError('허용되지 않는 요청 방식입니다.', 405);
    };
    $csvCell = function ($v): string {
        $s = $v === null ? '' : (string)$v;
        if (preg_match('/^[=+\-@\t\r]/', $s)) $s = "'" . $s;
        return '"' . str_replace('"', '""', $s) . '"';
    };

    switch (true) {
        case $route === 'event':
            $must('GET');
            out(200, ['event' => $game->publicEvent($game->currentEvent())]);

        case $route === 'join':
            $must('POST');
            if ($limited("join:$ip", 200, 60000)) throw new GameError('요청이 너무 많습니다. 잠시 후 다시 시도하세요.', 429);
            out(200, $game->join($body()['nickname'] ?? null));

        case $route === 'version':
            $must('GET');
            out(200, ['version' => APP_VERSION, 'catalog_size' => count(Market::TICKERS), 'runtime' => 'PHP ' . PHP_VERSION]);

        case $route === 'state':
            $must('GET');
            out(200, $game->myState($needAuth()));

        case $route === 'transactions':
            $must('GET');
            out(200, ['transactions' => $game->myTransactions($needAuth())]);

        case $route === 'trade':
            $must('POST');
            $auth = $needAuth();
            if ($limited('trade:' . $auth['user']['id'], 60, 60000)) throw new GameError('거래 요청이 너무 빠릅니다. 잠시 후 다시 시도하세요.', 429);
            $result = $game->trade($auth, $body());
            out(200, ['trade' => $result, 'state' => $game->myState($auth)]);

        case $route === 'compare':
            $must('GET');
            out(200, $game->compare($needAuth(), (string)($_GET['code'] ?? '')));

        case $route === 'report':
            $must('GET');
            out(200, $game->report($needAuth()));

        case $route === 'ranking':
            $must('GET');
            out(200, $game->ranking($game->currentEvent()));

        case $route === 'tickers':
            $must('GET');
            out(200, ['tickers' => array_map(fn($k) => ['ticker' => $k, 'name' => Market::TICKERS[$k]['name'], 'sector' => Market::TICKERS[$k]['sector'], 'group' => Market::TICKERS[$k]['group'], 'unit' => Market::TICKERS[$k]['unit']], Market::tickerList()), 'groups' => Market::GROUPS]);

        case (bool)preg_match('#^stocks/([A-Za-z0-9._-]{1,12})/candles$#', $route, $m):
            $must('GET');
            $ev = $game->currentEvent();
            if (!$ev) throw new GameError('진행 중인 이벤트가 없습니다.', 404);
            $range = (string)($_GET['range'] ?? '1d');
            out(200, ['ticker' => $m[1], 'range' => $range, 'candles' => $game->candles($ev, $m[1], $range)]);

        // ----- 관리자 -----
        case $route === 'admin/login':
            $must('POST');
            if ($limited("login:$ip", 10, 60000)) throw new GameError('로그인 시도가 너무 많습니다. 1분 뒤 다시 시도하세요.', 429);
            if ($adminPassword === '' || $adminPassword === 'CHANGE_ME') {
                throw new GameError('관리자 비밀번호가 아직 설정되지 않았습니다. 서버의 config.php 에서 admin_password 를 바꿔주세요.', 403);
            }
            $pw = $body()['password'] ?? null;
            if (!is_string($pw) || !hash_equals(hash('sha256', $adminPassword), hash('sha256', $pw))) throw new GameError('비밀번호가 올바르지 않습니다.', 401);
            $tok = bin2hex(random_bytes(24));
            $db->prepare('DELETE FROM admin_sessions WHERE expires <= ?')->execute([$now]);
            $db->prepare('INSERT INTO admin_sessions (token_hash, expires) VALUES (?,?)')->execute([hash('sha256', $tok), $now + 8 * 3600 * 1000]);
            out(200, ['token' => $tok]);

        case str_starts_with($route, 'admin/'):
            $needAdmin();
            switch ($route) {
                case 'admin/overview': $must('GET'); out(200, $game->adminOverview());
                case 'admin/transactions': $must('GET'); out(200, ['transactions' => $game->adminTransactions()]);
                case 'admin/event': $must('POST'); out(200, ['event' => $game->createEvent($body())]);
                case 'admin/event/update': $must('POST'); out(200, ['event' => $game->updateEvent($body())]);
                case 'admin/event/start': $must('POST'); out(200, ['event' => $game->startEvent()]);
                case 'admin/event/end': $must('POST'); out(200, ['event' => $game->endEvent()]);
                case 'admin/event/reset': $must('POST'); out(200, ['event' => $game->resetEvent()]);
                case 'admin/export.csv':
                    $must('GET');
                    $lines = [implode(',', array_map($csvCell, ['시각', '닉네임', '코드', '종목', '구분', '수량', '체결가(P)', '실현손익(P)', '이유']))];
                    foreach (array_reverse($game->adminTransactions(10000)) as $t) {
                        $lines[] = implode(',', array_map($csvCell, [gmdate('c', intdiv((int)$t['created_at'], 1000)), $t['nickname'], $t['code'], $t['name'],
                            $t['type'] === 'buy' ? '매수' : '매도', $t['quantity'], $t['price'], $t['realized_pl'], $t['reason']]));
                    }
                    discard_output();
                    header('Content-Type: text/csv; charset=utf-8');
                    header('Content-Disposition: attachment; filename="transactions.csv"');
                    echo "\xEF\xBB\xBF" . implode("\r\n", $lines);
                    exit;
            }
            // fallthrough → 404
        default:
            throw new GameError('요청한 API를 찾을 수 없습니다.', 404);
    }
} catch (GameError $e) {
    out($e->status, ['error' => $e->getMessage()]);
} catch (Throwable $e) {
    error_log('[simgame] ' . $e);
    out(500, ['error' => '서버 오류가 발생했습니다.']);
}
