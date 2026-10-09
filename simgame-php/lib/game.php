<?php
// 게임 핵심 로직(PHP판). 현금·보유수량·체결가·총자산·수익률·순위는 모두 서버(여기)에서만 계산한다.
// 실제 증권사/결제/외부 주문 시스템과 연결되지 않는다. 모든 거래는 DB 기록일 뿐이다.
if (!defined('SIMGAME')) { http_response_code(403); exit; }

final class Game {
    public const NICK_MAX = 12;
    public const REASON_MIN = 10;
    public const REASON_MAX = 200;
    public const MAX_QTY = 1000000;
    public const MIN_BALANCE = 10000;
    public const MAX_BALANCE = 1000000000000;
    public const DEFAULT_BALANCE = 100000000; // 1억 P
    private const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    private PDO $db;
    private Market $market;
    /** @var callable */
    private $clock;

    public function __construct(PDO $db, Market $market, ?callable $clock = null) {
        $this->db = $db;
        $this->market = $market;
        $this->clock = $clock ?? 'sim_now_ms';
    }

    private function now(): int { return (int)($this->clock)(); }
    private function q(string $sql, array $params = []): PDOStatement {
        $st = $this->db->prepare($sql);
        $st->execute($params);
        return $st;
    }
    private function one(string $sql, array $params = []): ?array {
        $r = $this->q($sql, $params)->fetch();
        return $r === false ? null : $r;
    }
    private function all(string $sql, array $params = []): array { return $this->q($sql, $params)->fetchAll(); }

    private function tx(callable $fn) {
        $this->db->exec('BEGIN IMMEDIATE');
        try {
            $r = $fn();
            $this->db->exec('COMMIT');
            return $r;
        } catch (Throwable $e) {
            try { $this->db->exec('ROLLBACK'); } catch (Throwable $ignore) { /* 이미 종료됨 */ }
            throw $e;
        }
    }

    private static function clean(string $s): string {
        $s = preg_replace('/[\x00-\x1f\x7f\x{200b}-\x{200f}\x{2028}-\x{202e}]/u', ' ', $s) ?? '';
        $s = preg_replace('/\s+/u', ' ', $s) ?? '';
        return trim($s);
    }
    private static function len(string $s): int { return mb_strlen($s, 'UTF-8'); }
    private static function name(string $ticker): string { return Market::TICKERS[$ticker]['name'] ?? $ticker; }
    private static function unit(string $ticker): string { return Market::TICKERS[$ticker]['unit'] ?? '주'; }
    private static function levOf(string $ticker): int { return (int)(Market::TICKERS[$ticker]['leverage'] ?? 1); }
    // 포지션 평가액 = 증거금 + 평가손익. 레버리지 1배면 가격×수량과 같고, 0 아래로는 내려가지 않는다(강제청산).
    private static function equityOf(int $qty, float $avg, int $lev, int $price): int {
        return (int)max(0, round($qty * ($price - $avg * (1 - 1 / $lev))));
    }
    private static function toInt($v): ?int {
        if (is_int($v)) return $v;
        if (is_float($v) && is_finite($v) && floor($v) == $v && abs($v) < 9007199254740992) return (int)$v;
        return null;
    }

    // ---------- 이벤트 ----------
    private function parseEvent(?array $row): ?array {
        if (!$row) return null;
        $row['tickers'] = json_decode($row['tickers'], true) ?: [];
        $row['sell_reason_required'] = (bool)$row['sell_reason_required'];
        $row['frozen'] = $row['frozen_prices'] ? json_decode($row['frozen_prices'], true) : null;
        return $row;
    }

    private function endEventAt(array $ev, int $at): void {
        $frozen = [];
        foreach ($ev['tickers'] as $t) $frozen[$t] = $this->market->priceAt($t, $at);
        $this->q("UPDATE events SET status='ended', ended_at=?, frozen_prices=? WHERE id=?", [$at, json_encode($frozen), $ev['id']]);
    }

    // 종료 시각이 지난 이벤트는 호출 시점에 자동 종료(종료 시각 기준 가격으로 고정)
    public function currentEvent(): ?array {
        $ev = $this->parseEvent($this->one('SELECT * FROM events ORDER BY id DESC LIMIT 1'));
        if ($ev && $ev['status'] === 'running' && $ev['end_at'] && (int)$ev['end_at'] <= $this->now()) {
            $this->endEventAt($ev, (int)$ev['end_at']);
            $ev = $this->parseEvent($this->one('SELECT * FROM events WHERE id=?', [$ev['id']]));
        }
        return $ev;
    }

    private function participantCount(int $evId): int {
        return (int)$this->one('SELECT COUNT(*) AS n FROM users WHERE event_id=?', [$evId])['n'];
    }

