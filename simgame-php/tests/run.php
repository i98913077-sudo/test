<?php
declare(strict_types=1);
// 실행: php tests/run.php   (게임 규칙 + 실제 PHP 서버를 띄워 HTTP 계층까지 검증)
define('SIMGAME', 1);
ini_set('serialize_precision', '-1');
require __DIR__ . '/../lib/util.php';
require __DIR__ . '/../lib/market.php';
require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/game.php';

$passed = 0; $failed = 0; $current = '';
function t(string $name, callable $fn): void {
    global $passed, $failed, $current;
    $current = $name;
    try { $fn(); $passed++; echo "ok   - $name\n"; }
    catch (Throwable $e) { $failed++; echo "FAIL - $name\n       " . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine() . "\n"; }
}
function check($cond, string $msg = 'assertion failed'): void { if (!$cond) throw new RuntimeException($msg); }
function eq($a, $b, string $msg = ''): void { if ($a !== $b) throw new RuntimeException(($msg ? "$msg: " : '') . 'expected ' . json_encode($b) . ' got ' . json_encode($a)); }
function fails(callable $fn, ?int $status = null, string $msg = ''): void {
    try { $fn(); } catch (GameError $e) { if ($status !== null) eq($e->status, $status, $msg ?: 'status'); return; }
    throw new RuntimeException('GameError가 발생해야 함' . ($msg ? " ($msg)" : ''));
}
function tmpdir(): string { $d = sys_get_temp_dir() . '/simgame_' . bin2hex(random_bytes(6)); mkdir($d); return $d; }
function rmrf(string $d): void { foreach (glob("$d/*") ?: [] as $f) is_dir($f) ? rmrf($f) : unlink($f); @rmdir($d); }

function fresh(float $vol = 1.0): array {
    $dir = tmpdir();
    $clock = new class { public int $t; };
    $clock->t = gmmktime(3, 0, 0, 10, 8, 2026) * 1000;
    $db = sim_open_db($dir);
    $game = new Game($db, new Market(sim_price_seed($db), $vol), fn() => $clock->t);
    return [$game, $clock, $dir];
}
function started(array $in = [], float $vol = 1.0): array {
    [$g, $c, $d] = fresh($vol);
    $g->createEvent($in);
    $g->startEvent();
    return [$g, $c, $d];
}
function player(Game $g, string $nick = 'A'): array { $j = $g->join($nick); return [$g->authenticate($j['token']), $j]; }
const REASON = '반도체 업황이 좋아질 것 같다고 생각해서 선택했어요';

echo "── 게임 규칙 ──\n";

t('이벤트 기본값은 1억 P이고 시작 전에는 거래할 수 없다', function () {
    [$g, $c, $d] = fresh();
    $ev = $g->createEvent(['name' => '테스트']);
    eq($ev['initial_balance'], 100000000); eq($ev['status'], 'ready');
    [$a] = player($g);
    fails(fn() => $g->trade($a, ['ticker' => '005930', 'side' => 'buy', 'quantity' => 1, 'reason' => REASON]), 409);
    rmrf($d);
});

t('매수 이유는 필수이며 서버에서 검증한다', function () {
    [$g, $c, $d] = started();
    [$a] = player($g);
    $buy = fn(array $x) => fn() => $g->trade($a, $x + ['ticker' => '005930', 'side' => 'buy', 'quantity' => 1]);
    fails($buy([]), 400, '이유 없음');
    fails($buy(['reason' => '']), 400, '빈 이유');
    fails($buy(['reason' => '   짧음   ']), 400, '10자 미만');
    fails($buy(['reason' => str_repeat('x', 201)]), 400, '200자 초과');
    fails($buy(['reason' => 123]), 400, '숫자');
    fails($buy(['reason' => "\u{200b}\u{200b}\u{200b}\u{200b}\u{200b}\u{200b}\u{200b}\u{200b}\u{200b}\u{200b}\u{200b}\u{200b}"]), 400, '제로폭 문자로 길이 우회');
    $r = $g->trade($a, ['ticker' => '005930', 'side' => 'buy', 'quantity' => 1, 'reason' => REASON]);
    eq($r['type'], 'buy');
    rmrf($d);
});

t('체결가는 서버가 정하며 클라이언트가 보낸 가격/현금은 무시된다', function () {
    [$g, $c, $d] = started();
    [$a] = player($g);
    $st = $g->myState($a);
    $price = array_values(array_filter($st['stocks'], fn($s) => $s['ticker'] === '005930'))[0]['price'];
    $r = $g->trade($a, ['ticker' => '005930', 'side' => 'buy', 'quantity' => 10, 'reason' => REASON, 'price' => 1, 'cash' => 9e15, 'total' => 9e15]);
    eq($r['price'], $price);
    eq($g->myState($a)['me']['cash'], 100000000 - $price * 10);
    rmrf($d);
});

