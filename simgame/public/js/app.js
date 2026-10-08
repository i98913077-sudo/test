import { el, $, clear, fmtCompact, fmt, fmtP, fmtPct, fmtSigned, dir, arrow, fmtTime, fmtDuration, store, api, banner, disclaimerBlock, toast, COLORS } from './common.js';
import { drawCandles } from './chart.js';

const app = $('#app');
const S = { state: null, tab: 'market', selected: null, range: '1d', query: '', candles: null, compareCode: null, clockOffset: 0, tradeCtx: null };
let pollTimer, clockTimer, candleTimer;

const EDU_CARDS = [
  ['주식이란?', '기업의 소유권을 나눈 단위로, 거래되는 금융상품 중 하나입니다.'],
  ['분산이란?', '여러 자산이나 종목에 나누어 담는 개념입니다. 한 곳의 변동이 전체에 미치는 영향이 달라질 수 있습니다.'],
  ['위험과 수익', '높은 수익 가능성에는 손실 가능성도 함께 존재할 수 있습니다.'],
  ['등락률이란?', '이전 기준 가격 대비 얼마나 올랐거나 내렸는지를 퍼센트로 나타낸 값입니다.'],
  ['평균 매수가(평단)', '여러 번 나누어 샀을 때 한 주당 평균적으로 얼마에 샀는지를 계산한 값입니다.'],
  ['평가손익이란?', '아직 팔지 않은 주식을 현재 가격으로 계산했을 때의 이익이나 손실입니다. 팔기 전에는 확정되지 않습니다.'],
];
const MISSIONS = [
  '오늘의 미션: 가상자산 1억 P로 나만의 포트폴리오를 구성해보세요.',
  '오늘의 미션: 서로 다른 3개 종목에 나누어 담아보세요.',
  '오늘의 미션: 한 종목에 모든 돈을 넣었을 때 어떤 일이 생길 수 있는지 확인해보세요.',
  '오늘의 미션: 내가 적은 매수 이유가 맞았는지 나중에 되돌아보세요.',
];
let eduIdx = Math.floor(Math.random() * EDU_CARDS.length), missionIdx = 0;

const serverNow = () => Date.now() + S.clockOffset;
const syncClock = (ev) => { if (ev?.server_time) S.clockOffset = ev.server_time - Date.now(); };

// ───────────── 시작 ─────────────
boot();
async function boot() {
  if (store.token) {
    try { start(await api('/api/state', { token: store.token })); return; }
    catch (e) { if (e.status === 401) store.token = null; }
  }
  renderIntro();
}

// ───────────── 인트로 / 참가 ─────────────
async function renderIntro(message) {
  stopTimers();
  clear(app);
  let event = null;
  try { event = (await api('/api/event')).event; } catch { /* 아래에서 안내 */ }
  const nick = el('input', { class: 'input', id: 'nick', maxlength: 12, placeholder: '닉네임 (최대 12자)', autocomplete: 'off', 'aria-label': '닉네임' });
  const agree = el('input', { type: 'checkbox', id: 'agree' });
  const err = el('p', { class: 'err', role: 'alert' }, message ?? '');
  const btn = el('button', { class: 'btn primary block', disabled: true }, '확인하고 참가하기');
  const canJoin = event && event.status !== 'ended';
  const sync = () => { btn.disabled = !(agree.checked && nick.value.trim()); };
  agree.addEventListener('change', sync); nick.addEventListener('input', sync);
  const submit = async (e) => {
    e?.preventDefault();
    if (btn.disabled) return;
    btn.disabled = true; err.textContent = '';
    try {
      const j = await api('/api/join', { method: 'POST', body: { nickname: nick.value } });
      store.token = j.token;
      start(await api('/api/state', { token: j.token }));
    } catch (ex) { err.textContent = ex.message; sync(); }
  };
  btn.addEventListener('click', submit);
  nick.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(e); });

  const status = !event ? '현재 열려 있는 이벤트가 없습니다. 선생님의 안내를 기다려주세요.'
    : event.status === 'ended' ? `「${event.name}」 이벤트가 종료되었습니다.`
    : event.status === 'ready' ? `「${event.name}」 · 곧 시작합니다 (참가자 ${event.participants}명 대기 중)`
    : `「${event.name}」 · 진행 중 (참가자 ${event.participants}명)`;

  app.append(banner(), el('main', { class: 'wrap' },
    el('div', { class: 'hero' },
      el('div', { class: 'logo' }, 'SAFE INVEST'),
      el('h1', {}, '우리 반 모의투자 챌린지'),
      el('p', { class: 'muted' }, canJoin ? `가상 포인트 ${event.initial_balance.toLocaleString('ko-KR')}P로 시작해요` : '교육용 가상 모의투자 게임')),
    el('div', { class: 'card' }, el('b', {}, status)),
    el('div', { class: 'notice' },
      el('b', {}, '📢 모의투자 게임 안내'), el('br'),
      '이 게임은 금융교육 및 수업 활동을 위한 가상 모의투자 게임입니다. 게임에서 사용하는 포인트는 실제 돈이 아니며 현금으로 교환할 수 없습니다. 게임 결과는 실제 투자수익을 의미하지 않습니다. 실제 투자 판단은 각자의 책임과 충분한 정보 확인이 필요합니다.'),
    canJoin ? el('form', { class: 'card', onsubmit: submit },
      el('label', { class: 'field', for: 'nick' }, '닉네임'),
      nick,
      el('p', { class: 'muted small' }, '실명, 전화번호 등 개인정보는 입력하지 마세요. 닉네임만으로 참가하고, 참가 코드는 자동으로 만들어져요.'),
      el('label', { class: 'check', for: 'agree' }, agree, el('span', {}, '위 안내를 읽었고, 가상 포인트로 하는 교육용 게임임을 이해했습니다.')),
      btn, err) : el('div', { class: 'card' }, el('a', { class: 'btn block', href: '/ranking' }, '🏆 최종 순위 보기')),
    el('p', { class: 'muted small' }, '※ 브라우저 저장소를 지우면 참가 정보가 사라져 같은 계정으로 돌아올 수 없어요.'),
    disclaimerBlock()));
  if (canJoin) nick.focus();
}

