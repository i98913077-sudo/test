import { el, $, clear, fmtCompact, fmt, fmtP, fmtPct, fmtSigned, dir, arrow, fmtTime, fmtDuration, store, api, banner, disclaimerBlock, toast, COLORS } from './common.js';
import { drawCandles } from './chart.js';

// 화면 구성: 실제 증권 앱(MTS)처럼 하단 6개 메뉴. 모든 거래는 가상 포인트로 하는 게임이다.
const app = $('#app');
const TABS = [['watch', '⭐', '관심종목'], ['quote', '💹', '현재가'], ['order', '🧾', '주문'], ['chart', '📈', '차트'], ['account', '💼', '계좌'], ['menu', '☰', '메뉴']];
const GROUP_FILTERS = [['all', '전체', null], ['kr', '국내', ['kr']], ['us', '미국', ['us']], ['etc', '선물', ['idx', 'fx', 'oil']]];
const GROUP_NAMES = { kr: '국내주식', us: '미국주식', idx: '지수선물', fx: '달러선물', oil: '원유선물' };
const S = {
  state: null, tab: 'watch', sub: null, selected: null, side: 'buy', range: '1d', group: 'all', query: '', watchMode: 'fav',
  candles: null, mini: null, compareCode: null, clockOffset: 0, tradeCtx: null, favs: null,
};
let pollTimer, clockTimer, candleTimer;
const ui = {};
let txCache = null;

const EDU_CARDS = [
  ['주식이란?', '기업의 소유권을 나눈 단위로, 거래되는 금융상품 중 하나입니다.'],
  ['분산이란?', '여러 자산이나 종목에 나누어 담는 개념입니다. 한 곳의 변동이 전체에 미치는 영향이 달라질 수 있습니다.'],
  ['레버리지란?', '적은 돈(증거금)으로 더 큰 금액을 거래하는 방식이에요. 레버리지 10배면 주문금액의 1/10만 내지만 이익도 손실도 10배로 커져요.'],
  ['증거금과 강제청산', '증거금은 레버리지 거래를 위해 맡겨 두는 돈이에요. 가격이 반대로 크게 움직여 증거금을 모두 잃으면 포지션이 강제로 정리(강제청산)돼요.'],
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

// 관심종목은 이 기기에만 저장한다(개인정보 아님).
const FAV_KEY = 'safeinvest.favs';
function loadFavs() { try { const v = JSON.parse(localStorage.getItem(FAV_KEY)); return Array.isArray(v) ? v : null; } catch { return null; } }
function saveFavs() { try { localStorage.setItem(FAV_KEY, JSON.stringify(S.favs)); } catch { /* 저장 불가 환경 */ } }
function initFavs() {
  S.favs = loadFavs();
  if (S.favs) return;
  const have = S.state.stocks.map((s) => s.ticker);
  let f = ['005930', '000660', 'NVDA', 'TSLA', 'K200F'].filter((t) => have.includes(t));
  if (!f.length) f = have.slice(0, 5);
  S.favs = f; saveFavs();
}
const isFav = (t) => S.favs.includes(t);
function toggleFav(t) { S.favs = isFav(t) ? S.favs.filter((x) => x !== t) : [...S.favs, t]; saveFavs(); }

const curStock = () => S.state.stocks.find((s) => s.ticker === S.selected);
const posOf = (t) => S.state.me.positions.find((p) => p.ticker === t);
function ensureSelected() {
  if (!curStock()) S.selected = S.favs.find((t) => S.state.stocks.some((s) => s.ticker === t)) ?? S.state.stocks[0]?.ticker ?? null;
  return curStock();
}

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

  const status = !event ? '현재 열려 있는 이벤트가 없습니다. 너굴의 안내를 기다려주세요.'
    : event.status === 'ended' ? `「${event.name}」 이벤트가 종료되었습니다.`
    : event.status === 'ready' ? `「${event.name}」 · 곧 시작합니다 (참가자 ${event.participants}명 대기 중)`
    : `「${event.name}」 · 진행 중 (참가자 ${event.participants}명)`;

  app.append(banner(), el('main', { class: 'wrap' },
    el('div', { class: 'hero' },
      el('div', { class: 'logo' }, 'SAFE INVEST'),
      el('h1', {}, '너굴이들 모의투자 챌린지'),
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
      btn, err) : el('div', { class: 'card' }, el('a', { class: 'btn block', href: 'ranking.html' }, '🏆 최종 순위 보기')),
    el('p', { class: 'muted small' }, '※ 브라우저 저장소를 지우면 참가 정보가 사라져 같은 계정으로 돌아올 수 없어요.'),
    disclaimerBlock()));
  if (canJoin) nick.focus();
}

