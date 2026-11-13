/* 사이버 나는 SOLO — 시청자 관람석
   시청자는 공개 프로필·자기어필·속마음 인터뷰·(생중계를 켠 경우) 공용 거실을 보고,
   가상 기프티콘과 좋아요로 응원하며, 친구를 소개할 수 있다. 비공개 선택·1:1 대화·연락처는 볼 수 없다. */
(function(){
"use strict";
const S = window.SOLO, $ = S.$, esc = S.esc, db = S.db;
const SLOTS = '0123456789abcdefghij', MAX_CHEERS = SLOTS.length;

let user = null, sid = null, season = null, me = null, isCast = false, blocked = false;
let parts = {}, appeals = {}, likes = {}, cheers = {}, referrals = {}, notices = {}, interviews = {}, talk = [], lounge = [], couples = null, viewerCount = 0;
let tab = 'live', listeners = [], flagListeners = [], flagKey = '';

function ref(p){ return db.ref('solo/' + p); }
function on(r, ev, cb, list){ r.on(ev, cb, function(){ cb(null); }); (list || listeners).push(function(){ r.off(ev, cb); }); }
function err(e){ const m = String((e && e.message) || e); return /permission|PERMISSION/.test(m) ? '권한이 없어요.' : m; }
function avatarHtml(p, cls){ const a = (p && p.avatar) || {}; return '<div class="avatar ' + (cls || '') + '" style="background:' + esc(a.color || '#F3EDE1') + '">' + esc(a.emoji || '🙂') + '</div>'; }
function modal(html){ const r = $('modalRoot'); r.innerHTML = '<div class="modal"><div class="sheet">' + html + '</div></div>'; r.firstChild.addEventListener('click', function(e){ if(e.target === r.firstChild) closeModal(); }); }
function closeModal(){ $('modalRoot').innerHTML = ''; }
function cast(){ return Object.keys(parts).filter(function(k){ return parts[k].status === 'approved'; }).sort(function(a, b){ return (parts[a].createdAt || 0) - (parts[b].createdAt || 0); }); }
function nickOf(u){ return parts[u] ? parts[u].nick : '(알 수 없음)'; }

/* ───────── 시작 ───────── */
function boot(){
  if(S.initError){ $('vjErr').textContent = 'Firebase를 불러오지 못했어요.'; return; }
  $('vjNick').oninput = function(){ $('vjGo').disabled = this.value.trim().length < 1; };
  $('vjGo').onclick = join;
  document.querySelectorAll('[data-w]').forEach(function(b){ b.onclick = function(){ setTab(b.dataset.w); }; });
  S.ready().then(function(u){
    user = u;
    ref('blocked/' + u.uid).on('value', function(s){ blocked = !!s.val(); render(); }, function(){});
    S.watchSeason(function(id, se){
      const changed = id !== sid;
      sid = id; season = se;
      if(changed){ detach(); if(sid) attach(); }
      attachFlags();
      render();
    });
  }).catch(function(e){ $('vjErr').textContent = e.message; });
}
function detach(){
  listeners.concat(flagListeners).forEach(function(f){ f(); }); listeners = []; flagListeners = []; flagKey = '';
  me = null; isCast = false; parts = {}; appeals = {}; likes = {}; cheers = {}; referrals = {}; notices = {}; interviews = {}; talk = []; lounge = []; couples = null;
}
function attach(){
  on(ref('viewers/' + sid), 'value', function(s){ const v = (s && s.val()) || {}; viewerCount = Object.keys(v).length; me = v[user.uid] || null; attachFlags(); render(); });
  on(ref('participants/' + sid), 'value', function(s){ parts = (s && s.val()) || {}; isCast = !!parts[user.uid]; render(); });
  on(ref('appeals/' + sid), 'value', function(s){ appeals = (s && s.val()) || {}; render(); });
  on(ref('appealLikes/' + sid), 'value', function(s){ likes = (s && s.val()) || {}; render(); });
  on(ref('cheers/' + sid), 'value', function(s){ cheers = (s && s.val()) || {}; render(); });
  on(ref('referrals/' + sid), 'value', function(s){ referrals = (s && s.val()) || {}; render(); });
  on(ref('announcements/' + sid), 'value', function(s){ notices = (s && s.val()) || {}; render(); });
}
// 시청자 전용·공개 여부에 따라 읽을 수 있는 데이터는 등록/설정이 바뀔 때 다시 구독한다
function attachFlags(){
  if(!sid || !season) return;
  const key = [!!me, !!season.broadcastLounge, !!season.resultsPublished].join();
  if(key === flagKey) return;
  flagKey = key;
  flagListeners.forEach(function(f){ f(); }); flagListeners = [];
  interviews = {}; talk = []; lounge = []; couples = null;
  if(me){
    on(ref('interviews/' + sid), 'value', function(s){ interviews = (s && s.val()) || {}; render(); }, flagListeners);
    on(ref('viewerChat/' + sid).limitToLast(150), 'value', function(s){ talk = s ? S.listOf(s.val()) : []; updateTalk(); }, flagListeners);
    if(season.broadcastLounge) on(ref('lounge/' + sid).limitToLast(100), 'value', function(s){ lounge = s ? S.listOf(s.val()) : []; if(tab === 'live') updateLive(); }, flagListeners);
  }
  if(season.resultsPublished) on(ref('results/' + sid + '/couples'), 'value', function(s){ couples = s ? (s.val() || {}) : null; render(); }, flagListeners);
}

function join(){
  if(!sid){ $('vjErr').textContent = '아직 열린 기수가 없어요.'; return; }
  if(isCast){ $('vjErr').textContent = '이 기기는 출연자로 참가 중이라 관람석에 입장할 수 없어요. (속마음 인터뷰 보호)'; return; }
  const n = $('vjNick').value.trim();
  if(S.BAD_NICK.test(n)){ $('vjErr').textContent = '. # $ [ ] / 기호는 쓸 수 없어요.'; return; }
  $('vjGo').disabled = true;
  ref('viewers/' + sid + '/' + user.uid).set({nick: n, at: S.TS}).then(function(){ S.toast('관람석에 입장했어요 📺', 'ok'); },
    function(e){ $('vjGo').disabled = false; $('vjErr').textContent = season && season.viewersOpen === false ? '운영자가 지금은 관람석을 닫아 두었어요.' : '입장하지 못했어요: ' + err(e); });
}

/* ───────── 화면 ───────── */
function setTab(t){
  tab = t;
  document.querySelectorAll('[data-w]').forEach(function(b){ b.classList.toggle('on', b.dataset.w === t); });
  ['live','cast','iv','talk','friend'].forEach(function(x){ $('w-' + x).classList.toggle('hidden', x !== t); });
  $('w-talk').dataset.built = '';
  render(); window.scrollTo(0, 0);
}
function render(){
  $('vjSeason').textContent = season ? season.name : '-';
  $('vjViewers').textContent = sid ? viewerCount + '명' : '-';
  if(!me || blocked){
    $('v-join').classList.remove('hidden'); $('v-app').classList.add('hidden');
    if(blocked){ $('vjErr').textContent = '운영 정책에 따라 관람이 제한되었어요.'; $('vjGo').disabled = true; }
    else if(isCast) $('vjErr').textContent = '이 기기는 출연자로 참가 중이라 관람석에 입장할 수 없어요.';
    return;
  }
  $('v-join').classList.add('hidden'); $('v-app').classList.remove('hidden');
  $('vMe').textContent = '👀 ' + me.nick;
  $('vPhase').textContent = season ? (S.PHASES[season.phase] || '') : '';
  $('vInfo').textContent = season ? season.name + ' · 시청자 ' + viewerCount + '명' : '';
  if(tab === 'live') renderLive();
  if(tab === 'cast') renderCast();
  if(tab === 'iv') renderIv();
  if(tab === 'talk') renderTalk();
  if(tab === 'friend') renderFriend();
}

function cheerTotals(){
  const t = {}; Object.keys(cheers).forEach(function(k){ const c = cheers[k]; t[c.to] = (t[c.to] || 0) + 1; }); return t;
}
function rankHtml(){
  const t = cheerTotals(), ids = cast().slice().sort(function(a, b){ return ((t[b] || 0) + Object.keys(likes[b] || {}).length) - ((t[a] || 0) + Object.keys(likes[a] || {}).length); }).slice(0, 5);
  if(!ids.length) return '<p class="muted">아직 출연자가 없어요.</p>';
  return ids.map(function(k, i){ return '<div class="rank"><div class="no">' + (i + 1) + '</div>' + avatarHtml(parts[k]) + '<div class="grow"><b>' + esc(parts[k].nick) + '</b><div class="muted" style="font-size:13px;">🎁 ' + (t[k] || 0) + ' · ❤️ ' + Object.keys(likes[k] || {}).length + '</div></div><button class="btn sm" data-cheer="' + k + '">응원</button></div>'; }).join('');
}

function renderLive(){
  const el = $('w-live');
  let html = '';
  const spot = season && season.spotlight && parts[season.spotlight];
  if(spot) html += '<div class="spotlight">' + avatarHtml(spot) + '<div class="grow"><div class="eyebrow" style="letter-spacing:.15em;"><span class="live-dot"></span>ON AIR · 스포트라이트</div><b class="serif" style="font-size:18px;">지금은 ' + esc(spot.nick) + '님의 자기어필 시간</b>' +
    (appeals[season.spotlight] ? '<div style="margin-top:4px;white-space:pre-wrap;">' + esc(appeals[season.spotlight].text) + '</div>' + (S.isJpeg(appeals[season.spotlight].photo) ? '<img class="appeal-photo" alt="어필 사진" src="' + appeals[season.spotlight].photo + '">' : '') : '') +
    '<div class="row" style="margin-top:8px;"><button class="btn sm" data-cheer="' + season.spotlight + '">🎁 기프티콘 응원</button><button class="btn sm ghost" style="color:#fff;border-color:rgba(255,255,255,.5);" data-like="' + season.spotlight + '">' + ((likes[season.spotlight] || {})[user.uid] ? '❤️' : '🤍') + ' ' + Object.keys(likes[season.spotlight] || {}).length + '</button></div></div></div>';
  if(season && season.resultsPublished){
    const cs = couples ? Object.keys(couples) : [];
    html += '<div class="card"><h3>💍 최종 커플 발표</h3>' + (cs.length ? cs.map(function(k){ const c = couples[k]; return '<div class="couple">' + esc(c.aEmoji || '') + ' ' + esc(c.a) + ' 💞 ' + esc(c.b) + ' ' + esc(c.bEmoji || '') + '</div>'; }).join('') : '<p class="muted">이번 기수에는 성사된 커플이 없어요. 😢</p>') + '</div>';
  }
  const ks = Object.keys(notices).sort(function(a, b){ return notices[b].at - notices[a].at; }).slice(0, 3);
  if(ks.length) html += '<div class="card"><h3>📣 제작진 공지</h3>' + ks.map(function(k){ return '<div class="item"><div class="im"><div style="white-space:pre-wrap;">' + esc(notices[k].text) + '</div><div class="id">' + new Date(notices[k].at).toLocaleString('ko-KR') + '</div></div></div>'; }).join('') + '</div>';
  html += '<div class="card"><h3><span class="live-dot"></span>공용 거실 생중계</h3>' + (season && season.broadcastLounge ? '<div class="chatbox" style="height:360px;"><div class="msgs" id="wLounge"></div></div>' : '<p class="muted">제작진이 생중계를 켜면 출연자들의 공용 거실 대화를 볼 수 있어요.</p>') + '</div>';
  html += '<div class="card"><h3>🏆 응원 순위</h3>' + rankHtml() + '</div>';
  el.innerHTML = html;
  bindCommon(el);
  updateLive();
}
function updateLive(){ const m = $('wLounge'); if(!m) return; m.innerHTML = S.bubbles(lounge, '', {empty: '거실이 아직 조용해요.'}); m.scrollTop = m.scrollHeight; }

function renderCast(){
  const el = $('w-cast'), ids = cast();
  let html = '<h2 class="serif" style="color:var(--wine);margin:6px 0 10px;">출연자 · ' + ids.length + '명</h2>';
  if(!ids.length) html += '<div class="empty">아직 출연자가 없어요.</div>';
  ids.forEach(function(k){
    const p = parts[k], a = appeals[k], rf = p.ref && referrals[p.ref], liked = (likes[k] || {})[user.uid];
    const got = {}; Object.keys(cheers).forEach(function(c){ if(cheers[c].to === k) got[cheers[c].gift] = (got[cheers[c].gift] || 0) + 1; });
    html += '<div class="card pcard' + (season && season.spotlight === k ? ' onair' : '') + '">' + avatarHtml(p, 'lg') + '<div class="meta"><div class="nick">' + esc(p.nick) + ' <span class="pill navy">' + (p.gender === 'M' ? '남' : '여') + '</span> <span class="pill">' + esc(p.age) + '</span></div>' +
      (p.personality ? '<div class="line">✨ ' + esc(p.personality) + '</div>' : '') + (p.hobby ? '<div class="line">🎯 ' + esc(p.hobby) + '</div>' : '') + (p.style ? '<div class="line">💞 ' + esc(p.style) + '</div>' : '') +
      '<div class="intro">' + esc(p.intro) + '</div>' + (p.ideal ? '<div class="line">🔎 원하는 상대: ' + esc(p.ideal) + '</div>' : '') +
      (p.fromSeason ? '<div class="refline" style="background:#E5E9F2;color:var(--navy);">🔁 ' + esc(p.fromSeason) + '에서 이어진 출연자</div> ' : '') +
      (rf ? '<div class="refline">👭 ' + esc(rf.byNick) + '님의 친구 소개' + (rf.note ? ' · "' + esc(rf.note) + '"' : '') + '</div>' : '') +
      (a ? '<div class="appeal"><div class="eyebrow" style="letter-spacing:.1em;">🎙️ 자기어필</div><div class="intro" style="margin:4px 0;">' + esc(a.text) + '</div>' + (S.isJpeg(a.photo) ? '<img class="appeal-photo" alt="어필 사진" src="' + a.photo + '">' : '') + '</div>' : '') +
      (Object.keys(got).length ? '<div class="line">받은 응원 ' + Object.keys(got).map(function(g){ return (S.GIFTS[g] ? S.GIFTS[g].e : '🎁') + got[g]; }).join(' ') + '</div>' : '') +
      '<div class="row" style="margin-top:10px;"><button class="btn sm" data-cheer="' + k + '">🎁 기프티콘</button><button class="btn sm ' + (liked ? '' : 'ghost') + '" data-like="' + k + '">' + (liked ? '❤️' : '🤍') + ' ' + Object.keys(likes[k] || {}).length + '</button><button class="linkbtn" data-rep="' + k + '" style="flex:0 0 auto;">신고</button></div></div></div>';
  });
  el.innerHTML = html;
  bindCommon(el);
}

function renderIv(){
  const el = $('w-iv'), all = [];
  Object.keys(interviews).forEach(function(u){ S.listOf(interviews[u]).forEach(function(x){ all.push(Object.assign({u: u}, x)); }); });
  all.sort(function(a, b){ return (b.at || 0) - (a.at || 0); });
  el.innerHTML = '<h2 class="serif" style="color:var(--wine);margin:6px 0 4px;">🎤 속마음 인터뷰</h2><p class="muted" style="margin-top:0;">출연자들이 제작진 카메라 앞에서 털어놓은 속마음이에요. <b>출연자들은 서로의 인터뷰를 볼 수 없어요.</b> 스포일러는 시청자톡에서만!</p>' +
    (all.length ? all.map(function(x){ const p = parts[x.u] || {}; return '<div class="card pcard">' + avatarHtml(p) + '<div class="meta"><div class="nick" style="font-size:17px;">' + esc(p.nick || '') + '의 속마음</div><div class="intro">"' + esc(x.text) + '"</div><div class="muted" style="font-size:12px;">' + new Date(x.at).toLocaleString('ko-KR') + '</div></div></div>'; }).join('') : '<div class="empty">아직 인터뷰가 없어요.</div>');
}

function renderTalk(){
  const el = $('w-talk');
  if(el.dataset.built !== '1'){
    el.dataset.built = '1';
    el.innerHTML = '<h2 class="serif" style="color:var(--wine);margin:6px 0 4px;">💬 시청자톡</h2><p class="muted" style="margin-top:0;">시청자끼리만 보는 대화방이에요. 출연자는 볼 수 없어요.</p>' +
      '<div class="chatbox"><div class="msgs" id="wtMsgs"></div><form class="chatin" id="wtForm" autocomplete="off"><input class="t" id="wtText" maxlength="200" placeholder="응원·과몰입 환영! 악플은 금지"><button class="btn sm" id="wtSend">전송</button></form></div>';
    $('wtForm').onsubmit = function(e){
      e.preventDefault();
      const t = $('wtText').value.trim(); if(!t) return;
      $('wtSend').disabled = true;
      ref('viewerChat/' + sid).push({uid: user.uid, nick: me.nick, text: t, at: S.TS}).then(function(){ $('wtText').value = ''; $('wtSend').disabled = false; const m = $('wtMsgs'); m.scrollTop = m.scrollHeight; },
        function(er){ $('wtSend').disabled = false; S.toast('보내지 못했어요: ' + err(er), 'bad'); });
    };
  }
  updateTalk();
}
function updateTalk(){
  const m = $('wtMsgs'); if(!m || tab !== 'talk') return;
  const near = m.scrollHeight - m.scrollTop - m.clientHeight < 140;
  m.innerHTML = S.bubbles(talk, user.uid, {empty: '첫 번째 응원 메시지를 남겨 보세요!'});
  if(near) m.scrollTop = m.scrollHeight;
}

function refUrl(){ return S.computedEntryUrl() + '?ref=' + user.uid; }
function renderFriend(){
  const el = $('w-friend'), mine = referrals[user.uid];
  const n = Object.keys(parts).filter(function(k){ return parts[k].ref === user.uid; }).length;
  const watchUrl = S.computedEntryUrl() + 'watch.html';
  el.innerHTML = '<h2 class="serif" style="color:var(--wine);margin:6px 0 10px;">👭 친구 소개</h2>' +
    '<div class="card"><h3>솔로 친구를 출연자로 소개하기</h3><p class="muted" style="margin-top:0;">내 소개 링크로 입장한 친구의 프로필에 <b>"' + esc(me.nick) + '님의 친구 소개"</b>와 추천사가 표시돼요.</p>' +
    '<label class="f">추천사 <span class="muted">(100자)</span></label><input class="t" id="wfNote" maxlength="100" placeholder="예) 제 대학 동기예요. 웃는 모습이 정말 예뻐요!" value="' + esc(mine ? mine.note || '' : '') + '">' +
    '<button class="btn sm" id="wfSave" style="margin-top:8px;">' + (mine ? '추천사 고치기' : '내 소개 링크 만들기') + '</button>' +
    (mine ? '<div class="center" style="margin-top:12px;"><div class="qrbox" id="wfQr"></div><p class="url">' + esc(refUrl()) + '</p><button class="btn sm navy" id="wfShare">친구에게 공유하기</button><p class="muted">내 소개로 출연한 친구: <b>' + n + '명</b></p></div>' : '') + '</div>' +
    '<div class="card"><h3>📺 관람석에 친구 초대</h3><p class="muted" style="margin-top:0;">같이 과몰입할 시청자를 불러 주세요.</p><p class="url">' + esc(watchUrl) + '</p><button class="btn sm ghost" id="wfWatch">관람석 링크 공유</button></div>';
  $('wfSave').onclick = function(){
    ref('referrals/' + sid + '/' + user.uid).set({by: user.uid, byNick: me.nick, role: 'viewer', note: $('wfNote').value.trim(), at: S.TS})
      .then(function(){ S.toast('소개 링크가 준비됐어요', 'ok'); }, function(e){ S.toast(err(e), 'bad'); });
  };
  if($('wfQr')) S.makeQR($('wfQr'), refUrl(), 160);
  if($('wfShare')) $('wfShare').onclick = function(){ share(refUrl(), me.nick + '님이 사이버 나는 SOLO 출연자로 당신을 소개했어요!'); };
  $('wfWatch').onclick = function(){ share(watchUrl, '사이버 나는 SOLO 관람석에서 같이 봐요!'); };
}
function share(url, text){
  if(navigator.share) navigator.share({title: '사이버 나는 SOLO', text: text, url: url}).catch(function(){});
  else (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function(){ S.toast('링크를 복사했어요', 'ok'); }, function(){ prompt('링크를 복사하세요', url); });
}

/* ───────── 응원 ───────── */
function bindCommon(el){
  el.querySelectorAll('[data-cheer]').forEach(function(b){ b.onclick = function(){ cheerModal(b.dataset.cheer); }; });
  el.querySelectorAll('[data-like]').forEach(function(b){ b.onclick = function(){
    const k = b.dataset.like, r = ref('appealLikes/' + sid + '/' + k + '/' + user.uid);
    ((likes[k] || {})[user.uid] ? r.remove() : r.set(true)).catch(function(e){ S.toast(err(e), 'bad'); });
  }; });
  el.querySelectorAll('[data-rep]').forEach(function(b){ b.onclick = function(){
    const r = prompt(nickOf(b.dataset.rep) + '님을 신고하는 이유를 적어 주세요'); if(!r || !r.trim()) return;
    ref('reports/' + sid).push({from: user.uid, target: b.dataset.rep, reason: r.trim().slice(0, 200), at: S.TS}).then(function(){ S.toast('신고가 접수되었어요', 'ok'); }, function(e){ S.toast(err(e), 'bad'); });
  }; });
}
function freeSlot(){
  for(let i = 0; i < SLOTS.length; i++){ if(!cheers[user.uid + '_' + SLOTS[i]]) return SLOTS[i]; }
  return null;
}
function cheerModal(target){
  const used = Object.keys(cheers).filter(function(k){ return k.indexOf(user.uid + '_') === 0; }).length;
  const slot = freeSlot();
  if(!slot){ S.toast('이번 기수 기프티콘을 모두 보냈어요 (' + MAX_CHEERS + '개)'); return; }
  let gift = 'coffee';
  modal('<h3 class="serif" style="color:var(--wine);margin-top:0;">🎁 기프티콘으로 응원하기</h3>' +
    '<p class="muted">가상 기프티콘이에요 (실제 결제·실물 없음). 남은 개수 ' + (MAX_CHEERS - used) + '/' + MAX_CHEERS + '</p>' +
    '<label class="f">받는 출연자</label><select class="t" id="chTo">' + cast().map(function(k){ return '<option value="' + k + '"' + (k === target ? ' selected' : '') + '>' + esc(parts[k].avatar.emoji + ' ' + parts[k].nick) + '</option>'; }).join('') + '</select>' +
    '<label class="f">기프티콘</label><div class="gift-grid" id="chG">' + Object.keys(S.GIFTS).map(function(g){ return '<button class="' + (g === gift ? 'on' : '') + '" data-g="' + g + '"><b>' + S.GIFTS[g].e + '</b>' + esc(S.GIFTS[g].n) + '</button>'; }).join('') + '</div>' +
    '<label class="f">응원 메시지 <span class="muted">(60자, 선택)</span></label><input class="t" id="chM" maxlength="60" placeholder="예) 영수님 직진 응원합니다!">' +
    '<div style="height:12px"></div><button class="btn" id="chOk">보내기</button><button class="btn ghost" id="chX">취소</button>');
  $('chG').querySelectorAll('button').forEach(function(b){ b.onclick = function(){ gift = b.dataset.g; $('chG').querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x === b); }); }; });
  $('chX').onclick = closeModal;
  $('chOk').onclick = function(){
    const to = $('chTo').value; if(!to) return;
    $('chOk').disabled = true;
    ref('cheers/' + sid + '/' + user.uid + '_' + slot).set({from: user.uid, fromNick: me.nick, to: to, gift: gift, msg: $('chM').value.trim(), at: S.TS})
      .then(function(){ closeModal(); S.toast(nickOf(to) + '님에게 ' + S.GIFTS[gift].e + ' ' + S.GIFTS[gift].n + '을(를) 보냈어요!', 'ok'); },
        function(e){ $('chOk').disabled = false; S.toast('보내지 못했어요: ' + err(e), 'bad'); });
  };
}

boot();
})();