t('수량·현금·보유수량 검증 (음수, 소수, 문자열, 초과 매수/매도, 공매도)', function () {
    [$g, $c, $d] = started();
    [$a] = player($g);
    foreach ([0, -5, 1.5, '3', null, 1e12, NAN] as $q) {
        fails(fn() => $g->trade($a, ['ticker' => '005930', 'side' => 'buy', 'quantity' => $q, 'reason' => REASON]), 400, 'qty=' . var_export($q, true));
    }
    fails(fn() => $g->trade($a, ['ticker' => '005930', 'side' => 'buy', 'quantity' => 999999, 'reason' => REASON]), 400, '현금 부족');
    fails(fn() => $g->trade($a, ['ticker' => '005930', 'side' => 'sell', 'quantity' => 1]), 400, '미보유 매도');
    fails(fn() => $g->trade($a, ['ticker' => '005930', 'side' => 'hold', 'quantity' => 1, 'reason' => REASON]), 400, '잘못된 구분');
    fails(fn() => $g->trade($a, ['ticker' => '999999', 'side' => 'buy', 'quantity' => 1, 'reason' => REASON]), 400, '없는 종목');
    fails(fn() => $g->trade($a, ['ticker' => ['x'], 'side' => 'buy', 'quantity' => 1, 'reason' => REASON]), 400, '배열 종목');
    eq($g->myState($a)['me']['cash'], 100000000, '실패한 요청은 상태를 바꾸지 않는다');
    rmrf($d);
});

t('매도: 평단, 실현손익, 보유 감소, 거래기록, 손익 합 일치', function () {
    [$g, $c, $d] = started();
    [$a] = player($g);
    $b1 = $g->trade($a, ['ticker' => '005930', 'side' => 'buy', 'quantity' => 10, 'reason' => REASON]);
    $c->t += 30 * 60000;
    $b2 = $g->trade($a, ['ticker' => '005930', 'side' => 'buy', 'quantity' => 10, 'reason' => REASON]);
    $pos = $g->myState($a)['me']['positions'][0];
    eq($pos['quantity'], 20);
    eq($pos['average_price'], (int)round(($b1['price'] + $b2['price']) / 2));
    $c->t += 30 * 60000;
    $avg = ($b1['price'] + $b2['price']) / 2;
    $s = $g->trade($a, ['ticker' => '005930', 'side' => 'sell', 'quantity' => 5]);
    eq($s['realized_pl'], (int)round(($s['price'] - $avg) * 5));
    eq($g->myState($a)['me']['positions'][0]['quantity'], 15);
    $g->trade($a, ['ticker' => '005930', 'side' => 'sell', 'quantity' => 15]);
    $st = $g->myState($a);
    eq(count($st['me']['positions']), 0);
    $tx = $g->myTransactions($a);
    eq(count($tx), 4);
    $realized = array_sum(array_map(fn($x) => (int)($x['realized_pl'] ?? 0), $tx));
    check(abs($st['me']['total'] - 100000000 - $realized) <= 20, '총자산 변화 ≈ 실현손익 합');
    rmrf($d);
});

t('매도 이유를 필수로 설정하면 검증한다', function () {
    [$g, $c, $d] = started(['sell_reason_required' => true]);
    [$a] = player($g);
    $g->trade($a, ['ticker' => '005930', 'side' => 'buy', 'quantity' => 2, 'reason' => REASON]);
    fails(fn() => $g->trade($a, ['ticker' => '005930', 'side' => 'sell', 'quantity' => 1]), 400);
    $g->trade($a, ['ticker' => '005930', 'side' => 'sell', 'quantity' => 1, 'reason' => REASON]);
    rmrf($d);
});

t('인증: 빈/위조/짧은 토큰은 null', function () {
    [$g, $c, $d] = started();
    check($g->authenticate('') === null && $g->authenticate(str_repeat('f', 48)) === null && $g->authenticate('abc') === null);
    check($g->authenticate(null) === null);
    rmrf($d);
});

t('닉네임 검증과 중복 닉네임 허용(코드로 구분)', function () {
    [$g, $c, $d] = fresh();
    $g->createEvent();
    foreach (['', '   ', str_repeat('a', 13), '<script>', 'a"b', 123, null] as $n) fails(fn() => $g->join($n), 400, var_export($n, true));
    $a = $g->join('같은이름'); $b = $g->join('같은이름');
    check($a['code'] !== $b['code']);
    check(preg_match('/^[A-Z2-9]{4}$/', $a['code']) === 1);
    rmrf($d);
});

