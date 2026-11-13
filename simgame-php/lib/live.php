<?php
if (!defined('SIMGAME')) { http_response_code(403); exit; }

// 가상자산(비트코인·이더리움) 시세를 업비트 공개 시세 API(로그인·키 불필요)에서 읽어 온다.
// - 서버(PHP)만 외부 시세를 부르고, 브라우저는 이 서버만 본다. (API 키가 필요 없고, 있어도 브라우저에 두지 않는다)
// - 여러 사람이 동시에 새로고침해도 업비트에는 몇 초에 한 번만 묻도록 DB에 잠깐 저장해 둔다.
// - 호스팅이 외부 접속을 막거나 업비트가 응답하지 않으면 마지막으로 받은 값, 그것도 없으면 샘플 가격으로 계속 돌아간다.
// - 다른 상품(주식·선물)은 지금처럼 샘플 가격이다.
final class LiveMarket extends Market {
    private const QUOTE_TTL_MS = 4000;    // 현재가 재조회 간격
    private const CANDLE_TTL_MS = 15000;  // 차트 재조회 간격
    private const FAIL_BACKOFF_MS = 60000; // 실패하면 1분 동안은 다시 묻지 않는다
    private const DELAYED_MS = 120000;    // 마지막 수신이 2분보다 오래되면 '지연'으로 표시
    private const NEAR_NOW_MS = 120000;   // 이만큼 이내면 '지금' 가격으로 본다
    private const BASE = 'https://api.upbit.com/v1';
    // 게임 기간 → [업비트 캔들 경로, 개수(최대 200)]
    private const UPBIT_RANGES = [
        'm1' => ['candles/minutes/1', 120], 'm3' => ['candles/minutes/3', 120], 'm5' => ['candles/minutes/5', 144],
        'm10' => ['candles/minutes/10', 144], 'm30' => ['candles/minutes/30', 144],
        '1d' => ['candles/minutes/5', 200], '1w' => ['candles/minutes/60', 168],
        '1m' => ['candles/days', 30], '3m' => ['candles/days', 90],
    ];

    private PDO $db;
    private string $base;
    /** @var callable(string):?string */
    private $http;
    /** @var callable():int */
    private $clock;
    private ?array $quotes = null;  // 요청 안에서 한 번만 읽는다
    private bool $failedThisRequest = false;
    private array $memo = [];
    private bool $sampleOnly = false; // 샘플 차트를 만드는 동안에는 샘플 가격만 쓴다

    public function __construct(int $seed, float $volatility, PDO $db, ?callable $http = null, ?callable $clock = null, ?string $base = null) {
        parent::__construct($seed, $volatility);
        $this->base = $base ?: self::BASE;
        $this->db = $db;
        $this->http = $http ?? 'sim_http_get';
        $this->clock = $clock ?? fn() => sim_now_ms();
        $db->exec('CREATE TABLE IF NOT EXISTS live_cache (k TEXT PRIMARY KEY, v TEXT NOT NULL, t INTEGER NOT NULL)');
    }

    private static function live(string $ticker): ?array { return self::TICKERS[$ticker]['live'] ?? null; }
    private function now(): int { return (int)($this->clock)(); }

    // ---- 캐시 (여러 요청이 같이 써도 한 요청만 외부에 묻는다) ----
    private function cacheGet(string $k): ?array {
        $st = $this->db->prepare('SELECT v, t FROM live_cache WHERE k = ?');
        $st->execute([$k]);
        $row = $st->fetch();
        if (!$row) return null;
        $v = json_decode($row['v'], true);
        return ['v' => is_array($v) ? $v : null, 't' => (int)$row['t']];
    }
    private function cachePut(string $k, ?array $v, int $t): void {
        $this->db->prepare('INSERT INTO live_cache (k, v, t) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, t = excluded.t')
            ->execute([$k, json_encode($v), $t]);
    }
    // 오래된 캐시를 '내가 갱신하겠다'고 먼저 표시한 요청만 true. 나머지는 기존 값을 쓴다.
    private function claim(string $k, int $ttl): bool {
        $now = $this->now();
        $this->db->prepare("INSERT OR IGNORE INTO live_cache (k, v, t) VALUES (?, 'null', 0)")->execute([$k]);
        $st = $this->db->prepare('UPDATE live_cache SET t = ? WHERE k = ? AND t <= ?');
        $st->execute([$now, $k, $now - $ttl]);
        return $st->rowCount() === 1;
    }
    private function backingOff(): bool {
        if ($this->failedThisRequest) return true;
        $f = $this->cacheGet('fail_until');
        return $f && $f['t'] > $this->now();
    }
    private function markFailed(): void {
        $this->failedThisRequest = true;
        $this->cachePut('fail_until', null, $this->now() + self::FAIL_BACKOFF_MS);
    }

