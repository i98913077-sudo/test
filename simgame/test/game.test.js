import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';

async function setup(opts = {}) {
  let clock = Date.UTC(2026, 9, 8, 3, 0, 0);
  const { server, game } = createApp({ adminPassword: 'pw-test', now: () => clock, ...opts });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  server.unref(); // 테스트가 실패해 close()를 못 불러도 프로세스가 멈추지 않게
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, { token, body, raw } = {}) => {
    const res = await fetch(base + p, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (raw) return res;
    return { status: res.status, ...(await res.json()) };
  };
  const adminToken = (await call('POST', '/api/admin/login', { body: { password: 'pw-test' } })).token;
  const admin = (method, p, body) => call(method, p, { token: adminToken, body });
  return {
    base, call, admin, game, advance: (ms) => { clock += ms; }, setClock: (t) => { clock = t; }, getClock: () => clock,
    close: () => new Promise((r) => server.close(r)),
  };
}
const REASON = '반도체 업황이 좋아질 것 같다고 생각해서 선택했어요';

test('이벤트 기본값은 1억 P이고 시작 전에는 거래할 수 없다', async () => {
  const t = await setup();
  const ev = await t.admin('POST', '/api/admin/event', { name: '테스트' });
  assert.equal(ev.event.initial_balance, 100_000_000);
  assert.equal(ev.event.status, 'ready');
  const j = await t.call('POST', '/api/join', { body: { nickname: '학생A' } });
  assert.ok(j.token && j.code);
  const r = await t.call('POST', '/api/trade', { token: j.token, body: { ticker: '005930', side: 'buy', quantity: 1, reason: REASON } });
  assert.equal(r.status, 409);
  await t.close();
});

test('매수 이유는 필수이며 서버에서 검증한다', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', {});
  await t.admin('POST', '/api/admin/event/start');
  const { token } = await t.call('POST', '/api/join', { body: { nickname: 'A' } });
  const buy = (body) => t.call('POST', '/api/trade', { token, body: { ticker: '005930', side: 'buy', quantity: 1, ...body } });
  assert.equal((await buy({})).status, 400, '이유 없음');
  assert.equal((await buy({ reason: '' })).status, 400, '빈 이유');
  assert.equal((await buy({ reason: '   짧음   ' })).status, 400, '10자 미만');
  assert.equal((await buy({ reason: 'x'.repeat(201) })).status, 400, '200자 초과');
  assert.equal((await buy({ reason: 123 })).status, 400, '숫자 형식');
  assert.equal((await buy({ reason: REASON })).status, 200);
  await t.close();
});

test('체결가는 서버가 정하며 클라이언트가 보낸 가격은 무시된다', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', {});
  await t.admin('POST', '/api/admin/event/start');
  const { token } = await t.call('POST', '/api/join', { body: { nickname: 'A' } });
  const st = await t.call('GET', '/api/state', { token });
  const serverPrice = st.stocks.find((s) => s.ticker === '005930').price;
  const r = await t.call('POST', '/api/trade', { token, body: { ticker: '005930', side: 'buy', quantity: 10, reason: REASON, price: 1, cash: 9e15, total: 9e15 } });
  assert.equal(r.status, 200);
  assert.equal(r.trade.price, serverPrice);
  assert.equal(r.state.me.cash, 100_000_000 - serverPrice * 10);
  await t.close();
});

test('수량·현금·보유수량 검증 (음수, 소수, 초과 매수/매도)', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', {});
  await t.admin('POST', '/api/admin/event/start');
  const { token } = await t.call('POST', '/api/join', { body: { nickname: 'A' } });
  const tr = (body) => t.call('POST', '/api/trade', { token, body: { ticker: '005930', reason: REASON, ...body } });
  for (const quantity of [0, -5, 1.5, '3', null, 1e12, Number.NaN]) {
    assert.equal((await tr({ side: 'buy', quantity })).status, 400, `quantity=${quantity}`);
  }
  assert.equal((await tr({ side: 'buy', quantity: 999_999 })).status, 400, '현금 부족');
  assert.equal((await tr({ side: 'sell', quantity: 1 })).status, 400, '미보유 매도(공매도 금지)');
  assert.equal((await tr({ side: 'hold', quantity: 1 })).status, 400, '잘못된 구분');
  assert.equal((await tr({ side: 'buy', quantity: 1, ticker: '999999' })).status, 400, '없는 종목');
  const st = await t.call('GET', '/api/state', { token });
  assert.equal(st.me.cash, 100_000_000, '실패한 요청은 상태를 바꾸지 않는다');
  await t.close();
});

