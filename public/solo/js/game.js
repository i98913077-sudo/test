/* 사이버 나는 SOLO — 참가자 화면 */
(function(){
"use strict";
const S = window.SOLO, $ = S.$, esc = S.esc, db = S.db;

const AGES = ['20대 초반','20대 중반','20대 후반','30대 초반','30대 중반','30대 후반','40대 이상'];
const PERSONALITIES = ['다정함','유쾌함','차분함','진지함','계획형','즉흥형','배려심','리더십','낙천적','섬세함','엉뚱함','성실함'];
const STYLES = ['천천히 알아가요','적극적으로 표현해요','친구 같은 연애','매일 연락 좋아요','각자 시간도 소중해요','이벤트를 좋아해요'];
const AVATARS = ['🦊','🐻','🐰','🐱','🐶','🐼','🐨','🦁','🐯','🐧','🦄','🐹','🌷','🌻','🍀','⭐','🌙','☕'];
const COLORS = ['#F4E3E8','#E5E9F2','#FBF0DC','#E2F2EA','#EDE4F7','#FDE2D0','#DDEFF7','#F1F1E6'];
const ITEM_EMOJI = ['🌹','💐','🍫','☕','🍰','💌','🎟️','🎬','🧸','🎵','📚','✏️','🍎','🌙','💎','🎀','🍀','🧁'];
const MAX_ITEMS = 10;

let user = null, sid = null, season = null, me = null, blocked = false;
let parts = {}, myVotes = [], myFinal = null, items = {}, notices = {}, resFirst = null, resFinal = null, couples = null;
let tab = 'lobby', showAll = false, appOn = false, listeners = [], resultListeners = [];

/* ───────── 공통 ───────── */
function show(id){ ['s-intro','s-onboard','s-wait','s-app'].forEach(function(s){ $(s).classList.toggle('hidden', s !== id); }); window.scrollTo(0,0); }
function avatarHtml(p, cls){ const a = (p && p.avatar) || {}; return '<div class="avatar ' + (cls||'') + '" style="background:' + esc(a.color || '#F3EDE1') + '">' + esc(a.emoji || '🙂') + '</div>'; }
function approvedOthers(){ return Object.keys(parts).filter(function(k){ return k !== user.uid && parts[k].status === 'approved'; }); }
function nickOf(uid){ return parts[uid] ? parts[uid].nick : '(알 수 없음)'; }
function err(e){ const m = String((e && e.message) || e); return /permission|PERMISSION/.test(m) ? '권한이 없거나 마감되었어요.' : m; }
function on(ref, ev, cb, list){ ref.on(ev, cb, function(){ cb(null); }); (list || listeners).push(function(){ ref.off(ev, cb); }); }
function modal(html){
  const r = $('modalRoot');
  r.innerHTML = '<div class="modal"><div class="sheet">' + html + '</div></div>';
  r.firstChild.addEventListener('click', function(e){ if(e.target === r.firstChild) closeModal(); });
  return r.firstChild;
}
function closeModal(){ $('modalRoot').innerHTML = ''; }

function phaseDeadline(){
  if(!season) return 0;
  if(season.phase === 'first') return season.firstEndsAt || 0;
  if(season.phase === 'final') return season.finalEndsAt || 0;
  return 0;
}
function phaseOpen(ph){ if(!season || season.phase !== ph) return false; const d = phaseDeadline(); return !d || S.now() < d; }

/* ───────── 첫 화면 ───────── */
function guideModal(){
  modal('<h3 class="serif" style="color:var(--wine);margin-top:0;">프로그램 안내</h3>' +
    '<ol class="guide">' +
    '<li><b>QR코드로 입장</b> — 스마트폰 카메라로 QR을 찍으면 이 페이지가 열려요.</li>' +
    '<li><b>캐릭터 만들기</b> — 닉네임·연령대·성격·취미·자기소개로 나만의 캐릭터를 만들어요. 실명·학교·전화번호는 받지 않아요.</li>' +
    '<li><b>솔로 나라 로비</b> — 이번 기수 참가자들의 프로필 카드를 둘러봐요.</li>' +
    '<li><b>첫인상 선택</b> — 운영자가 정한 기간 동안 마음에 드는 상대를 비공개로 선택해요.</li>' +
    '<li><b>호감 알림</b> — 운영자가 공개하면, 서로 선택한 경우에만 알려드려요.</li>' +
    '<li><b>최종 선택</b> — 기수 마지막에 단 한 명을 선택해요. 서로 선택하면 커플 성사!</li>' +
    '<li><b>아이템</b> — 직접 아이템을 만들어 마음에 드는 상대에게 선물할 수 있어요.</li>' +
    '</ol><p class="muted">선택 내용은 본인과 운영자만 볼 수 있고, 상대 동의 없이 연락처를 공개하지 않아요. 불편한 참가자는 카드의 "신고"로 알려주세요.</p>' +
    '<button class="btn" id="mClose">확인</button>');
  $('mClose').onclick = closeModal;
}
function qrModal(){
  db.ref('solo/config/entryUrl').once('value').then(function(s){ return s.val(); }, function(){ return null; }).then(function(cfg){
    const url = cfg || S.computedEntryUrl();
    modal('<div class="center"><h3 class="serif" style="color:var(--wine);margin-top:0;">QR코드로 입장하기</h3>' +
      '<p class="muted">옆 사람에게 이 QR을 보여주거나, 스마트폰 카메라로 찍어 입장하세요.</p>' +
      '<div class="qrbox" id="mQr"></div><p class="url" style="margin:12px 0;">' + esc(url) + '</p>' +
      (S.isPublicUrl(url) ? '' : '<p class="hint bad">지금 주소는 외부 기기에서 열 수 없는 주소일 수 있어요. 운영자 페이지에서 실제 배포 주소를 등록해 주세요.</p>') +
      '<button class="btn navy" id="mCopy">주소 복사</button><button class="btn ghost" id="mClose">닫기</button></div>');
    S.makeQR($('mQr'), url, 220);
    $('mCopy').onclick = function(){ (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function(){ S.toast('주소를 복사했어요', 'ok'); }, function(){ prompt('주소를 복사하세요', url); }); };
    $('mClose').onclick = closeModal;
  });
}

function boot(){
  show('s-intro');
  $('iGuide').onclick = guideModal;
  $('iQr').onclick = qrModal;
  if(S.initError){ $('iErr').textContent = 'Firebase를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'; return; }
  S.ready().then(function(u){
    user = u;
    db.ref('solo/blocked/' + u.uid).on('value', function(s){ blocked = !!s.val(); if(blocked && appOn) renderAll(); }, function(){});
    S.watchSeason(function(id, se){
      const changed = id !== sid;
      sid = id; season = se;
      if(changed){ detach(); if(sid) attachSeason(); }
      renderIntro();
      if(appOn){ attachResults(); renderAll(); }
    });
  }).catch(function(e){
    $('iStatus').textContent = '접속 준비 중 문제가 생겼어요.';
    $('iErr').textContent = e.message;
  });
  $('iEnter').onclick = enter;
}

function renderIntro(){
  $('iSeason').textContent = season ? season.name : '-';
  const n = Object.keys(parts).filter(function(k){ return parts[k].status === 'approved'; }).length;
  $('iCount').textContent = season ? n + '명' : '-';
  if(!season){ $('iStatus').textContent = '아직 열린 기수가 없어요. 운영자가 기수를 열면 입장할 수 있어요.'; $('iEnter').disabled = true; return; }
  $('iStatus').textContent = S.STATUS[season.status] + ' · ' + (S.PHASES[season.phase] || '');
  $('iEnter').disabled = false;
}

function enter(){
  if(!sid || !season) return;
  if(blocked){ waitScreen('입장이 제한되었어요', '운영 정책에 따라 이 기기에서는 참가할 수 없어요.'); return; }
  if(me){ openApp(); return; }
  if(season.status === 'ended'){ S.toast('이번 기수는 종료되었어요. 다음 기수를 기다려 주세요.'); return; }
  startOnboarding();
}

/* ───────── 시즌 데이터 구독 ───────── */
function detach(){ listeners.forEach(function(f){ f(); }); listeners = []; resultListeners.forEach(function(f){ f(); }); resultListeners = []; parts = {}; me = null; myVotes = []; myFinal = null; items = {}; notices = {}; }
function attachSeason(){
  on(db.ref('solo/participants/' + sid), 'value', function(s){
    parts = (s && s.val()) || {};
    const prev = me; me = parts[user.uid] || null;
    renderIntro();
    if(appOn) renderAll();
    else if(!prev && me && !$('s-onboard').classList.contains('hidden')) openApp();
  });
  on(db.ref('solo/votes/' + sid + '/' + user.uid), 'value', function(s){
    const v = (s && s.val()) || {};
    myVotes = ['0','1','2'].map(function(k){ return v[k]; }).filter(Boolean);
    if(appOn) renderAll();
  });
  on(db.ref('solo/finalChoices/' + sid + '/' + user.uid), 'value', function(s){ myFinal = s && s.val() ? s.val().target : null; if(appOn) renderAll(); });
  on(db.ref('solo/items/' + sid), 'value', function(s){ items = (s && s.val()) || {}; if(appOn) renderAll(); });
  on(db.ref('solo/announcements/' + sid), 'value', function(s){ notices = (s && s.val()) || {}; if(appOn) renderAll(); });
}
// 결과는 공개 플래그가 켜진 뒤에만 읽을 수 있어서, 시즌 상태가 바뀔 때마다 다시 구독한다.
function attachResults(){
  resultListeners.forEach(function(f){ f(); }); resultListeners = [];
  resFirst = resFinal = couples = null;
  if(!sid || !season) return;
  if(season.firstRevealed) on(db.ref('solo/results/' + sid + '/first/' + user.uid), 'value', function(s){ resFirst = s ? (s.val() || {}) : null; renderAll(); }, resultListeners);
  if(season.resultsPublished){
    on(db.ref('solo/results/' + sid + '/final/' + user.uid), 'value', function(s){ resFinal = s ? (s.val() || {}) : null; renderAll(); }, resultListeners);
    on(db.ref('solo/results/' + sid + '/couples'), 'value', function(s){ couples = s ? (s.val() || {}) : null; renderAll(); }, resultListeners);
  }
}

/* ───────── 캐릭터 생성 ───────── */
let ob = null;
function startOnboarding(){
  ob = {step:0, agree:false, nick:'', nickOk:false, age:'', gender:'', lookingFor:'', personality:[], hobby:'', style:'', intro:'', ideal:'', emoji:AVATARS[0], color:COLORS[0]};
  show('s-onboard');
  $('obPrev').onclick = function(){ if(ob.step === 0){ show('s-intro'); return; } ob.step--; renderOb(); };
  $('obNext').onclick = nextOb;
  renderOb();
}
const OB_STEPS = 6;
function renderOb(){
  $('obSteps').innerHTML = Array.from({length:OB_STEPS}, function(_, i){ return '<i class="' + (i <= ob.step ? 'on' : '') + '"></i>'; }).join('');
  $('obNext').textContent = ob.step === OB_STEPS - 1 ? '캐릭터 생성 & 입장' : '다음';
  $('obPrev').textContent = ob.step === 0 ? '처음으로' : '이전';
  const b = $('obBody');
  if(ob.step === 0){
    b.innerHTML = '<div class="card"><h3>이용 안내</h3><ol class="guide">' +
      '<li>닉네임으로만 참여해요. <b>실명·학교명·전화번호는 입력하지 마세요.</b></li>' +
      '<li>프로필(닉네임·연령대·성별·성격·취미·자기소개)은 이번 기수 참가자에게 공개돼요.</li>' +
      '<li>호감 선택과 최종 선택은 <b>본인과 운영자만</b> 볼 수 있어요.</li>' +
      '<li>서로를 선택한 경우에만, 운영자가 공개한 뒤 결과를 알려드려요.</li>' +
      '<li>상대를 존중해 주세요. 부적절한 이용은 운영자가 차단할 수 있어요.</li>' +
      '<li>이 기기의 브라우저에 익명 로그인 정보가 저장돼요. 다른 기기에서는 새 캐릭터가 필요해요.</li></ol>' +
      '<label class="row" style="gap:8px;margin-top:10px;cursor:pointer;"><input type="checkbox" id="obAgree" style="flex:0 0 auto;width:20px;height:20px;"' + (ob.agree ? ' checked' : '') + '> <span>위 내용을 확인했어요</span></label></div>';
    $('obAgree').onchange = function(){ ob.agree = this.checked; };
  }else if(ob.step === 1){
    b.innerHTML = '<div class="card"><h3>닉네임 설정</h3><p class="muted">2~12자. 이번 기수에서 다른 참가자와 겹칠 수 없어요.</p>' +
      '<input class="t" id="obNick" maxlength="12" placeholder="예) 영숙, 광수, 별빛쌤" value="' + esc(ob.nick) + '"><div class="hint" id="obNickHint"></div></div>';
    const inp = $('obNick');
    inp.oninput = function(){ ob.nick = inp.value; ob.nickOk = false; $('obNickHint').textContent = ''; $('obNickHint').className = 'hint'; };
    inp.onblur = function(){ checkNick(); };
    inp.focus();
  }else if(ob.step === 2){
    b.innerHTML = '<div class="card"><h3>매칭 정보</h3>' +
      '<label class="f">연령대</label><div class="seg" id="obAge">' + AGES.map(function(a){ return '<button class="chip' + (ob.age === a ? ' on' : '') + '" data-v="' + a + '">' + a + '</button>'; }).join('') + '</div>' +
      '<label class="f">나의 성별 <span class="muted">(매칭에만 사용)</span></label><div class="seg" id="obGender">' + ['M','F'].map(function(g){ return '<button class="chip' + (ob.gender === g ? ' on' : '') + '" data-v="' + g + '">' + (g === 'M' ? '남성' : '여성') + '</button>'; }).join('') + '</div>' +
      '<label class="f">만나고 싶은 상대</label><div class="seg" id="obLook">' + [['M','남성'],['F','여성'],['A','상관없음']].map(function(g){ return '<button class="chip' + (ob.lookingFor === g[0] ? ' on' : '') + '" data-v="' + g[0] + '">' + g[1] + '</button>'; }).join('') + '</div></div>';
    seg('obAge', 'age'); seg('obGender', 'gender'); seg('obLook', 'lookingFor');
  }else if(ob.step === 3){
    b.innerHTML = '<div class="card"><h3>나를 소개하는 키워드</h3>' +
      '<label class="f">성격 <span class="muted">(최대 3개)</span></label><div class="chips" id="obPers">' + PERSONALITIES.map(function(p){ return '<button class="chip' + (ob.personality.indexOf(p) >= 0 ? ' on' : '') + '" data-v="' + p + '">' + p + '</button>'; }).join('') + '</div>' +
      '<label class="f">취미</label><input class="t" id="obHobby" maxlength="40" placeholder="예) 주말 등산, 보드게임, 베이킹" value="' + esc(ob.hobby) + '">' +
      '<label class="f">연애 스타일</label><div class="chips" id="obStyle">' + STYLES.map(function(p){ return '<button class="chip' + (ob.style === p ? ' on' : '') + '" data-v="' + p + '">' + p + '</button>'; }).join('') + '</div></div>';
    $('obPers').querySelectorAll('.chip').forEach(function(c){ c.onclick = function(){
      const v = c.dataset.v, i = ob.personality.indexOf(v);
      if(i >= 0) ob.personality.splice(i, 1); else if(ob.personality.length < 3) ob.personality.push(v); else { S.toast('성격은 3개까지 고를 수 있어요'); return; }
      c.classList.toggle('on');
    }; });
    seg('obStyle', 'style');
    $('obHobby').oninput = function(){ ob.hobby = this.value; };
  }else if(ob.step === 4){
    b.innerHTML = '<div class="card"><h3>자기소개</h3>' +
      '<label class="f">자기소개 <span class="muted">(필수, 300자 이내)</span></label><textarea class="t" id="obIntro" maxlength="300" placeholder="교실 밖의 나는 어떤 사람인가요?">' + esc(ob.intro) + '</textarea>' +
      '<label class="f">원하는 상대</label><input class="t" id="obIdeal" maxlength="100" placeholder="예) 대화가 잘 통하고 웃음이 많은 사람" value="' + esc(ob.ideal) + '">' +
      '<p class="hint">실명·학교명·연락처·SNS 아이디는 적지 마세요.</p></div>';
    $('obIntro').oninput = function(){ ob.intro = this.value; };
    $('obIdeal').oninput = function(){ ob.ideal = this.value; };
  }else{
    b.innerHTML = '<div class="card"><h3>캐릭터 생성</h3><div class="emoji-grid" id="obEmoji">' + AVATARS.map(function(e){ return '<button class="' + (ob.emoji === e ? 'on' : '') + '" data-v="' + e + '">' + e + '</button>'; }).join('') + '</div>' +
      '<div class="colors" id="obColor">' + COLORS.map(function(c){ return '<button class="' + (ob.color === c ? 'on' : '') + '" data-v="' + c + '" style="background:' + c + '"></button>'; }).join('') + '</div></div>' +
      '<div class="card pcard" id="obPreview"></div>';
    $('obEmoji').querySelectorAll('button').forEach(function(x){ x.onclick = function(){ ob.emoji = x.dataset.v; renderOb(); }; });
    $('obColor').querySelectorAll('button').forEach(function(x){ x.onclick = function(){ ob.color = x.dataset.v; renderOb(); }; });
    $('obPreview').innerHTML = cardInner(obProfile(), true);
  }
}
function seg(id, key){ $(id).querySelectorAll('.chip').forEach(function(c){ c.onclick = function(){ ob[key] = c.dataset.v; $(id).querySelectorAll('.chip').forEach(function(x){ x.classList.toggle('on', x === c); }); }; }); }
function obProfile(){
  return {nick: ob.nick.trim(), age: ob.age, gender: ob.gender, lookingFor: ob.lookingFor, personality: ob.personality.join(', '), hobby: ob.hobby.trim(),
    style: ob.style, intro: ob.intro.trim(), ideal: ob.ideal.trim(), avatar: {emoji: ob.emoji, color: ob.color}};
}
function checkNick(){
  const n = ob.nick.trim(), h = $('obNickHint');
  if(n.length < 2 || n.length > 12){ if(h){ h.textContent = '닉네임은 2~12자로 정해 주세요.'; h.className = 'hint bad'; } return Promise.resolve(false); }
  if(S.BAD_NICK.test(n)){ if(h){ h.textContent = '. # $ [ ] / 기호는 쓸 수 없어요.'; h.className = 'hint bad'; } return Promise.resolve(false); }
  return db.ref('solo/nicknames/' + sid + '/' + S.nickKey(n)).once('value').then(function(s){
    ob.nickOk = !s.exists();
    if(h){ h.textContent = ob.nickOk ? '사용할 수 있는 닉네임이에요 ✓' : '이미 사용 중인 닉네임이에요.'; h.className = 'hint ' + (ob.nickOk ? 'ok' : 'bad'); }
    return ob.nickOk;
  });
}
function nextOb(){
  const st = ob.step;
  if(st === 0 && !ob.agree){ S.toast('이용 안내를 확인해 주세요'); return; }
  if(st === 1){ $('obNext').disabled = true; checkNick().then(function(ok){ $('obNext').disabled = false; if(ok){ ob.step++; renderOb(); } }); return; }
  if(st === 2 && (!ob.age || !ob.gender || !ob.lookingFor)){ S.toast('연령대·성별·만나고 싶은 상대를 모두 골라 주세요'); return; }
  if(st === 4 && !ob.intro.trim()){ S.toast('자기소개를 한 줄 이상 적어 주세요'); return; }
  if(st < OB_STEPS - 1){ ob.step++; renderOb(); return; }
  createCharacter();
}
function createCharacter(){
  const p = obProfile();
  p.status = season.requireApproval ? 'pending' : 'approved';
  p.createdAt = S.TS;
  const up = {};
  up['participants/' + sid + '/' + user.uid] = p;
  up['nicknames/' + sid + '/' + S.nickKey(p.nick)] = user.uid;
  $('obNext').disabled = true;
  db.ref('solo').update(up).then(function(){
    S.toast('캐릭터가 생성되었어요!', 'ok');
  }).catch(function(e){
    $('obNext').disabled = false;
    checkNick().then(function(ok){
      if(!ok){ ob.step = 1; renderOb(); S.toast('그 사이 다른 사람이 닉네임을 가져갔어요. 다른 닉네임을 골라 주세요.', 'bad'); }
      else S.toast('저장하지 못했어요: ' + err(e), 'bad');
    });
  });
}

/* ───────── 본편 ───────── */
function waitScreen(t, x){ appOn = false; $('wTitle').textContent = t; $('wText').textContent = x; show('s-wait'); }
function openApp(){
  appOn = true;
  show('s-app');
  document.querySelectorAll('.tabs button').forEach(function(b){ b.onclick = function(){ setTab(b.dataset.t); }; });
  attachResults();
  renderAll();
  if(!openApp._iv) openApp._iv = setInterval(tick, 1000);
}
function setTab(t){
  tab = t;
  document.querySelectorAll('.tabs button').forEach(function(b){ b.classList.toggle('on', b.dataset.t === t); });
  ['lobby','picks','items','news'].forEach(function(x){ $('t-' + x).classList.toggle('hidden', x !== t); });
  if(t === 'news') markSeen();
  renderAll(); window.scrollTo(0,0);
}
function tick(){
  const d = phaseDeadline();
  $('aLeft').textContent = d ? S.fmtLeft(d - S.now()) : '';
}
function renderAll(){
  if(!appOn) return;
  if(!me){ show('s-intro'); appOn = false; return; }
  if(blocked || me.status === 'blocked'){ waitScreen('입장이 제한되었어요', '운영 정책에 따라 이번 기수 참여가 제한되었어요.'); return; }
  if(me.status === 'pending'){ waitScreen('참가 승인 대기 중', '운영자가 참가 신청을 확인하고 있어요. 승인되면 이 화면이 자동으로 바뀌어요.'); appOn = true; return; }
  if(me.status === 'hidden'){ waitScreen('프로필이 숨김 처리되었어요', '운영자에게 문의해 주세요.'); appOn = true; return; }
  if($('s-app').classList.contains('hidden')) show('s-app');
  $('aMe').innerHTML = avatarHtml(me) + esc(me.nick);
  $('aPhase').textContent = season ? (S.PHASES[season.phase] || '') : '';
  tick();
  if(tab === 'lobby') renderLobby();
  if(tab === 'picks') renderPicks();
  if(tab === 'items') renderItems();
  if(tab === 'news') renderNews();
  $('newsDot').classList.toggle('hidden', !hasUnseen());
}

function cardInner(p, preview){
  const g = p.gender ? (p.gender === 'M' ? '남' : '여') : '';
  return avatarHtml(p, 'lg') + '<div class="meta"><div class="nick">' + esc(p.nick || '닉네임') + (g ? ' <span class="pill navy">' + g + '</span>' : '') + (p.age ? ' <span class="pill">' + esc(p.age) + '</span>' : '') + '</div>' +
    (p.personality ? '<div class="line">✨ ' + esc(p.personality) + '</div>' : '') +
    (p.hobby ? '<div class="line">🎯 ' + esc(p.hobby) + '</div>' : '') +
    (p.style ? '<div class="line">💞 ' + esc(p.style) + '</div>' : '') +
    '<div class="intro">' + esc(p.intro || (preview ? '자기소개가 여기에 보여요.' : '')) + '</div>' +
    (p.ideal ? '<div class="line">🔎 원하는 상대: ' + esc(p.ideal) + '</div>' : '') + '</div>';
}

function renderLobby(){
  const el = $('t-lobby');
  let ids = approvedOthers();
  const filtered = me.lookingFor === 'A' || showAll ? ids : ids.filter(function(k){ return parts[k].gender === me.lookingFor; });
  filtered.sort(function(a, b){ return (parts[a].createdAt || 0) - (parts[b].createdAt || 0); });
  const firstOn = phaseOpen('first'), finalOn = phaseOpen('final');
  let html = '<h2 class="serif" style="color:var(--wine);margin:6px 0 4px;">솔로 나라 · ' + esc(season ? season.name : '') + '</h2>' +
    '<p class="muted" style="margin-top:0;">' + ids.length + '명의 참가자가 함께하고 있어요.' + (me.lookingFor !== 'A' ? ' <button class="linkbtn" id="lAll">' + (showAll ? '관심 상대만 보기' : '모든 참가자 보기') + '</button>' : '') + '</p>';
  const latest = latestNotice();
  if(latest) html += '<div class="notice">📣 ' + esc(latest.text) + '</div>';
  if(firstOn) html += '<div class="notice navy">💗 첫인상 선택 중! 최대 <b>' + season.picks + '명</b>까지 고를 수 있어요. (' + myVotes.length + '/' + season.picks + ')</div>';
  if(finalOn) html += '<div class="notice navy">💍 최종 선택 중! 단 <b>한 명</b>을 골라 주세요.</div>';
  if(!filtered.length) html += '<div class="empty">아직 다른 참가자가 없어요.<br>QR코드를 공유해 동료 선생님을 초대해 보세요!</div>';
  filtered.forEach(function(k){
    const p = parts[k], picked = myVotes.indexOf(k) >= 0, fin = myFinal === k;
    html += '<div class="card pcard' + ((firstOn && picked) || (finalOn && fin) ? ' picked' : '') + '">' + cardInner(p) + '</div>' +
      '<div class="row" style="margin:-6px 0 18px;">' +
      (firstOn ? '<button class="btn sm heart-btn' + (picked ? ' on' : '') + '" data-vote="' + k + '">' + (picked ? '💗 호감 선택됨' : '🤍 호감 선택') + '</button>' : '') +
      (finalOn ? '<button class="btn sm heart-btn' + (fin ? ' on' : '') + '" data-final="' + k + '">' + (fin ? '💍 최종 선택됨' : '💍 최종 선택') + '</button>' : '') +
      '<button class="btn sm ghost" data-gift="' + k + '">🎁 선물</button>' +
      '<button class="linkbtn" data-report="' + k + '" style="flex:0 0 auto;">신고</button></div>';
  });
  el.innerHTML = html;
  if($('lAll')) $('lAll').onclick = function(){ showAll = !showAll; renderLobby(); };
  el.querySelectorAll('[data-vote]').forEach(function(b){ b.onclick = function(){ toggleVote(b.dataset.vote); }; });
  el.querySelectorAll('[data-final]').forEach(function(b){ b.onclick = function(){ setFinal(b.dataset.final); }; });
  el.querySelectorAll('[data-gift]').forEach(function(b){ b.onclick = function(){ giftModal(null, b.dataset.gift); }; });
  el.querySelectorAll('[data-report]').forEach(function(b){ b.onclick = function(){ report(b.dataset.report); }; });
}

function toggleVote(target){
  if(!phaseOpen('first')){ S.toast('지금은 첫인상 선택 기간이 아니에요'); return; }
  if(target === user.uid) return;
  let next = myVotes.slice();
  const i = next.indexOf(target);
  if(i >= 0) next.splice(i, 1);
  else if(next.length >= season.picks){ S.toast('최대 ' + season.picks + '명까지 선택할 수 있어요. 먼저 다른 선택을 취소해 주세요.'); return; }
  else next.push(target);
  const ref = db.ref('solo/votes/' + sid + '/' + user.uid);
  const val = {updatedAt: S.TS}; next.forEach(function(t, n){ val[String(n)] = t; });
  (next.length ? ref.set(val) : ref.remove()).then(function(){
    S.toast(i >= 0 ? '선택을 취소했어요' : nickOf(target) + '님을 선택했어요 (비공개)', 'ok');
  }).catch(function(e){ S.toast('저장하지 못했어요: ' + err(e), 'bad'); });
}
function setFinal(target){
  if(!phaseOpen('final')){ S.toast('지금은 최종 선택 기간이 아니에요'); return; }
  const ref = db.ref('solo/finalChoices/' + sid + '/' + user.uid);
  const cancel = myFinal === target;
  if(!cancel && !confirm(nickOf(target) + '님을 최종 선택할까요?\n마감 전까지는 바꿀 수 있어요.')) return;
  (cancel ? ref.remove() : ref.set({target: target, at: S.TS})).then(function(){
    S.toast(cancel ? '최종 선택을 취소했어요' : '최종 선택을 저장했어요 (비공개)', 'ok');
  }).catch(function(e){ S.toast('저장하지 못했어요: ' + err(e), 'bad'); });
}
function report(target){
  const r = prompt(nickOf(target) + '님을 신고하는 이유를 적어 주세요 (운영자만 볼 수 있어요)');
  if(!r || !r.trim()) return;
  db.ref('solo/reports/' + sid).push({from: user.uid, target: target, reason: r.trim().slice(0, 200), at: S.TS})
    .then(function(){ S.toast('신고가 접수되었어요', 'ok'); }, function(e){ S.toast('접수하지 못했어요: ' + err(e), 'bad'); });
}

function renderPicks(){
  const el = $('t-picks');
  const ph = season ? season.phase : 'lobby';
  let html = '<h2 class="serif" style="color:var(--wine);margin:6px 0 10px;">나의 선택</h2>';
  html += '<div class="card"><h3>💗 첫인상 선택</h3>';
  if(ph === 'lobby') html += '<p class="muted">아직 첫인상 선택이 시작되지 않았어요. 로비에서 참가자들을 둘러보세요!</p>';
  else{
    html += '<p class="muted">' + (phaseOpen('first') ? '진행 중 · 최대 ' + season.picks + '명 · 마감 전까지 변경 가능' : '마감되어 더 이상 바꿀 수 없어요.') + '</p>';
    html += myVotes.length ? myVotes.map(function(k){ return '<div class="item"><div class="ie">' + esc(parts[k] && parts[k].avatar ? parts[k].avatar.emoji : '🙂') + '</div><div class="im"><div class="in">' + esc(nickOf(k)) + '</div></div>' +
      (phaseOpen('first') ? '<button class="btn sm ghost" data-unvote="' + k + '">취소</button>' : '') + '</div>'; }).join('') : '<p class="muted">선택한 상대가 없어요.</p>';
  }
  html += '</div><div class="card"><h3>💍 최종 선택</h3>';
  if(ph !== 'final' && ph !== 'closed') html += '<p class="muted">최종 선택은 기수 마지막에 열려요.</p>';
  else html += '<p class="muted">' + (phaseOpen('final') ? '진행 중 · 단 한 명 · 마감 전까지 변경 가능' : '마감되었어요.') + '</p>' +
    (myFinal ? '<div class="item"><div class="ie">' + esc(parts[myFinal] && parts[myFinal].avatar ? parts[myFinal].avatar.emoji : '🙂') + '</div><div class="im"><div class="in">' + esc(nickOf(myFinal)) + '</div></div></div>' : '<p class="muted">아직 최종 선택을 하지 않았어요.</p>');
  html += '</div><p class="muted center">선택 내용은 본인과 운영자만 볼 수 있어요.<br>서로 선택한 경우에만 결과 공개 후 알려드려요.</p>';
  el.innerHTML = html;
  el.querySelectorAll('[data-unvote]').forEach(function(b){ b.onclick = function(){ toggleVote(b.dataset.unvote); }; });
}

/* ───────── 아이템 ───────── */
function myCreatedIds(){ return Object.keys(items).filter(function(k){ return k.indexOf(user.uid + '_') === 0; }); }
function renderItems(){
  const el = $('t-items');
  const mine = Object.keys(items).filter(function(k){ return items[k].owner === user.uid; });
  const made = myCreatedIds().length;
  let html = '<h2 class="serif" style="color:var(--wine);margin:6px 0 10px;">아이템 공방</h2>' +
    '<button class="btn" id="itNew"' + (made >= MAX_ITEMS ? ' disabled' : '') + '>✨ 새 아이템 만들기 (' + made + '/' + MAX_ITEMS + ')</button>' +
    '<div class="card"><h3>내 가방</h3>';
  if(!mine.length) html += '<p class="muted">아직 아이템이 없어요. 직접 만들어 마음에 드는 상대에게 선물해 보세요!</p>';
  mine.sort(function(a, b){ return ((items[b].gift && items[b].gift.at) || items[b].createdAt || 0) - ((items[a].gift && items[a].gift.at) || items[a].createdAt || 0); });
  mine.forEach(function(k){
    const it = items[k], got = it.gift && it.gift.from !== user.uid;
    html += '<div class="item"><div class="ie">' + esc(it.emoji) + '</div><div class="im"><div class="in">' + esc(it.name) + ' <span class="pill navy">' + esc(S.ITEM_KIND[it.kind] || '') + '</span></div>' +
      '<div class="id">' + esc(it.desc || '') + '</div>' +
      (got ? '<div class="id" style="color:var(--wine);">🎁 ' + esc(it.gift.fromNick) + '님의 선물' + (it.gift.msg ? ' · "' + esc(it.gift.msg) + '"' : '') + '</div>' : '<div class="id">만든 사람: ' + esc(it.creatorNick || '') + '</div>') +
      '</div><div style="display:flex;flex-direction:column;gap:6px;"><button class="btn sm" data-give="' + k + '">선물</button><button class="btn sm ghost" data-drop="' + k + '">버리기</button></div></div>';
  });
  html += '</div>';
  const all = Object.keys(items).sort(function(a, b){ return (items[b].createdAt || 0) - (items[a].createdAt || 0); }).slice(0, 30);
  html += '<div class="card"><h3>아이템 도감</h3><p class="muted">이번 기수 참가자들이 만든 아이템이에요. 선물 기록은 참가자에게 보일 수 있어요.</p>' +
    (all.length ? all.map(function(k){ const it = items[k]; return '<div class="item"><div class="ie">' + esc(it.emoji) + '</div><div class="im"><div class="in">' + esc(it.name) + '</div><div class="id">' + esc(S.ITEM_KIND[it.kind] || '') + ' · ' + esc(it.creatorNick || '') + ' 제작</div></div></div>'; }).join('') : '<p class="muted">아직 만들어진 아이템이 없어요.</p>') + '</div>';
  el.innerHTML = html;
  $('itNew').onclick = newItemModal;
  el.querySelectorAll('[data-give]').forEach(function(b){ b.onclick = function(){ giftModal(b.dataset.give, null); }; });
  el.querySelectorAll('[data-drop]').forEach(function(b){ b.onclick = function(){
    if(!confirm('이 아이템을 버릴까요? 되돌릴 수 없어요.')) return;
    db.ref('solo/items/' + sid + '/' + b.dataset.drop).remove().then(function(){ S.toast('아이템을 버렸어요'); }, function(e){ S.toast(err(e), 'bad'); });
  }; });
}
function newItemModal(){
  const used = myCreatedIds();
  let slot = -1; for(let i = 0; i < MAX_ITEMS; i++){ if(used.indexOf(user.uid + '_' + i) < 0){ slot = i; break; } }
  if(slot < 0){ S.toast('아이템은 1인당 ' + MAX_ITEMS + '개까지 만들 수 있어요'); return; }
  const f = {emoji: ITEM_EMOJI[0], kind: 'gift'};
  modal('<h3 class="serif" style="color:var(--wine);margin-top:0;">새 아이템 만들기</h3>' +
    '<label class="f">아이콘</label><div class="emoji-grid" id="niE">' + ITEM_EMOJI.map(function(e, i){ return '<button class="' + (i === 0 ? 'on' : '') + '" data-v="' + e + '">' + e + '</button>'; }).join('') + '</div>' +
    '<label class="f">종류</label><div class="seg" id="niK">' + Object.keys(S.ITEM_KIND).map(function(k){ return '<button class="chip' + (k === 'gift' ? ' on' : '') + '" data-v="' + k + '">' + S.ITEM_KIND[k] + '</button>'; }).join('') + '</div>' +
    '<label class="f">이름 <span class="muted">(20자)</span></label><input class="t" id="niN" maxlength="20" placeholder="예) 퇴근길 붕어빵 쿠폰">' +
    '<label class="f">설명 <span class="muted">(80자, 선택)</span></label><input class="t" id="niD" maxlength="80" placeholder="예) 함께 먹으면 두 배로 맛있어요">' +
    '<div style="height:14px"></div><button class="btn" id="niOk">만들기</button><button class="btn ghost" id="niX">취소</button>');
  $('niE').querySelectorAll('button').forEach(function(b){ b.onclick = function(){ f.emoji = b.dataset.v; $('niE').querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x === b); }); }; });
  $('niK').querySelectorAll('.chip').forEach(function(b){ b.onclick = function(){ f.kind = b.dataset.v; $('niK').querySelectorAll('.chip').forEach(function(x){ x.classList.toggle('on', x === b); }); }; });
  $('niX').onclick = closeModal;
  $('niOk').onclick = function(){
    const name = $('niN').value.trim(), desc = $('niD').value.trim();
    if(!name){ S.toast('아이템 이름을 적어 주세요'); return; }
    $('niOk').disabled = true;
    db.ref('solo/items/' + sid + '/' + user.uid + '_' + slot).set({creator: user.uid, creatorNick: me.nick, owner: user.uid, name: name, emoji: f.emoji, kind: f.kind, desc: desc, createdAt: S.TS})
      .then(function(){ closeModal(); S.toast(f.emoji + ' ' + name + ' 완성!', 'ok'); }, function(e){ $('niOk').disabled = false; S.toast('만들지 못했어요: ' + err(e), 'bad'); });
  };
}
function giftModal(itemId, targetId){
  const mine = Object.keys(items).filter(function(k){ return items[k].owner === user.uid; });
  if(!mine.length){ S.toast('선물할 아이템이 없어요. 아이템 탭에서 먼저 만들어 주세요.'); setTab('items'); return; }
  const others = approvedOthers();
  if(!others.length){ S.toast('선물할 참가자가 없어요'); return; }
  modal('<h3 class="serif" style="color:var(--wine);margin-top:0;">🎁 선물하기</h3>' +
    '<label class="f">아이템</label><select class="t" id="gI">' + mine.map(function(k){ return '<option value="' + k + '"' + (k === itemId ? ' selected' : '') + '>' + esc(items[k].emoji + ' ' + items[k].name) + '</option>'; }).join('') + '</select>' +
    '<label class="f">받는 사람</label><select class="t" id="gT">' + others.map(function(k){ return '<option value="' + k + '"' + (k === targetId ? ' selected' : '') + '>' + esc(parts[k].avatar.emoji + ' ' + parts[k].nick) + '</option>'; }).join('') + '</select>' +
    '<label class="f">메시지 <span class="muted">(80자, 선택)</span></label><input class="t" id="gM" maxlength="80" placeholder="예) 오늘 대화 즐거웠어요!">' +
    '<p class="hint">선물한 아이템은 상대의 가방으로 옮겨져요. 연락처는 적지 마세요.</p>' +
    '<button class="btn" id="gOk">선물 보내기</button><button class="btn ghost" id="gX">취소</button>');
  $('gX').onclick = closeModal;
  $('gOk').onclick = function(){
    const id = $('gI').value, to = $('gT').value, it = items[id];
    if(!it) return;
    const v = Object.assign({}, it, {owner: to, gift: {from: user.uid, fromNick: me.nick, msg: $('gM').value.trim(), at: S.TS}});
    $('gOk').disabled = true;
    db.ref('solo/items/' + sid + '/' + id).set(v).then(function(){ closeModal(); S.toast(nickOf(to) + '님에게 ' + it.emoji + ' 선물을 보냈어요!', 'ok'); },
      function(e){ $('gOk').disabled = false; S.toast('보내지 못했어요: ' + err(e), 'bad'); });
  };
}