    private function fetchJson(string $path, array $query) {
        if ($this->backingOff()) return null;
        $body = ($this->http)($this->base . '/' . $path . '?' . http_build_query($query));
        $data = is_string($body) ? json_decode($body, true) : null;
        if (!is_array($data) || !array_is_list($data) || !$data) { $this->markFailed(); return null; }
        return $data;
    }

    // ---- 현재가 ----
    /** @return array{at:int, q:array<string,array{price:float,prev:float,vol:float}>}|null */
    private function quotes(): ?array {
        if ($this->quotes !== null) return $this->quotes ?: null;
        $markets = [];
        foreach (self::TICKERS as $t => $m) if (!empty($m['live'])) $markets[$m['live']['market']] = (string)$t;
        $cached = $this->cacheGet('quotes');
        $fresh = $cached && $cached['v'] && $this->now() - (int)($cached['v']['at'] ?? 0) < self::QUOTE_TTL_MS;
        if (!$fresh && $markets && !$this->backingOff() && $this->claim('quotes', self::QUOTE_TTL_MS)) {
            $rows = $this->fetchJson('ticker', ['markets' => implode(',', array_keys($markets))]);
            $q = [];
            foreach ($rows ?? [] as $r) {
                $t = $markets[$r['market'] ?? ''] ?? null;
                $price = (float)($r['trade_price'] ?? 0);
                if ($t === null || $price <= 0) continue;
                $q[$t] = ['price' => $price, 'prev' => (float)($r['prev_closing_price'] ?? $price) ?: $price, 'vol' => (float)($r['acc_trade_volume'] ?? 0)];
            }
            if ($q) {
                $cached = ['v' => ['at' => $this->now(), 'q' => $q], 't' => $this->now()];
                $this->cachePut('quotes', $cached['v'], $this->now());
            } elseif ($rows !== null) {
                $this->markFailed();
            }
        }
        $this->quotes = ($cached && $cached['v'] && !empty($cached['v']['q'])) ? $cached['v'] : [];
        return $this->quotes ?: null;
    }
    private function quote(string $ticker): ?array { return $this->quotes()['q'][$ticker] ?? null; }

    // 요청을 처리하기 전에 미리 불러 둔다. (거래 트랜잭션 안에서 외부 접속을 기다리지 않도록)
    public function warm(): void { $this->quotes(); }

    private static function toP(float $krw, array $live): int { return max(1, (int)round($krw * $live['mult'])); }

    public function sourceOf(string $ticker): string {
        if (!self::live($ticker)) return 'sample';
        $qs = $this->quotes();
        if (!$qs || !isset($qs['q'][$ticker])) return 'sample';
        return $this->now() - (int)$qs['at'] > self::DELAYED_MS ? 'upbit-delayed' : 'upbit';
    }

    public function priceAt(string $ticker, int $ms): int {
        $live = $this->sampleOnly ? null : self::live($ticker);
        $q = $live ? $this->quote($ticker) : null;
        if (!$q) return parent::priceAt($ticker, $ms);
        if (abs($this->now() - $ms) <= self::NEAR_NOW_MS) return self::toP($q['price'], $live);
        // 지난 시각(예: 자동 종료 시각) 가격은 그 분의 1분봉 종가로 구한다. 못 구하면 마지막 가격.
        $key = "at:$ticker:" . intdiv($ms, 60000);
        if (!array_key_exists($key, $this->memo)) {
            $rows = $this->fetchJson('candles/minutes/1', ['market' => $live['market'], 'to' => gmdate('Y-m-d\TH:i:s\Z', intdiv($ms, 60000) * 60 + 60), 'count' => 1]);
            $this->memo[$key] = isset($rows[0]['trade_price']) ? (float)$rows[0]['trade_price'] : null;
        }
        return self::toP($this->memo[$key] ?? $q['price'], $live);
    }

