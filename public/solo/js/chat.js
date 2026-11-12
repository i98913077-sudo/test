/* 사이버 나는 SOLO — 대화 모듈 (공용 거실 · 1:1 데이트 대화 · 연락처/사진 교환)
   game.js 가 SOLO_CHAT.start(ctx) 로 붙인다. 모든 권한 검사는 database.rules.json 에서 다시 이뤄진다. */
(function(){
"use strict";
const S = window.SOLO, $ = S.$, esc = S.esc, db = S.db;

let C = null;                 // game.js 가 넘겨주는 컨텍스트
let offs = [], roomOffs = {}, viewOffs = [], outOffs = {};
let lounge = [], myRooms = {}, roomMeta = {}, lastMsg = {}, readAt = {}, incoming = {}, outgoing = {};
let view = 'list', openId = null, roomMsgs = [], shareState = {}, partnerShare = {}, myShare = {};

function sid(){ return C.sid(); }
function uid(){ return C.uid(); }
function ref(p){ return db.ref('solo/' + p); }
function on(r, ev, cb, list){ r.on(ev, cb, function(){ cb(null); }); (list || offs).push(function(){ r.off(ev, cb); }); }
function stopView(){ viewOffs.forEach(function(f){ f(); }); viewOffs = []; }

function start(ctx){
  stop();
  C = ctx;
  on(ref('lounge/' + sid()).limitToLast(150), 'value', function(s){ lounge = s ? S.listOf(s.val()) : []; refresh('lounge'); });
  on(ref('myRooms/' + sid() + '/' + uid()), 'value', function(s){
    myRooms = (s && s.val()) || {};
    Object.keys(myRooms).forEach(watchRoom);
    refresh('list');
  });
  on(ref('dmReq/' + sid() + '/' + uid()), 'value', function(s){ incoming = (s && s.val()) || {}; refresh('list'); });
  on(ref('dmRead/' + sid() + '/' + uid()), 'value', function(s){ readAt = (s && s.val()) || {}; refresh('list'); });
}
function stop(){
  offs.forEach(function(f){ f(); }); offs = [];
  Object.keys(roomOffs).forEach(function(k){ roomOffs[k](); }); roomOffs = {};
  Object.keys(outOffs).forEach(function(k){ outOffs[k](); }); outOffs = {};
  stopView();
  lounge = []; myRooms = {}; roomMeta = {}; lastMsg = {}; readAt = {}; incoming = {}; outgoing = {};
  view = 'list'; openId = null;
}
function watchRoom(id){
  if(roomOffs[id]) return;
  const r1 = ref('dmRooms/' + sid() + '/' + id), r2 = ref('dmMsgs/' + sid() + '/' + id).limitToLast(1);
  const f1 = r1.on('value', function(s){ roomMeta[id] = s.val() || {}; refresh(); }, function(){});
  const f2 = r2.on('value', function(s){ const l = S.listOf(s.val()); lastMsg[id] = l[l.length - 1] || null; refresh(); }, function(){});
  roomOffs[id] = function(){ r1.off('value', f1); r2.off('value', f2); };
}
// 내가 보낸 신청이 아직 남아 있는지 (상대가 수락/거절하면 사라짐)
function watchOutgoing(target){
  if(outOffs[target]) return;
  const r = ref('dmReq/' + sid() + '/' + target + '/' + uid());
  const f = r.on('value', function(s){ const had = !!outgoing[target]; outgoing[target] = s.val(); if(had !== !!outgoing[target]) C.rerender(); }, function(){});
  outOffs[target] = function(){ r.off('value', f); };
}

/* ───────── 상태 ───────── */
function roomWith(other){ const id = S.roomIdOf(uid(), other); return myRooms[id] ? id : null; }
function unreadRooms(){
  return Object.keys(myRooms).filter(function(id){ const m = lastMsg[id]; return m && m.uid !== uid() && (m.at || 0) > (readAt[id] || 0); }).length;
}
function loungeSeenKey(){ return 'solo_lounge_' + sid(); }
function loungeUnread(){
  const last = lounge[lounge.length - 1]; if(!last || last.uid === uid()) return false;
  let seen = 0; try{ seen = Number(localStorage.getItem(loungeSeenKey()) || 0); }catch(e){}
  return (last.at || 0) > seen;
}
function badge(){ return unreadRooms() + Object.keys(incoming).length + (loungeUnread() ? 1 : 0); }
function chatOpen(){ const se = C.season(); return !se || se.chatOpen !== false; }

/* ───────── 로비 카드 버튼 ───────── */
function lobbyAction(target){
  watchOutgoing(target);
  if(roomWith(target)) return '<button class="btn sm navy" data-chat-open="' + target + '">💬 대화하기</button>';
  if(incoming[target]) return '<button class="btn sm" data-chat-accept="' + target + '">' + (incoming[target].ticket ? '🎫 슈퍼데이트 수락' : '💌 데이트 수락') + '</button>';
  if(outgoing[target]) return '<button class="btn sm ghost" data-chat-cancel="' + target + '">⏳ 신청함</button>';
  return '<button class="btn sm ghost" data-chat-req="' + target + '">💌 데이트 신청</button>';
}
function bindLobby(el){
  el.querySelectorAll('[data-chat-open]').forEach(function(b){ b.onclick = function(){ openRoom(roomWith(b.dataset.chatOpen)); }; });
  el.querySelectorAll('[data-chat-accept]').forEach(function(b){ b.onclick = function(){ accept(b.dataset.chatAccept); }; });
  el.querySelectorAll('[data-chat-cancel]').forEach(function(b){ b.onclick = function(){
    if(confirm(C.nickOf(b.dataset.chatCancel) + '님에게 보낸 데이트 신청을 취소할까요?')) ref('dmReq/' + sid() + '/' + b.dataset.chatCancel + '/' + uid()).remove().catch(function(e){ S.toast(C.err(e), 'bad'); });
  }; });
  el.querySelectorAll('[data-chat-req]').forEach(function(b){ b.onclick = function(){ requestModal(b.dataset.chatReq); }; });
}

/* ───────── 데이트 신청 · 수락 ───────── */
function requestModal(target){
  if(!chatOpen()){ S.toast('지금은 운영자가 대화를 닫아 두었어요'); return; }
  const items = C.items(), tickets = Object.keys(items).filter(function(k){ return items[k].owner === uid() && items[k].kind === 'date'; });
  C.modal('<h3 class="serif" style="color:var(--wine);margin-top:0;">💌 ' + esc(C.nickOf(target)) + '님에게 데이트 신청</h3>' +
    '<p class="muted">상대가 수락하면 둘만의 1:1 대화방이 열려요.</p>' +
    '<label class="f">한마디 <span class="muted">(80자, 선택)</span></label><input class="t" id="rqMsg" maxlength="80" placeholder="예) 아까 자기소개 듣고 더 이야기 나누고 싶어졌어요">' +
    (tickets.length ? '<label class="f">🎫 슈퍼데이트권 사용 <span class="muted">(데이트권 아이템 1개 소모)</span></label><select class="t" id="rqTicket"><option value="">사용 안 함</option>' +
      tickets.map(function(k){ return '<option value="' + k + '">' + esc(items[k].emoji + ' ' + items[k].name) + '</option>'; }).join('') + '</select>' :
      '<p class="hint">아이템 탭에서 종류를 "데이트권"으로 만들면 🎫 슈퍼데이트 신청을 할 수 있어요.</p>') +
    '<div style="height:12px"></div><button class="btn" id="rqOk">신청 보내기</button><button class="btn ghost" id="rqX">취소</button>');
  $('rqX').onclick = C.closeModal;
  $('rqOk').onclick = function(){
    const up = {}, t = $('rqTicket') ? $('rqTicket').value : '';
    const v = {at: S.TS, msg: $('rqMsg').value.trim()};
    if(t){ v.ticket = t; up['items/' + sid() + '/' + t] = null; }
    up['dmReq/' + sid() + '/' + target + '/' + uid()] = v;
    $('rqOk').disabled = true;
    db.ref('solo').update(up).then(function(){ C.closeModal(); S.toast((t ? '🎫 슈퍼데이트' : '💌 데이트') + ' 신청을 보냈어요', 'ok'); C.rerender(); },
      function(e){ $('rqOk').disabled = false; S.toast('보내지 못했어요: ' + C.err(e), 'bad'); });
  };
}
function accept(from){
  const id = S.roomIdOf(uid(), from), up = {};
  if(myRooms[id]){ up['dmReq/' + sid() + '/' + uid() + '/' + from] = null; }
  else{
    const p = id.split('__');
    up['dmRooms/' + sid() + '/' + id] = {a: p[0], b: p[1], createdAt: S.TS};
    up['myRooms/' + sid() + '/' + uid() + '/' + id] = true;
    up['myRooms/' + sid() + '/' + from + '/' + id] = true;
    up['dmReq/' + sid() + '/' + uid() + '/' + from] = null;
  }
  db.ref('solo').update(up).then(function(){ S.toast(C.nickOf(from) + '님과 1:1 대화방이 열렸어요 💞', 'ok'); openRoom(id); },
    function(e){ S.toast('수락하지 못했어요: ' + C.err(e), 'bad'); });
}
function decline(from){
  ref('dmReq/' + sid() + '/' + uid() + '/' + from).remove().then(function(){ S.toast('신청을 정중히 거절했어요'); }, function(e){ S.toast(C.err(e), 'bad'); });
}

/* ───────── 화면 ───────── */
function openRoom(id){ if(!id) return; view = 'room'; openId = id; C.setTab('chat'); }
function openLounge(){ view = 'lounge'; openId = null; C.setTab('chat'); }
function back(){ view = 'list'; openId = null; stopView(); C.rerender(); }
function refresh(what){
  if(!C) return;
  if(C.tab() !== 'chat'){ C.badge(); return; }
  if(view === 'lounge'){ if(what === 'lounge') updateLounge(); C.badge(); return; }
  if(view === 'room'){ updateRoom(); C.badge(); return; }
  render($('t-chat'));
}

function render(el){
  const key = view + ':' + (openId || '');
  if(el.dataset.key !== key){ el.dataset.key = key; stopView(); build(el); }
  if(view === 'list') renderList(el);
  else if(view === 'lounge') updateLounge();
  else updateRoom();
  C.badge();
}
function build(el){
  if(view === 'list'){ el.innerHTML = '<div id="chList"></div>'; return; }
  const se = C.season() || {};
  if(view === 'lounge'){
    el.innerHTML = '<div class="chathead"><button class="btn sm ghost" id="chBack">←</button><div class="grow"><b class="serif">🛋️ 공용 거실</b><div class="muted" style="font-size:12px;">이번 기수 출연자 모두가 함께하는 대화방</div></div></div>' +
      (se.broadcastLounge ? '<div class="notice" style="margin:8px 0;">📺 지금 공용 거실은 <b>시청자에게 생중계</b> 중이에요.</div>' : '') +
      '<div class="chatbox"><div class="msgs" id="chMsgs"></div>' + inputBar() + '</div>';
    $('chBack').onclick = back;
    bindInput(sendLounge);
    try{ localStorage.setItem(loungeSeenKey(), String(S.now())); }catch(e){}
    return;
  }
  const other = S.otherOf(openId, uid()), p = C.parts()[other] || {};
  el.innerHTML = '<div class="chathead"><button class="btn sm ghost" id="chBack">←</button>' + C.avatarHtml(p) +
    '<div class="grow"><b class="serif">' + esc(p.nick || '') + '</b><div class="muted" style="font-size:12px;">1:1 데이트 대화 · 둘만 볼 수 있어요 (신고 시 운영자 확인)</div></div>' +
    '<button class="btn sm ghost" id="chMenu">⋯</button></div>' +
    '<div class="exbar" id="chEx"></div>' +
    '<div class="chatbox"><div class="msgs" id="chMsgs"></div>' + inputBar() + '</div>';
  $('chBack').onclick = back;
  $('chMenu').onclick = roomMenu;
  bindInput(sendDm);
  const base = 'dmMsgs/' + sid() + '/' + openId;
  on(ref(base).limitToLast(300), 'value', function(s){ roomMsgs = s ? S.listOf(s.val()) : []; updateRoom(); markRead(); }, viewOffs);
  on(ref('dmShareState/' + sid() + '/' + openId), 'value', function(s){ shareState = (s && s.val()) || {}; loadShares(); }, viewOffs);
}
function inputBar(){
  return '<form class="chatin" id="chForm" autocomplete="off"><input class="t" id="chText" maxlength="300" placeholder="메시지를 입력하세요"' + (chatOpen() ? '' : ' disabled') + '><button class="btn sm" id="chSend">전송</button></form>';
}
function bindInput(send){
  $('chForm').onsubmit = function(e){
    e.preventDefault();
    const t = $('chText').value.trim(); if(!t) return;
    $('chSend').disabled = true;
    send(t).then(function(){ $('chText').value = ''; $('chSend').disabled = false; $('chText').focus(); },
      function(err){ $('chSend').disabled = false; S.toast('보내지 못했어요: ' + C.err(err), 'bad'); });
  };
}
function scrollDown(force){
  const m = $('chMsgs'); if(!m) return;
  if(force || m.scrollHeight - m.scrollTop - m.clientHeight < 140) m.scrollTop = m.scrollHeight;
}

function renderList(el){
  const box = $('chList') || el;
  const se = C.season() || {};
  let html = '<h2 class="serif" style="color:var(--wine);margin:6px 0 10px;">대화</h2>';
  if(!chatOpen()) html += '<div class="notice">운영자가 지금은 대화를 닫아 두었어요. 읽기만 할 수 있어요.</div>';
  const last = lounge[lounge.length - 1];
  html += '<div class="card chrow" id="chLounge" style="cursor:pointer;"><div class="ie">🛋️</div><div class="grow"><b>공용 거실</b>' + (loungeUnread() ? ' <span class="pill bad">NEW</span>' : '') + (se.broadcastLounge ? ' <span class="pill navy">📺 생중계</span>' : '') +
    '<div class="muted ellip">' + (last ? esc((last.staff ? '📢 ' : '') + last.nick + ': ' + last.text) : '출연자 모두와 이야기해 보세요') + '</div></div></div>';
  const inc = Object.keys(incoming);
  if(inc.length){
    html += '<div class="card"><h3>💌 받은 데이트 신청</h3>' + inc.map(function(f){
      const r = incoming[f], p = C.parts()[f] || {};
      return '<div class="item' + (r.ticket ? ' super' : '') + '">' + C.avatarHtml(p) + '<div class="im"><div class="in">' + esc(p.nick || '') + (r.ticket ? ' <span class="pill warn">🎫 슈퍼데이트</span>' : '') + '</div><div class="id">' + esc(r.msg || '대화를 신청했어요') + '</div></div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;"><button class="btn sm" data-acc="' + f + '">수락</button><button class="btn sm ghost" data-dec="' + f + '">거절</button></div></div>';
    }).join('') + '</div>';
  }
  const ids = Object.keys(myRooms).sort(function(a, b){ return ((lastMsg[b] && lastMsg[b].at) || 0) - ((lastMsg[a] && lastMsg[a].at) || 0); });
  html += '<div class="card"><h3>💞 1:1 데이트 대화</h3>' + (ids.length ? ids.map(function(id){
    const o = S.otherOf(id, uid()), p = C.parts()[o] || {}, m = lastMsg[id], un = m && m.uid !== uid() && (m.at || 0) > (readAt[id] || 0);
    return '<div class="item chrow" data-room="' + id + '" style="cursor:pointer;">' + C.avatarHtml(p) + '<div class="im"><div class="in">' + esc(p.nick || '(퇴장)') + (un ? ' <span class="pill bad">NEW</span>' : '') + ((roomMeta[id] || {}).closed ? ' <span class="pill navy">종료됨</span>' : '') + '</div>' +
      '<div class="id ellip">' + (m ? esc((m.uid === uid() ? '나: ' : '') + m.text) : '대화방이 열렸어요. 먼저 인사해 보세요!') + '</div></div><div class="muted" style="font-size:12px;">' + (m ? S.fmtTime(m.at) : '') + '</div></div>';
  }).join('') : '<p class="muted">솔로 나라 로비에서 마음에 드는 상대에게 "💌 데이트 신청"을 보내 보세요. 상대가 수락하면 대화방이 열려요.</p>') + '</div>';
  box.innerHTML = html;
  $('chLounge').onclick = openLounge;
  box.querySelectorAll('[data-room]').forEach(function(r){ r.onclick = function(){ openRoom(r.dataset.room); }; });
  box.querySelectorAll('[data-acc]').forEach(function(b){ b.onclick = function(){ accept(b.dataset.acc); }; });
  box.querySelectorAll('[data-dec]').forEach(function(b){ b.onclick = function(){ if(confirm('신청을 거절할까요?')) decline(b.dataset.dec); }; });
}

function updateLounge(){
  const m = $('chMsgs'); if(!m) return;
  m.innerHTML = S.bubbles(lounge, uid(), {empty: '공용 거실이 조용해요. 먼저 인사를 건네 보세요!'});
  scrollDown();
  try{ localStorage.setItem(loungeSeenKey(), String(S.now())); }catch(e){}
}
function sendLounge(t){
  const me = C.me();
  return ref('lounge/' + sid()).push({uid: uid(), nick: me.nick, emoji: me.avatar ? me.avatar.emoji : '', text: t, at: S.TS}).then(function(){ scrollDown(true); });
}

function updateRoom(){
  const m = $('chMsgs'); if(!m) return;
  const other = S.otherOf(openId, uid()), p = C.parts()[other] || {}, meta = roomMeta[openId] || {};
  const msgs = roomMsgs.map(function(x){ return Object.assign({nick: p.nick, emoji: p.avatar ? p.avatar.emoji : ''}, x); });
  m.innerHTML = S.bubbles(msgs, uid(), {empty: '💞 대화방이 열렸어요. 먼저 인사해 보세요!'}) + (meta.closed ? '<div class="daysep">대화가 종료되었어요</div>' : '');
  if(meta.closed){ $('chText').disabled = true; $('chText').placeholder = '종료된 대화방이에요'; }
  scrollDown();
  renderExchange();
}
function markRead(){ if(openId && view === 'room') ref('dmRead/' + sid() + '/' + uid() + '/' + openId).set(S.TS).catch(function(){}); }
function sendDm(t){ return ref('dmMsgs/' + sid() + '/' + openId).push({uid: uid(), text: t, at: S.TS}).then(function(){ scrollDown(true); }); }

/* ───────── 연락처 · 사진 교환 ───────── */
function loadShares(){
  const other = S.otherOf(openId, uid()), mine = shareState[uid()] || {}, theirs = shareState[other] || {};
  ['contact', 'photo'].forEach(function(k){
    if(mine[k]) ref('dmShare/' + sid() + '/' + openId + '/' + uid() + '/' + k).once('value').then(function(s){ myShare[k] = s.val(); renderExchange(); }, function(){});
    else myShare[k] = null;
    if(mine[k] && theirs[k]) ref('dmShare/' + sid() + '/' + openId + '/' + other + '/' + k).once('value').then(function(s){ partnerShare[k] = s.val(); renderExchange(); }, function(){ partnerShare[k] = null; renderExchange(); });
    else partnerShare[k] = null;
  });
  renderExchange();
}
function exchangeBlock(){
  const se = C.season() || {}, other = S.otherOf(openId, uid());
  if(se.exchange === 'off') return '운영자가 이번 기수의 연락처·사진 교환을 막아 두었어요.';
  if(se.exchange === 'couple' && C.finalPartner() !== other) return '이번 기수는 최종 커플이 된 경우에만 연락처·사진을 교환할 수 있어요.';
  if((roomMeta[openId] || {}).closed) return '종료된 대화방에서는 교환할 수 없어요.';
  return '';
}
function renderExchange(){
  const el = $('chEx'); if(!el || view !== 'room') return;
  const other = S.otherOf(openId, uid()), p = C.parts()[other] || {};
  const mine = shareState[uid()] || {}, theirs = shareState[other] || {}, blockMsg = exchangeBlock();
  function st(k, label){
    const both = mine[k] && theirs[k];
    let s = '<div class="exrow"><b>' + label + '</b> <span class="pill ' + (mine[k] ? 'ok' : '') + '">나 ' + (mine[k] ? '✔' : '—') + '</span> <span class="pill ' + (theirs[k] ? 'ok' : '') + '">' + esc(p.nick || '상대') + ' ' + (theirs[k] ? '✔' : '—') + '</span>';
    if(both){
      if(k === 'contact') s += '<div class="exval">📇 ' + esc(partnerShare.contact || '불러오는 중…') + '</div>';
      else s += '<div class="exval">' + (S.isJpeg(partnerShare.photo) ? '<img class="exphoto" id="exPhoto" alt="상대 사진" src="' + partnerShare.photo + '">' : '불러오는 중…') + '</div>';
    }else if(mine[k]) s += '<div class="muted" style="font-size:12px;">' + esc(p.nick || '상대') + '님도 올리면 서로 보여요.</div>';
    else if(theirs[k]) s += '<div class="muted" style="font-size:12px;">' + esc(p.nick || '상대') + '님이 이미 올렸어요. 나도 올리면 바로 교환돼요!</div>';
    if(!blockMsg) s += '<div class="row" style="margin-top:6px;">' + (mine[k] ? '<button class="btn sm ghost" data-unshare="' + k + '">내 ' + (k === 'contact' ? '연락처' : '사진') + ' 내리기</button>' : '<button class="btn sm" data-share="' + k + '">' + (k === 'contact' ? '📇 내 연락처 올리기' : '📷 내 사진 올리기') + '</button>') + '</div>';
    return s + '</div>';
  }
  el.innerHTML = '<details' + (el.dataset.open === '1' ? ' open' : '') + '><summary>🤝 연락처 · 사진 교환' + ((mine.contact && theirs.contact) || (mine.photo && theirs.photo) ? ' <span class="pill ok">교환 완료</span>' : (theirs.contact || theirs.photo ? ' <span class="pill warn">상대가 올렸어요</span>' : '')) + '</summary>' +
    '<p class="muted" style="font-size:12px;margin:6px 0;">두 사람 모두 올렸을 때만 서로의 연락처·사진이 보여요. 운영자도 내용은 볼 수 없어요. 한번 상대에게 보이면 되돌릴 수 없으니 신중하게 결정하세요.</p>' +
    (blockMsg ? '<div class="notice navy">' + esc(blockMsg) + '</div>' : '') + st('contact', '📇 연락처') + st('photo', '📷 사진') + '</details>';
  const d = el.querySelector('details'); d.ontoggle = function(){ el.dataset.open = d.open ? '1' : ''; };
  el.querySelectorAll('[data-share]').forEach(function(b){ b.onclick = function(){ b.dataset.share === 'contact' ? shareContact() : sharePhoto(); }; });
  el.querySelectorAll('[data-unshare]').forEach(function(b){ b.onclick = function(){ unshare(b.dataset.unshare); }; });
  if($('exPhoto')) $('exPhoto').onclick = function(){ C.modal('<img alt="사진" style="width:100%;border-radius:16px;" src="' + partnerShare.photo + '"><button class="btn ghost" style="margin-top:12px;" id="phX">닫기</button>'); $('phX').onclick = C.closeModal; };
}
function writeShare(k, v){
  const up = {}, base = sid() + '/' + openId + '/' + uid();
  up['dmShare/' + base + '/' + k] = v;
  up['dmShareState/' + base + '/' + k] = v ? true : null;
  return db.ref('solo').update(up);
}
function shareContact(){
  const p = C.parts()[S.otherOf(openId, uid())] || {};
  C.modal('<h3 class="serif" style="color:var(--wine);margin-top:0;">📇 연락처 교환</h3>' +
    '<p class="muted">' + esc(p.nick || '상대') + '님도 연락처를 올려야 서로 보여요. 전화번호, 카카오톡 ID, 인스타그램 등 원하는 방식으로 적어 주세요.</p>' +
    '<input class="t" id="ctV" maxlength="100" placeholder="예) 카톡 ID: solo_teacher">' +
    '<label class="row" style="gap:8px;margin:12px 0;"><input type="checkbox" id="ctOk" style="flex:0 0 auto;width:18px;height:18px;"> <span>상대에게 공개되는 것에 동의해요</span></label>' +
    '<button class="btn" id="ctGo">올리기</button><button class="btn ghost" id="ctX">취소</button>');
  $('ctX').onclick = C.closeModal;
  $('ctGo').onclick = function(){
    const v = $('ctV').value.trim();
    if(!v){ S.toast('연락처를 적어 주세요'); return; }
    if(!$('ctOk').checked){ S.toast('공개 동의에 체크해 주세요'); return; }
    writeShare('contact', v).then(function(){ C.closeModal(); S.toast('연락처를 올렸어요', 'ok'); }, function(e){ S.toast('올리지 못했어요: ' + C.err(e), 'bad'); });
  };
}
function sharePhoto(){
  const p = C.parts()[S.otherOf(openId, uid())] || {};
  C.modal('<h3 class="serif" style="color:var(--wine);margin-top:0;">📷 사진 교환</h3>' +
    '<p class="muted">' + esc(p.nick || '상대') + '님도 사진을 올려야 서로 보여요. 사진은 작게 줄여서 저장돼요.</p>' +
    '<input type="file" accept="image/*" class="t" id="phF"><div id="phPrev" style="margin-top:10px;"></div>' +
    '<label class="row" style="gap:8px;margin:12px 0;"><input type="checkbox" id="phOk" style="flex:0 0 auto;width:18px;height:18px;"> <span>상대에게 공개되는 것에 동의해요</span></label>' +
    '<button class="btn" id="phGo" disabled>올리기</button><button class="btn ghost" id="phX">취소</button>');
  let data = null;
  $('phX').onclick = C.closeModal;
  $('phF').onchange = function(){
    const f = this.files[0]; data = null; $('phGo').disabled = true;
    S.compressPhoto(f).then(function(d){ data = d; $('phPrev').innerHTML = '<img alt="미리보기" style="max-width:100%;max-height:260px;border-radius:14px;" src="' + d + '">'; $('phGo').disabled = false; },
      function(e){ S.toast(e.message, 'bad'); });
  };
  $('phGo').onclick = function(){
    if(!data) return;
    if(!$('phOk').checked){ S.toast('공개 동의에 체크해 주세요'); return; }
    $('phGo').disabled = true;
    writeShare('photo', data).then(function(){ C.closeModal(); S.toast('사진을 올렸어요', 'ok'); }, function(e){ $('phGo').disabled = false; S.toast('올리지 못했어요: ' + C.err(e), 'bad'); });
  };
}
function unshare(k){
  if(!confirm('내 ' + (k === 'contact' ? '연락처' : '사진') + '를 내릴까요? 이미 상대가 본 내용은 되돌릴 수 없어요.')) return;
  writeShare(k, null).then(function(){ S.toast('내렸어요'); }, function(e){ S.toast(C.err(e), 'bad'); });
}

function roomMenu(){
  const other = S.otherOf(openId, uid()), closed = (roomMeta[openId] || {}).closed;
  C.modal('<h3 class="serif" style="color:var(--wine);margin-top:0;">대화방 메뉴</h3>' +
    '<button class="btn ghost" id="rmRep">🚨 이 대화 신고하기</button>' +
    (closed ? '' : '<button class="btn ghost" id="rmEnd">🚪 대화 종료하기</button>') +
    '<button class="btn" id="rmX">닫기</button>');
  $('rmX').onclick = C.closeModal;
  $('rmRep').onclick = function(){
    const r = prompt('신고 이유를 적어 주세요 (운영자가 이 대화 내용을 확인해요)');
    if(!r || !r.trim()) return;
    ref('reports/' + sid()).push({from: uid(), target: other, reason: r.trim().slice(0, 200), room: openId, at: S.TS})
      .then(function(){ C.closeModal(); S.toast('신고가 접수되었어요', 'ok'); }, function(e){ S.toast(C.err(e), 'bad'); });
  };
  if($('rmEnd')) $('rmEnd').onclick = function(){
    if(!confirm('대화를 종료할까요? 두 사람 모두 더 이상 메시지를 보낼 수 없어요.')) return;
    ref('dmRooms/' + sid() + '/' + openId + '/closed').set(true).then(function(){ C.closeModal(); S.toast('대화를 종료했어요'); }, function(e){ S.toast(C.err(e), 'bad'); });
  };
}

window.SOLO_CHAT = {start: start, stop: stop, render: render, lobbyAction: lobbyAction, bindLobby: bindLobby, badge: badge, openRoom: openRoom, roomWith: roomWith};
})();
