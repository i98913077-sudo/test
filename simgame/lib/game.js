// 게임 핵심 로직. 현금·보유수량·체결가·총자산·수익률·순위는 모두 여기(서버)에서만 계산한다.
// 이 모듈은 실제 증권사/결제/외부 주문 시스템과 연결되지 않는다. 모든 거래는 DB 기록일 뿐이다.
import { createHash, randomBytes } from 'node:crypto';
import { TICKERS, TICKER_MAP, GROUPS } from './market.js';

export class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const LIMITS = {
  nickname: 12,
  reasonMin: 10,
  reasonMax: 200,
  maxQuantity: 1_000_000,
  minBalance: 10_000,
  maxBalance: 1_000_000_000_000,
  defaultBalance: 100_000_000, // 1억 P
};

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const NICK_RE = /^[\p{L}\p{N}_\-. ]+$/u;
const sha = (s) => createHash('sha256').update(s).digest('hex');
const len = (s) => Array.from(s).length;
const CONTROL_RE = new RegExp('[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e]', 'g');
const clean = (s) => String(s).replace(CONTROL_RE, ' ').replace(/\s+/g, ' ').trim();

// 종목 표시 이름·단위(주/계약/배럴 등)
const tinfo = (t) => ({ name: TICKER_MAP.get(t)?.name ?? t, unit: TICKER_MAP.get(t)?.unit ?? '주' });

const levOf = (t) => TICKER_MAP.get(t)?.leverage ?? 1;
// 포지션 평가액 = 증거금 + 평가손익. 레버리지 1배면 가격×수량과 같고, 0 아래로는 내려가지 않는다(강제청산).
const equityOf = (qty, avg, lev, price) => Math.max(0, Math.round(qty * (price - avg * (1 - 1 / lev))));