/* ───────── 소식 · 결과 ───────── */
function latestNotice(){ const ks = Object.keys(notices).sort(function(a, b){ return notices[b].at - notices[a].at; }); return ks.length ? notices[ks[0]] : null; }
function seenKey(){ return 'solo_seen_' + sid; }
function hasUnseen(){
  if(!season) return false;
  let seen = ''; try{ seen = localStorage.getItem(seenKey()) || ''; }catch(e){}
  const cur = (season.firstRevealed ? 'F' : '') + (season.resultsPublished ? 'R' : '') + Object.keys(notices).length;
  return cur !== seen && (season.firstRevealed || season.resultsPublished || Object.keys(notices).length > 0);
}
function markSeen(){ if(!season) return; try{ localStorage.setItem(seenKey(), (season.firstRevealed ? 'F' : '') + (season.resultsPublished ? 'R' : '') + Object.keys(notices).length); }catch(e){} }

function renderNews(){
  const el = $('t-news');
  let html = '<h2 class="serif" style="color:var(--wine);margin:6px 0 10px;">소식 · 결과</h2>';
  if(season && season.resultsPublished){
    html += '<div class="card"><h3>💍 최종 결과</h3>';
    if(!resFinal) html += '<p class="muted">결과를 불러오는 중…</p>';
    else if(resFinal.partner){
      const pp = parts[resFinal.partner] || {nick: resFinal.partnerNick, avatar: {}};
      html += '<div class="result-big">🎉 커플 성사!</div><div class="couple">' + avatarHtml(me) + '<span>' + esc(me.nick) + '</span><span>💞</span><span>' + esc(pp.nick || resFinal.partnerNick) + '</span>' + avatarHtml(pp) + '</div>' +
        '<p class="muted center">서로를 최종 선택했어요. 연락처는 공개되지 않으니, 운영자 안내에 따라 동의한 경우에만 교환해 주세요.</p>';
    }else html += '<div class="result-big">🌙 솔로</div><p class="muted center">이번 기수에서는 서로의 최종 선택이 엇갈렸어요.<br>새로운 인연은 다음 기수에서!</p>';
    const cs = couples ? Object.keys(couples) : [];
    html += '<h3 style="margin-top:18px;">이번 기수 커플 (' + cs.length + '쌍)</h3>' + (cs.length ? cs.map(function(k){ const c = couples[k]; return '<div class="couple">' + esc(c.aEmoji || '') + ' ' + esc(c.a) + ' 💞 ' + esc(c.b) + ' ' + esc(c.bEmoji || '') + '</div>'; }).join('') : '<p class="muted">이번 기수에는 성사된 커플이 없어요.</p>');
    html += '<p class="muted center">' + esc(season.name) + ' 기수가 종료되었어요. 함께해 주셔서 감사합니다.</p></div>';
  }
  if(season && season.firstRevealed){
    html += '<div class="card"><h3>💗 첫인상 호감 알림</h3>';
    if(!resFirst) html += '<p class="muted">결과를 불러오는 중…</p>';
    else{
      const mu = resFirst.mutual ? Object.keys(resFirst.mutual) : [];
      html += mu.length ? mu.map(function(k){ return '<div class="couple">💞 ' + esc(resFirst.mutual[k]) + '님과 서로 호감!</div>'; }).join('') : '<p class="muted">이번 첫인상 선택에서 서로 선택한 상대는 없었어요.</p>';
      html += '<p class="muted">나를 선택한 사람 수: <b>' + (resFirst.received || 0) + '명</b> (누가 선택했는지는 공개되지 않아요)</p>';
    }
    html += '</div>';
  }
  const ks = Object.keys(notices).sort(function(a, b){ return notices[b].at - notices[a].at; });
  html += '<div class="card"><h3>📣 공지사항</h3>' + (ks.length ? ks.map(function(k){ return '<div class="item"><div class="im"><div class="in" style="font-weight:500;white-space:pre-wrap;">' + esc(notices[k].text) + '</div><div class="id">' + new Date(notices[k].at).toLocaleString('ko-KR') + '</div></div></div>'; }).join('') : '<p class="muted">공지사항이 없어요.</p>') + '</div>';
  if(!(season && (season.firstRevealed || season.resultsPublished))) html += '<p class="muted center">결과는 운영자가 공개하면 여기에 표시돼요.</p>';
  el.innerHTML = html;
}

boot();
})();