t('순위: 총자산 기준 정렬, 동점은 같은 순위, 내부 정보 미노출', function () {
    [$g, $c, $d] = started();
    [$a, $ja] = player($g, 'A'); [$b] = player($g, 'B'); player($g, 'C');
    eq(array_column($g->ranking($g->currentEvent())['rows'], 'rank'), [1, 1, 1]);
    $g->trade($a, ['ticker' => '000660', 'side' => 'buy', 'quantity' => 100, 'reason' => REASON]);
    $g->trade($b, ['ticker' => '035720', 'side' => 'buy', 'quantity' => 100, 'reason' => REASON]);
    $c->t += 3 * 3600 * 1000;
    $rk = $g->ranking($g->currentEvent());
    $totals = array_column($rk['rows'], 'total');
    $sorted = $totals; rsort($sorted);
    eq($totals, $sorted);
    foreach ($rk['rows'] as $r) check(!isset($r['user_id']) && !isset($r['token']), '내부 ID 노출');
    $mine = array_values(array_filter($rk['rows'], fn($r) => $r['code'] === $ja['code']))[0];
    eq($g->myState($a)['me']['rank'], $mine['rank']);
    rmrf($d);
});

t('매수 이유 공개: 종료 전 타인에게 숨기고, 종료 후 공개 / 실시간 모드', function () {
    [$g, $c, $d] = started(['reason_reveal_mode' => 'after_end']);
    [$a, $ja] = player($g, 'A'); [$b] = player($g, 'B');
    $g->trade($a, ['ticker' => '005930', 'side' => 'buy', 'quantity' => 3, 'reason' => '비밀 이유입니다 비밀 이유']);
    $cmp = $g->compare($b, $ja['code']);
    eq($cmp['other']['details_visible'], false);
    check(!str_contains(json_encode($cmp, JSON_UNESCAPED_UNICODE), '비밀 이유'), '종료 전 타인 이유 노출');
    check(!isset($cmp['other']['positions']), '종료 전 타인 보유종목 노출');
    $rk = $g->ranking($g->currentEvent());
    eq($rk['reasons_visible'], false);
    check(!str_contains(json_encode($rk, JSON_UNESCAPED_UNICODE), '비밀 이유'));
    eq($g->compare($a, $ja['code'])['me']['details_visible'], true, '내 이유는 항상 보임');
    $g->endEvent();
    $cmp = $g->compare($b, $ja['code']);
    eq($cmp['other']['details_visible'], true);
    check(str_contains(json_encode($cmp, JSON_UNESCAPED_UNICODE), '비밀 이유'));
    eq($g->ranking($g->currentEvent())['reasons'][0]['nickname'], 'A');
    rmrf($d);
});

t('실시간 공개 모드에서는 종료 전에도 이유가 보인다', function () {
    [$g, $c, $d] = started(['reason_reveal_mode' => 'live']);
    [$a, $ja] = player($g, 'A'); [$b] = player($g, 'B');
    $g->trade($a, ['ticker' => '005930', 'side' => 'buy', 'quantity' => 3, 'reason' => '실시간 공개 이유입니다']);
    check(str_contains(json_encode($g->compare($b, $ja['code']), JSON_UNESCAPED_UNICODE), '실시간 공개 이유'));
    rmrf($d);
});

t('종료 시각이 지나면 자동 종료되고, 종료 후 총자산은 고정되며 새 참가·거래는 막힌다', function () {
    [$g, $c, $d] = started(['duration_min' => 30]);
    $j = $g->join('A'); $a = $g->authenticate($j['token']);
    $g->trade($a, ['ticker' => '005930', 'side' => 'buy', 'quantity' => 10, 'reason' => REASON]);
    $c->t += 31 * 60000;
    fails(fn() => $g->trade($a, ['ticker' => '005930', 'side' => 'sell', 'quantity' => 1]), 409, '종료 후 거래');
    $a = $g->authenticate($j['token']);
    $s1 = $g->myState($a);
    eq($s1['event']['status'], 'ended');
    $c->t += 5 * 3600 * 1000;
    $s2 = $g->myState($g->authenticate($j['token']));
    eq($s2['me']['total'], $s1['me']['total']);
    fails(fn() => $g->join('Late'), 409);
    rmrf($d);
});

t('시작 자금·종목은 참가자가 있으면 변경 불가, 초기화하면 참가자가 사라진다', function () {
    [$g, $c, $d] = fresh();
    $g->createEvent(['initial_balance' => 50000000, 'tickers' => ['005930', '000660']]);
    $j = $g->join('A');
    fails(fn() => $g->updateEvent(['initial_balance' => 10001]), 409);
    fails(fn() => $g->updateEvent(['tickers' => ['005930']]), 409);
    $st = $g->myState($g->authenticate($j['token']));
    eq($st['me']['cash'], 50000000); eq(count($st['stocks']), 2);
    eq($g->resetEvent()['participants'], 0);
    check($g->authenticate($j['token']) === null, '초기화 후 기존 토큰 무효');
    eq($g->updateEvent(['initial_balance' => 20000000])['initial_balance'], 20000000);
    rmrf($d);
});