// ───────────── 게임 셸 ─────────────
function start(first) {
  S.state = first; syncClock(first.event);
  initFavs();
  S.tab = 'watch'; S.sub = null; S.compareCode = null; S.selected = null; S.side = 'buy'; txCache = null;
  ensureSelected();
  clear(app);
  ui.summary = el('section', { class: 'card summary' });
  ui.status = el('div');
  ui.content = el('div', { id: 'content' });
  ui.tabs = el('nav', { class: 'tabbar six', 'aria-label': '하단 메뉴' },
    ...TABS.map(([k, ic, label]) => el('button', { 'data-tab': k, onclick: () => showTab(k) }, el('span', { class: 'ic' }, ic), label)));
  app.append(banner(), el('main', { class: 'wrap' }, ui.summary, ui.status, ui.content, disclaimerBlock()), ui.tabs);
  renderSummary();
  showTab('watch');
  stopTimers();
  pollTimer = setInterval(poll, 5000);
  clockTimer = setInterval(tickClock, 1000);
  candleTimer = setInterval(() => { if (S.tab === 'chart') loadChart(); else if (S.tab === 'quote') loadMini(); }, 15000);
  window.addEventListener('resize', redrawCharts);
}
function stopTimers() { clearInterval(pollTimer); clearInterval(clockTimer); clearInterval(candleTimer); window.removeEventListener('resize', redrawCharts); }

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
  if (event.status === 'ready') notes.push(el('div', { class: 'notice' }, '⏳ 아직 게임이 시작되지 않았어요. 너굴의 시작 신호를 기다리는 동안 종목을 살펴보세요.'));
  if (event.status === 'ended') notes.push(el('div', { class: 'notice' }, '🏁 게임이 종료되었어요. 거래는 더 할 수 없고, 메뉴에서 나의 투자 리포트를 확인할 수 있어요.'));
  clear(ui.status).append(...notes);
  tickClock();
}
const stat = (k, v) => el('div', { class: 'stat' }, el('div', { class: 'k' }, k), el('div', { class: 'v num' }, v));
const sumLine = (k, v) => el('div', { class: 'sum-line' }, el('span', { class: 'muted' }, k), el('span', { class: 'num' }, v));
const backBtn = (label, fn) => el('button', { class: 'btn sm', onclick: fn }, label);

function showTab(tab, opts = {}) {
  S.tab = tab; S.compareCode = null; S.tradeCtx = null;
  if (tab !== 'menu' || opts.resetSub) S.sub = null;
  ui.summary.classList.add('compact'); // 상단은 항상 한 줄 요약. 상세는 각 화면(계좌 등)에서 보여준다
  ui.tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  clear(ui.content);
  ({ watch: renderWatch, quote: renderQuote, order: renderOrder, chart: renderChartTab, account: renderAccount, menu: renderMenu })[tab]();
  window.scrollTo({ top: 0 });
}
// 종목을 고르고 다른 탭으로 이동 (실제 MTS처럼 종목을 누르면 현재가 화면으로)
function selectStock(ticker, tab = 'quote', side) {
  if (S.selected !== ticker) { S.candles = null; S.mini = null; }
  S.selected = ticker;
  if (side) S.side = side;
  showTab(tab);
}
function refreshActiveTab() {
  if (S.tab === 'watch') updateWatchList();
  else if (S.tab === 'quote') updateQuote();
  else if (S.tab === 'order') { updateOrderHead(); S.tradeCtx?.refresh(); }
  else if (S.tab === 'chart') updateChartHead();
  else if (S.tab === 'account') renderAccount(true);
  else if (S.tab === 'menu' && S.sub === 'rank' && !S.compareCode) renderRank(true);
}

// 종목 선택 드롭다운 (현재가·주문·차트 공통)
function stockPicker() {
  const sel = el('select', { class: 'input picker', 'aria-label': '종목 선택' });
  for (const [g, name] of Object.entries(GROUP_NAMES)) {
    const list = S.state.stocks.filter((s) => s.group === g);
    if (!list.length) continue;
    sel.append(el('optgroup', { label: name }, ...list.map((s) => el('option', { value: s.ticker, selected: s.ticker === S.selected }, `${s.name} (${s.ticker})`))));
  }
  sel.addEventListener('change', () => { S.candles = null; S.mini = null; S.selected = sel.value; showTab(S.tab); });
  return sel;
}
const priceBlock = (s) => el('div', { class: 'pricebox' },
  el('div', { class: `bigprice num ${dir(s.change)}` }, fmt(s.price), el('span', { class: 'unitp' }, 'P')),
  el('div', { class: `num ${dir(s.change)}` }, `${arrow(s.change)} ${fmt(Math.abs(s.change))}P  ${fmtPct(s.change_rate)}`));
const leverNotice = (s) => ((s.leverage ?? 1) > 1 ? el('div', { class: 'notice small' }, `⚠️ 레버리지 ${s.leverage}배 상품: 주문금액의 1/${s.leverage}만 증거금으로 내고, 손익도 ${s.leverage}배로 커져요. 가격이 약 ${Math.round(100 / s.leverage)}% 반대로 움직이면 증거금을 모두 잃고 강제청산돼요. (가상 포인트로 하는 게임이에요)`) : null);

// ───────────── 관심종목 ─────────────
function renderWatch() {
  const search = el('input', { class: 'input', type: 'search', id: 'q', placeholder: '🔍 종목 검색 (예: 엔비디아, NVDA)', value: S.query, 'aria-label': '종목 검색' });
  search.addEventListener('input', () => { S.query = search.value; updateWatchList(); });
  ui.list = el('div', { id: 'stock-list' });
  const mode = el('div', { class: 'seg' }, ...[['fav', '⭐ 관심'], ['all', '전체 종목']].map(([k, label]) =>
    el('button', { class: `seg-btn${S.watchMode === k ? ' active' : ''}`, 'data-m': k, onclick: () => { S.watchMode = k; renderWatchAgain(); } }, label)));
  const groupChips = el('div', { class: 'chips wrap-chips', role: 'tablist', 'aria-label': '종목 구분' }, ...GROUP_FILTERS.map(([k, label]) =>
    el('button', { class: `chip${k === S.group ? ' active' : ''}`, 'data-g': k, onclick: () => { S.group = k; groupChips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.g === k)); updateWatchList(); } }, label)));
  ui.content.append(mode, groupChips, search,
    el('div', { class: 'notice small' }, '표시되는 가격은 수업을 위한 샘플(DEMO) 가격이며 실제 시세가 아닙니다. 종목 설명은 교육용 정보이며 투자 권유가 아닙니다. ⭐를 누르면 관심종목에 담겨요.'),
    ui.list);
  updateWatchList();
}
function renderWatchAgain() { clear(ui.content); renderWatch(); }