// ───────────── 게임 셸 ─────────────
let ui = {};
function start(first) {
  S.state = first; syncClock(first.event);
  S.tab = 'market'; S.selected = null; S.compareCode = null;
  clear(app);
  ui.summary = el('section', { class: 'card summary' });
  ui.status = el('div');
  ui.content = el('div', { id: 'content' });
  ui.tabs = el('nav', { class: 'tabbar', 'aria-label': '메뉴' },
    ...[['market', '📈', '시장'], ['account', '💼', '내 계좌'], ['rank', '🏆', '랭킹'], ['report', '📝', '리포트']].map(([k, ic, label]) =>
      el('button', { 'data-tab': k, onclick: () => showTab(k) }, el('span', { class: 'ic' }, ic), label)));
  app.append(banner(), el('main', { class: 'wrap' }, ui.summary, ui.status, ui.content, disclaimerBlock()), ui.tabs);
  renderSummary();
  showTab('market');
  stopTimers();
  pollTimer = setInterval(poll, 5000);
  clockTimer = setInterval(tickClock, 1000);
  window.addEventListener('resize', redrawChart);
}
function stopTimers() { clearInterval(pollTimer); clearInterval(clockTimer); clearInterval(candleTimer); window.removeEventListener('resize', redrawChart); }

async function poll() {
  try {
    S.state = await api('/api/state', { token: store.token });
    syncClock(S.state.event);
    renderSummary();
    refreshActiveTab();
  } catch (e) {
    if (e.status === 401) { store.token = null; closeOverlays(); renderIntro('참가 정보가 만료되었거나 이벤트가 초기화되었어요. 다시 참가해주세요.'); }
  }
}
function closeOverlays() { document.querySelectorAll('.overlay').forEach((o) => o.remove()); }

function tickClock() {
  const t = $('#timer');
  const ev = S.state?.event;
  if (!t || !ev) return;
  if (ev.status === 'running' && ev.end_at) t.textContent = `남은 시간 ${fmtDuration(ev.end_at - serverNow())}`;
  else t.textContent = '';
  if (ev.status === 'running' && ev.end_at && serverNow() > ev.end_at + 500) poll();
}