    public function publicEvent(?array $ev): ?array {
        if (!$ev) return null;
        return [
            'id' => (int)$ev['id'], 'name' => $ev['name'], 'status' => $ev['status'],
            'initial_balance' => (int)$ev['initial_balance'],
            'start_at' => $ev['start_at'] !== null ? (int)$ev['start_at'] : null,
            'end_at' => $ev['end_at'] !== null ? (int)$ev['end_at'] : null,
            'ended_at' => $ev['ended_at'] !== null ? (int)$ev['ended_at'] : null,
            'duration_min' => $ev['duration_min'] !== null ? (int)$ev['duration_min'] : null,
            'reason_reveal_mode' => $ev['reason_reveal_mode'],
            'sell_reason_required' => $ev['sell_reason_required'],
            'tickers' => $ev['tickers'],
            'participants' => $this->participantCount((int)$ev['id']),
            'server_time' => $this->now(),
            'data_mode' => 'demo',
        ];
    }

    private function validateTickers($list): array {
        $all = Market::tickerList();
        if ($list === null) return $all;
        if (!is_array($list) || count($list) < 1 || count($list) > count($all)) throw new GameError('종목은 1개 이상 선택해야 합니다.');
        $set = array_values(array_unique(array_map('strval', $list)));
        foreach ($set as $t) if (!isset(Market::TICKERS[$t])) throw new GameError('알 수 없는 종목이 포함되어 있습니다.');
        return array_values(array_filter($all, fn($t) => in_array($t, $set, true))); // 표의 순서대로 정렬
    }
    private function validateBalance($v): int {
        if ($v === null) return self::DEFAULT_BALANCE;
        $n = self::toInt($v);
        if ($n === null || $n < self::MIN_BALANCE || $n > self::MAX_BALANCE) {
            throw new GameError('시작 가상자금은 ' . number_format(self::MIN_BALANCE) . 'P 이상 ' . number_format(self::MAX_BALANCE) . 'P 이하의 정수여야 합니다.');
        }
        return $n;
    }
    private function validateDuration($v): ?int {
        if ($v === null || $v === '') return null;
        $n = self::toInt($v);
        if ($n === null || $n < 1 || $n > 7 * 1440) throw new GameError('진행 시간은 1분 ~ 7일(분 단위 정수)이어야 합니다.');
        return $n;
    }
    private function validateMode($v): string {
        if ($v === null) return 'after_end';
        if ($v !== 'after_end' && $v !== 'live') throw new GameError('매수 이유 공개 방식이 올바르지 않습니다.');
        return $v;
    }
    private function validateName($v): string {
        $name = self::clean(is_string($v) ? $v : '');
        if (self::len($name) < 1 || self::len($name) > 40) throw new GameError('이벤트 이름은 1~40자여야 합니다.');
        return $name;
    }