function updateWatchList() {
  if (!ui.list || !ui.list.isConnected) return;
  const q = S.query.trim().toLowerCase();
  const allowed = GROUP_FILTERS.find((g) => g[0] === S.group)?.[2];
  let items = S.state.stocks.filter((s) => (!allowed || allowed.includes(s.group)) && (!q || s.name.toLowerCase().includes(q) || s.ticker.toLowerCase().includes(q)));
  if (S.watchMode === 'fav' && !q) items = items.filter((s) => isFav(s.ticker));
  clear(ui.list);
  if (!items.length) {
    const noneInGroup = !q && allowed && !S.state.stocks.some((x) => allowed.includes(x.group));
    ui.list.append(el('div', { class: noneInGroup ? 'notice' : 'muted' }, noneInGroup
      ? '이 구분의 종목은 아직 이 게임에 없어요. 너굴(운영자)에게 관리자 화면에서 종목을 추가해 달라고 말해 주세요.'
      : S.watchMode === 'fav' && !q ? '관심종목이 비어 있어요. "전체 종목"에서 ⭐를 눌러 담아보세요.' : '검색 결과가 없어요.'));
    return;
  }
  for (const s of items) {
    const held = posOf(s.ticker);
    const star = el('button', { class: `star${isFav(s.ticker) ? ' on' : ''}`, 'aria-label': isFav(s.ticker) ? '관심종목에서 빼기' : '관심종목에 담기', onclick: (e) => { e.stopPropagation(); toggleFav(s.ticker); updateWatchList(); } }, isFav(s.ticker) ? '★' : '☆');
    ui.list.append(el('div', { class: 'wrow' }, star,
      el('button', { class: 'stock grow', onclick: () => selectStock(s.ticker, 'quote') },
        el('div', {}, el('div', { class: 'name' }, s.name), el('div', { class: 'sub' }, `${s.ticker} · ${s.sector}${(s.leverage ?? 1) > 1 ? ` · 레버리지 ${s.leverage}배` : ''}${held ? ` · 보유 ${fmt(held.quantity)}${held.unit}` : ''}`)),
        el('div', { class: 'px num' }, el('div', { class: 'name' }, fmtP(s.price)), el('div', { class: `${dir(s.change)} small` }, `${arrow(s.change)} ${fmtPct(s.change_rate)}`)))));
  }
}

// ───────────── 현재가 ─────────────
function renderQuote() {
  const s = ensureSelected();
  if (!s) { ui.content.append(el('p', { class: 'muted' }, '거래할 수 있는 종목이 없어요.')); return; }
  ui.qHead = el('div', { class: 'card' });
  ui.qActions = el('div', { class: 'row actions' });
  ui.qCanvas = el('canvas', { 'aria-label': `${s.name} 1일 차트` });
  ui.qStats = el('div', { class: 'card' });
  ui.content.append(stockPicker(), ui.qHead, ui.qActions,
    el('div', { class: 'chart-box mini' }, ui.qCanvas),
    ui.qStats,
    el('div', { class: 'card' }, el('b', {}, '종목 기본정보'), el('div', { class: 'muted' }, s.sector), el('div', {}, s.info),
      el('div', { class: 'muted small' }, '가격은 수업용 샘플(DEMO) 데이터이며 실제 시세가 아닙니다.')));
  updateQuote();
  loadMini();
}
function updateQuote() {
  if (!ui.qHead?.isConnected) return;
  const s = curStock(); if (!s) return;
  const held = posOf(s.ticker);
  const canTrade = S.state.event.status === 'running';
  clear(ui.qHead).append(
    el('div', { class: 'row between' }, el('div', {}, el('h2', {}, s.name), el('span', { class: 'muted small' }, `${s.ticker} · ${s.sector}`)),
      el('button', { class: `star big${isFav(s.ticker) ? ' on' : ''}`, 'aria-label': '관심종목 담기/빼기', onclick: () => { toggleFav(s.ticker); updateQuote(); } }, isFav(s.ticker) ? '★' : '☆')),
    priceBlock(s), leverNotice(s));
  clear(ui.qActions).append(
    el('button', { class: 'btn buy grow', disabled: !canTrade, onclick: () => selectStock(s.ticker, 'order', 'buy') }, '매수'),
    el('button', { class: 'btn sell grow', disabled: !canTrade || !held, onclick: () => selectStock(s.ticker, 'order', 'sell') }, '매도'));
  if (!canTrade) ui.qActions.append(el('p', { class: 'muted small' }, S.state.event.status === 'ready' ? '게임 시작 후 거래할 수 있어요.' : '게임이 종료되어 거래할 수 없어요.'));
  clear(ui.qStats).append(el('div', { class: 'stat-grid' },
    stat('전일 종가', fmtP(s.prev_close)), stat('오늘 거래량', `${fmt(s.volume)}${s.unit}`),
    stat('내 보유', held ? `${fmt(held.quantity)}${held.unit}` : '없음'), stat('내 평균 매수가', held ? fmtP(held.average_price) : '-'),
    stat('평가손익', held ? fmtSigned(held.profit) : '-'), stat(held?.leverage > 1 ? '수익률(증거금 대비)' : '수익률', held ? fmtPct(held.return_rate) : '-')));
}