t('이미 만든 이벤트에도 종목을 추가할 수 있고, 참가자가 있으면 빼는 것만 막는다', function () {
    [$g, $c, $d] = started(['tickers' => ['005930', '000660']]);
    [$a] = player($g);
    $g->trade($a, ['ticker' => '005930', 'side' => 'buy', 'quantity' => 2, 'reason' => REASON]);
    eq(count($g->myState($a)['stocks']), 2);
    $g->updateEvent(['tickers' => ['005930', '000660', 'NVDA', 'WTI', 'K200F']]);
    $st = $g->myState($a);
    eq(array_column($st['stocks'], 'ticker'), ['005930', '000660', 'NVDA', 'K200F', 'WTI'], '표 순서대로 정렬');
    eq($st['me']['positions'][0]['quantity'], 2, '기존 보유 유지');
    $g->trade($a, ['ticker' => 'NVDA', 'side' => 'buy', 'quantity' => 1, 'reason' => REASON]);
    fails(fn() => $g->updateEvent(['tickers' => ['000660', 'NVDA']]), 409);
    eq(count($g->myState($a)['stocks']), 5);
    rmrf($d);
});

t('선물 레버리지 10배: 증거금만 내고, 평가액=증거금+손익(10배), 총자산 정합성, 매도 정산', function () {
    [$g, $c, $d] = started(['tickers' => ['K200F', '005930']]);
    [$a] = player($g);
    $k = array_values(array_filter($g->myState($a)['stocks'], fn($x) => $x['ticker'] === 'K200F'))[0];
    eq($k['leverage'], 10);
    $qty = intdiv(200000000, $k['price']);
    check($qty * $k['price'] > 100000000, '명목금액이 현금보다 큼');
    $b = $g->trade($a, ['ticker' => 'K200F', 'side' => 'buy', 'quantity' => $qty, 'reason' => REASON]);
    $margin = (int)ceil($b['price'] * $qty / 10);
    eq($b['leverage'], 10); eq($b['cash_change'], -$margin);
    $st = $g->myState($a);
    eq($st['me']['cash'], 100000000 - $margin);
    eq($st['me']['positions'][0]['margin'], (int)round($qty * $b['price'] / 10));
    $c->t += 3 * 3600 * 1000;
    $s1 = $g->myState($a);
    $pos = $s1['me']['positions'][0] ?? null;
    check($pos !== null, '3시간 만에 강제청산될 만큼 변동하지 않는다');
    {
        eq($pos['value'], (int)max(0, round($qty * ($pos['price'] - $pos['average_price'] * 0.9))));
        eq($pos['profit'], $pos['value'] - $pos['margin']);
        check(abs($pos['return_rate'] - 10 * ($pos['price'] / $pos['average_price'] - 1)) < 1e-3, '증거금 대비 수익률 = 가격 변동률 × 10');
        eq($s1['me']['total'], $s1['me']['cash'] + $s1['me']['stock_value']);
        $cashBefore = $s1['me']['cash'];
        $sell = $g->trade($a, ['ticker' => 'K200F', 'side' => 'sell', 'quantity' => $qty]);
        eq($sell['cash_change'], $pos['value']);
        eq($g->myState($a)['me']['cash'], $cashBefore + $pos['value']);
        eq($sell['realized_pl'], $pos['value'] - $pos['margin']);
        eq(count($g->myState($a)['me']['positions']), 0);
    }
    fails(fn() => $g->trade($a, ['ticker' => 'K200F', 'side' => 'buy', 'quantity' => intdiv(1500000000, $k['price']), 'reason' => REASON]), 400);
    rmrf($d);
});

class FakeMarket extends Market {
    public int $p = 35000;
    public function priceAt(string $ticker, int $ms): int { return $this->p; }
    public function prevClose(string $ticker, int $ms): int { return 35000; }
    public function todayVolume(string $ticker, int $ms): int { return 1; }
}