test('매도: 평단 계산, 실현손익, 보유 감소, 거래기록', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', {});
  await t.admin('POST', '/api/admin/event/start');
  const { token } = await t.call('POST', '/api/join', { body: { nickname: 'A' } });
  const b1 = await t.call('POST', '/api/trade', { token, body: { ticker: '005930', side: 'buy', quantity: 10, reason: REASON } });
  t.advance(30 * 60000);
  const b2 = await t.call('POST', '/api/trade', { token, body: { ticker: '005930', side: 'buy', quantity: 10, reason: REASON } });
  let st = await t.call('GET', '/api/state', { token });
  const pos = st.me.positions[0];
  assert.equal(pos.quantity, 20);
  assert.equal(pos.average_price, Math.round((b1.trade.price + b2.trade.price) / 2));
  t.advance(30 * 60000);
  const s = await t.call('POST', '/api/trade', { token, body: { ticker: '005930', side: 'sell', quantity: 5 } });
  assert.equal(s.status, 200, '매도 이유는 기본 선택사항');
  const avg = (b1.trade.price + b2.trade.price) / 2;
  assert.equal(s.trade.realized_pl, Math.round((s.trade.price - avg) * 5));
  st = await t.call('GET', '/api/state', { token });
  assert.equal(st.me.positions[0].quantity, 15);
  const sold = await t.call('POST', '/api/trade', { token, body: { ticker: '005930', side: 'sell', quantity: 15 } });
  assert.equal(sold.status, 200);
  st = await t.call('GET', '/api/state', { token });
  assert.equal(st.me.positions.length, 0);
  const tx = await t.call('GET', '/api/transactions', { token });
  assert.equal(tx.transactions.length, 4);
  // 총자산 = 현금 (모두 매도). 현금 증감 = 실현손익 합과 일치
  const realized = tx.transactions.reduce((a, x) => a + (x.realized_pl ?? 0), 0);
  assert.ok(Math.abs(st.me.total - 100_000_000 - realized) <= 20, '총자산 변화 ≈ 실현손익 합 (평단 반올림 오차 허용)');
  await t.close();
});

test('매도 이유를 필수로 설정하면 검증한다', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', { sell_reason_required: true });
  await t.admin('POST', '/api/admin/event/start');
  const { token } = await t.call('POST', '/api/join', { body: { nickname: 'A' } });
  await t.call('POST', '/api/trade', { token, body: { ticker: '005930', side: 'buy', quantity: 2, reason: REASON } });
  assert.equal((await t.call('POST', '/api/trade', { token, body: { ticker: '005930', side: 'sell', quantity: 1 } })).status, 400);
  assert.equal((await t.call('POST', '/api/trade', { token, body: { ticker: '005930', side: 'sell', quantity: 1, reason: REASON } })).status, 200);
  await t.close();
});

test('인증: 토큰 없음/위조 토큰은 거부', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', {});
  await t.admin('POST', '/api/admin/event/start');
  assert.equal((await t.call('GET', '/api/state')).status, 401);
  assert.equal((await t.call('GET', '/api/state', { token: 'f'.repeat(48) })).status, 401);
  assert.equal((await t.call('POST', '/api/trade', { body: { ticker: '005930', side: 'buy', quantity: 1, reason: REASON } })).status, 401);
  await t.close();
});

test('관리자 API는 인증 없이 접근할 수 없다', async () => {
  const t = await setup();
  for (const [m, p] of [['GET', '/api/admin/overview'], ['POST', '/api/admin/event'], ['POST', '/api/admin/event/reset'], ['GET', '/api/admin/export.csv'], ['GET', '/api/admin/transactions']]) {
    assert.equal((await t.call(m, p)).status, 401, p);
  }
  const wrong = await t.call('POST', '/api/admin/login', { body: { password: 'nope' } });
  assert.equal(wrong.status, 401);
  // 학생 토큰으로 관리자 API 접근 불가
  await t.admin('POST', '/api/admin/event', {});
  const { token } = await t.call('POST', '/api/join', { body: { nickname: 'A' } });
  assert.equal((await t.call('GET', '/api/admin/overview', { token })).status, 401);
  await t.close();
});