// ───────────── 차트 ─────────────
const RANGES = [['1d', '1일'], ['1w', '1주'], ['1m', '1개월'], ['3m', '3개월']];
function renderChartTab() {
  const s = ensureSelected();
  if (!s) { ui.content.append(el('p', { class: 'muted' }, '거래할 수 있는 종목이 없어요.')); return; }
  ui.cHead = el('div', { class: 'card slim' });
  ui.ohlc = el('div', { class: 'ohlc', 'aria-live': 'polite' }, '차트를 누르거나 드래그하면 값을 볼 수 있어요.');
  ui.cCanvas = el('canvas', { 'aria-label': `${s.name} 캔들차트` });
  const chips = el('div', { class: 'chips', role: 'tablist' }, ...RANGES.map(([k, label]) =>
    el('button', { class: `chip${k === S.range ? ' active' : ''}`, 'data-r': k, onclick: () => { S.range = k; S.candles = null; chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.r === k)); loadChart(); } }, label)));
  ui.content.append(stockPicker(), ui.cHead, chips,
    el('div', { class: 'chart-box' }, ui.cCanvas), ui.ohlc,
    el('div', { class: 'legend small' }, el('span', {}, el('i', { class: 'ma5' }), '이동평균 5'), el('span', {}, el('i', { class: 'ma20' }), '이동평균 20'), el('span', { class: 'muted' }, '아래 막대: 거래량')),
    el('div', { class: 'row actions' },
      el('button', { class: 'btn buy grow', disabled: S.state.event.status !== 'running', onclick: () => selectStock(s.ticker, 'order', 'buy') }, '매수'),
      el('button', { class: 'btn sell grow', disabled: S.state.event.status !== 'running' || !posOf(s.ticker), onclick: () => selectStock(s.ticker, 'order', 'sell') }, '매도')));
  updateChartHead();
  loadChart();
}
function updateChartHead() {
  if (!ui.cHead?.isConnected) return;
  const s = curStock(); if (!s) return;
  clear(ui.cHead).append(el('div', { class: 'row between' }, el('b', {}, s.name), priceBlock(s)));
}
async function fetchCandles(ticker, range) { return (await api(`/api/stocks/${encodeURIComponent(ticker)}/candles?range=${range}`)).candles; }
async function loadChart() {
  if (S.tab !== 'chart' || !S.selected) return;
  const key = `${S.selected}|${S.range}`;
  try {
    const c = await fetchCandles(S.selected, S.range);
    if (S.tab !== 'chart' || key !== `${S.selected}|${S.range}`) return;
    S.candles = c; redrawCharts();
  } catch { /* 다음 주기에 재시도 */ }
}
async function loadMini() {
  if (S.tab !== 'quote' || !S.selected) return;
  const t = S.selected;
  try {
    const c = await fetchCandles(t, '1d');
    if (S.tab !== 'quote' || t !== S.selected) return;
    S.mini = c; redrawCharts();
  } catch { /* 다음 주기에 재시도 */ }
}
function redrawCharts() {
  if (ui.cCanvas?.isConnected && S.candles && S.tab === 'chart') {
    drawCandles(ui.cCanvas, S.candles, {
      onHover: (c) => {
        const d = new Date(c.t);
        const when = S.range === '1d' || S.range === '1w' ? d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('ko-KR');
        ui.ohlc.textContent = `${when}  시 ${fmt(c.o)} · 고 ${fmt(c.h)} · 저 ${fmt(c.l)} · 종 ${fmt(c.c)} · 거래량 ${fmt(c.v)}`;
      },
    });
  }
  if (ui.qCanvas?.isConnected && S.mini && S.tab === 'quote') drawCandles(ui.qCanvas, S.mini, { ma: false });
}

// ───────────── 주문 ─────────────
function renderOrder() {
  const s = ensureSelected();
  if (!s) { ui.content.append(el('p', { class: 'muted' }, '거래할 수 있는 종목이 없어요.')); return; }
  ui.oHead = el('div', { class: 'card slim' });
  ui.oBody = el('div');
  const seg = el('div', { class: 'seg three' }, ...[['buy', '매수'], ['sell', '매도'], ['fills', '체결내역']].map(([k, label]) =>
    el('button', { class: `seg-btn ${k}${S.side === k ? ' active' : ''}`, 'data-side': k, onclick: () => { S.side = k; seg.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.side === k)); renderOrderBody(); } }, label)));
  ui.content.append(stockPicker(), ui.oHead, seg, ui.oBody);
  updateOrderHead();
  renderOrderBody();
}
function updateOrderHead() {
  if (!ui.oHead?.isConnected) return;
  const s = curStock(); if (!s) return;
  clear(ui.oHead).append(el('div', { class: 'row between' }, el('b', {}, s.name), priceBlock(s)));
}
async function renderOrderBody() {
  S.tradeCtx = null;
  clear(ui.oBody);
  if (S.side === 'fills') { ui.oBody.append(el('p', { class: 'muted' }, '불러오는 중…')); const box = ui.oBody; await renderFills(box); return; }
  const f = buildTradeForm(S.side, S.selected, () => renderOrderBody());
  ui.oBody.append(f.node);
  S.tradeCtx = { refresh: f.refresh };
  f.refresh();
}

