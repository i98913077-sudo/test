import { el, $, clear, fmt, fmtP, fmtPct, fmtSigned, dir, fmtTime, fmtDuration, api, apiUrl, banner, disclaimerBlock, toast } from './common.js';

const app = $('#app');
const KEY = 'safeinvest.admin';
const tok = {
  get v() { try { return sessionStorage.getItem(KEY); } catch { return null; } },
  set v(x) { try { x ? sessionStorage.setItem(KEY, x) : sessionStorage.removeItem(KEY); } catch { /* 무시 */ } },
};
const call = (path, opts = {}) => api(path, { ...opts, token: tok.v });
let timer, allTickers = [], allGroups = [];

if (tok.v) dashboard(); else login();

function login(msg) {
  clearInterval(timer);
  const pw = el('input', { class: 'input', type: 'password', id: 'pw', autocomplete: 'current-password', 'aria-label': '관리자 비밀번호' });
  const err = el('p', { class: 'err', role: 'alert' }, msg ?? '');
  const go = async (e) => {
    e.preventDefault();
    try { tok.v = (await api('/api/admin/login', { method: 'POST', body: { password: pw.value } })).token; dashboard(); }
    catch (ex) { err.textContent = ex.message; }
  };
  clear(app).append(banner(), el('main', { class: 'wrap' }, el('h1', {}, '너굴 관리자'),
    el('form', { class: 'card', onsubmit: go }, el('label', { class: 'field', for: 'pw' }, '관리자 비밀번호'), pw, el('button', { class: 'btn primary block', type: 'submit' }, '로그인'), err),
    el('p', { class: 'muted small' }, '비밀번호는 서버에 올린 config.php 의 admin_password 에서 설정합니다.'), disclaimerBlock()));
}

async function dashboard() {
  try { const tk = await api('/api/tickers'); allTickers = tk.tickers; allGroups = tk.groups ?? []; await draw(); }
  catch (e) { if (e.status === 401) { tok.v = null; return login('로그인이 필요합니다.'); } toast(e.message); }
  clearInterval(timer);
  timer = setInterval(() => draw().catch((e) => { if (e.status === 401) { tok.v = null; login('세션이 만료되었습니다.'); } }), 4000);
}

let formState = null; // 입력 중인 폼 값을 갱신 때 보존
async function draw() {
  const ov = await call('/api/admin/overview');
  const txs = ov.event ? (await call('/api/admin/transactions')).transactions : [];
  // 입력 중에는 폼을 다시 그리지 않는다
  if (document.activeElement && app.contains(document.activeElement) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && $('#admin-root')) return;
  const ev = ov.event;
  const root = el('main', { class: 'wrap wide', id: 'admin-root' });
  root.append(
    el('div', { class: 'row between' }, el('h1', {}, '너굴 관리자'), el('div', { class: 'row' },
      el('a', { class: 'btn sm', href: 'ranking.html', target: '_blank', rel: 'noopener' }, '🏆 수업용 순위 화면'),
      el('button', { class: 'btn sm', onclick: () => { tok.v = null; login(); } }, '로그아웃'))),
    studentLink(),
    ev ? eventCard(ev) : null,
    (!ev || ev.status === 'ended') ? createCard() : null,
    ev ? statsCard(ov) : null,
    ev ? boardCard(ov) : null,
    ev ? txCard(txs) : null,
    disclaimerBlock());
  clear(app).append(banner(), root);
}

function studentLink() {
  const url = new URL('./', location.href).href;
  return el('div', { class: 'card' }, el('b', {}, '너굴이 접속 주소'), el('div', { class: 'row' },
    el('code', { class: 'grow' }, url), el('button', { class: 'btn sm', onclick: async () => { try { await navigator.clipboard.writeText(url); toast('주소를 복사했어요'); } catch { toast('복사 실패: 직접 선택해 복사해주세요'); } } }, '복사')),
    el('p', { class: 'muted small' }, '이 주소를 QR코드 생성기(무료 사이트 등)에 넣어 화면에 띄우면 너굴이들이 휴대폰으로 스캔해 접속할 수 있어요.'));
}

function field(label, input, hint) { return el('div', {}, el('label', { class: 'field' }, label), input, hint ? el('div', { class: 'muted small' }, hint) : null); }