test('관리자 비밀번호 미설정 시 로그인 불가', async () => {
  const t = await setup({ adminPassword: undefined });
  const r = await t.call('POST', '/api/admin/login', { body: { password: '' } });
  assert.equal(r.status, 401);
  await t.close();
});

test('닉네임 검증과 중복 닉네임 허용(코드로 구분)', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', {});
  for (const nickname of ['', '   ', 'a'.repeat(13), '<script>', 'a"b', 123, null]) {
    assert.equal((await t.call('POST', '/api/join', { body: { nickname } })).status, 400, String(nickname));
  }
  const a = await t.call('POST', '/api/join', { body: { nickname: '같은이름' } });
  const b = await t.call('POST', '/api/join', { body: { nickname: '같은이름' } });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.notEqual(a.code, b.code);
  assert.match(a.code, /^[A-Z2-9]{4}$/);
  await t.close();
});

test('순위: 총자산 기준 정렬, 동점은 같은 순위', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', {});
  await t.admin('POST', '/api/admin/event/start');
  const a = await t.call('POST', '/api/join', { body: { nickname: 'A' } });
  const b = await t.call('POST', '/api/join', { body: { nickname: 'B' } });
  await t.call('POST', '/api/join', { body: { nickname: 'C' } });
  let rk = await t.call('GET', '/api/ranking');
  assert.deepEqual(rk.rows.map((r) => r.rank), [1, 1, 1], '아무도 거래 안 하면 모두 1위');
  await t.call('POST', '/api/trade', { token: a.token, body: { ticker: '000660', side: 'buy', quantity: 100, reason: REASON } });
  await t.call('POST', '/api/trade', { token: b.token, body: { ticker: '035720', side: 'buy', quantity: 100, reason: REASON } });
  t.advance(3 * 3600 * 1000);
  rk = await t.call('GET', '/api/ranking');
  const totals = rk.rows.map((r) => r.total);
  assert.deepEqual(totals, [...totals].sort((x, y) => y - x));
  assert.equal(rk.rows[0].rank, 1);
  assert.ok(rk.rows.every((r) => !('user_id' in r) && !('token' in r)), '공개 순위에 내부 ID/토큰 없음');
  const stA = await t.call('GET', '/api/state', { token: a.token });
  assert.equal(stA.me.rank, rk.rows.find((r) => r.code === a.code).rank);
  await t.close();
});

test('매수 이유 공개: 종료 전에는 타인에게 숨기고, 종료 후 공개', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', { reason_reveal_mode: 'after_end' });
  await t.admin('POST', '/api/admin/event/start');
  const a = await t.call('POST', '/api/join', { body: { nickname: 'A' } });
  const b = await t.call('POST', '/api/join', { body: { nickname: 'B' } });
  await t.call('POST', '/api/trade', { token: a.token, body: { ticker: '005930', side: 'buy', quantity: 3, reason: '비밀 이유입니다 비밀 이유' } });
  let cmp = await t.call('GET', `/api/compare?code=${a.code}`, { token: b.token });
  assert.equal(cmp.other.details_visible, false);
  assert.ok(!JSON.stringify(cmp).includes('비밀 이유'), '종료 전 타인 이유 노출 금지');
  assert.equal(cmp.other.positions, undefined, '종료 전 타인 보유종목 숨김');
  let rk = await t.call('GET', '/api/ranking');
  assert.equal(rk.reasons_visible, false);
  assert.ok(!JSON.stringify(rk).includes('비밀 이유'));
  cmp = await t.call('GET', `/api/compare?code=${a.code}`, { token: a.token });
  assert.equal(cmp.me.details_visible, true, '내 이유는 항상 볼 수 있다');
  await t.admin('POST', '/api/admin/event/end');
  cmp = await t.call('GET', `/api/compare?code=${a.code}`, { token: b.token });
  assert.equal(cmp.other.details_visible, true);
  assert.ok(JSON.stringify(cmp).includes('비밀 이유'));
  rk = await t.call('GET', '/api/ranking');
  assert.equal(rk.reasons_visible, true);
  assert.equal(rk.reasons[0].nickname, 'A');
  await t.close();
});