    public function createEvent(array $in = []): array {
        $cur = $this->currentEvent();
        if ($cur && $cur['status'] !== 'ended') throw new GameError('아직 종료되지 않은 이벤트가 있습니다. 먼저 종료하거나 초기화하세요.', 409);
        $name = $this->validateName(array_key_exists('name', $in) ? $in['name'] : '너굴이들 모의투자 챌린지');
        $this->q("INSERT INTO events (name, status, initial_balance, tickers, duration_min, reason_reveal_mode, sell_reason_required, created_at)
                  VALUES (?, 'ready', ?, ?, ?, ?, ?, ?)", [
            $name, $this->validateBalance($in['initial_balance'] ?? null), json_encode($this->validateTickers($in['tickers'] ?? null)),
            $this->validateDuration($in['duration_min'] ?? null), $this->validateMode($in['reason_reveal_mode'] ?? null),
            !empty($in['sell_reason_required']) ? 1 : 0, $this->now(),
        ]);
        return $this->publicEvent($this->parseEvent($this->one('SELECT * FROM events WHERE id=?', [$this->db->lastInsertId()])));
    }

    public function updateEvent(array $in = []): array {
        $ev = $this->currentEvent();
        if (!$ev) throw new GameError('이벤트가 없습니다.', 404);
        if ($ev['status'] === 'ended') throw new GameError('종료된 이벤트는 수정할 수 없습니다.', 409);
        $hasPlayers = $this->participantCount((int)$ev['id']) > 0;
        $next = $ev;
        if (array_key_exists('name', $in)) $next['name'] = $this->validateName($in['name']);
        if (array_key_exists('reason_reveal_mode', $in)) $next['reason_reveal_mode'] = $this->validateMode($in['reason_reveal_mode']);
        if (array_key_exists('sell_reason_required', $in)) $next['sell_reason_required'] = !empty($in['sell_reason_required']);
        if (array_key_exists('duration_min', $in) && $ev['status'] === 'ready') $next['duration_min'] = $this->validateDuration($in['duration_min']);
        if (array_key_exists('initial_balance', $in)) {
            if ($hasPlayers) throw new GameError('참가자가 있으면 시작 가상자금을 바꿀 수 없습니다. (공정성을 위해) 초기화 후 변경하세요.', 409);
            $next['initial_balance'] = $this->validateBalance($in['initial_balance']);
        }
        if (array_key_exists('tickers', $in)) {
            $nt = $this->validateTickers($in['tickers']);
            // 종목을 "추가"하는 것은 기존 보유에 영향이 없어 참가자가 있어도 허용. 빼는 것만 막는다.
            if ($hasPlayers && count(array_diff($ev['tickers'], $nt)) > 0) {
                throw new GameError('참가자가 있으면 종목을 추가만 할 수 있습니다. 종목을 빼려면 초기화 후 변경하세요.', 409);
            }
            $next['tickers'] = $nt;
        }
        if (array_key_exists('end_in_min', $in) && $ev['status'] === 'running') {
            $m = $this->validateDuration($in['end_in_min']);
            $next['end_at'] = $m === null ? null : $this->now() + $m * 60000;
        }
        $this->q('UPDATE events SET name=?, initial_balance=?, tickers=?, duration_min=?, reason_reveal_mode=?, sell_reason_required=?, end_at=? WHERE id=?', [
            $next['name'], $next['initial_balance'], json_encode($next['tickers']), $next['duration_min'], $next['reason_reveal_mode'],
            $next['sell_reason_required'] ? 1 : 0, $next['end_at'], $ev['id'],
        ]);
        return $this->publicEvent($this->currentEvent());
    }

    public function startEvent(): array {
        $ev = $this->currentEvent();
        if (!$ev) throw new GameError('이벤트가 없습니다.', 404);
        if ($ev['status'] !== 'ready') throw new GameError('시작 전 상태의 이벤트만 시작할 수 있습니다.', 409);
        $t = $this->now();
        $end = $ev['duration_min'] ? $t + (int)$ev['duration_min'] * 60000 : null;
        $this->q("UPDATE events SET status='running', start_at=?, end_at=? WHERE id=?", [$t, $end, $ev['id']]);
        return $this->publicEvent($this->currentEvent());
    }

    public function endEvent(): array {
        $ev = $this->currentEvent();
        if (!$ev) throw new GameError('이벤트가 없습니다.', 404);
        if ($ev['status'] !== 'running') throw new GameError('진행 중인 이벤트만 종료할 수 있습니다.', 409);
        $this->endEventAt($ev, $this->now());
        return $this->publicEvent($this->currentEvent());
    }

    public function resetEvent(): array {
        $ev = $this->currentEvent();
        if (!$ev) throw new GameError('이벤트가 없습니다.', 404);
        $this->tx(function () use ($ev) {
            foreach (['transactions', 'holdings', 'accounts'] as $t) $this->q("DELETE FROM $t WHERE event_id=?", [$ev['id']]);
            $this->q('DELETE FROM users WHERE event_id=?', [$ev['id']]);
            $this->q("UPDATE events SET status='ready', start_at=NULL, end_at=NULL, ended_at=NULL, frozen_prices=NULL WHERE id=?", [$ev['id']]);
        });
        return $this->publicEvent($this->currentEvent());
    }

    // ---------- 가격 ----------
    private function priceOf(array $ev, string $ticker): int {
        if ($ev['status'] === 'ended') return (int)($ev['frozen'][$ticker] ?? $this->market->priceAt($ticker, (int)$ev['ended_at']));
        return $this->market->priceAt($ticker, $this->now());
    }
    private function refTime(array $ev): int { return $ev['status'] === 'ended' ? (int)$ev['ended_at'] : $this->now(); }

    public function stocks(array $ev): array {
        $at = $this->refTime($ev);
        $out = [];
        foreach ($ev['tickers'] as $ticker) {
            $meta = Market::TICKERS[$ticker];
            $price = $this->priceOf($ev, $ticker);
            $prev = $this->market->prevClose($ticker, $at);
            $out[] = [
                'ticker' => $ticker, 'name' => $meta['name'], 'group' => $meta['group'], 'unit' => $meta['unit'], 'leverage' => (int)($meta['leverage'] ?? 1), 'sector' => $meta['sector'], 'info' => $meta['info'],
                'price' => $price, 'prev_close' => $prev, 'change' => $price - $prev, 'change_rate' => ($price - $prev) / $prev,
                'volume' => $this->market->todayVolume($ticker, $at),
            ];
        }
        return $out;
    }

    public function candles(?array $ev, string $ticker, string $range): array {
        if (!$ev || !in_array($ticker, $ev['tickers'], true)) throw new GameError('종목을 찾을 수 없습니다.', 404);
        $out = $this->market->candles($ticker, $range, $this->refTime($ev));
        if ($out === null) throw new GameError('지원하지 않는 기간입니다.');
        return $out;
    }

    // ---------- 참가 / 인증 ----------
    public function join($rawNickname): array {
        $ev = $this->currentEvent();
        if (!$ev) throw new GameError('진행 중인 이벤트가 없습니다. 너굴(운영자)에게 문의하세요.', 404);
        if ($ev['status'] === 'ended') throw new GameError('이미 종료된 이벤트입니다.', 409);
        if (!is_string($rawNickname)) throw new GameError('닉네임을 입력하세요.');
        $nickname = self::clean($rawNickname);
        if (self::len($nickname) < 1 || self::len($nickname) > self::NICK_MAX) throw new GameError('닉네임은 1~' . self::NICK_MAX . '자로 입력하세요.');
        if (!preg_match('/^[\p{L}\p{N}_\-. ]+$/u', $nickname)) throw new GameError('닉네임에는 한글, 영문, 숫자, 공백, _ - . 만 사용할 수 있습니다.');
        $token = bin2hex(random_bytes(24));
        return $this->tx(function () use ($ev, $nickname, $token) {
            do {
                $code = '';
                foreach (str_split(random_bytes(4)) as $ch) $code .= self::CODE_CHARS[ord($ch) % strlen(self::CODE_CHARS)];
            } while ($this->one('SELECT 1 FROM users WHERE event_id=? AND participant_code=?', [$ev['id'], $code]));
            $this->q('INSERT INTO users (event_id, nickname, participant_code, token_hash, created_at) VALUES (?,?,?,?,?)',
                [$ev['id'], $nickname, $code, hash('sha256', $token), $this->now()]);
            $uid = (int)$this->db->lastInsertId();
            $this->q('INSERT INTO accounts (user_id, event_id, cash, peak_total, low_total) VALUES (?,?,?,?,?)',
                [$uid, $ev['id'], $ev['initial_balance'], $ev['initial_balance'], $ev['initial_balance']]);
            return ['token' => $token, 'code' => $code, 'nickname' => $nickname];
        });
    }

    public function authenticate($token): ?array {
        if (!is_string($token) || strlen($token) < 16 || strlen($token) > 200) return null;
        $ev = $this->currentEvent();
        if (!$ev) return null;
        $u = $this->one('SELECT * FROM users WHERE token_hash=? AND event_id=?', [hash('sha256', $token), $ev['id']]);
        return $u ? ['user' => $u, 'ev' => $ev] : null;
    }

    // ---------- 평가 / 순위 ----------
    private function positionsFor(array $ev, int $userId): array {
        $out = [];
        foreach ($this->all('SELECT ticker, quantity, average_price, leverage FROM holdings WHERE user_id=? ORDER BY ticker', [$userId]) as $h) {
            $price = $this->priceOf($ev, $h['ticker']);
            $qty = (int)$h['quantity']; $avg = (float)$h['average_price']; $lev = (int)$h['leverage'];
            $value = self::equityOf($qty, $avg, $lev, $price);
            $margin = (int)round($qty * $avg / $lev); // 증거금(레버리지 1배면 매수금액)
            $out[] = [
                'ticker' => $h['ticker'], 'name' => self::name($h['ticker']), 'unit' => self::unit($h['ticker']), 'quantity' => $qty,
                'leverage' => $lev, 'margin' => $margin,
                'average_price' => (int)round($avg), 'price' => $price, 'value' => $value,
                'profit' => $value - $margin, 'return_rate' => $margin ? ($value - $margin) / $margin : 0.0, // 레버리지 상품은 증거금 대비 수익률
            ];
        }
        return $out;
    }

    private function account(array $ev, int $userId): array {
        $a = $this->one('SELECT cash, peak_total, low_total FROM accounts WHERE user_id=?', [$userId]);
        $positions = $this->positionsFor($ev, $userId);
        $stockValue = array_sum(array_column($positions, 'value'));
        $cash = (int)$a['cash'];
        $total = $cash + $stockValue;
        $init = (int)$ev['initial_balance'];
        return [
            'cash' => $cash, 'stock_value' => $stockValue, 'total' => $total, 'return_rate' => ($total - $init) / $init,
            'positions' => $positions, 'peak_total' => max((int)$a['peak_total'], $total), 'low_total' => min((int)$a['low_total'], $total),
        ];
    }

    // 순위표 계산. 진행 중에는 최고/최저 총자산을 갱신한다(리포트의 최대 평가손익용).
    // 레버리지 포지션이 증거금을 모두 잃었는지(평가액 0) 찾는다.
    private function findLiquidations(array $ev, ?int $userId = null): array {
        if ($ev['status'] !== 'running') return [];
        $sql = 'SELECT user_id, ticker, quantity, average_price, leverage FROM holdings WHERE event_id=? AND leverage>1' . ($userId !== null ? ' AND user_id=?' : '');
        $rows = $this->all($sql, $userId !== null ? [$ev['id'], $userId] : [$ev['id']]);
        return array_values(array_filter($rows, fn($h) => self::equityOf((int)$h['quantity'], (float)$h['average_price'], (int)$h['leverage'], $this->priceOf($ev, $h['ticker'])) === 0));
    }
    // 강제청산: 포지션을 지우고 증거금을 잃은 것으로 기록한다. (트랜잭션 안에서 호출)
    private function applyLiquidations(array $list, array $ev): void {
        foreach ($list as $h) {
            $margin = (int)round((int)$h['quantity'] * (float)$h['average_price'] / (int)$h['leverage']);
            $this->q('DELETE FROM holdings WHERE user_id=? AND ticker=?', [$h['user_id'], $h['ticker']]);
            $this->q('INSERT INTO transactions (user_id, event_id, ticker, type, quantity, price, reason, realized_pl, leverage, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
                [$h['user_id'], $ev['id'], $h['ticker'], 'sell', $h['quantity'], $this->priceOf($ev, $h['ticker']),
                 '강제청산: 가격이 반대로 크게 움직여 증거금이 모두 소진되었어요.', -$margin, $h['leverage'], $this->now()]);
        }
    }

    public function board(array $ev): array {
        if ($ev['status'] === 'running' && $this->findLiquidations($ev)) $this->tx(fn() => $this->applyLiquidations($this->findLiquidations($ev), $ev));
        $users = $this->all('SELECT u.id, u.nickname, u.participant_code AS code, u.created_at, a.cash, a.peak_total, a.low_total
            FROM users u JOIN accounts a ON a.user_id=u.id WHERE u.event_id=?', [$ev['id']]);
        $hold = [];
        foreach ($this->all('SELECT user_id, ticker, quantity, average_price, leverage FROM holdings WHERE event_id=?', [$ev['id']]) as $h) $hold[$h['user_id']][] = $h;
        $price = [];
        foreach ($ev['tickers'] as $t) $price[$t] = $this->priceOf($ev, $t);
        $init = (int)$ev['initial_balance'];
        $rows = [];
        foreach ($users as $u) {
            $stockValue = 0;
            foreach ($hold[$u['id']] ?? [] as $h) $stockValue += self::equityOf((int)$h['quantity'], (float)$h['average_price'], (int)$h['leverage'], (int)($price[$h['ticker']] ?? 0));
            $total = (int)$u['cash'] + $stockValue;
            $rows[] = [
                'user_id' => (int)$u['id'], 'nickname' => $u['nickname'], 'code' => $u['code'], 'created_at' => (int)$u['created_at'],
                'cash' => (int)$u['cash'], 'stock_value' => $stockValue, 'total' => $total, 'return_rate' => ($total - $init) / $init,
                'holdings_count' => count($hold[$u['id']] ?? []), '_peak' => (int)$u['peak_total'], '_low' => (int)$u['low_total'],
            ];
        }
        usort($rows, fn($a, $b) => [$b['total'], $a['created_at'], $a['user_id']] <=> [$a['total'], $b['created_at'], $b['user_id']]);
        foreach ($rows as $i => &$r) {
            $r['rank'] = ($i > 0 && $rows[$i - 1]['total'] === $r['total']) ? $rows[$i - 1]['rank'] : $i + 1;
        }
        unset($r);
        if ($ev['status'] === 'running') {
            foreach ($rows as $r) {
                if ($r['total'] > $r['_peak'] || $r['total'] < $r['_low']) {
                    $this->q('UPDATE accounts SET peak_total=?, low_total=? WHERE user_id=?', [max($r['_peak'], $r['total']), min($r['_low'], $r['total']), $r['user_id']]);
                }
            }
        }
        return array_map(function ($r) { unset($r['_peak'], $r['_low'], $r['created_at']); return $r; }, $rows);
    }

    private function reasonsVisible(array $ev, bool $isOwner, bool $isAdmin): bool {
        return $isAdmin || $isOwner || $ev['reason_reveal_mode'] === 'live' || $ev['status'] === 'ended';
    }
    private function publicBoardRow(array $r): array {
        return ['rank' => $r['rank'], 'nickname' => $r['nickname'], 'code' => $r['code'], 'total' => $r['total'], 'return_rate' => $r['return_rate']];
    }

    public function ranking(?array $ev): array {
        if (!$ev) return ['event' => null, 'rows' => [], 'reasons' => [], 'reasons_visible' => false];
        $rows = $this->board($ev);
        $visible = $this->reasonsVisible($ev, false, false);
        $reasons = [];
        if ($visible) {
            foreach ($this->all("SELECT t.ticker, t.quantity, t.price, t.reason, t.created_at, u.nickname, u.participant_code AS code
                FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.event_id=? AND t.type='buy' ORDER BY t.id DESC LIMIT 30", [$ev['id']]) as $r) {
                $r['name'] = self::name($r['ticker']); $r['unit'] = self::unit($r['ticker']);
                $reasons[] = $r;
            }
        }
        $avg = count($rows) ? array_sum(array_column($rows, 'return_rate')) / count($rows) : 0.0;
        return [
            'event' => $this->publicEvent($ev), 'rows' => array_map([$this, 'publicBoardRow'], $rows), 'average_return' => $avg,
            'reasons_visible' => $visible, 'reasons' => $reasons,
        ];
    }

    // ---------- 내 상태 ----------
    // 인증 시점 이후 이벤트 상태가 바뀌었을 수 있으므로 항상 최신 이벤트를 다시 읽는다.
    private function freshEv(array $auth): array {
        $ev = $this->currentEvent();
        if (!$ev || (int)$ev['id'] !== (int)$auth['ev']['id']) throw new GameError('이벤트가 변경되었습니다. 다시 접속해주세요.', 409);
        return $ev;
    }

    public function myState(array $auth): array {
        $user = $auth['user']; $ev = $this->freshEv($auth);
        $rows = $this->board($ev);
        $me = null;
        foreach ($rows as $r) if ($r['user_id'] === (int)$user['id']) { $me = $r; break; }
        return [
            'event' => $this->publicEvent($ev),
            'me' => array_merge(['nickname' => $user['nickname'], 'code' => $user['participant_code'], 'rank' => $me['rank'] ?? null, 'participants' => count($rows)],
                $this->account($ev, (int)$user['id'])),
            'stocks' => $this->stocks($ev),
        ];
    }

    public function myTransactions(array $auth, int $limit = 100): array {
        $out = [];
        foreach ($this->all('SELECT id, ticker, type, quantity, price, reason, realized_pl, created_at FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT ?',
            [$auth['user']['id'], $limit]) as $r) {
            $r['name'] = self::name($r['ticker']); $r['unit'] = self::unit($r['ticker']);
            $out[] = $r;
        }
        return $out;
    }

    // ---------- 가상 매수/매도 ----------
    private function validateReason($raw, bool $required): ?string {
        if ($raw === null || $raw === '') {
            if ($required) throw new GameError('이유를 ' . self::REASON_MIN . '자 이상 적어주세요.');
            return null;
        }
        if (!is_string($raw)) throw new GameError('이유 형식이 올바르지 않습니다.');
        $r = self::clean($raw);
        if ($r === '' && !$required) return null;
        if (self::len($r) < self::REASON_MIN) throw new GameError('이유를 ' . self::REASON_MIN . '자 이상 적어주세요. (지금 ' . self::len($r) . '자)');
        if (self::len($r) > self::REASON_MAX) throw new GameError('이유는 ' . self::REASON_MAX . '자 이하로 적어주세요.');
        return $r;
    }

    public function trade(array $auth, array $in = []): array {
        $user = $auth['user'];
        return $this->tx(function () use ($auth, $user, $in) {
            $ev = $this->currentEvent(); // 트랜잭션 안에서 최신 상태 확인
            if (!$ev || (int)$ev['id'] !== (int)$auth['ev']['id']) throw new GameError('이벤트가 변경되었습니다. 다시 접속해주세요.', 409);
            if ($ev['status'] === 'ready') throw new GameError('아직 게임이 시작되지 않았습니다. 너굴의 시작 신호를 기다려주세요.', 409);
            if ($ev['status'] === 'ended') throw new GameError('게임이 종료되어 더 이상 거래할 수 없습니다.', 409);
            $ticker = $in['ticker'] ?? null; $side = $in['side'] ?? null;
            if (!is_string($ticker) || !in_array($ticker, $ev['tickers'], true)) throw new GameError('이 게임에서 거래할 수 없는 종목입니다.');
            if ($side !== 'buy' && $side !== 'sell') throw new GameError('거래 유형이 올바르지 않습니다.');
            $qty = array_key_exists('quantity', $in) ? self::toInt($in['quantity']) : null;
            if ($qty === null || $qty < 1 || $qty > self::MAX_QTY) throw new GameError('수량은 1 ~ ' . number_format(self::MAX_QTY) . ' 사이의 정수여야 합니다.');
            $reason = $this->validateReason($in['reason'] ?? null, $side === 'buy' || $ev['sell_reason_required']);

            // 증거금이 모두 소진된 레버리지 포지션은 먼저 강제청산한다.
            $this->applyLiquidations($this->findLiquidations($ev, (int)$user['id']), $ev);

            // 체결가는 항상 서버가 정한다. 클라이언트가 보낸 가격은 사용하지 않는다.
            $price = $this->priceOf($ev, $ticker);
            $amount = $price * $qty; // 명목 거래금액
            $lev = self::levOf($ticker);
            $uid = (int)$user['id'];
            $acc = $this->one('SELECT cash FROM accounts WHERE user_id=?', [$uid]);
            $h = $this->one('SELECT quantity, average_price, leverage FROM holdings WHERE user_id=? AND ticker=?', [$uid, $ticker]);
            $realized = null;
            if ($side === 'buy') {
                if ($h && (int)$h['leverage'] !== $lev) throw new GameError('이 종목은 거래 방식이 바뀌었어요. 기존 보유를 먼저 매도해주세요.', 409);
                $margin = (int)ceil($amount / $lev); // 필요한 증거금(레버리지 1배면 매수금액)
                if ($margin > (int)$acc['cash']) throw new GameError($lev > 1 ? '가상현금(증거금)이 부족합니다.' : '가상현금이 부족합니다.');
                $cashChange = -$margin;
                $this->q('UPDATE accounts SET cash = cash - ? WHERE user_id=?', [$margin, $uid]);
                if ($h) {
                    $nq = (int)$h['quantity'] + $qty;
                    $avg = ((int)$h['quantity'] * (float)$h['average_price'] + $amount) / $nq;
                    $this->q('UPDATE holdings SET quantity=?, average_price=? WHERE user_id=? AND ticker=?', [$nq, $avg, $uid, $ticker]);
                } else {
                    $this->q('INSERT INTO holdings (user_id, event_id, ticker, quantity, average_price, leverage) VALUES (?,?,?,?,?,?)', [$uid, $ev['id'], $ticker, $qty, $price, $lev]);
                }
            } else {
                if (!$h || (int)$h['quantity'] < $qty) throw new GameError('보유한 수량보다 많이 매도할 수 없습니다.');
                $hl = (int)$h['leverage'];
                $marginPart = $qty * (float)$h['average_price'] / $hl;
                $proceeds = self::equityOf($qty, (float)$h['average_price'], $hl, $price); // 정산금 = 증거금 + 손익 (0 미만이면 0)
                $realized = $proceeds - (int)round($marginPart);
                $cashChange = $proceeds;
                $this->q('UPDATE accounts SET cash = cash + ? WHERE user_id=?', [$proceeds, $uid]);
                if ((int)$h['quantity'] === $qty) $this->q('DELETE FROM holdings WHERE user_id=? AND ticker=?', [$uid, $ticker]);
                else $this->q('UPDATE holdings SET quantity = quantity - ? WHERE user_id=? AND ticker=?', [$qty, $uid, $ticker]);
            }
            $txLev = $h ? (int)$h['leverage'] : $lev;
            $this->q('INSERT INTO transactions (user_id, event_id, ticker, type, quantity, price, reason, realized_pl, leverage, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
                [$uid, $ev['id'], $ticker, $side, $qty, $price, $reason, $realized, $txLev, $this->now()]);
            return ['id' => (int)$this->db->lastInsertId(), 'ticker' => $ticker, 'name' => self::name($ticker), 'unit' => self::unit($ticker), 'type' => $side,
                'quantity' => $qty, 'price' => $price, 'amount' => $amount, 'leverage' => $txLev, 'cash_change' => $cashChange, 'realized_pl' => $realized];
        });
    }

    // ---------- 비교 ----------
    public function compare(array $auth, string $code): array {
        $user = $auth['user']; $ev = $this->freshEv($auth);
        $rows = $this->board($ev);
        $them = null; $meRow = null;
        foreach ($rows as $r) {
            if ($r['code'] === strtoupper($code)) $them = $r;
            if ($r['user_id'] === (int)$user['id']) $meRow = $r;
        }
        if (!$them) throw new GameError('참가자를 찾을 수 없습니다.', 404);
        $isSelf = $them['user_id'] === (int)$user['id'];
        $detail = function (array $row, bool $owner) use ($ev) {
            $visible = $this->reasonsVisible($ev, $owner, false);
            $base = ['nickname' => $row['nickname'], 'code' => $row['code'], 'rank' => $row['rank'], 'total' => $row['total'],
                'return_rate' => $row['return_rate'], 'details_visible' => $visible];
            if (!$visible) return $base;
            $reasons = [];
            foreach ($this->all('SELECT ticker, type, quantity, price, reason, created_at FROM transactions WHERE user_id=? AND reason IS NOT NULL ORDER BY id DESC LIMIT 50', [$row['user_id']]) as $r) {
                $r['name'] = self::name($r['ticker']); $r['unit'] = self::unit($r['ticker']);
                $reasons[] = $r;
            }
            return $base + ['cash' => $row['cash'], 'positions' => $this->positionsFor($ev, $row['user_id']), 'reasons' => $reasons];
        };
        return ['me' => $detail($meRow, true), 'other' => $isSelf ? null : $detail($them, false),
            'reveal_mode' => $ev['reason_reveal_mode'], 'ended' => $ev['status'] === 'ended'];
    }

    // ---------- 투자 리포트 ----------
    public function report(array $auth): array {
        $user = $auth['user']; $ev = $this->freshEv($auth);
        $rows = $this->board($ev);
        $me = null;
        foreach ($rows as $r) if ($r['user_id'] === (int)$user['id']) { $me = $r; break; }
        $acc = $this->account($ev, (int)$user['id']);
        $txs = $this->all('SELECT ticker, type, quantity, price, reason, realized_pl, created_at FROM transactions WHERE user_id=? ORDER BY id', [$user['id']]);
        $counts = [];
        foreach ($txs as $t) $counts[$t['ticker']] = ($counts[$t['ticker']] ?? 0) + 1;
        arsort($counts);
        $topTicker = $counts ? array_key_first($counts) : null;
        $total = $acc['total'];
        $weights = [];
        foreach ($acc['positions'] as $p) $weights[] = ['ticker' => $p['ticker'], 'name' => $p['name'], 'weight' => $total ? $p['value'] / $total : 0.0];
        $weights[] = ['ticker' => 'CASH', 'name' => '가상현금', 'weight' => $total ? $acc['cash'] / $total : 0.0];
        $stockWeights = array_map(fn($p) => $acc['stock_value'] ? $p['value'] / $acc['stock_value'] : 0.0, $acc['positions']);
        $maxStockWeight = $stockWeights ? max($stockWeights) : 0.0;
        $nPos = count($acc['positions']);

        // 교육용 해설: 특정 전략을 정답으로 제시하지 않고 관찰 결과만 설명한다.
        $insights = [];
        if ($nPos === 0) $insights[] = '현재 보유한 주식이 없어 자산이 모두 가상현금입니다. 현금만 들고 있으면 가격 변동에 따른 손익은 없지만, 다른 선택지와 비교해볼 수 있습니다.';
        elseif ($nPos === 1) $insights[] = '이번 게임에서는 한 종목에 주식 자산이 집중되었습니다. 실제 투자에서도 자산을 여러 곳에 나누는 방식이 위험 관리에 활용될 수 있습니다.';
        elseif ($maxStockWeight >= 0.7) $insights[] = '여러 종목을 보유했지만 한 종목의 비중이 큽니다. 종목 수와 비중은 다른 개념이라는 점을 확인해보세요.';
        else $insights[] = "{$nPos}개 종목에 비교적 고르게 나누어 보유했습니다. 나눠 담으면 한 종목의 가격 변동이 전체 자산에 미치는 영향이 줄어드는 경향이 있습니다.";
        $cashShare = $total ? $acc['cash'] / $total : 0;
        if ($cashShare >= 0.5 && $nPos > 0) $insights[] = '자산의 절반 이상을 현금으로 보유했습니다. 현금 비중은 변동에 덜 흔들리는 대신 가격이 오를 때의 변화도 함께 줄어듭니다.';
        if (count($txs) >= 20) $insights[] = '거래 횟수가 많았습니다. 자주 사고파는 것과 한 번 정하고 지켜보는 것의 결과를 비교해보세요.';
        $insights[] = '이 결과는 짧은 시간 동안의 가상 게임 결과이며, 실제 투자 성과나 미래 수익을 의미하지 않습니다. 특정한 투자 방법이 정답이라는 뜻도 아닙니다.';

        $sells = array_values(array_filter($txs, fn($t) => $t['type'] === 'sell' && $t['realized_pl'] !== null));
        $unreal = array_column($acc['positions'], 'profit');
        $reasons = [];
        foreach (array_reverse($txs) as $t) {
            if ($t['reason']) { $t['name'] = self::name($t['ticker']); $t['unit'] = self::unit($t['ticker']); $reasons[] = $t; }
        }
        return [
            'event' => $this->publicEvent($ev), 'is_final' => $ev['status'] === 'ended',
            'nickname' => $user['nickname'], 'code' => $user['participant_code'],
            'rank' => $me['rank'] ?? null, 'participants' => count($rows),
            'total' => $total, 'return_rate' => $acc['return_rate'], 'cash' => $acc['cash'], 'stock_value' => $acc['stock_value'],
            'trade_count' => count($txs), 'buy_count' => count(array_filter($txs, fn($t) => $t['type'] === 'buy')), 'sell_count' => count($sells),
            'most_traded' => $topTicker !== null ? ['ticker' => $topTicker, 'name' => self::name($topTicker), 'count' => $counts[$topTicker]] : null,
            'weights' => $weights, 'max_total' => $acc['peak_total'], 'min_total' => $acc['low_total'],
            'max_unrealized_gain' => $unreal ? max(0, ...$unreal) : 0,
            'max_unrealized_loss' => $unreal ? min(0, ...$unreal) : 0,
            'best_realized' => $sells ? max(array_column($sells, 'realized_pl')) : null,
            'worst_realized' => $sells ? min(array_column($sells, 'realized_pl')) : null,
            'reasons' => $reasons, 'insights' => $insights,
        ];
    }

    // ---------- 관리자 ----------
    public function adminOverview(): array {
        $ev = $this->currentEvent();
        if (!$ev) return ['event' => null];
        $rows = $this->board($ev);
        $perTicker = [];
        $tradeCount = 0;
        foreach ($this->all('SELECT ticker, type, quantity, price FROM transactions WHERE event_id=?', [$ev['id']]) as $t) {
            $tradeCount++;
            $e = $perTicker[$t['ticker']] ?? ['ticker' => $t['ticker'], 'name' => self::name($t['ticker']), 'buy_qty' => 0, 'sell_qty' => 0, 'amount' => 0, 'count' => 0];
            $e[$t['type'] === 'buy' ? 'buy_qty' : 'sell_qty'] += (int)$t['quantity'];
            $e['amount'] += (int)$t['quantity'] * (int)$t['price'];
            $e['count']++;
            $perTicker[$t['ticker']] = $e;
        }
        $perTicker = array_values($perTicker);
        usort($perTicker, fn($a, $b) => $b['count'] <=> $a['count']);
        $tradeCounts = [];
        foreach ($this->all('SELECT user_id, COUNT(*) AS n FROM transactions WHERE event_id=? GROUP BY user_id', [$ev['id']]) as $r) $tradeCounts[$r['user_id']] = (int)$r['n'];
        $elapsed = $ev['start_at'] ? ($ev['status'] === 'ended' ? (int)$ev['ended_at'] : $this->now()) - (int)$ev['start_at'] : 0;
        return [
            'event' => $this->publicEvent($ev),
            'stats' => [
                'participants' => count($rows),
                'leader' => $rows ? $this->publicBoardRow($rows[0]) : null,
                'average_return' => $rows ? array_sum(array_column($rows, 'return_rate')) / count($rows) : 0.0,
                'trade_count' => $tradeCount, 'per_ticker' => $perTicker, 'elapsed_ms' => $elapsed,
            ],
            'board' => array_map(fn($r) => $this->publicBoardRow($r) + ['cash' => $r['cash'], 'stock_value' => $r['stock_value'], 'trades' => $tradeCounts[$r['user_id']] ?? 0], $rows),
            'stocks' => $this->stocks($ev),
        ];
    }

    public function adminTransactions(int $limit = 500): array {
        $ev = $this->currentEvent();
        if (!$ev) return [];
        $out = [];
        foreach ($this->all('SELECT t.id, t.ticker, t.type, t.quantity, t.price, t.reason, t.realized_pl, t.created_at, u.nickname, u.participant_code AS code
            FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.event_id=? ORDER BY t.id DESC LIMIT ?', [$ev['id'], $limit]) as $r) {
            $r['name'] = self::name($r['ticker']); $r['unit'] = self::unit($r['ticker']);
            $out[] = $r;
        }
        return $out;
    }
}