function tickerPicker(selected) {
  const boxes = [];
  const sections = (allGroups.length ? allGroups : [{ id: undefined, label: '종목' }]).map((g) => {
    const items = allTickers.filter((t) => g.id === undefined || t.group === g.id).map((t) => {
      const cb = el('input', { type: 'checkbox', value: t.ticker, checked: selected.includes(t.ticker) });
      boxes.push({ cb });
      return el('label', { class: 'check' }, cb, el('span', {}, `${t.name} (${t.ticker})`));
    });
    const members = boxes.slice(boxes.length - items.length).map((b) => b.cb);
    const all = el('input', { type: 'checkbox', checked: members.every((c) => c.checked), 'aria-label': `${g.label} 전체 선택` });
    all.addEventListener('change', () => members.forEach((c) => { c.checked = all.checked; }));
    return el('div', { class: 'ticker-group' }, el('label', { class: 'check' }, all, el('b', {}, `${g.label} (${items.length})`)), ...items);
  });
  return { node: el('div', {}, ...sections), get: () => boxes.filter((b) => b.cb.checked).map((b) => b.cb.value) };
}

function createCard() {
  const name = el('input', { class: 'input', value: '너굴이들 모의투자 챌린지', maxlength: 40 });
  const bal = el('input', { class: 'input', type: 'number', inputmode: 'numeric', value: '100000000', min: 10000, step: 1000000 });
  const dur = el('input', { class: 'input', type: 'number', inputmode: 'numeric', placeholder: '비우면 직접 종료', min: 1 });
  const mode = el('select', { class: 'input' }, el('option', { value: 'after_end' }, '게임 종료 후 공개 (권장)'), el('option', { value: 'live' }, '실시간 공개'));
  const sellReq = el('input', { type: 'checkbox' });
  const picker = tickerPicker(allTickers.map((t) => t.ticker));
  const err = el('p', { class: 'err', role: 'alert' });
  const btn = el('button', { class: 'btn primary block' }, '새 이벤트 만들기');
  btn.addEventListener('click', async () => {
    err.textContent = '';
    try {
      await call('/api/admin/event', { method: 'POST', body: {
        name: name.value, initial_balance: Number(bal.value), duration_min: dur.value ? Number(dur.value) : null,
        reason_reveal_mode: mode.value, sell_reason_required: sellReq.checked, tickers: picker.get(),
      } });
      toast('이벤트를 만들었어요'); await draw();
    } catch (e) { err.textContent = e.message; }
  });
  return el('div', { class: 'card' }, el('h2', {}, '새 이벤트 만들기'),
    field('이벤트 이름', name), field('시작 가상자금 (P)', bal, '기본값 100,000,000P(1억 P). 실제 돈이 아닌 게임 포인트예요.'),
    field('진행 시간 (분)', dur, '시작 버튼을 누른 때부터 계산돼요.'), field('매수 이유 공개 시점', mode, '종료 후 공개를 쓰면 서로 따라 사는 것을 막을 수 있어요.'),
    el('label', { class: 'check' }, sellReq, el('span', {}, '매도 이유도 필수로 받기')),
    el('b', {}, '거래 가능한 종목'), picker.node, btn, err);
}

function eventCard(ev) {
  const err = el('p', { class: 'err', role: 'alert' });
  const run = (fn, okMsg) => async () => { err.textContent = ''; try { await fn(); toast(okMsg); await draw(); } catch (e) { err.textContent = e.message; } };
  const status = { ready: '시작 전', running: '● 진행 중', ended: '종료' }[ev.status];
  const extend = el('input', { class: 'input', type: 'number', min: 1, placeholder: '지금부터 N분 뒤 종료' });
  const mode = el('select', { class: 'input' }, el('option', { value: 'after_end', selected: ev.reason_reveal_mode === 'after_end' }, '게임 종료 후 공개'), el('option', { value: 'live', selected: ev.reason_reveal_mode === 'live' }, '실시간 공개'));
  const sellReq = el('input', { type: 'checkbox', checked: ev.sell_reason_required });
  return el('div', { class: 'card' },
    el('div', { class: 'row between' }, el('h2', {}, `이벤트: ${ev.name}`), el('span', { class: 'pill' }, status)),
    el('div', { class: 'muted small' }, `시작 자금 ${fmtP(ev.initial_balance)} · ${ev.tickers.length}개 종목 · 참가자 ${ev.participants}명 · 시작 ${ev.start_at ? fmtTime(ev.start_at) : '-'} · 종료 예정 ${ev.end_at ? fmtTime(ev.end_at) : (ev.duration_min ? `시작 후 ${ev.duration_min}분` : '직접 종료')}`),
    el('div', { class: 'row' },
      ev.status === 'ready' ? el('button', { class: 'btn primary grow', onclick: run(() => call('/api/admin/event/start', { method: 'POST' }), '게임을 시작했어요') }, '▶ 게임 시작') : null,
      ev.status === 'running' ? el('button', { class: 'btn danger grow', onclick: () => { if (confirm('지금 게임을 종료할까요? 종료하면 가격이 고정되고 더 이상 거래할 수 없어요.')) run(() => call('/api/admin/event/end', { method: 'POST' }), '게임을 종료했어요')(); } }, '■ 게임 종료') : null,
      el('button', { class: 'btn grow', onclick: () => { if (confirm('초기화하면 모든 참가자, 거래 기록, 순위가 삭제됩니다. 계속할까요?')) run(() => call('/api/admin/event/reset', { method: 'POST' }), '초기화했어요')(); } }, '↺ 게임 초기화')),
    ev.status !== 'ended' ? el('div', {},
      field('매수 이유 공개 시점', mode), el('label', { class: 'check' }, sellReq, el('span', {}, '매도 이유도 필수로 받기')),
      ev.status === 'running' ? field('종료 시간 조정', extend, '비워두고 저장하면 변경하지 않아요.') : null,
      el('button', { class: 'btn sm', onclick: run(() => call('/api/admin/event/update', { method: 'POST', body: { reason_reveal_mode: mode.value, sell_reason_required: sellReq.checked, ...(extend.value ? { end_in_min: Number(extend.value) } : {}) } }), '설정을 저장했어요') }, '설정 저장')) : null,
    err);
}