test('실시간 공개 모드에서는 종료 전에도 이유가 보인다', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', { reason_reveal_mode: 'live' });
  await t.admin('POST', '/api/admin/event/start');
  const a = await t.call('POST', '/api/join', { body: { nickname: 'A' } });
  const b = await t.call('POST', '/api/join', { body: { nickname: 'B' } });
  await t.call('POST', '/api/trade', { token: a.token, body: { ticker: '005930', side: 'buy', quantity: 3, reason: '실시간 공개 이유입니다' } });
  const cmp = await t.call('GET', `/api/compare?code=${a.code}`, { token: b.token });
  assert.ok(JSON.stringify(cmp).includes('실시간 공개 이유'));
  await t.close();
});

test('종료 시각이 지나면 자동 종료되고 가격이 고정된다', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', { duration_min: 30 });
  await t.admin('POST', '/api/admin/event/start');
  const { token } = await t.call('POST', '/api/join', { body: { nickname: 'A' } });
  await t.call('POST', '/api/trade', { token, body: { ticker: '005930', side: 'buy', quantity: 10, reason: REASON } });
  t.advance(31 * 60000);
  const r = await t.call('POST', '/api/trade', { token, body: { ticker: '005930', side: 'sell', quantity: 1 } });
  assert.equal(r.status, 409);
  const s1 = await t.call('GET', '/api/state', { token });
  assert.equal(s1.event.status, 'ended');
  t.advance(5 * 3600 * 1000);
  const s2 = await t.call('GET', '/api/state', { token });
  assert.equal(s2.me.total, s1.me.total, '종료 후 총자산은 변하지 않는다');
  const j = await t.call('POST', '/api/join', { body: { nickname: 'Late' } });
  assert.equal(j.status, 409, '종료 후 참가 불가');
  await t.close();
});

test('시작 자금·종목은 참가자가 있으면 변경할 수 없고, 초기화하면 참가자가 사라진다', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', { initial_balance: 50_000_000, tickers: ['005930', '000660'] });
  const { token } = await t.call('POST', '/api/join', { body: { nickname: 'A' } });
  assert.equal((await t.admin('PATCH', '/api/admin/event', { initial_balance: 1 + 10_000 })).status, 409);
  assert.equal((await t.admin('PATCH', '/api/admin/event', { tickers: ['005930'] })).status, 409);
  const st = await t.call('GET', '/api/state', { token });
  assert.equal(st.me.cash, 50_000_000);
  assert.equal(st.stocks.length, 2);
  const rs = await t.admin('POST', '/api/admin/event/reset');
  assert.equal(rs.event.participants, 0);
  assert.equal((await t.call('GET', '/api/state', { token })).status, 401, '초기화 후 기존 토큰 무효');
  assert.equal((await t.admin('PATCH', '/api/admin/event', { initial_balance: 20_000_000 })).status, 200);
  await t.close();
});

test('입력 검증: 시작자금/종목/진행시간 범위', async () => {
  const t = await setup();
  assert.equal((await t.admin('POST', '/api/admin/event', { initial_balance: -1 })).status, 400);
  assert.equal((await t.admin('POST', '/api/admin/event', { initial_balance: 1.5 })).status, 400);
  assert.equal((await t.admin('POST', '/api/admin/event', { tickers: ['abc'] })).status, 400);
  assert.equal((await t.admin('POST', '/api/admin/event', { tickers: [] })).status, 400);
  assert.equal((await t.admin('POST', '/api/admin/event', { duration_min: 0 })).status, 400);
  assert.equal((await t.admin('POST', '/api/admin/event', { reason_reveal_mode: 'x' })).status, 400);
  assert.equal((await t.admin('POST', '/api/admin/event', { name: '' })).status, 400);
  assert.equal((await t.admin('POST', '/api/admin/event', {})).status, 200);
  assert.equal((await t.admin('POST', '/api/admin/event', {})).status, 409, '진행되지 않은 이벤트가 있으면 새로 못 만듦');
  await t.close();
});