function setCompact(on) { ui.summary?.classList.toggle('compact', !!on); }
function renderSummary() {
  const { me, event } = S.state;
  const label = event.status === 'running' ? el('span', { class: 'pill live' }, '● 진행 중') : event.status === 'ready' ? el('span', { class: 'pill' }, '시작 대기') : el('span', { class: 'pill' }, '종료');
  clear(ui.summary).append(
    el('div', { class: 'who' }, el('b', {}, `${me.nickname}`, el('span', { class: 'muted small' }, ` #${me.code}`)), el('span', {}, label, ' ', el('span', { class: 'timer small', id: 'timer' }))),
    el('div', { class: 'total num' }, fmtP(me.total)),
    el('div', { class: `retline ${dir(me.return_rate)} num`, 'aria-label': '게임 수익률' }, `${arrow(me.return_rate)} 게임 수익률 ${fmtPct(me.return_rate)}  (${fmtSigned(me.total - event.initial_balance)})`),
    el('div', { class: 'stat-grid three sumstats' },
      stat('가상현금', fmtCompact(me.cash)), stat('주식 평가', fmtCompact(me.stock_value)),
      stat('현재 순위', me.rank ? `${me.rank}위/${me.participants}명` : '-')));
  const notes = [];
  if (event.status === 'ready') notes.push(el('div', { class: 'notice' }, '⏳ 아직 게임이 시작되지 않았어요. 선생님의 시작 신호를 기다리는 동안 종목을 살펴보세요.'));
  if (event.status === 'ended') notes.push(el('div', { class: 'notice' }, '🏁 게임이 종료되었어요. 거래는 더 할 수 없고, 리포트 탭에서 나의 투자 리포트를 확인할 수 있어요.'));
  clear(ui.status).append(...notes);
  tickClock();
}
const stat = (k, v) => el('div', { class: 'stat' }, el('div', { class: 'k' }, k), el('div', { class: 'v num' }, v));

function showTab(tab) {
  S.tab = tab; S.compareCode = null;
  if (tab !== 'market') S.selected = null;
  setCompact(false);
  clearInterval(candleTimer);
  ui.tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  clear(ui.content);
  ({ market: renderMarket, account: renderAccount, rank: renderRank, report: renderReport })[tab]();
  window.scrollTo({ top: 0 });
}
function refreshActiveTab() {
  if (S.tab === 'market') { if (S.selected) updateDetailHead(); else updateStockList(); }
  else if (S.tab === 'account') renderAccount(true);
  else if (S.tab === 'rank' && !S.compareCode) renderRank(true);
  if (S.tradeCtx) S.tradeCtx.refresh();
}

// ───────────── 시장 탭 ─────────────
function renderMarket() {
  if (S.selected) return renderDetail();
  const [eduT, eduB] = EDU_CARDS[eduIdx];
  const search = el('input', { class: 'input', type: 'search', id: 'q', placeholder: '🔍 종목 검색 (예: 삼성전자)', value: S.query, 'aria-label': '종목 검색' });
  search.addEventListener('input', () => { S.query = search.value; updateStockList(); });
  ui.list = el('div', { id: 'stock-list' });
  ui.content.append(
    el('div', { class: 'card mission' }, el('b', {}, MISSIONS[missionIdx % MISSIONS.length]),
      el('div', {}, el('button', { class: 'btn sm', onclick: () => { missionIdx++; renderMarket2(); } }, '다른 미션 보기'))),
    el('div', { class: 'card card-edu' }, el('b', {}, `💡 ${eduT}`), el('div', {}, eduB),
      el('div', {}, el('button', { class: 'btn sm', onclick: () => { eduIdx = (eduIdx + 1) % EDU_CARDS.length; renderMarket2(); } }, '다음 카드'))),
    el('div', { class: 'notice small' }, '표시되는 가격은 수업을 위한 샘플(DEMO) 가격이며 실제 시세가 아닙니다. 종목 설명은 교육용 정보이며 투자 권유가 아닙니다.'),
    search, ui.list);
  updateStockList();
}
function renderMarket2() { const q = S.query; clear(ui.content); renderMarket(); S.query = q; }

function updateStockList() {
  if (!ui.list || !ui.list.isConnected) return;
  const q = S.query.trim().toLowerCase();
  const items = S.state.stocks.filter((s) => !q || s.name.toLowerCase().includes(q) || s.ticker.includes(q));
  clear(ui.list);
  if (!items.length) ui.list.append(el('p', { class: 'muted' }, '검색 결과가 없어요.'));
  for (const s of items) {
    const held = S.state.me.positions.find((p) => p.ticker === s.ticker);
    ui.list.append(el('button', { class: 'stock', onclick: () => { S.selected = s.ticker; S.range = '1d'; setCompact(true); clear(ui.content); renderDetail(); window.scrollTo({ top: 0 }); } },
      el('div', {}, el('div', { class: 'name' }, s.name), el('div', { class: 'sub' }, `${s.ticker} · ${s.sector}${held ? ` · 보유 ${fmt(held.quantity)}주` : ''}`)),
      el('div', { class: 'px num' }, el('div', { class: 'name' }, fmtP(s.price)), el('div', { class: `${dir(s.change)} small` }, `${arrow(s.change)} ${fmtPct(s.change_rate)}`))));
  }
}