t('강제청산(결정적 시나리오): 경계값, 급락 시 손실 한정, 이익 정산, 청산 후 거래 오류에도 기록 유지', function () {
    $dir = tmpdir();
    $db = sim_open_db($dir);
    $fake = new FakeMarket(1);
    $now = gmmktime(3, 0, 0, 10, 8, 2026) * 1000;
    $g = new Game($db, $fake, fn() => $now);
    $g->createEvent(['tickers' => ['K200F']]);
    $g->startEvent();
    $login = fn() => $g->authenticate($g->join('A')['token']);
    $buy = fn($a, int $qty = 1000) => $g->trade($a, ['ticker' => 'K200F', 'side' => 'buy', 'quantity' => $qty, 'reason' => REASON]);
    $OPEN = 100000000 - 3500000; // 1000계약 × 35,000 ÷ 10배

    // 1) 평균가 35,000 → 청산선은 31,500 (−10%)
    $a = $login();
    $buy($a);
    eq($g->myState($a)['me']['cash'], $OPEN);
    $fake->p = 31600; // −9.71%: 아직 살아있다
    $me = $g->myState($a)['me'];
    eq(count($me['positions']), 1);
    eq($me['positions'][0]['value'], 100000);
    eq($me['positions'][0]['profit'], 100000 - 3500000);
    check(abs($me['positions'][0]['return_rate'] - (100000 - 3500000) / 3500000) < 1e-9);
    eq($me['total'], $OPEN + 100000);
    $fake->p = 31500; // −10%: 증거금 소진 → 강제청산
    $me = $g->myState($a)['me'];
    eq(count($me['positions']), 0);
    eq($me['cash'], $OPEN, '증거금만 잃고 현금은 그대로'); eq($me['total'], $OPEN);
    $liq = array_values(array_filter($g->myTransactions($a), fn($x) => $x['type'] === 'sell'))[0];
    check(str_contains($liq['reason'], '강제청산'));
    eq((int)$liq['realized_pl'], -3500000);

    // 2) 급락(−43%): 손실은 증거금으로 한정, 현금이 음수가 되지 않는다
    $fake->p = 35000;
    $buy($a);
    $fake->p = 20000;
    $me = $g->myState($a)['me'];
    eq(count($me['positions']), 0); eq($me['cash'], $OPEN - 3500000);
    check($me['cash'] >= 0 && $me['total'] === $me['cash']);

    // 3) 이익: +5% → 증거금 대비 +50%, 매도하면 정산금이 현금으로
    $fake->p = 35000;
    $buy($a);
    $cashBefore = $g->myState($a)['me']['cash'];
    $fake->p = 36750;
    $me = $g->myState($a)['me'];
    eq($me['positions'][0]['value'], 5250000);
    check(abs($me['positions'][0]['return_rate'] - 0.5) < 1e-9);
    $sold = $g->trade($a, ['ticker' => 'K200F', 'side' => 'sell', 'quantity' => 1000]);
    eq($sold['cash_change'], 5250000); eq($sold['realized_pl'], 1750000);
    eq($g->myState($a)['me']['cash'], $cashBefore + 5250000);

    // 4) 청산된 뒤 매도를 시도하면 오류지만, 청산 기록은 되돌려지지 않는다
    $fake->p = 35000;
    $buy($a);
    $fake->p = 30000;
    fails(fn() => $g->trade($a, ['ticker' => 'K200F', 'side' => 'sell', 'quantity' => 1000]), 400);
    eq(count($g->myState($a)['me']['positions']), 0);
    $n = count(array_filter($g->myTransactions($a), fn($x) => str_contains((string)$x['reason'], '강제청산')));
    eq($n, 3, '청산 기록 3건이 모두 남아 있다');

    // 5) 레버리지 1배 종목은 청산되지 않는다
    $dir2 = tmpdir(); $db2 = sim_open_db($dir2); $fake2 = new FakeMarket(1);
    $g2 = new Game($db2, $fake2, fn() => $now);
    $g2->createEvent(['tickers' => ['005930']]); $g2->startEvent();
    $fake2->p = 70000;
    $b = $g2->authenticate($g2->join('B')['token']);
    $g2->trade($b, ['ticker' => '005930', 'side' => 'buy', 'quantity' => 10, 'reason' => REASON]);
    $fake2->p = 7000;
    eq($g2->myState($b)['me']['positions'][0]['value'], 70000);
    $db = $db2 = null; rmrf($dir); rmrf($dir2);
});

t('기존 DB(레버리지 컬럼 없는 옛 버전)도 열어서 컬럼을 자동 추가한다', function () {
    $dir = tmpdir();
    $file = $dir . '/g_oldtest.sqlite';
    $old = new PDO('sqlite:' . $file);
    $old->exec("CREATE TABLE holdings (user_id INTEGER NOT NULL, event_id INTEGER NOT NULL, ticker TEXT NOT NULL, quantity INTEGER NOT NULL, average_price REAL NOT NULL, PRIMARY KEY (user_id, ticker));
        CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, event_id INTEGER NOT NULL, ticker TEXT NOT NULL, type TEXT NOT NULL, quantity INTEGER NOT NULL, price INTEGER NOT NULL, reason TEXT, realized_pl INTEGER, created_at INTEGER NOT NULL);
        INSERT INTO holdings VALUES (1,1,'005930',5,70000);");
    $old = null;
    $db = sim_open_db($dir);
    $row = $db->query('SELECT leverage FROM holdings')->fetch();
    eq((int)$row['leverage'], 1, '기존 보유는 1배');
    $has = false; foreach ($db->query('PRAGMA table_info(transactions)')->fetchAll() as $c) if ($c['name'] === 'leverage') $has = true;
    check($has, 'transactions.leverage');
    $db = null; rmrf($dir);
});