test('캔들 API: 기간별 개수, OHLC 정합성, 잘못된 입력', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', {});
  await t.admin('POST', '/api/admin/event/start');
  for (const [range, n] of [['1d', 288], ['1w', 168], ['1m', 30], ['3m', 90]]) {
    const r = await t.call('GET', `/api/stocks/005930/candles?range=${range}`);
    assert.equal(r.candles.length, n, range);
    for (const c of r.candles) {
      assert.ok(c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c) && c.l > 0 && c.v > 0, JSON.stringify(c));
    }
  }
  assert.equal((await t.call('GET', '/api/stocks/005930/candles?range=9y')).status, 400);
  assert.equal((await t.call('GET', '/api/stocks/000000/candles?range=1d')).status, 404);
  await t.close();
});

test('가격은 결정적이며 같은 시드면 재현된다', async () => {
  const { createMarket } = await import('../lib/market.js');
  const m1 = createMarket({ seed: 42 });
  const m2 = createMarket({ seed: 42 });
  const m3 = createMarket({ seed: 43 });
  const ts = Date.UTC(2026, 9, 8, 3, 0, 0);
  assert.equal(m1.priceAt('005930', ts), m2.priceAt('005930', ts));
  assert.notEqual(m1.priceAt('005930', ts), m3.priceAt('005930', ts));
  // 가격이 기준가에서 비현실적으로 멀어지지 않는다
  for (let d = 0; d < 100; d += 7) {
    const p = m1.priceAt('005930', ts - d * 86400000);
    assert.ok(p > 70000 * 0.4 && p < 70000 * 2.5, `p=${p}`);
  }
});

test('리포트: 집중/분산 해설과 통계, 특정 종목 추천 문구 없음', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', {});
  await t.admin('POST', '/api/admin/event/start');
  const { token } = await t.call('POST', '/api/join', { body: { nickname: 'A' } });
  await t.call('POST', '/api/trade', { token, body: { ticker: '005930', side: 'buy', quantity: 100, reason: REASON } });
  let rep = await t.call('GET', '/api/report', { token });
  assert.equal(rep.trade_count, 1);
  assert.equal(rep.most_traded.name, '삼성전자');
  assert.ok(rep.insights.some((s) => s.includes('한 종목에 주식 자산이 집중')));
  await t.call('POST', '/api/trade', { token, body: { ticker: '000660', side: 'buy', quantity: 100, reason: REASON } });
  await t.call('POST', '/api/trade', { token, body: { ticker: '035720', side: 'buy', quantity: 100, reason: REASON } });
  rep = await t.call('GET', '/api/report', { token });
  assert.equal(rep.weights.length, 4);
  assert.ok(Math.abs(rep.weights.reduce((a, w) => a + w.weight, 0) - 1) < 1e-9);
  const text = JSON.stringify(rep.insights);
  assert.ok(!/매수하세요|사세요|추천|보장/.test(text), '투자 권유/보장 표현 금지');
  assert.equal(rep.is_final, false);
  await t.close();
});

test('관리자 현황 + CSV 내보내기 (수식 주입 방지)', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', {});
  await t.admin('POST', '/api/admin/event/start');
  const { token } = await t.call('POST', '/api/join', { body: { nickname: 'A' } });
  await t.call('POST', '/api/trade', { token, body: { ticker: '005930', side: 'buy', quantity: 1, reason: '=HYPERLINK("http://x") 수식 주입 테스트' } });
  const ov = await t.admin('GET', '/api/admin/overview');
  assert.equal(ov.stats.participants, 1);
  assert.equal(ov.stats.trade_count, 1);
  assert.equal(ov.stats.per_ticker[0].name, '삼성전자');
  const res = await fetch(`${t.base}/api/admin/export.csv`, { headers: { Authorization: `Bearer ${(await t.call('POST', '/api/admin/login', { body: { password: 'pw-test' } })).token}` } });
  const csv = await res.text();
  assert.equal(res.status, 200);
  assert.ok(csv.includes(`"'=HYPERLINK`), '수식으로 시작하는 셀은 앞에 작은따옴표');
  await t.close();
});