const RANGES = [['1d', '1일'], ['1w', '1주'], ['1m', '1개월'], ['3m', '3개월']];
function renderDetail() {
  const s = S.state.stocks.find((x) => x.ticker === S.selected);
  ui.detailHead = el('div', { class: 'card' });
  ui.ohlc = el('div', { class: 'ohlc', 'aria-live': 'polite' }, '차트를 누르거나 드래그하면 값을 볼 수 있어요.');
  ui.canvas = el('canvas', { 'aria-label': `${s.name} 캔들차트` });
  ui.chartBox = el('div', { class: 'chart-box' }, ui.canvas);
  ui.chips = el('div', { class: 'chips', role: 'tablist' }, ...RANGES.map(([k, label]) =>
    el('button', { class: `chip${k === S.range ? ' active' : ''}`, 'data-r': k, onclick: () => { S.range = k; ui.chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.r === k)); loadCandles(); } }, label)));
  ui.actions = el('div', { class: 'row actions' });
  ui.detailStats = el('div', { class: 'card' });
  ui.content.append(
    el('button', { class: 'btn sm', onclick: () => { S.selected = null; setCompact(false); clear(ui.content); renderMarket(); } }, '← 종목 목록'),
    ui.detailHead, ui.actions, ui.chips, ui.chartBox, ui.ohlc, ui.detailStats,
    el('div', { class: 'card' }, el('b', {}, '종목 기본정보'), el('div', { class: 'muted' }, `${s.sector}`), el('div', {}, s.info),
      el('div', { class: 'muted small' }, '가격은 수업용 샘플(DEMO) 데이터이며 실제 시세가 아닙니다.')));
  updateDetailHead();
  loadCandles();
  clearInterval(candleTimer);
  candleTimer = setInterval(loadCandles, 15000);
}
async function loadCandles() {
  if (!S.selected) return;
  const key = `${S.selected}|${S.range}`;
  try {
    const r = await api(`/api/stocks/${S.selected}/candles?range=${S.range}`);
    if (key !== `${S.selected}|${S.range}`) return;
    S.candles = r.candles; redrawChart();
  } catch { /* 다음 주기에 재시도 */ }
}
function redrawChart() {
  if (!S.selected || !ui.canvas?.isConnected || !S.candles) return;
  drawCandles(ui.canvas, S.candles, {
    onHover: (c) => {
      const d = new Date(c.t);
      const when = S.range === '1d' || S.range === '1w' ? d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('ko-KR');
      ui.ohlc.textContent = `${when}  시 ${fmt(c.o)} · 고 ${fmt(c.h)} · 저 ${fmt(c.l)} · 종 ${fmt(c.c)} · 거래량 ${fmt(c.v)}`;
    },
  });
}
function updateDetailHead() {
  if (!ui.detailHead?.isConnected) return;
  const s = S.state.stocks.find((x) => x.ticker === S.selected);
  const held = S.state.me.positions.find((p) => p.ticker === s.ticker);
  const canTrade = S.state.event.status === 'running';
  clear(ui.detailHead).append(
    el('div', { class: 'row between' }, el('h2', {}, s.name), el('span', { class: 'muted small' }, s.ticker)),
    el('div', { class: 'row between' },
      el('div', { class: 'total num' }, el('b', { class: 'num', id: 'px' }, fmtP(s.price))),
      el('div', { class: `${dir(s.change)} num` }, `${arrow(s.change)} ${fmt(Math.abs(s.change))}P (${fmtPct(s.change_rate)})`)),
    );
  clear(ui.detailStats).append(el('div', { class: 'stat-grid' }, stat('전일 종가', fmtP(s.prev_close)), stat('오늘 거래량', `${fmt(s.volume)}주`),
      stat('내 보유', held ? `${fmt(held.quantity)}주` : '없음'), stat('내 평균 매수가', held ? fmtP(held.average_price) : '-')));
  clear(ui.actions).append(
    el('button', { class: 'btn buy grow', disabled: !canTrade, onclick: () => openTrade('buy', s.ticker) }, '모의 매수'),
    el('button', { class: 'btn sell grow', disabled: !canTrade || !held, onclick: () => openTrade('sell', s.ticker) }, '모의 매도'));
  if (!canTrade) ui.actions.append(el('p', { class: 'muted small' }, S.state.event.status === 'ready' ? '게임 시작 후 거래할 수 있어요.' : '게임이 종료되어 거래할 수 없어요.'));
}