export function createGame({ db, market, now = Date.now }) {
  const q = (sql) => db.prepare(sql);

  function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  // ---------- 이벤트 ----------
  function parseEvent(row) {
    if (!row) return null;
    return {
      ...row,
      tickers: JSON.parse(row.tickers),
      sell_reason_required: !!row.sell_reason_required,
      frozen: row.frozen_prices ? JSON.parse(row.frozen_prices) : null,
    };
  }

  function endEventAt(ev, at) {
    const frozen = {};
    for (const t of ev.tickers) frozen[t] = market.priceAt(t, at);
    q("UPDATE events SET status='ended', ended_at=?, frozen_prices=? WHERE id=?").run(at, JSON.stringify(frozen), ev.id);
  }

  // 종료 시각이 지난 이벤트는 호출 시점에 자동 종료(종료 시각 기준 가격으로 고정)
  function currentEvent() {
    let ev = parseEvent(q('SELECT * FROM events ORDER BY id DESC LIMIT 1').get());
    if (ev && ev.status === 'running' && ev.end_at && ev.end_at <= now()) {
      endEventAt(ev, ev.end_at);
      ev = parseEvent(q('SELECT * FROM events WHERE id=?').get(ev.id));
    }
    return ev;
  }

  const participantCount = (evId) => q('SELECT COUNT(*) AS n FROM users WHERE event_id=?').get(evId).n;

  function publicEvent(ev) {
    if (!ev) return null;
    return {
      id: ev.id,
      name: ev.name,
      status: ev.status,
      initial_balance: ev.initial_balance,
      start_at: ev.start_at,
      end_at: ev.end_at,
      ended_at: ev.ended_at,
      duration_min: ev.duration_min,
      reason_reveal_mode: ev.reason_reveal_mode,
      sell_reason_required: ev.sell_reason_required,
      tickers: ev.tickers,
      participants: participantCount(ev.id),
      server_time: now(),
      data_mode: 'demo',
    };
  }

  function validateTickers(list) {
    if (list == null) return TICKERS.map((t) => t.ticker);
    if (!Array.isArray(list) || list.length < 1 || list.length > TICKERS.length) throw new GameError('종목은 1개 이상 선택해야 합니다.');
    const set = new Set(list.map(String));
    if (![...set].every((t) => TICKER_MAP.has(t))) throw new GameError('알 수 없는 종목이 포함되어 있습니다.');
    return TICKERS.map((t) => t.ticker).filter((t) => set.has(t)); // 표의 순서대로 정렬
  }
  function validateBalance(v) {
    if (v == null) return LIMITS.defaultBalance;
    if (!Number.isSafeInteger(v) || v < LIMITS.minBalance || v > LIMITS.maxBalance) {
      throw new GameError(`시작 가상자금은 ${LIMITS.minBalance.toLocaleString('ko-KR')}P 이상 ${LIMITS.maxBalance.toLocaleString('ko-KR')}P 이하의 정수여야 합니다.`);
    }
    return v;
  }
  function validateDuration(v) {
    if (v == null || v === '') return null;
    if (!Number.isInteger(v) || v < 1 || v > 7 * 1440) throw new GameError('진행 시간은 1분 ~ 7일(분 단위 정수)이어야 합니다.');
    return v;
  }
  function validateMode(v) {
    if (v == null) return 'after_end';
    if (v !== 'after_end' && v !== 'live') throw new GameError('매수 이유 공개 방식이 올바르지 않습니다.');
    return v;
  }
  function validateName(v) {
    const name = clean(v ?? '');
    if (len(name) < 1 || len(name) > 40) throw new GameError('이벤트 이름은 1~40자여야 합니다.');
    return name;
  }

  function createEvent(input = {}) {
    const cur = currentEvent();
    if (cur && cur.status !== 'ended') throw new GameError('아직 종료되지 않은 이벤트가 있습니다. 먼저 종료하거나 초기화하세요.', 409);
    const name = validateName(input.name ?? '너굴이들 모의투자 챌린지');
    const info = q(`INSERT INTO events (name, status, initial_balance, tickers, duration_min, reason_reveal_mode, sell_reason_required, created_at)
      VALUES (?, 'ready', ?, ?, ?, ?, ?, ?)`).run(
      name,
      validateBalance(input.initial_balance),
      JSON.stringify(validateTickers(input.tickers)),
      validateDuration(input.duration_min),
      validateMode(input.reason_reveal_mode),
      input.sell_reason_required ? 1 : 0,
      now(),
    );
    return publicEvent(parseEvent(q('SELECT * FROM events WHERE id=?').get(info.lastInsertRowid)));
  }

  function updateEvent(input = {}) {
    const ev = currentEvent();
    if (!ev) throw new GameError('이벤트가 없습니다.', 404);
    if (ev.status === 'ended') throw new GameError('종료된 이벤트는 수정할 수 없습니다.', 409);
    const hasPlayers = participantCount(ev.id) > 0;
    const next = { ...ev };
    if ('name' in input) next.name = validateName(input.name);
    if ('reason_reveal_mode' in input) next.reason_reveal_mode = validateMode(input.reason_reveal_mode);
    if ('sell_reason_required' in input) next.sell_reason_required = !!input.sell_reason_required;
    if ('duration_min' in input && ev.status === 'ready') next.duration_min = validateDuration(input.duration_min);
    if ('initial_balance' in input) {
      if (hasPlayers) throw new GameError('참가자가 있으면 시작 가상자금을 바꿀 수 없습니다. (공정성을 위해) 초기화 후 변경하세요.', 409);
      next.initial_balance = validateBalance(input.initial_balance);
    }
    if ('tickers' in input) {
      const nt = validateTickers(input.tickers);
      // 종목을 "추가"하는 것은 기존 보유에 영향이 없어 참가자가 있어도 허용. 빼는 것만 막는다.
      if (hasPlayers && !ev.tickers.every((t) => nt.includes(t))) {
        throw new GameError('참가자가 있으면 종목을 추가만 할 수 있습니다. 종목을 빼려면 초기화 후 변경하세요.', 409);
      }
      next.tickers = nt;
    }
    // 진행 중 종료 시간 조정: 지금부터 N분 뒤에 끝나도록
    if ('end_in_min' in input && ev.status === 'running') {
      const m = validateDuration(input.end_in_min);
      next.end_at = m == null ? null : now() + m * 60000;
    }
    q(`UPDATE events SET name=?, initial_balance=?, tickers=?, duration_min=?, reason_reveal_mode=?, sell_reason_required=?, end_at=? WHERE id=?`).run(
      next.name, next.initial_balance, JSON.stringify(next.tickers), next.duration_min, next.reason_reveal_mode,
      next.sell_reason_required ? 1 : 0, next.end_at, ev.id,
    );
    return publicEvent(currentEvent());
  }

  function startEvent() {
    const ev = currentEvent();
    if (!ev) throw new GameError('이벤트가 없습니다.', 404);
    if (ev.status !== 'ready') throw new GameError('시작 전 상태의 이벤트만 시작할 수 있습니다.', 409);
    const t = now();
    const end = ev.duration_min ? t + ev.duration_min * 60000 : null;
    q("UPDATE events SET status='running', start_at=?, end_at=? WHERE id=?").run(t, end, ev.id);
    return publicEvent(currentEvent());
  }

  function endEvent() {
    const ev = currentEvent();
    if (!ev) throw new GameError('이벤트가 없습니다.', 404);
    if (ev.status !== 'running') throw new GameError('진행 중인 이벤트만 종료할 수 있습니다.', 409);
    endEventAt(ev, now());
    return publicEvent(currentEvent());
  }

  function resetEvent() {
    const ev = currentEvent();
    if (!ev) throw new GameError('이벤트가 없습니다.', 404);
    tx(() => {
      for (const t of ['transactions', 'holdings', 'accounts']) q(`DELETE FROM ${t} WHERE event_id=?`).run(ev.id);
      q('DELETE FROM users WHERE event_id=?').run(ev.id);
      q("UPDATE events SET status='ready', start_at=NULL, end_at=NULL, ended_at=NULL, frozen_prices=NULL WHERE id=?").run(ev.id);
    });
    return publicEvent(currentEvent());
  }

  // ---------- 가격 ----------
  function priceOf(ev, ticker) {
    if (ev.status === 'ended') return ev.frozen?.[ticker] ?? market.priceAt(ticker, ev.ended_at);
    return market.priceAt(ticker, now());
  }
  const refTime = (ev) => (ev.status === 'ended' ? ev.ended_at : now());

  function stocks(ev) {
    const at = refTime(ev);
    return ev.tickers.map((ticker) => {
      const meta = TICKER_MAP.get(ticker);
      const price = priceOf(ev, ticker);
      const prev = market.prevClose(ticker, at);
      return {
        ticker, name: meta.name, group: meta.group, unit: meta.unit, leverage: meta.leverage ?? 1, sector: meta.sector, info: meta.info,
        price, prev_close: prev, change: price - prev, change_rate: (price - prev) / prev,
        volume: market.todayVolume(ticker, at),
      };
    });
  }

  function candles(ev, ticker, range) {
    if (!ev || !ev.tickers.includes(ticker)) throw new GameError('종목을 찾을 수 없습니다.', 404);
    const out = market.candles(ticker, range, refTime(ev));
    if (!out) throw new GameError('지원하지 않는 기간입니다.');
    return out;
  }

  // ---------- 참가 / 인증 ----------
  function join(rawNickname) {
    const ev = currentEvent();
    if (!ev) throw new GameError('진행 중인 이벤트가 없습니다. 너굴(운영자)에게 문의하세요.', 404);
    if (ev.status === 'ended') throw new GameError('이미 종료된 이벤트입니다.', 409);
    if (typeof rawNickname !== 'string') throw new GameError('닉네임을 입력하세요.');
    const nickname = clean(rawNickname);
    if (len(nickname) < 1 || len(nickname) > LIMITS.nickname) throw new GameError(`닉네임은 1~${LIMITS.nickname}자로 입력하세요.`);
    if (!NICK_RE.test(nickname)) throw new GameError('닉네임에는 한글, 영문, 숫자, 공백, _ - . 만 사용할 수 있습니다.');
    const token = randomBytes(24).toString('hex');
    return tx(() => {
      let code;
      do {
        code = Array.from(randomBytes(4), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
      } while (q('SELECT 1 FROM users WHERE event_id=? AND participant_code=?').get(ev.id, code));
      const u = q('INSERT INTO users (event_id, nickname, participant_code, token_hash, created_at) VALUES (?,?,?,?,?)')
        .run(ev.id, nickname, code, sha(token), now());
      q('INSERT INTO accounts (user_id, event_id, cash, peak_total, low_total) VALUES (?,?,?,?,?)')
        .run(u.lastInsertRowid, ev.id, ev.initial_balance, ev.initial_balance, ev.initial_balance);
      return { token, code, nickname };
    });
  }

  function authenticate(token) {
    if (typeof token !== 'string' || token.length < 16 || token.length > 200) return null;
    const ev = currentEvent();
    if (!ev) return null;
    const u = q('SELECT * FROM users WHERE token_hash=? AND event_id=?').get(sha(token), ev.id);
    return u ? { user: u, ev } : null;
  }

  // ---------- 평가 / 순위 ----------
  function positionsFor(ev, userId) {
    const rows = q('SELECT ticker, quantity, average_price, leverage FROM holdings WHERE user_id=? ORDER BY ticker').all(userId);
    return rows.map((h) => {
      const price = priceOf(ev, h.ticker);
      const value = equityOf(h.quantity, h.average_price, h.leverage, price);
      const margin = Math.round((h.quantity * h.average_price) / h.leverage); // 증거금(레버리지 1배면 매수금액)
      return {
        ticker: h.ticker, ...tinfo(h.ticker), quantity: h.quantity, leverage: h.leverage, margin,
        average_price: Math.round(h.average_price), price, value,
        profit: value - margin, return_rate: margin ? (value - margin) / margin : 0, // 레버리지 상품은 증거금 대비 수익률
      };
    });
  }

  function account(ev, userId) {
    const a = q('SELECT cash, peak_total, low_total FROM accounts WHERE user_id=?').get(userId);
    const positions = positionsFor(ev, userId);
    const stockValue = positions.reduce((s, p) => s + p.value, 0);
    const total = a.cash + stockValue;
    return {
      cash: a.cash, stock_value: stockValue, total,
      return_rate: (total - ev.initial_balance) / ev.initial_balance,
      positions, peak_total: Math.max(a.peak_total, total), low_total: Math.min(a.low_total, total),
    };
  }

  // 순위표 계산. 진행 중에는 최고/최저 총자산을 갱신한다(리포트의 최대 평가손익용).
  // 레버리지 포지션이 증거금을 모두 잃었는지(평가액 0) 찾는다.
  function findLiquidations(ev, userId) {
    if (ev.status !== 'running') return [];
    const rows = userId
      ? q('SELECT user_id, ticker, quantity, average_price, leverage FROM holdings WHERE event_id=? AND leverage>1 AND user_id=?').all(ev.id, userId)
      : q('SELECT user_id, ticker, quantity, average_price, leverage FROM holdings WHERE event_id=? AND leverage>1').all(ev.id);
    return rows.filter((h) => equityOf(h.quantity, h.average_price, h.leverage, priceOf(ev, h.ticker)) === 0);
  }
  // 강제청산: 포지션을 지우고 증거금을 잃은 것으로 기록한다. (트랜잭션 안에서 호출)
  function applyLiquidations(list, ev) {
    for (const h of list) {
      const margin = Math.round((h.quantity * h.average_price) / h.leverage);
      q('DELETE FROM holdings WHERE user_id=? AND ticker=?').run(h.user_id, h.ticker);
      q(`INSERT INTO transactions (user_id, event_id, ticker, type, quantity, price, reason, realized_pl, leverage, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(h.user_id, ev.id, h.ticker, 'sell', h.quantity, priceOf(ev, h.ticker),
        '강제청산: 가격이 반대로 크게 움직여 증거금이 모두 소진되었어요.', -margin, h.leverage, now());
    }
  }

  function board(ev) {
    if (ev.status === 'running' && findLiquidations(ev).length) tx(() => applyLiquidations(findLiquidations(ev), ev));
    const users = q(`SELECT u.id, u.nickname, u.participant_code AS code, u.created_at, a.cash, a.peak_total, a.low_total
      FROM users u JOIN accounts a ON a.user_id=u.id WHERE u.event_id=?`).all(ev.id);
    const hold = new Map();
    for (const h of q('SELECT user_id, ticker, quantity, average_price, leverage FROM holdings WHERE event_id=?').all(ev.id)) {
      if (!hold.has(h.user_id)) hold.set(h.user_id, []);
      hold.get(h.user_id).push(h);
    }
    const price = new Map(ev.tickers.map((t) => [t, priceOf(ev, t)]));
    const rows = users.map((u) => {
      const hs = hold.get(u.id) ?? [];
      const stockValue = hs.reduce((s, h) => s + equityOf(h.quantity, h.average_price, h.leverage, price.get(h.ticker) ?? 0), 0);
      const total = u.cash + stockValue;
      return {
        user_id: u.id, nickname: u.nickname, code: u.code, created_at: u.created_at,
        cash: u.cash, stock_value: stockValue, total, return_rate: (total - ev.initial_balance) / ev.initial_balance,
        holdings_count: hs.length, _peak: u.peak_total, _low: u.low_total,
      };
    });
    rows.sort((a, b) => b.total - a.total || a.created_at - b.created_at || a.user_id - b.user_id);
    rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].rank : i + 1; });
    if (ev.status === 'running') {
      const upd = q('UPDATE accounts SET peak_total=?, low_total=? WHERE user_id=?');
      for (const r of rows) {
        if (r.total > r._peak || r.total < r._low) upd.run(Math.max(r._peak, r.total), Math.min(r._low, r.total), r.user_id);
      }
    }
    return rows.map(({ _peak, _low, created_at, ...r }) => r);
  }

  const reasonsVisible = (ev, isOwner, isAdmin) => isAdmin || isOwner || ev.reason_reveal_mode === 'live' || ev.status === 'ended';

  function publicBoardRow(r) {
    return { rank: r.rank, nickname: r.nickname, code: r.code, total: r.total, return_rate: r.return_rate };
  }

  function ranking(ev) {
    if (!ev) return { event: null, rows: [], reasons: [], reasons_visible: false };
    const rows = board(ev);
    const visible = reasonsVisible(ev, false, false);
    let reasons = [];
    if (visible) {
      reasons = q(`SELECT t.ticker, t.quantity, t.price, t.reason, t.created_at, u.nickname, u.participant_code AS code
        FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.event_id=? AND t.type='buy' ORDER BY t.id DESC LIMIT 30`)
        .all(ev.id).map((r) => ({ ...r, ...tinfo(r.ticker) }));
    }
    const avg = rows.length ? rows.reduce((s, r) => s + r.return_rate, 0) / rows.length : 0;
    return {
      event: publicEvent(ev), rows: rows.map(publicBoardRow), average_return: avg,
      reasons_visible: visible, reasons,
    };
  }

  // ---------- 내 상태 ----------
  function myState(auth) {
    const { user, ev } = auth;
    const rows = board(ev);
    const me = rows.find((r) => r.user_id === user.id);
    const acc = account(ev, user.id);
    return {
      event: publicEvent(ev),
      me: { nickname: user.nickname, code: user.participant_code, rank: me?.rank ?? null, participants: rows.length, ...acc },
      stocks: stocks(ev),
    };
  }

  function myTransactions(auth, limit = 100) {
    const rows = q(`SELECT id, ticker, type, quantity, price, reason, realized_pl, created_at FROM transactions
      WHERE user_id=? ORDER BY id DESC LIMIT ?`).all(auth.user.id, limit);
    return rows.map((r) => ({ ...r, ...tinfo(r.ticker) }));
  }

  // ---------- 가상 매수/매도 ----------
  function validateReason(raw, required) {
    if (raw == null || raw === '') {
      if (required) throw new GameError(`이유를 ${LIMITS.reasonMin}자 이상 적어주세요.`);
      return null;
    }
    if (typeof raw !== 'string') throw new GameError('이유 형식이 올바르지 않습니다.');
    const r = clean(raw);
    if (r === '' && !required) return null;
    if (len(r) < LIMITS.reasonMin) throw new GameError(`이유를 ${LIMITS.reasonMin}자 이상 적어주세요. (지금 ${len(r)}자)`);
    if (len(r) > LIMITS.reasonMax) throw new GameError(`이유는 ${LIMITS.reasonMax}자 이하로 적어주세요.`);
    return r;
  }

  function trade(auth, input = {}) {
    const { user } = auth;
    // 증거금이 모두 소진된 레버리지 포지션은 먼저 강제청산하고 확정한다. (이후 거래가 오류로 되돌려져도 청산 기록은 남는다)
    const ev0 = currentEvent();
    if (ev0 && ev0.id === auth.ev.id && findLiquidations(ev0, user.id).length) tx(() => applyLiquidations(findLiquidations(ev0, user.id), ev0));
    return tx(() => {
      const ev = currentEvent(); // 트랜잭션 안에서 최신 상태 확인
      if (!ev || ev.id !== auth.ev.id) throw new GameError('이벤트가 변경되었습니다. 다시 접속해주세요.', 409);
      if (ev.status === 'ready') throw new GameError('아직 게임이 시작되지 않았습니다. 너굴의 시작 신호를 기다려주세요.', 409);
      if (ev.status === 'ended') throw new GameError('게임이 종료되어 더 이상 거래할 수 없습니다.', 409);
      const { ticker, side } = input;
      if (!ev.tickers.includes(ticker)) throw new GameError('이 게임에서 거래할 수 없는 종목입니다.');
      if (side !== 'buy' && side !== 'sell') throw new GameError('거래 유형이 올바르지 않습니다.');
      const qty = input.quantity;
      if (!Number.isSafeInteger(qty) || qty < 1 || qty > LIMITS.maxQuantity) {
        throw new GameError(`수량은 1 ~ ${LIMITS.maxQuantity.toLocaleString('ko-KR')} 사이의 정수여야 합니다.`);
      }
      const reason = validateReason(input.reason, side === 'buy' || ev.sell_reason_required);

      // 체결가는 항상 서버가 정한다. 클라이언트가 보낸 가격은 사용하지 않는다.
      const price = priceOf(ev, ticker);
      const amount = price * qty; // 명목 거래금액
      const lev = levOf(ticker);
      const acc = q('SELECT cash FROM accounts WHERE user_id=?').get(user.id);
      const h = q('SELECT quantity, average_price, leverage FROM holdings WHERE user_id=? AND ticker=?').get(user.id, ticker);
      let realized = null;
      let cashChange; // 현금 증감: 매수는 -증거금, 매도는 +정산금

      if (side === 'buy') {
        if (h && h.leverage !== lev) throw new GameError('이 종목은 거래 방식이 바뀌었어요. 기존 보유를 먼저 매도해주세요.', 409);
        const margin = Math.ceil(amount / lev); // 필요한 증거금(레버리지 1배면 매수금액)
        if (margin > acc.cash) throw new GameError(lev > 1 ? '가상현금(증거금)이 부족합니다.' : '가상현금이 부족합니다.');
        cashChange = -margin;
        q('UPDATE accounts SET cash = cash - ? WHERE user_id=?').run(margin, user.id);
        if (h) {
          const nq = h.quantity + qty;
          const avg = (h.quantity * h.average_price + amount) / nq;
          q('UPDATE holdings SET quantity=?, average_price=? WHERE user_id=? AND ticker=?').run(nq, avg, user.id, ticker);
        } else {
          q('INSERT INTO holdings (user_id, event_id, ticker, quantity, average_price, leverage) VALUES (?,?,?,?,?,?)').run(user.id, ev.id, ticker, qty, price, lev);
        }
      } else {
        if (!h || h.quantity < qty) throw new GameError('보유한 수량보다 많이 매도할 수 없습니다.');
        const marginPart = (qty * h.average_price) / h.leverage;
        const proceeds = equityOf(qty, h.average_price, h.leverage, price); // 정산금 = 증거금 + 손익 (0 미만이면 0)
        realized = proceeds - Math.round(marginPart);
        cashChange = proceeds;
        q('UPDATE accounts SET cash = cash + ? WHERE user_id=?').run(proceeds, user.id);
        if (h.quantity === qty) q('DELETE FROM holdings WHERE user_id=? AND ticker=?').run(user.id, ticker);
        else q('UPDATE holdings SET quantity = quantity - ? WHERE user_id=? AND ticker=?').run(qty, user.id, ticker);
      }
      const info = q(`INSERT INTO transactions (user_id, event_id, ticker, type, quantity, price, reason, realized_pl, leverage, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(user.id, ev.id, ticker, side, qty, price, reason, realized, h?.leverage ?? lev, now());
      return { id: Number(info.lastInsertRowid), ticker, ...tinfo(ticker), type: side, quantity: qty, price, amount, leverage: h?.leverage ?? lev,
        cash_change: cashChange, realized_pl: realized };
    });
  }

  // ---------- 비교 ----------
  function compare(auth, code) {
    const { user, ev } = auth;
    const rows = board(ev);
    const them = rows.find((r) => r.code === String(code).toUpperCase());
    if (!them) throw new GameError('참가자를 찾을 수 없습니다.', 404);
    const meRow = rows.find((r) => r.user_id === user.id);
    const isSelf = them.user_id === user.id;
    const detail = (row, owner) => {
      const visible = reasonsVisible(ev, owner, false);
      const base = { nickname: row.nickname, code: row.code, rank: row.rank, total: row.total, return_rate: row.return_rate, details_visible: visible };
      if (!visible) return base;
      const reasons = q(`SELECT ticker, type, quantity, price, reason, created_at FROM transactions WHERE user_id=? AND reason IS NOT NULL ORDER BY id DESC LIMIT 50`)
        .all(row.user_id).map((r) => ({ ...r, ...tinfo(r.ticker) }));
      return { ...base, cash: row.cash, positions: positionsFor(ev, row.user_id), reasons };
    };
    return { me: detail(meRow, true), other: isSelf ? null : detail(them, false), reveal_mode: ev.reason_reveal_mode, ended: ev.status === 'ended' };
  }

  // ---------- 투자 리포트 ----------
  function report(auth) {
    const { user, ev } = auth;
    const rows = board(ev);
    const me = rows.find((r) => r.user_id === user.id);
    const acc = account(ev, user.id);
    const txs = q('SELECT ticker, type, quantity, price, reason, realized_pl, created_at FROM transactions WHERE user_id=? ORDER BY id').all(user.id);
    const counts = new Map();
    for (const t of txs) counts.set(t.ticker, (counts.get(t.ticker) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const weights = acc.positions.map((p) => ({ ticker: p.ticker, name: p.name, weight: acc.total ? p.value / acc.total : 0 }));
    weights.push({ ticker: 'CASH', name: '가상현금', weight: acc.total ? acc.cash / acc.total : 0 });
    const stockWeights = acc.positions.map((p) => (acc.stock_value ? p.value / acc.stock_value : 0));
    const maxStockWeight = stockWeights.length ? Math.max(...stockWeights) : 0;

    // 교육용 해설: 특정 전략을 정답으로 제시하지 않고 관찰 결과만 설명한다.
    const insights = [];
    if (acc.positions.length === 0) {
      insights.push('현재 보유한 주식이 없어 자산이 모두 가상현금입니다. 현금만 들고 있으면 가격 변동에 따른 손익은 없지만, 다른 선택지와 비교해볼 수 있습니다.');
    } else if (acc.positions.length === 1) {
      insights.push('이번 게임에서는 한 종목에 주식 자산이 집중되었습니다. 실제 투자에서도 자산을 여러 곳에 나누는 방식이 위험 관리에 활용될 수 있습니다.');
    } else if (maxStockWeight >= 0.7) {
      insights.push('여러 종목을 보유했지만 한 종목의 비중이 큽니다. 종목 수와 비중은 다른 개념이라는 점을 확인해보세요.');
    } else {
      insights.push(`${acc.positions.length}개 종목에 비교적 고르게 나누어 보유했습니다. 나눠 담으면 한 종목의 가격 변동이 전체 자산에 미치는 영향이 줄어드는 경향이 있습니다.`);
    }
    const cashShare = acc.total ? acc.cash / acc.total : 0;
    if (cashShare >= 0.5 && acc.positions.length > 0) insights.push('자산의 절반 이상을 현금으로 보유했습니다. 현금 비중은 변동에 덜 흔들리는 대신 가격이 오를 때의 변화도 함께 줄어듭니다.');
    if (txs.length >= 20) insights.push('거래 횟수가 많았습니다. 자주 사고파는 것과 한 번 정하고 지켜보는 것의 결과를 비교해보세요.');
    insights.push('이 결과는 짧은 시간 동안의 가상 게임 결과이며, 실제 투자 성과나 미래 수익을 의미하지 않습니다. 특정한 투자 방법이 정답이라는 뜻도 아닙니다.');

    const sells = txs.filter((t) => t.type === 'sell' && t.realized_pl != null);
    const unreal = acc.positions.map((p) => p.profit);
    return {
      event: publicEvent(ev), is_final: ev.status === 'ended',
      nickname: user.nickname, code: user.participant_code,
      rank: me?.rank ?? null, participants: rows.length,
      total: acc.total, return_rate: acc.return_rate, cash: acc.cash, stock_value: acc.stock_value,
      trade_count: txs.length, buy_count: txs.filter((t) => t.type === 'buy').length, sell_count: sells.length,
      most_traded: top ? { ticker: top[0], ...tinfo(top[0]), count: top[1] } : null,
      weights, max_total: acc.peak_total, min_total: acc.low_total,
      max_unrealized_gain: unreal.length ? Math.max(0, ...unreal) : 0,
      max_unrealized_loss: unreal.length ? Math.min(0, ...unreal) : 0,
      best_realized: sells.length ? Math.max(...sells.map((s) => s.realized_pl)) : null,
      worst_realized: sells.length ? Math.min(...sells.map((s) => s.realized_pl)) : null,
      reasons: txs.filter((t) => t.reason).map((t) => ({ ...t, ...tinfo(t.ticker) })).reverse(),
      insights,
    };
  }

  // ---------- 관리자 ----------
  function adminOverview() {
    const ev = currentEvent();
    if (!ev) return { event: null };
    const rows = board(ev);
    const txRows = q('SELECT ticker, type, quantity, price FROM transactions WHERE event_id=?').all(ev.id);
    const perTicker = new Map();
    for (const t of txRows) {
      const e = perTicker.get(t.ticker) ?? { ticker: t.ticker, ...tinfo(t.ticker), buy_qty: 0, sell_qty: 0, amount: 0, count: 0 };
      e[t.type === 'buy' ? 'buy_qty' : 'sell_qty'] += t.quantity;
      e.amount += t.quantity * t.price;
      e.count += 1;
      perTicker.set(t.ticker, e);
    }
    const tradeCounts = new Map(q('SELECT user_id, COUNT(*) AS n FROM transactions WHERE event_id=? GROUP BY user_id').all(ev.id).map((r) => [r.user_id, r.n]));
    const elapsed = ev.start_at ? (ev.status === 'ended' ? ev.ended_at : now()) - ev.start_at : 0;
    return {
      event: publicEvent(ev),
      stats: {
        participants: rows.length,
        leader: rows[0] ? publicBoardRow(rows[0]) : null,
        average_return: rows.length ? rows.reduce((s, r) => s + r.return_rate, 0) / rows.length : 0,
        trade_count: txRows.length,
        per_ticker: [...perTicker.values()].sort((a, b) => b.count - a.count),
        elapsed_ms: elapsed,
      },
      board: rows.map((r) => ({ ...publicBoardRow(r), cash: r.cash, stock_value: r.stock_value, trades: tradeCounts.get(r.user_id) ?? 0 })),
      stocks: stocks(ev),
    };
  }

  function adminTransactions(limit = 500) {
    const ev = currentEvent();
    if (!ev) return [];
    return q(`SELECT t.id, t.ticker, t.type, t.quantity, t.price, t.reason, t.realized_pl, t.created_at, u.nickname, u.participant_code AS code
      FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.event_id=? ORDER BY t.id DESC LIMIT ?`).all(ev.id, limit)
      .map((r) => ({ ...r, ...tinfo(r.ticker) }));
  }

  return {
    currentEvent, publicEvent, createEvent, updateEvent, startEvent, endEvent, resetEvent,
    stocks, candles, join, authenticate, myState, myTransactions, trade, compare, report,
    ranking, adminOverview, adminTransactions, board,
  };
}