t('입력 검증: 시작자금/종목/진행시간/이름/중복 이벤트', function () {
    [$g, $c, $d] = fresh();
    foreach ([['initial_balance' => -1], ['initial_balance' => 1.5], ['tickers' => ['abc']], ['tickers' => []], ['duration_min' => 0],
        ['reason_reveal_mode' => 'x'], ['name' => '']] as $bad) {
        fails(fn() => $g->createEvent($bad), 400, json_encode($bad));
    }
    $g->createEvent([]);
    fails(fn() => $g->createEvent([]), 409, '진행 안 된 이벤트가 있으면 새로 못 만듦');
    rmrf($d);
});

t('캔들: 기간별 개수, OHLC 정합성, 잘못된 입력', function () {
    [$g, $c, $d] = started();
    $ev = $g->currentEvent();
    foreach (['1d' => 288, '1w' => 168, '1m' => 30, '3m' => 90] as $range => $n) {
        $cs = $g->candles($ev, '005930', $range);
        eq(count($cs), $n, $range);
        foreach ($cs as $x) check($x['h'] >= max($x['o'], $x['c']) && $x['l'] <= min($x['o'], $x['c']) && $x['l'] > 0 && $x['v'] > 0, json_encode($x));
    }
    fails(fn() => $g->candles($ev, '005930', '9y'), 400);
    fails(fn() => $g->candles($ev, '000000', '1d'), 404);
    rmrf($d);
});

t('가격: 같은 시드면 재현, 시드가 다르면 다르고, 기준가에서 비현실적으로 벗어나지 않는다', function () {
    $ts = gmmktime(3, 0, 0, 10, 8, 2026) * 1000;
    $m1 = new Market(42); $m2 = new Market(42); $m3 = new Market(43);
    eq($m1->priceAt('005930', $ts), $m2->priceAt('005930', $ts));
    check($m1->priceAt('005930', $ts) !== $m3->priceAt('005930', $ts));
    foreach (Market::tickerList() as $tk) {
        $meta = Market::TICKERS[$tk];
        for ($d = 0; $d < 200; $d += 3) {
            $p = $m1->priceAt($tk, $ts - $d * 86400000);
            check($p > $meta['base'] * 0.5 && $p < $meta['base'] * 1.8, "$tk p=$p");
        }
    }
});

t('기본 종목(국내·미국 시총 상위, 지수선물, 달러, 원유) 전부 거래 가능, 종목 코드는 문자열 (숫자형 배열키 회귀)', function () {
    [$g, $c, $d] = started();
    [$a] = player($g);
    $st = $g->myState($a);
    $names = array_column($st['stocks'], 'name');
    foreach (['삼성전자', 'SK하이닉스', 'LG에너지솔루션', '삼성바이오로직스', '현대차', '기아', '셀트리온', 'KB금융', 'NAVER',
        '엔비디아', '마이크로소프트', '애플', '알파벳(구글)', '아마존', '메타', '브로드컴', '테슬라', '버크셔 해서웨이',
        '코스피200 선물', '코스닥150 선물', 'S&P500 선물', '나스닥100 선물', '다우존스 선물', '달러 선물(원/달러)', '달러인덱스 선물', 'WTI 원유 선물', '브렌트유 선물', '스페이스엑스(SpaceX)'] as $n) {
        check(in_array($n, $names, true), "$n 누락");
    }
    $groups = array_values(array_unique(array_column($st['stocks'], 'group'))); sort($groups);
    eq($groups, ['fx', 'idx', 'kr', 'oil', 'us']);
    foreach ($g->currentEvent()['tickers'] as $tk) {
        check(is_string($tk), "ticker 타입: " . gettype($tk));
        $r = $g->trade($a, ['ticker' => $tk, 'side' => 'buy', 'quantity' => 1, 'reason' => REASON]);
        check($r['unit'] !== '', 'unit');
    }
    $after = $g->myState($a);
    eq(count($after['me']['positions']), count($st['stocks']));
    foreach ($after['stocks'] as $s2) check(is_string($s2['ticker']) && $s2['price'] > 0 && $s2['prev_close'] > 0);
    foreach ($after['me']['positions'] as $p) check($p['unit'] !== '');
    foreach (['NVDA', 'WTI', 'USDKRW', 'BRKB', '373220'] as $code) eq(count($g->candles($g->currentEvent(), $code, '1d')), 288, $code);
    rmrf($d);
});