// ───────────── 매수/매도 ─────────────
function openTrade(side, ticker) {
  closeOverlays();
  const isBuy = side === 'buy';
  const cur = () => S.state.stocks.find((x) => x.ticker === ticker);
  const held = () => S.state.me.positions.find((p) => p.ticker === ticker);
  const needReason = isBuy || S.state.event.sell_reason_required;
  const qty = el('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1, step: 1, value: '1', id: 'qty', 'aria-label': '수량' });
  const reason = el('textarea', { class: 'input', id: 'reason', maxlength: 200, placeholder: isBuy ? '예) 요즘 이 회사 제품이 많이 팔린다는 기사를 읽어서, 앞으로도 잘 팔릴 것 같다고 생각했어요.' : '예) 목표했던 만큼 올라서 일부를 팔아 현금을 확보하고 싶어요.', 'aria-label': isBuy ? '매수 이유' : '매도 이유' });
  const count = el('span', { class: 'muted small' }, '0 / 200자');
  const err = el('p', { class: 'err', role: 'alert' });
  const priceLine = el('b', { class: 'num' });
  const amountLine = el('b', { class: 'num' });
  const limitLine = el('span', { class: 'num muted' });
  const submit = el('button', { class: `btn ${isBuy ? 'buy' : 'sell'} grow` }, isBuy ? '매수 확인' : '매도 확인');
  const getQty = () => (/^\d+$/.test(qty.value.trim()) ? Number(qty.value.trim()) : NaN);
  const maxQty = () => (isBuy ? Math.floor(S.state.me.cash / cur().price) : held()?.quantity ?? 0);

  function refresh() {
    const s = cur(), n = getQty();
    priceLine.textContent = fmtP(s.price);
    amountLine.textContent = Number.isFinite(n) ? fmtP(n * s.price) : '-';
    limitLine.textContent = isBuy ? `가상현금 ${fmtP(S.state.me.cash)} · 최대 ${fmt(maxQty())}주` : `보유 ${fmt(maxQty())}주`;
    const rl = Array.from(reason.value.trim()).length;
    count.textContent = `${rl} / 200자${needReason ? ' · 최소 10자' : ''}`;
    submit.disabled = !Number.isFinite(n) || n < 1 || (needReason && rl < 10) || n > maxQty() || S.state.event.status !== 'running';
    err.textContent = Number.isFinite(n) && n > maxQty() ? (isBuy ? '가상현금이 부족해요.' : '보유 수량보다 많이 팔 수 없어요.') : '';
  }
  const step = (d) => { const n = getQty(); qty.value = String(Math.max(1, (Number.isFinite(n) ? n : 0) + d)); refresh(); };
  qty.addEventListener('input', refresh); reason.addEventListener('input', refresh);

  const close = () => { S.tradeCtx = null; overlay.remove(); };
  submit.addEventListener('click', () => confirmTrade());
  function confirmTrade() {
    const s = cur(), n = getQty(), r = reason.value.trim();
    const ok = el('button', { class: `btn ${isBuy ? 'buy' : 'sell'} grow` }, isBuy ? '네, 모의 매수 할게요' : '네, 모의 매도 할게요');
    const cerr = el('p', { class: 'err', role: 'alert' });
    const dlg = el('div', { class: 'overlay center', role: 'dialog', 'aria-modal': 'true' }, el('div', { class: 'sheet center' },
      el('h2', {}, isBuy ? '모의 매수 확인' : '모의 매도 확인'),
      el('div', { class: 'card' },
        sumLine('종목', s.name), sumLine('수량', `${fmt(n)}주`), sumLine('예상 체결가', fmtP(s.price)), sumLine('예상 거래금액', fmtP(n * s.price)),
        r ? el('div', { class: 'reason-item' }, `${isBuy ? '매수' : '매도'} 이유: ${r}`) : null),
      el('p', { class: 'muted small' }, '실제 주문이 아니에요. 확인하는 순간의 게임 가격으로 체결돼요. 가격이 바뀌면 체결 금액도 달라질 수 있어요.'),
      cerr, el('div', { class: 'row' }, el('button', { class: 'btn grow', onclick: () => dlg.remove() }, '돌아가기'), ok)));
    ok.addEventListener('click', async () => {
      ok.disabled = true; cerr.textContent = '';
      try {
        const res = await api('/api/trade', { method: 'POST', token: store.token, body: { ticker, side, quantity: n, reason: r || undefined } });
        S.state = res.state; syncClock(S.state.event);
        dlg.remove(); close(); renderSummary(); refreshActiveTab();
        toast(`${isBuy ? '모의 매수' : '모의 매도'} 체결: ${res.trade.name} ${fmt(res.trade.quantity)}주 @ ${fmtP(res.trade.price)}`);
      } catch (e) {
        cerr.textContent = e.message; ok.disabled = false;
        if (e.status === 401) poll();
      }
    });
    document.body.append(dlg);
  }

  const quick = isBuy ? [['25%', 0.25], ['50%', 0.5], ['최대', 1]] : [['절반', 0.5], ['전량', 1]];
  const overlay = el('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' }, el('div', { class: 'sheet' },
    el('div', { class: 'row between' }, el('h2', {}, `${isBuy ? '모의 매수' : '모의 매도'} · ${cur().name}`), el('button', { class: 'btn sm', onclick: close, 'aria-label': '닫기' }, '✕')),
    el('div', { class: 'notice small' }, '🎓 가상 포인트로 하는 게임 속 거래예요. 실제 주문이 아니에요.'),
    sumLine('현재 게임 가격', priceLine),
    el('label', { class: 'field', for: 'qty' }, '수량 (주)'),
    el('div', { class: 'qty-row' },
      el('button', { class: 'qty-btn', onclick: () => step(-10) }, '-10'), el('button', { class: 'qty-btn', onclick: () => step(-1) }, '-1'), qty,
      el('button', { class: 'qty-btn', onclick: () => step(1) }, '+1'), el('button', { class: 'qty-btn', onclick: () => step(10) }, '+10')),
    el('div', { class: 'row' }, ...quick.map(([label, f]) => el('button', { class: 'btn sm grow', onclick: () => { qty.value = String(Math.max(1, Math.floor(maxQty() * f))); refresh(); } }, label))),
    el('div', { class: 'row between small' }, limitLine),
    sumLine('예상 거래금액', amountLine),
    el('label', { class: 'field', for: 'reason' }, isBuy ? '매수 이유 (필수)' : (needReason ? '매도 이유 (필수)' : '매도 이유 (선택)')),
    reason, el('div', { class: 'row between' }, count),
    err,
    el('div', { class: 'row' }, el('button', { class: 'btn grow', onclick: close }, '취소'), submit)));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  S.tradeCtx = { refresh };
  refresh();
  (isBuy ? qty : reason).focus();
}
const sumLine = (k, v) => el('div', { class: 'sum-line' }, el('span', { class: 'muted' }, k), el('span', { class: 'num' }, v));