    public function prevClose(string $ticker, int $ms): int {
        $live = self::live($ticker);
        $q = $live ? $this->quote($ticker) : null;
        return $q ? self::toP($q['prev'], $live) : parent::prevClose($ticker, $ms);
    }

    public function todayVolume(string $ticker, int $ms): int {
        $live = self::live($ticker);
        $q = $live ? $this->quote($ticker) : null;
        return $q ? (int)round($q['vol'] / $live['mult']) : parent::todayVolume($ticker, $ms);
    }

    public function candles(string $ticker, string $range, int $ms): ?array {
        $live = self::live($ticker);
        if (!$live || !isset(self::RANGES[$range])) return parent::candles($ticker, $range, $ms);
        [$path, $count] = self::UPBIT_RANGES[$range];
        $nearNow = abs($this->now() - $ms) <= self::NEAR_NOW_MS;
        $query = ['market' => $live['market'], 'count' => $count];
        if (!$nearNow) $query['to'] = gmdate('Y-m-d\TH:i:s\Z', intdiv($ms, 1000) + 1);
        $k = 'c:' . $live['market'] . ":$range" . ($nearNow ? '' : ':' . intdiv($ms, 60000));
        $cached = $this->cacheGet($k);
        $rows = $cached['v'] ?? null;
        $fresh = $rows && ($this->now() - $cached['t'] < self::CANDLE_TTL_MS || !$nearNow);
        if (!$fresh && !$this->backingOff() && $this->claim($k, self::CANDLE_TTL_MS)) {
            $got = $this->fetchJson($path, $query);
            if ($got) {
                $rows = [];
                foreach (array_reverse($got) as $r) { // 업비트는 최신 봉이 먼저 온다 → 시간순으로 뒤집는다
                    $t = strtotime(($r['candle_date_time_utc'] ?? '') . 'Z');
                    if ($t === false || !isset($r['opening_price'], $r['high_price'], $r['low_price'], $r['trade_price'])) continue;
                    $rows[] = ['t' => $t * 1000, 'o' => self::toP($r['opening_price'], $live), 'h' => self::toP($r['high_price'], $live),
                        'l' => self::toP($r['low_price'], $live), 'c' => self::toP($r['trade_price'], $live),
                        'v' => (int)round((float)($r['candle_acc_trade_volume'] ?? 0) / $live['mult'])];
                }
                if ($rows) $this->cachePut($k, $rows, $this->now());
            }
        }
        if (!$rows) {
            // 차트를 못 받았으면 샘플 차트를 현재 가격 수준에 맞춰 보여준다(가격대가 튀지 않게)
            $this->sampleOnly = true;
            try { $sample = parent::candles($ticker, $range, $ms); } finally { $this->sampleOnly = false; }
            $q = $this->quote($ticker);
            if (!$q || !$sample) return $sample;
            $f = self::toP($q['price'], $live) / max(1, end($sample)['c']);
            return array_map(fn($c) => ['t' => $c['t'], 'o' => (int)round($c['o'] * $f), 'h' => (int)round($c['h'] * $f), 'l' => (int)round($c['l'] * $f), 'c' => (int)round($c['c'] * $f), 'v' => $c['v']], $sample);
        }
        if ($nearNow) { // 진행 중인 마지막 봉은 현재가로 마감
            $p = $this->priceAt($ticker, $ms);
            $i = count($rows) - 1;
            $rows[$i]['c'] = $p;
            $rows[$i]['h'] = max($rows[$i]['h'], $p);
            $rows[$i]['l'] = min($rows[$i]['l'], $p);
        }
        return $rows;
    }
}

// 외부 시세 요청 (짧은 제한시간). 실패하면 null.
function sim_http_get(string $url): ?string {
    $ua = 'SimGame/1.0 (+educational mock trading)';
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 2, CURLOPT_TIMEOUT => 3,
            CURLOPT_HTTPHEADER => ['Accept: application/json'], CURLOPT_USERAGENT => $ua,
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        return ($body !== false && $code === 200) ? (string)$body : null;
    }
    if (filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN)) {
        $ctx = stream_context_create(['http' => ['timeout' => 3, 'header' => "Accept: application/json\r\nUser-Agent: $ua\r\n", 'ignore_errors' => true]]);
        $body = @file_get_contents($url, false, $ctx);
        $ok = isset($http_response_header[0]) && preg_match('#\s200\s#', $http_response_header[0]);
        return ($body !== false && $ok) ? $body : null;
    }
    return null;
}