t('리포트: 집중/분산 해설과 통계, 추천/보장 문구 없음', function () {
    [$g, $c, $d] = started();
    [$a] = player($g);
    $g->trade($a, ['ticker' => '005930', 'side' => 'buy', 'quantity' => 100, 'reason' => REASON]);
    $rep = $g->report($a);
    eq($rep['trade_count'], 1); eq($rep['most_traded']['name'], '삼성전자');
    check(str_contains(implode(' ', $rep['insights']), '한 종목에 주식 자산이 집중'));
    $g->trade($a, ['ticker' => '000660', 'side' => 'buy', 'quantity' => 100, 'reason' => REASON]);
    $g->trade($a, ['ticker' => '035720', 'side' => 'buy', 'quantity' => 100, 'reason' => REASON]);
    $rep = $g->report($a);
    eq(count($rep['weights']), 4);
    check(abs(array_sum(array_column($rep['weights'], 'weight')) - 1) < 1e-9);
    check(preg_match('/매수하세요|사세요|추천|보장/u', implode(' ', $rep['insights'])) === 0, '투자 권유/보장 표현');
    eq($rep['is_final'], false);
    rmrf($d);
});

t('관리자 현황', function () {
    [$g, $c, $d] = started();
    [$a] = player($g);
    $g->trade($a, ['ticker' => '005930', 'side' => 'buy', 'quantity' => 1, 'reason' => REASON]);
    $ov = $g->adminOverview();
    eq($ov['stats']['participants'], 1); eq($ov['stats']['trade_count'], 1); eq($ov['stats']['per_ticker'][0]['name'], '삼성전자');
    rmrf($d);
});

// ───────────────── HTTP 계층 ─────────────────
echo "── HTTP (실제 PHP 서버) ──\n";
$root = realpath(__DIR__ . '/..');
$dataDir = tmpdir();
$port = random_int(20000, 40000);
$env = ['SIMGAME_ADMIN_PASSWORD' => 'pw-test', 'SIMGAME_DATA_DIR' => $dataDir, 'SIMGAME_TEST' => '1', 'PATH' => getenv('PATH') ?: '/usr/bin:/bin', 'PHP_CLI_SERVER_WORKERS' => '4'];
$proc = proc_open([PHP_BINARY, '-S', "127.0.0.1:$port", '-t', $root], [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes, $root, $env);
register_shutdown_function(function () use ($proc, $dataDir) { proc_terminate($proc); rmrf($dataDir); });
for ($i = 0; $i < 50; $i++) { if (@fsockopen('127.0.0.1', $port)) break; usleep(100000); }

function http(string $method, string $route, array $o = []): array {
    global $port;
    $ch = curl_init("http://127.0.0.1:$port/api.php?r=" . $route . ($o['query'] ?? ''));
    $h = [];
    if (isset($o['token'])) $h[] = 'X-Auth-Token: ' . $o['token'];
    if (isset($o['now'])) $h[] = 'X-Sim-Now: ' . $o['now'];
    $payload = $o['raw'] ?? (isset($o['body']) ? json_encode($o['body']) : null);
    if ($payload !== null) $h[] = 'Content-Type: application/json';
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_HTTPHEADER => $h, CURLOPT_TIMEOUT => 20]
        + ($payload !== null ? [CURLOPT_POSTFIELDS => $payload] : []));
    $res = (string)curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $hs = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    $raw = substr($res, $hs);
    return ['status' => $status, 'headers' => substr($res, 0, $hs), 'raw' => $raw, 'json' => json_decode($raw, true)];
}

t('HTTP: 관리자 API는 인증 없이 접근 불가, 학생 토큰도 불가', function () {
    foreach ([['GET', 'admin/overview'], ['POST', 'admin/event'], ['POST', 'admin/event/reset'], ['GET', 'admin/export.csv'], ['GET', 'admin/transactions'], ['POST', 'admin/event/update']] as [$m, $r]) {
        eq(http($m, $r)['status'], 401, $r);
    }
    eq(http('POST', 'admin/login', ['body' => ['password' => 'nope']])['status'], 401);
    eq(http('POST', 'admin/login', ['body' => ['password' => ['x']]])['status'], 401);
    eq(http('GET', 'admin/overview', ['token' => str_repeat('a', 48)])['status'], 401);
});

$adminTok = http('POST', 'admin/login', ['body' => ['password' => 'pw-test']])['json']['token'] ?? '';
const NOW = 1791428400000; // 고정 시각
$H = fn(string $m, string $r, array $o = []) => http($m, $r, $o + ['now' => NOW]);