// ───────────── 내 계좌 ─────────────
let txCache = null;
async function renderAccount(silent) {
  const { me } = S.state;
  if (!silent || !txCache) { try { txCache = (await api('/api/transactions', { token: store.token })).transactions; } catch { txCache ??= []; } }
  if (S.tab !== 'account') return;
  const openKeys = new Set([...ui.content.querySelectorAll('details[open]')].map((d) => d.dataset.k));
  const reasonsBy = (ticker) => txCache.filter((t) => t.ticker === ticker && t.type === 'buy' && t.reason);
  clear(ui.content).append(
    el('div', { class: 'card' }, el('h2', {}, '내 포트폴리오'),
      el('div', { class: 'sum-line' }, el('span', {}, '가상현금'), el('b', { class: 'num' }, fmtP(me.cash))),
      me.positions.length === 0 ? el('p', { class: 'muted' }, '아직 보유한 주식이 없어요. 시장 탭에서 종목을 골라보세요.') : null,
      ...me.positions.map((p) => el('div', { class: 'pos' },
        el('div', { class: 'row between' }, el('b', {}, p.name), el('b', { class: `${dir(p.return_rate)} num` }, `${arrow(p.return_rate)} ${fmtPct(p.return_rate)}`)),
        el('div', { class: 'row between small muted num' }, el('span', {}, `${fmt(p.quantity)}주 · 평균 ${fmtP(p.average_price)}`), el('span', {}, `평가 ${fmtP(p.value)}`)),
        el('div', { class: `small num ${dir(p.profit)}` }, `평가손익 ${fmtSigned(p.profit)}`),
        reasonsBy(p.ticker).length ? el('details', { class: 'reasons', 'data-k': p.ticker, open: openKeys.has(p.ticker) },
          el('summary', {}, '내가 적은 매수 이유'), ...reasonsBy(p.ticker).map((t) => el('div', { class: 'reason-item' }, `${fmtTime(t.created_at)} · ${fmt(t.quantity)}주 @ ${fmtP(t.price)}\n${t.reason}`))) : null)),
      el('hr'), el('div', { class: 'sum-line' }, el('b', {}, '총자산'), el('b', { class: 'num' }, fmtP(me.total))),
      el('div', { class: `sum-line ${dir(me.return_rate)}` }, el('b', {}, '게임 수익률'), el('b', { class: 'num' }, fmtPct(me.return_rate)))),
    el('div', { class: 'card' }, el('h2', {}, '거래 기록'),
      txCache.length ? el('div', {}, ...txCache.map((t) => el('div', { class: 'pos' },
        el('div', { class: 'row between' }, el('b', { class: t.type === 'buy' ? 'up' : 'down' }, `${t.type === 'buy' ? '모의 매수' : '모의 매도'} · ${t.name}`), el('span', { class: 'muted small' }, fmtTime(t.created_at))),
        el('div', { class: 'small num' }, `${fmt(t.quantity)}주 @ ${fmtP(t.price)} = ${fmtP(t.quantity * t.price)}`),
        t.realized_pl != null ? el('div', { class: `small ${dir(t.realized_pl)}` }, `실현손익 ${fmtSigned(t.realized_pl)}`) : null,
        t.reason ? el('div', { class: 'reason-item small' }, t.reason) : null))) : el('p', { class: 'muted' }, '아직 거래 기록이 없어요.')));
}