function statsCard(ov) {
  const s = ov.stats;
  const tickers = s.per_ticker.length ? el('div', { class: 'scroll-x' }, el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ...['종목', '거래 수', '매수 수량', '매도 수량', '거래대금'].map((h) => el('th', {}, h)))),
    el('tbody', {}, ...s.per_ticker.map((t) => el('tr', {}, el('td', {}, t.name), el('td', {}, fmt(t.count)), el('td', {}, fmt(t.buy_qty)), el('td', {}, fmt(t.sell_qty)), el('td', {}, fmtP(t.amount))))))) : el('p', { class: 'muted' }, '아직 거래가 없어요.');
  return el('div', { class: 'card' }, el('h2', {}, '현황'), el('div', { class: 'stat-grid' },
    st('참가자 수', `${s.participants}명`), st('현재 1위', s.leader ? `${s.leader.nickname} (${fmtPct(s.leader.return_rate)})` : '-'),
    st('평균 수익률', fmtPct(s.average_return)), st('총 거래 횟수', `${s.trade_count}회`), st('진행 시간', s.elapsed_ms ? fmtDuration(s.elapsed_ms) : '-')),
    el('h3', {}, '종목별 거래량'), tickers);
}
const st = (k, v) => el('div', { class: 'stat' }, el('div', { class: 'k' }, k), el('div', { class: 'v' }, v));

function boardCard(ov) {
  return el('div', { class: 'card' }, el('h2', {}, '전체 순위'), ov.board.length ? el('div', { class: 'scroll-x' }, el('table', { class: 'tbl' },
    el('thead', {}, el('tr', {}, ...['순위', '닉네임', '코드', '총자산', '수익률', '현금', '거래'].map((h) => el('th', {}, h)))),
    el('tbody', {}, ...ov.board.map((r) => el('tr', {}, el('td', {}, r.rank), el('td', {}, r.nickname), el('td', {}, r.code), el('td', {}, fmtP(r.total)),
      el('td', { class: dir(r.return_rate) }, fmtPct(r.return_rate)), el('td', {}, fmtP(r.cash)), el('td', {}, r.trades)))))) : el('p', { class: 'muted' }, '참가자가 아직 없어요.'));
}

function txCard(txs) {
  const csv = el('button', { class: 'btn sm', onclick: async () => {
    try {
      const res = await fetch(apiUrl('/api/admin/export.csv'), { headers: { 'X-Auth-Token': tok.v } });
      if (!res.ok) throw new Error('내보내기에 실패했어요.');
      const url = URL.createObjectURL(await res.blob());
      const a = el('a', { href: url, download: 'transactions.csv' }); document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { toast(e.message); }
  } }, 'CSV 내려받기');
  return el('div', { class: 'card' }, el('div', { class: 'row between' }, el('h2', {}, `거래 기록 (최근 ${Math.min(txs.length, 200)}건)`), csv),
    txs.length ? el('div', { class: 'scroll-x' }, el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, ...['시각', '참가자', '구분', '종목', '수량', '체결가', '이유'].map((h) => el('th', {}, h)))),
      el('tbody', {}, ...txs.slice(0, 200).map((t) => el('tr', {}, el('td', {}, fmtTime(t.created_at)), el('td', {}, `${t.nickname} #${t.code}`),
        el('td', { class: t.type === 'buy' ? 'up' : 'down' }, t.type === 'buy' ? '매수' : '매도'), el('td', {}, t.name), el('td', {}, fmt(t.quantity)), el('td', {}, fmtP(t.price)),
        el('td', {}, t.reason ?? '')))))) : el('p', { class: 'muted' }, '아직 거래가 없어요.'));
}