// 주문 입력 폼. 실제 증권사 주문이 아니라 게임 DB에 가상 거래를 기록한다.
function buildTradeForm(side, ticker, onDone) {
  const isBuy = side === 'buy';
  const cur = () => S.state.stocks.find((x) => x.ticker === ticker);
  const held = () => posOf(ticker);
  const levered = (cur().leverage ?? 1) > 1;
  const needReason = isBuy || S.state.event.sell_reason_required;
  const qty = el('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1, step: 1, value: '1', id: 'qty', 'aria-label': '수량' });
  const reason = el('textarea', { class: 'input', id: 'reason', maxlength: 200, placeholder: isBuy ? '예) 요즘 이 회사 제품이 많이 팔린다는 기사를 읽어서, 앞으로도 잘 팔릴 것 같다고 생각했어요.' : '예) 목표했던 만큼 올라서 일부를 팔아 현금을 확보하고 싶어요.', 'aria-label': isBuy ? '매수 이유' : '매도 이유' });
  const count = el('span', { class: 'muted small' }, '0 / 200자');
  const err = el('p', { class: 'err', role: 'alert' });
  const priceLine = el('b', { class: 'num' });
  const amountLine = el('b', { class: 'num' });
  const marginLine = el('b', { class: 'num' });
  const limitLine = el('span', { class: 'num muted' });
  const submit = el('button', { class: `btn ${isBuy ? 'buy' : 'sell'} block` }, isBuy ? '매수 주문' : '매도 주문');
  const getQty = () => (/^\d+$/.test(qty.value.trim()) ? Number(qty.value.trim()) : NaN);
  const levNow = () => (isBuy ? cur().leverage ?? 1 : held()?.leverage ?? cur().leverage ?? 1);
  const maxQty = () => (isBuy ? Math.floor((S.state.me.cash * levNow()) / cur().price) : held()?.quantity ?? 0);
  // 매수: 필요 증거금 / 매도: 예상 정산금(증거금 + 손익, 0 미만이면 0)
  const marginFor = (n) => (isBuy ? Math.ceil((n * cur().price) / levNow()) : Math.max(0, Math.round(n * (cur().price - (held()?.average_price ?? cur().price) * (1 - 1 / levNow())))));

  function refresh() {
    const s = cur(), n = getQty();
    priceLine.textContent = fmtP(s.price);
    amountLine.textContent = Number.isFinite(n) ? fmtP(n * s.price) : '-';
    marginLine.textContent = Number.isFinite(n) ? fmtP(marginFor(n)) : '-';
    limitLine.textContent = isBuy ? `주문가능금액 ${fmtP(S.state.me.cash)} · 최대 ${fmt(maxQty())}${s.unit}` : `매도가능수량 ${fmt(maxQty())}${s.unit}`;
    const rl = Array.from(reason.value.trim()).length;
    count.textContent = `${rl} / 200자${needReason ? ' · 최소 10자' : ''}`;
    submit.disabled = !Number.isFinite(n) || n < 1 || (needReason && rl < 10) || n > maxQty() || S.state.event.status !== 'running';
    err.textContent = Number.isFinite(n) && n > maxQty() ? (isBuy ? (levered ? '증거금(가상현금)이 부족해요.' : '가상현금이 부족해요.') : '보유 수량보다 많이 팔 수 없어요.') : '';
  }
  const step = (d) => { const n = getQty(); qty.value = String(Math.max(1, (Number.isFinite(n) ? n : 0) + d)); refresh(); };
  qty.addEventListener('input', refresh); reason.addEventListener('input', refresh);

  submit.addEventListener('click', () => confirmTrade());
  function confirmTrade() {
    const s = cur(), n = getQty(), r = reason.value.trim();
    const ok = el('button', { class: `btn ${isBuy ? 'buy' : 'sell'} grow` }, isBuy ? '네, 모의 매수 할게요' : '네, 모의 매도 할게요');
    const cerr = el('p', { class: 'err', role: 'alert' });
    const dlg = el('div', { class: 'overlay center', role: 'dialog', 'aria-modal': 'true' }, el('div', { class: 'sheet center' },
      el('h2', {}, isBuy ? '모의 매수 확인' : '모의 매도 확인'),
      el('div', { class: 'card' },
        sumLine('종목', s.name), sumLine('수량', `${fmt(n)}${s.unit}`), sumLine('주문유형', '시장가'), sumLine('예상 체결가', fmtP(s.price)), sumLine(levered ? '명목 거래금액' : '예상 거래금액', fmtP(n * s.price)),
        levered ? sumLine(isBuy ? '필요 증거금 (현금에서 차감)' : '예상 정산금 (현금으로 입금)', fmtP(marginFor(n))) : null,
        levered ? sumLine('레버리지', `${levNow()}배`) : null,
        r ? el('div', { class: 'reason-item' }, `${isBuy ? '매수' : '매도'} 이유: ${r}`) : null),
      levered && isBuy ? el('div', { class: 'notice small' }, `⚠️ 손익이 ${levNow()}배로 커져요. 가격이 약 ${Math.round(100 / levNow())}% 반대로 움직이면 증거금을 모두 잃고 강제청산돼요.`) : null,
      el('p', { class: 'muted small' }, '실제 주문이 아니에요. 확인하는 순간의 게임 가격으로 체결돼요. 가격이 바뀌면 체결 금액도 달라질 수 있어요.'),
      cerr, el('div', { class: 'row' }, el('button', { class: 'btn grow', onclick: () => dlg.remove() }, '돌아가기'), ok)));
    ok.addEventListener('click', async () => {
      ok.disabled = true; cerr.textContent = '';
      try {
        const res = await api('/api/trade', { method: 'POST', token: store.token, body: { ticker, side, quantity: n, reason: r || undefined } });
        S.state = res.state; syncClock(S.state.event); txCache = null;
        dlg.remove(); renderSummary();
        toast(`${isBuy ? '모의 매수' : '모의 매도'} 체결: ${res.trade.name} ${fmt(res.trade.quantity)}${res.trade.unit} @ ${fmtP(res.trade.price)}`);
        updateOrderHead();
        onDone();
      } catch (e) {
        cerr.textContent = e.message; ok.disabled = false;
        if (e.status === 401) poll();
      }
    });
    document.body.append(dlg);
  }

  const quick = isBuy ? [['25%', 0.25], ['50%', 0.5], ['최대', 1]] : [['절반', 0.5], ['전량', 1]];
  const noHolding = !isBuy && !held();
  const node = el('div', { class: `card order-form ${isBuy ? 'is-buy' : 'is-sell'}` },
    sumLine('주문유형', '시장가'),
    el('div', { class: 'muted small' }, '현재 게임가격에 바로 체결돼요.'),
    sumLine('현재 게임 가격', priceLine),
    levered ? leverNotice(cur()) : null,
    noHolding ? el('div', { class: 'notice small' }, '이 종목을 보유하고 있지 않아 매도할 수 없어요. 먼저 매수해 보세요.') : null,
    el('label', { class: 'field', for: 'qty' }, `주문수량 (${cur().unit})`),
    el('div', { class: 'qty-row' },
      el('button', { class: 'qty-btn', onclick: () => step(-10) }, '-10'), el('button', { class: 'qty-btn', onclick: () => step(-1) }, '-1'), qty,
      el('button', { class: 'qty-btn', onclick: () => step(1) }, '+1'), el('button', { class: 'qty-btn', onclick: () => step(10) }, '+10')),
    el('div', { class: 'row' }, ...quick.map(([label, f]) => el('button', { class: 'btn sm grow', onclick: () => { qty.value = String(Math.max(1, Math.floor(maxQty() * f))); refresh(); } }, label))),
    el('div', { class: 'row between small' }, limitLine),
    sumLine(levered ? '명목 거래금액' : '예상 거래금액', amountLine),
    levered ? sumLine(isBuy ? '필요 증거금' : '예상 정산금', marginLine) : null,
    el('label', { class: 'field', for: 'reason' }, isBuy ? '매수 이유 (필수)' : (needReason ? '매도 이유 (필수)' : '매도 이유 (선택)')),
    reason, el('div', { class: 'row between' }, count),
    err, submit);
  return { node, refresh };
}

// 체결내역 (내 거래 기록)
async function renderFills(box) {
  if (!txCache) { try { txCache = (await api('/api/transactions', { token: store.token })).transactions; } catch { txCache = []; } }
  if (!box.isConnected) return;
  clear(box).append(el('div', { class: 'card' }, el('h2', {}, '체결내역'),
    txCache.length ? el('div', {}, ...txCache.map((t) => el('div', { class: 'pos' },
      el('div', { class: 'row between' }, el('b', { class: t.type === 'buy' ? 'up' : 'down' }, `${t.type === 'buy' ? '매수' : '매도'} · ${t.name}`), el('span', { class: 'muted small' }, fmtTime(t.created_at))),
      el('div', { class: 'small num' }, `${fmt(t.quantity)}${t.unit} @ ${fmtP(t.price)} = ${fmtP(t.quantity * t.price)}`),
      t.realized_pl != null ? el('div', { class: `small ${dir(t.realized_pl)}` }, `실현손익 ${fmtSigned(t.realized_pl)}`) : null,
      t.reason ? el('div', { class: 'reason-item small' }, t.reason) : null))) : el('p', { class: 'muted' }, '아직 체결내역이 없어요.')));
}

// ───────────── 계좌 ─────────────
async function renderAccount(silent) {
  const { me, event } = S.state;
  if (!silent || !txCache) { try { txCache = (await api('/api/transactions', { token: store.token })).transactions; } catch { txCache ??= []; } }
  if (S.tab !== 'account') return;
  const openKeys = new Set([...ui.content.querySelectorAll('details[open]')].map((d) => d.dataset.k));
  const reasonsBy = (ticker) => txCache.filter((t) => t.ticker === ticker && t.type === 'buy' && t.reason);
  const totalPl = me.total - event.initial_balance;
  clear(ui.content).append(
    el('div', { class: 'card acct' },
      el('div', { class: 'row between' }, el('h2', {}, '계좌 잔고'), el('span', { class: 'muted small' }, '가상 포인트')),
      sumLine('총평가금액', el('b', { class: 'num' }, fmtP(me.total))),
      sumLine('예수금 (가상현금)', fmtP(me.cash)),
      sumLine('주식 평가금액', fmtP(me.stock_value)),
      sumLine('총손익', el('b', { class: `num ${dir(totalPl)}` }, fmtSigned(totalPl))),
      sumLine('총수익률', el('b', { class: `num ${dir(me.return_rate)}` }, `${arrow(me.return_rate)} ${fmtPct(me.return_rate)}`)),
      sumLine('시작 자금', fmtP(event.initial_balance))),
    el('div', { class: 'card' }, el('h2', {}, '보유종목'),
      el('p', { class: 'muted small' }, '종목을 누르면 매수·매도·현재가·차트로 바로 이동할 수 있어요.'),
      me.positions.length === 0 ? el('p', { class: 'muted' }, '아직 보유한 종목이 없어요. 관심종목에서 종목을 골라 매수해 보세요.') : null,
      ...me.positions.map((p) => el('div', { class: 'holding' },
        el('button', { class: 'hrow', onclick: () => openActionSheet(p) },
          el('div', { class: 'row between' }, el('b', {}, p.name), el('b', { class: `num ${dir(p.profit)}` }, fmtSigned(p.profit))),
          el('div', { class: 'row between small num' }, el('span', { class: 'muted' }, `${fmt(p.quantity)}${p.unit} · 평균 ${fmtP(p.average_price)}`), el('b', { class: dir(p.return_rate) }, `${arrow(p.return_rate)} ${fmtPct(p.return_rate)}`)),
          el('div', { class: 'row between small num muted' }, el('span', {}, `현재가 ${fmtP(p.price)}`), el('span', {}, `평가 ${fmtP(p.value)}`)),
          p.leverage > 1 ? el('div', { class: 'small muted num' }, `레버리지 ${p.leverage}배 · 증거금 ${fmtP(p.margin)} (수익률은 증거금 대비)`) : null),
        reasonsBy(p.ticker).length ? el('details', { class: 'reasons', 'data-k': p.ticker, open: openKeys.has(p.ticker) },
          el('summary', {}, '내가 적은 매수 이유'), ...reasonsBy(p.ticker).map((t) => el('div', { class: 'reason-item' }, `${fmtTime(t.created_at)} · ${fmt(t.quantity)}${t.unit} @ ${fmtP(t.price)}\n${t.reason}`))) : null))),
    el('button', { class: 'btn block', onclick: () => { S.side = 'fills'; showTab('order'); } }, '🧾 체결내역 보기'));
}
// 보유종목을 누르면 나오는 바로가기 (실제 MTS의 종목 메뉴처럼)
function openActionSheet(p) {
  closeOverlays();
  const running = S.state.event.status === 'running';
  const go = (tab, side) => { overlay.remove(); selectStock(p.ticker, tab, side); };
  const overlay = el('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' }, el('div', { class: 'sheet' },
    el('div', { class: 'row between' }, el('h2', {}, p.name), el('button', { class: 'btn sm', onclick: () => overlay.remove(), 'aria-label': '닫기' }, '✕')),
    el('div', { class: 'muted small num' }, `${fmt(p.quantity)}${p.unit} · 평균 ${fmtP(p.average_price)} · 현재가 ${fmtP(p.price)}`),
    el('div', { class: 'action-grid' },
      el('button', { class: 'btn buy', disabled: !running, onclick: () => go('order', 'buy') }, '매수'),
      el('button', { class: 'btn sell', disabled: !running, onclick: () => go('order', 'sell') }, '매도'),
      el('button', { class: 'btn', onclick: () => go('quote') }, '현재가'),
      el('button', { class: 'btn', onclick: () => go('chart') }, '차트'))));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
}