t('HTTP: 관리자 로그인 → 이벤트 생성/시작 → 참가/거래/랭킹', function () use ($adminTok, $H) {
    check(strlen($adminTok) === 48, '관리자 토큰 발급');
    eq($H('POST', 'admin/event', ['token' => $adminTok, 'body' => ['name' => 'HTTP 테스트']])['status'], 200);
    eq($H('POST', 'admin/event/start', ['token' => $adminTok])['status'], 200);
    $j = $H('POST', 'join', ['body' => ['nickname' => '민수']]);
    eq($j['status'], 200);
    $tok = $j['json']['token'];
    eq($H('GET', 'state')['status'], 401, '토큰 없이 state');
    $st = $H('GET', 'state', ['token' => $tok]);
    eq($st['json']['me']['cash'], 100000000);
    eq($H('POST', 'trade', ['token' => $tok, 'body' => ['ticker' => '005930', 'side' => 'buy', 'quantity' => 5]])['status'], 400, '이유 없는 매수');
    $tr = $H('POST', 'trade', ['token' => $tok, 'body' => ['ticker' => '005930', 'side' => 'buy', 'quantity' => 5, 'reason' => '테스트용 매수 이유입니다 열자']]);
    eq($tr['status'], 200);
    eq($tr['json']['state']['me']['positions'][0]['quantity'], 5);
    $rk = $H('GET', 'ranking');
    eq($rk['json']['rows'][0]['nickname'], '민수');
    $cd = $H('GET', 'stocks/005930/candles', ['query' => '&range=1w']);
    eq(count($cd['json']['candles']), 168);
    eq(count($H('GET', 'stocks/NVDA/candles', ['query' => '&range=1d'])['json']['candles']), 288, 'NVDA 차트');
    eq($H('GET', 'stocks/NOPE/candles', ['query' => '&range=1d'])['status'], 404);
    eq(count($H('GET', 'tickers')['json']['groups']), 5);
});

t('HTTP: 잘못된 경로/메서드/JSON/큰 본문', function () use ($adminTok, $H) {
    eq($H('GET', 'nope')['status'], 404);
    eq($H('GET', 'join')['status'], 405);
    eq($H('POST', 'join', ['raw' => '{not json'])['status'], 400);
    eq($H('POST', 'join', ['raw' => '[1,2,3]'])['status'], 400);
    eq($H('POST', 'join', ['raw' => json_encode(['nickname' => str_repeat('x', 50000)])])['status'], 413);
    eq($H('GET', 'stocks/005930/candles', ['query' => '&range=9y'])['status'], 400);
    check(str_contains($H('GET', 'event')['headers'], 'X-Content-Type-Options: nosniff'));
});

t('HTTP: CSV 내보내기는 수식 주입을 막는다', function () use ($adminTok, $H) {
    $j = $H('POST', 'join', ['body' => ['nickname' => '수식']]);
    $H('POST', 'trade', ['token' => $j['json']['token'], 'body' => ['ticker' => '005930', 'side' => 'buy', 'quantity' => 1, 'reason' => '=HYPERLINK("http://x") 수식 주입 테스트']]);
    $csv = $H('GET', 'admin/export.csv', ['token' => $adminTok]);
    eq($csv['status'], 200);
    check(str_contains($csv['raw'], '"\'=HYPERLINK'), '수식 셀 앞에 작은따옴표');
    check(str_contains($csv['headers'], 'text/csv'));
});

t('HTTP: 관리자 설정 저장(POST update)과 종료 후 이유 공개', function () use ($adminTok, $H) {
    eq($H('POST', 'admin/event/update', ['token' => $adminTok, 'body' => ['reason_reveal_mode' => 'live']])['json']['event']['reason_reveal_mode'], 'live');
    eq($H('POST', 'admin/event/end', ['token' => $adminTok])['json']['event']['status'], 'ended');
    eq($H('GET', 'ranking')['json']['reasons_visible'], true);
    eq($H('POST', 'join', ['body' => ['nickname' => 'late']])['status'], 409);
});

t('HTTP: 비밀번호 CHANGE_ME/미설정이면 관리자 로그인이 막힌다', function () use ($root) {
    // 별도 서버(환경변수 없음, config.php 기본값 CHANGE_ME)
    $d = tmpdir(); $p = random_int(40001, 60000);
    $pr = proc_open([PHP_BINARY, '-S', "127.0.0.1:$p", '-t', $root], [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes, $root,
        ['SIMGAME_DATA_DIR' => $d, 'PATH' => getenv('PATH') ?: '/usr/bin:/bin']);
    for ($i = 0; $i < 50; $i++) { if (@fsockopen('127.0.0.1', $p)) break; usleep(100000); }
    $ch = curl_init("http://127.0.0.1:$p/api.php?r=admin/login");
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode(['password' => 'CHANGE_ME']), CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_RETURNTRANSFER => true]);
    curl_exec($ch); $status = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    proc_terminate($pr); rmrf($d);
    eq($status, 403);
});

echo "\n통과 $passed · 실패 $failed\n";
exit($failed ? 1 : 0);