// ───────────── 랭킹 / 비교 ─────────────
async function renderRank(silent) {
  let data;
  try { data = await api('/api/ranking'); } catch { return; }
  if (S.tab !== 'rank' || S.compareCode) return;
  const me = S.state.me;
  clear(ui.content).append(
    el('div', { class: 'card' }, el('div', { class: 'row between' }, el('h2', {}, '🏆 우리 반 모의투자 랭킹'), el('a', { class: 'btn sm', href: '/ranking', target: '_blank', rel: 'noopener' }, '큰 화면')),
      el('p', { class: 'muted small' }, '순위는 게임 내 총자산 기준이며, 실제 투자 성과나 미래 수익을 의미하지 않습니다. 참가자를 누르면 나와 비교할 수 있어요.'),
      data.rows.length ? null : el('p', { class: 'muted' }, '아직 참가자가 없어요.'),
      ...data.rows.map((r) => el('button', { class: `rank-row${r.code === me.code ? ' me' : ''}`, onclick: () => openCompare(r.code) },
        el('div', { class: 'rank-no' }, r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `${r.rank}`),
        el('div', {}, el('div', { class: 'rank-name' }, r.nickname, el('span', { class: 'muted small' }, ` #${r.code}${r.code === me.code ? ' (나)' : ''}`)), el('div', { class: 'small muted num' }, fmtP(r.total))),
        el('div', { class: `rank-right num ${dir(r.return_rate)}` }, el('b', {}, `${arrow(r.return_rate)} ${fmtPct(r.return_rate)}`))))));
}
async function openCompare(code) {
  S.compareCode = code;
  clear(ui.content).append(el('p', { class: 'muted' }, '불러오는 중…'));
  let c;
  try { c = await api(`/api/compare?code=${encodeURIComponent(code)}`, { token: store.token }); }
  catch (e) { toast(e.message); S.compareCode = null; return renderRank(); }
  const col = (p, title) => el('div', { class: 'col' },
    el('div', { class: 'small muted' }, title),
    el('b', {}, p.nickname, el('span', { class: 'muted small' }, ` #${p.code}`)),
    el('div', { class: 'num' }, `${p.rank}위`), el('div', { class: 'num small' }, fmtP(p.total)),
    el('b', { class: `num ${dir(p.return_rate)}` }, `${arrow(p.return_rate)} ${fmtPct(p.return_rate)}`));
  const detail = (p) => !p.details_visible
    ? el('div', { class: 'card muted' }, `🔒 ${p.nickname}님의 보유 종목과 매수 이유는 ${c.reveal_mode === 'after_end' ? '게임이 끝난 뒤' : '선생님이 공개하면'} 볼 수 있어요.`)
    : el('div', { class: 'card' }, el('h3', {}, `${p.nickname}님의 포트폴리오`),
      p.positions.length ? el('div', {}, ...p.positions.map((x) => el('div', { class: 'sum-line' }, el('span', {}, `${x.name} ${fmt(x.quantity)}주`), el('b', { class: `num ${dir(x.return_rate)}` }, fmtPct(x.return_rate))))) : el('p', { class: 'muted small' }, '보유한 주식이 없어요.'),
      el('div', { class: 'sum-line small muted' }, el('span', {}, '가상현금'), el('span', { class: 'num' }, fmtP(p.cash))),
      p.reasons.length ? el('details', { class: 'reasons', open: true }, el('summary', {}, '거래 이유'), ...p.reasons.map((t) => el('div', { class: 'reason-item' }, `${t.type === 'buy' ? '매수' : '매도'} · ${t.name} ${fmt(t.quantity)}주\n${t.reason}`))) : null);
  const diff = c.other ? c.me.return_rate - c.other.return_rate : null;
  clear(ui.content).append(
    el('button', { class: 'btn sm', onclick: () => { S.compareCode = null; renderRank(); } }, '← 랭킹으로'),
        el('h2', {}, c.other ? '수익률 비교' : '내 정보'),
    el('div', { class: 'cmp' }, col(c.me, '나'), c.other ? col(c.other, '상대') : null),
    diff != null ? el('p', { class: 'card' }, `나는 ${c.other.nickname}님보다 수익률이 ${diff === 0 ? '같아요' : `${Math.abs(diff * 100).toFixed(2)}%p ${diff > 0 ? '높아요' : '낮아요'}`}.`) : null,
    detail(c.me), c.other ? detail(c.other) : null,
    el('p', { class: 'muted small' }, '비교는 학습용이며 어떤 선택이 정답이라는 뜻이 아니에요.'));
}