// ───────────── 메뉴 ─────────────
function renderMenu() {
  if (S.sub) return ({ rank: renderRank, report: renderReport, history: renderHistory, learn: renderLearn, guide: renderGuide })[S.sub]();
  const item = (icon, title, desc, fn) => el('button', { class: 'menu-item', onclick: fn }, el('span', { class: 'mi' }, icon), el('span', { class: 'grow' }, el('b', {}, title), el('span', { class: 'muted small mdesc' }, desc)), el('span', { class: 'muted' }, '›'));
  const running = S.state.event.status === 'running';
  ui.content.append(
    el('div', { class: 'card menu' },
      el('h2', {}, '메뉴'),
      item('🔴', '매수', running ? '선택한 종목을 가상으로 사요' : '게임 중에만 거래할 수 있어요', () => { S.side = 'buy'; showTab('order'); }),
      item('🔵', '매도', '보유한 종목을 팔아요', () => { S.side = 'sell'; showTab('order'); }),
      item('🧾', '체결내역', '내 거래 기록과 이유', () => openSub('history')),
      item('🏆', '랭킹 · 수익률 비교', '너굴이들과 순위·수익률을 비교해요', () => openSub('rank')),
      item('📝', '나의 투자 리포트', '총자산, 분산 비율, 거래 돌아보기', () => openSub('report')),
      item('💡', '오늘의 미션 · 금융교육', '짧은 카드로 배워요', () => openSub('learn')),
      item('📘', '이용 안내 · 면책', '이 게임은 가상 포인트 교육용이에요', () => openSub('guide')),
      el('a', { class: 'menu-item', href: 'ranking.html', target: '_blank', rel: 'noopener' }, el('span', { class: 'mi' }, '🖥️'), el('span', { class: 'grow' }, el('b', {}, '큰 화면 순위'), el('span', { class: 'muted small mdesc' }, '수업 화면용 실시간 순위')), el('span', { class: 'muted' }, '↗')),
      item('🚪', '나가기', '이 기기의 참가 정보를 지워요', leaveGame)));
}
function openSub(name) { S.sub = name; S.compareCode = null; clear(ui.content); renderMenu(); window.scrollTo({ top: 0 }); }
function closeSub() { S.sub = null; S.compareCode = null; clear(ui.content); renderMenu(); window.scrollTo({ top: 0 }); }
function leaveGame() {
  const ok = el('button', { class: 'btn danger grow' }, '네, 나갈래요');
  const dlg = el('div', { class: 'overlay center', role: 'dialog', 'aria-modal': 'true' }, el('div', { class: 'sheet center' },
    el('h2', {}, '나갈까요?'),
    el('p', {}, '이 기기에 저장된 참가 정보가 지워져요. 같은 계정으로 다시 돌아올 수 없고, 다시 참가하면 새 계정으로 시작해요.'),
    el('div', { class: 'row' }, el('button', { class: 'btn grow', onclick: () => dlg.remove() }, '돌아가기'), ok)));
  ok.addEventListener('click', () => { dlg.remove(); store.token = null; stopTimers(); renderIntro(); });
  document.body.append(dlg);
}
async function renderHistory() {
  const box = el('div');
  ui.content.append(backBtn('← 메뉴', closeSub), box);
  box.append(el('p', { class: 'muted' }, '불러오는 중…'));
  await renderFills(box);
}
function renderLearn() {
  const [eduT, eduB] = EDU_CARDS[eduIdx];
  const again = () => { clear(ui.content); renderLearn(); };
  ui.content.append(backBtn('← 메뉴', closeSub),
    el('div', { class: 'card mission' }, el('b', {}, MISSIONS[missionIdx % MISSIONS.length]),
      el('div', {}, el('button', { class: 'btn sm', onclick: () => { missionIdx++; again(); } }, '다른 미션 보기'))),
    el('div', { class: 'card card-edu' }, el('b', {}, `💡 ${eduT}`), el('div', {}, eduB),
      el('div', {}, el('button', { class: 'btn sm', onclick: () => { eduIdx = (eduIdx + 1) % EDU_CARDS.length; again(); } }, '다음 카드'))),
    el('p', { class: 'muted small' }, '교육 내용은 특정 종목이나 투자 방법을 추천하는 것이 아니에요.'));
}
function renderGuide() {
  ui.content.append(backBtn('← 메뉴', closeSub),
    el('div', { class: 'notice' }, el('b', {}, '📢 모의투자 게임 안내'), el('br'),
      '이 게임은 금융교육 및 수업 활동을 위한 가상 모의투자 게임입니다. 게임에서 사용하는 포인트는 실제 돈이 아니며 현금으로 교환할 수 없습니다. 게임 결과는 실제 투자수익을 의미하지 않습니다. 실제 투자 판단은 각자의 책임과 충분한 정보 확인이 필요합니다.'),
    el('div', { class: 'card' }, el('h3', {}, '이 게임의 규칙'),
      el('p', {}, '• 모든 주문은 시장가로, 확인하는 순간의 게임 가격에 바로 체결돼요.'),
      el('p', {}, '• 가격은 수업용 샘플(DEMO)이며 실제 시세가 아니에요.'),
      el('p', {}, '• 선물은 레버리지 10배예요. 증거금만 내고 거래하며, 손익도 10배로 커지고, 약 10% 반대로 움직이면 강제청산돼요. 공매도와 만기는 없어요.'),
      el('p', {}, '• 매수할 때는 이유를 적어야 해요. 다른 사람의 이유는 게임이 끝난 뒤(또는 너굴이 정한 때) 공개돼요.')));
}

