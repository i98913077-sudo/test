import { el, $, clear, fmtP, fmtPct, fmt, dir, arrow, api, banner, disclaimerBlock, fmtDuration } from './common.js';

const app = $('#app');
const head = el('div', { class: 'board-head' });
const list = el('div');
const reasonsBox = el('div');
const stats = el('div', { class: 'row muted' });
app.append(banner(), el('main', { class: 'wrap wide' }, head, stats, list, reasonsBox,
  el('p', { class: 'disclaimer' }, '순위는 게임 내 총자산 기준이며, 실제 투자 성과나 미래 수익을 의미하지 않습니다.'), disclaimerBlock()));

let offset = 0, last = null;
async function refresh() {
  try {
    const d = await api('/api/ranking');
    offset = d.event ? d.event.server_time - Date.now() : 0;
    last = d;
    draw();
  } catch { /* 다음 주기에 재시도 */ }
}
function draw() {
  const d = last;
  if (!d) return;
  if (!d.event) {
    clear(head).append(el('h1', {}, '🏆 너굴이들 모의투자 랭킹'));
    clear(list).append(el('p', { class: 'muted' }, '진행 중인 이벤트가 없습니다.'));
    return;
  }
  const ev = d.event;
  const state = ev.status === 'running' ? '● 진행 중' : ev.status === 'ready' ? '시작 대기' : '🏁 종료';
  const remain = ev.status === 'running' && ev.end_at ? `남은 시간 ${fmtDuration(ev.end_at - (Date.now() + offset))}` : '';
  clear(head).append(el('h1', {}, `🏆 ${ev.name}`), el('div', { class: 'muted' }, `${state}${remain ? ` · ${remain}` : ''}`));
  clear(stats).append(el('span', {}, `참가자 ${d.rows.length}명`), el('span', {}, '·'), el('span', {}, `평균 수익률 ${fmtPct(d.average_return ?? 0)}`), el('span', {}, '·'), el('span', {}, `시작 자금 ${fmtP(ev.initial_balance)}`));
  clear(list);
  if (!d.rows.length) list.append(el('p', { class: 'muted' }, '아직 참가자가 없어요. QR코드로 접속해 참가해보세요!'));
  for (const r of d.rows) {
    const cls = r.rank <= 3 ? ` top${r.rank}` : '';
    list.append(el('div', { class: `big-rank${cls}` },
      el('div', { class: 'no' }, r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `${r.rank}`),
      el('div', { class: 'nick' }, r.nickname, el('span', { class: 'muted' }, ` #${r.code}`)),
      el('div', { class: 'tot num' }, fmtP(r.total)),
      el('b', { class: `num ${dir(r.return_rate)}` }, `${arrow(r.return_rate)} ${fmtPct(r.return_rate)}`)));
  }
  clear(reasonsBox);
  if (d.reasons_visible && d.reasons.length) {
    reasonsBox.append(el('div', { class: 'card' }, el('h2', {}, '💬 공개된 매수 이유'),
      ...d.reasons.slice(0, 12).map((r) => el('div', { class: 'reason-item' }, el('b', {}, `${r.nickname} #${r.code} · ${r.name} ${fmt(r.quantity)}${r.unit ?? '주'}`), el('br'), r.reason))));
  } else if (!d.reasons_visible) {
    reasonsBox.append(el('p', { class: 'muted small' }, '🔒 매수 이유는 게임이 끝난 뒤 공개됩니다.'));
  }
}
refresh();
setInterval(refresh, 3000);
setInterval(draw, 1000);