test('보안 헤더, 정적 파일 경로 이탈 차단, 큰 요청 거부', async () => {
  const t = await setup();
  const res = await t.call('GET', '/', { raw: true });
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  for (const p of ['/../server.js', '/%2e%2e/server.js', '/..%2fserver.js', '/js/../../lib/game.js']) {
    const r = await fetch(t.base + p);
    assert.ok([403, 404].includes(r.status), `${p} → ${r.status}`);
    assert.ok(!(await r.text()).includes('createGame'), `${p} 소스 노출`);
  }
  const big = await fetch(`${t.base}/api/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: 'x'.repeat(50_000) }) }).catch((e) => ({ status: 'closed', e }));
  assert.ok(big.status === 413 || big.status === 'closed');
  await t.close();
});

test('기본 종목: 국내·미국 시총 상위, 지수선물, 달러, 원유가 모두 있고 전부 거래 가능하다', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', {});
  await t.admin('POST', '/api/admin/event/start');
  const { token } = await t.call('POST', '/api/join', { body: { nickname: 'A' } });
  const st = await t.call('GET', '/api/state', { token });
  const names = st.stocks.map((x) => x.name);
  for (const n of ['삼성전자', 'SK하이닉스', 'LG에너지솔루션', '삼성바이오로직스', '현대차', '기아', '셀트리온', 'KB금융', 'NAVER',
    '엔비디아', '마이크로소프트', '애플', '알파벳(구글)', '아마존', '메타', '브로드컴', '테슬라', '버크셔 해서웨이',
    '코스피200 선물', 'S&P500 선물', '나스닥100 선물', '다우존스 선물', '원/달러 환율', '달러인덱스', 'WTI 원유', '브렌트유']) {
    assert.ok(names.includes(n), `${n} 누락`);
  }
  assert.deepEqual([...new Set(st.stocks.map((x) => x.group))].sort(), ['fx', 'idx', 'kr', 'oil', 'us']);
  assert.ok(st.stocks.every((x) => x.unit && x.price > 0 && x.prev_close > 0));
  for (const s of st.stocks) {
    const r = await t.call('POST', '/api/trade', { token, body: { ticker: s.ticker, side: 'buy', quantity: 1, reason: REASON } });
    assert.equal(r.status, 200, `${s.ticker} 매수 실패: ${r.error}`);
    assert.equal(r.trade.unit, s.unit);
  }
  const after = await t.call('GET', '/api/state', { token });
  assert.equal(after.me.positions.length, st.stocks.length);
  assert.ok(after.me.positions.every((p) => p.unit));
  // 숫자가 아닌 종목 코드(NVDA, WTI)로도 차트가 열린다
  for (const code of ['NVDA', 'WTI', 'USDKRW', 'BRKB']) {
    const c = await t.call('GET', `/api/stocks/${code}/candles?range=1d`);
    assert.equal(c.candles.length, 288, code);
  }
  assert.equal((await t.call('GET', '/api/stocks/NOPE/candles?range=1d')).status, 404);
  assert.equal((await t.call('GET', '/api/stocks/bad%24%24/candles?range=1d')).status, 404);
  const tk = await t.call('GET', '/api/tickers');
  assert.equal(tk.groups.length, 5);
  await t.close();
});

test('이미 만든 이벤트에도 종목을 추가할 수 있고, 참가자가 있으면 빼는 것만 막는다', async () => {
  const t = await setup();
  await t.admin('POST', '/api/admin/event', { tickers: ['005930', '000660'] });
  await t.admin('POST', '/api/admin/event/start');
  const { token } = await t.call('POST', '/api/join', { body: { nickname: 'A' } });
  await t.call('POST', '/api/trade', { token, body: { ticker: '005930', side: 'buy', quantity: 2, reason: REASON } });
  assert.equal((await t.call('GET', '/api/state', { token })).stocks.length, 2);
  // 추가는 허용 (참가자·보유가 있어도)
  const add = await t.admin('PATCH', '/api/admin/event', { tickers: ['005930', '000660', 'NVDA', 'WTI', 'K200F'] });
  assert.equal(add.status, 200);
  const st = await t.call('GET', '/api/state', { token });
  assert.deepEqual(st.stocks.map((x) => x.ticker), ['005930', '000660', 'NVDA', 'K200F', 'WTI'], '표 순서대로 정렬');
  assert.equal(st.me.positions[0].quantity, 2, '기존 보유는 그대로');
  assert.equal((await t.call('POST', '/api/trade', { token, body: { ticker: 'NVDA', side: 'buy', quantity: 1, reason: REASON } })).status, 200);
  // 빼는 것은 막는다 (보유 중 종목 포함)
  assert.equal((await t.admin('PATCH', '/api/admin/event', { tickers: ['000660', 'NVDA'] })).status, 409);
  assert.equal((await t.call('GET', '/api/state', { token })).stocks.length, 5);
  await t.close();
});