// ───────────── 랭킹 / 비교 ─────────────
async function renderRank(silent) {
  let data;
  try { data = await api('/api/ranking'); } catch { return; }
  if (S.tab !== 'menu' || S.sub !== 'rank' || S.compareCode) return;
  const me = S.state.me;
  clear(ui.content).append(backBtn('← 메뉴', closeSub),
    el('div', { class: 'card' }, el('div', { class: 'row between' }, el('h2', {}, '🏆 너굴이들 모의투자 랭킹'), el('a', { class: 'btn sm', href: 'ranking.html', target: '_blank', rel: 'noopener' }, '큰 화면')),
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
    ? el('div', { class: 'card muted' }, `🔒 ${p.nickname}님의 보유 종목과 매수 이유는 ${c.reveal_mode === 'after_end' ? '게임이 끝난 뒤' : '너굴이 공개하면'} 볼 수 있어요.`)
    : el('div', { class: 'card' }, el('h3', {}, `${p.nickname}님의 포트폴리오`),
      p.positions.length ? el('div', {}, ...p.positions.map((x) => el('div', { class: 'sum-line' }, el('span', {}, `${x.name} ${fmt(x.quantity)}${x.unit}`), el('b', { class: `num ${dir(x.return_rate)}` }, fmtPct(x.return_rate))))) : el('p', { class: 'muted small' }, '보유한 주식이 없어요.'),
      el('div', { class: 'sum-line small muted' }, el('span', {}, '가상현금'), el('span', { class: 'num' }, fmtP(p.cash))),
      p.reasons.length ? el('details', { class: 'reasons', open: true }, el('summary', {}, '거래 이유'), ...p.reasons.map((t) => el('div', { class: 'reason-item' }, `${t.type === 'buy' ? '매수' : '매도'} · ${t.name} ${fmt(t.quantity)}${t.unit}\n${t.reason}`))) : null);
  const diff = c.other ? c.me.return_rate - c.other.return_rate : null;
  clear(ui.content).append(
    backBtn('← 랭킹으로', () => { S.compareCode = null; renderRank(); }),
    el('h2', {}, c.other ? '수익률 비교' : '내 정보'),
    el('div', { class: 'cmp' }, col(c.me, '나'), c.other ? col(c.other, '상대') : null),
    diff != null ? el('p', { class: 'card' }, `나는 ${c.other.nickname}님보다 수익률이 ${diff === 0 ? '같아요' : `${Math.abs(diff * 100).toFixed(2)}%p ${diff > 0 ? '높아요' : '낮아요'}`}.`) : null,
    detail(c.me), c.other ? detail(c.other) : null,
    el('p', { class: 'muted small' }, '비교는 학습용이며 어떤 선택이 정답이라는 뜻이 아니에요.'));
}

// ───────────── 리포트 ─────────────
async function renderReport() {
  clear(ui.content).append(backBtn('← 메뉴', closeSub), el('p', { class: 'muted' }, '리포트를 만드는 중…'));
  let r;
  try { r = await api('/api/report', { token: store.token }); } catch (e) { clear(ui.content).append(backBtn('← 메뉴', closeSub), el('p', { class: 'err' }, e.message)); return; }
  if (S.tab !== 'menu' || S.sub !== 'report') return;
  clear(ui.content).append(backBtn('← 메뉴', closeSub),
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
      r.reasons.length ? el('div', {}, ...r.reasons.map((t) => el('div', { class: 'reason-item' }, `${t.type === 'buy' ? '매수' : '매도'} · ${t.name} ${fmt(t.quantity)}${t.unit} @ ${fmtP(t.price)}\n${t.reason}`))) : el('p', { class: 'muted' }, '기록된 이유가 없어요.')),
    el('a', { class: 'btn block', href: 'ranking.html' }, '🏆 너굴이들 전체 순위 보기'));
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