// ───────────── 리포트 ─────────────
async function renderReport() {
  clear(ui.content).append(el('p', { class: 'muted' }, '리포트를 만드는 중…'));
  let r;
  try { r = await api('/api/report', { token: store.token }); } catch (e) { clear(ui.content).append(el('p', { class: 'err' }, e.message)); return; }
  if (S.tab !== 'report') return;
  clear(ui.content).append(
    el('div', { class: 'card' }, el('h2', {}, r.is_final ? '📝 나의 투자 리포트' : '📝 중간 리포트'),
      !r.is_final ? el('p', { class: 'muted small' }, '아직 게임이 진행 중이라 지금까지의 결과예요. 게임이 끝나면 최종 리포트가 됩니다.') : null,
      el('div', { class: 'stat-grid' }, stat('총자산', fmtP(r.total)), stat('게임 수익률', fmtPct(r.return_rate)), stat('순위', r.rank ? `${r.rank}위 / ${r.participants}명` : '-'),
        stat('거래 횟수', `${r.trade_count}회 (매수 ${r.buy_count} · 매도 ${r.sell_count})`),
        stat('가장 많이 거래한 종목', r.most_traded ? `${r.most_traded.name} (${r.most_traded.count}회)` : '-'),
        stat('최고 / 최저 총자산', `${fmt(r.max_total)} / ${fmt(r.min_total)}`),
        stat('최대 평가이익', fmtSigned(r.max_unrealized_gain)), stat('최대 평가손실', fmtSigned(r.max_unrealized_loss)))),
    el('div', { class: 'card' }, el('h3', {}, '자산 구성 (분산 비율)'), weightsBar(r.weights)),
    el('div', { class: 'card card-edu' }, el('h3', {}, '💡 이번 게임에서 살펴볼 점'), ...r.insights.map((t) => el('p', {}, t))),
    el('div', { class: 'card' }, el('h3', {}, '내가 적은 거래 이유'),
      r.reasons.length ? el('div', {}, ...r.reasons.map((t) => el('div', { class: 'reason-item' }, `${t.type === 'buy' ? '매수' : '매도'} · ${t.name} ${fmt(t.quantity)}주 @ ${fmtP(t.price)}\n${t.reason}`))) : el('p', { class: 'muted' }, '기록된 이유가 없어요.')),
    el('a', { class: 'btn block', href: '/ranking' }, '🏆 우리 반 전체 순위 보기'));
}
function weightsBar(weights) {
  const bar = el('div', { class: 'bar', role: 'img', 'aria-label': '자산 구성 비율' });
  const legend = el('div', { class: 'legend' });
  weights.forEach((w, i) => {
    const color = w.ticker === 'CASH' ? '#9aa6bb' : COLORS[i % COLORS.length];
    const seg = el('span'); seg.style.width = `${(w.weight * 100).toFixed(2)}%`; seg.style.background = color;
    bar.append(seg);
    const dot = el('i'); dot.style.background = color;
    legend.append(el('span', {}, dot, `${w.name} ${(w.weight * 100).toFixed(1)}%`));
  });
  return el('div', {}, bar, legend);
}
