/* 사이버 나는 SOLO — 운영자 화면
   화면에서 버튼을 숨기는 것과 별개로, 모든 쓰기는 database.rules.json 의 관리자 규칙
   (solo/admins/{uid} === true, 콘솔에서만 추가 가능)으로 서버에서 다시 검사된다. */
(function(){
"use strict";
const S = window.SOLO, $ = S.$, esc = S.esc, db = S.db;

let user = null, seasons = {}, curSid = null, parts = {}, votes = {}, finals = {}, notices = {}, reports = {}, entryUrl = null;
let seasonListeners = [];

function err(e){ const m = String((e && e.message) || e); return /permission|PERMISSION/.test(m) ? '권한이 없어요 (관리자 규칙에서 거부됨)' : m; }
function hint(msg, kind){ $('cHint').textContent = msg; $('cHint').className = 'hint ' + (kind || ''); }
function toLocalInput(ts){ if(!ts) return ''; const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); }
function fromLocalInput(v){ return v ? new Date(v).getTime() : 0; }
function season(){ return curSid ? seasons[curSid] : null; }
function nick(uid){ return parts[uid] ? parts[uid].nick : '(삭제됨)'; }

/* ───────── 로그인 · 권한 ───────── */
function boot(){
  if(S.initError){ $('aAuthMsg').textContent = 'Firebase를 불러오지 못했어요.'; return; }
  S.auth.onAuthStateChanged(function(u){
    if(!u){
      S.ready().catch(function(e){ $('aAuthMsg').textContent = e.message; renderAuthButtons(); });
      return;
    }
    user = u;
    db.ref('solo/admins/' + u.uid).once('value').then(function(s){ return s.val() === true; }, function(){ return false; }).then(function(isAdmin){
      renderAuth(isAdmin);
      if(isAdmin) startAdmin();
    });
  });
}
function renderAuthButtons(){
  $('aAuthBody').innerHTML = '<div class="row"><button class="btn sm navy" id="gLogin">Google 계정으로 로그인</button></div>';
  $('gLogin').onclick = googleLogin;
}
function googleLogin(){
  S.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(function(e){
    S.toast(/operation-not-allowed|configuration-not-found/.test(e.code || '') ? 'Firebase 콘솔에서 Google 로그인을 사용 설정해 주세요.' : 'Google 로그인 실패: ' + (e.code || e.message), 'bad');
  });
}
function renderAuth(isAdmin){
  const who = user.isAnonymous ? '익명 로그인(이 브라우저 전용)' : (user.email || 'Google 계정');
  if(isAdmin){
    $('aAuthMsg').innerHTML = '✅ 운영자로 확인되었어요 · ' + esc(who);
    $('aAuthBody').innerHTML = '<button class="btn sm ghost" id="aOut">로그아웃</button>';
    $('aOut').onclick = function(){ S.auth.signOut().then(function(){ location.reload(); }); };
    $('aMain').classList.remove('hidden');
    return;
  }
  $('aAuthMsg').innerHTML = '이 계정은 아직 운영자가 아니에요. (' + esc(who) + ')';
  $('aAuthBody').innerHTML =
    '<p>운영자 권한은 앱에서 스스로 부여할 수 없고, <b>Firebase 콘솔</b>에서만 추가할 수 있어요.</p>' +
    '<ol class="guide"><li>(권장) 아래 버튼으로 Google 계정에 로그인해 UID를 고정하세요. 익명 로그인 UID는 브라우저 기록을 지우면 바뀌어요.</li>' +
    '<li>Firebase 콘솔 → Realtime Database → 데이터에서 <code>solo/admins</code> 아래에 키 <b>UID</b>, 값 <code>true</code> 를 추가하세요.</li>' +
    '<li>이 페이지를 새로고침하세요.</li></ol>' +
    '<label class="f">내 UID</label><div class="row"><input class="t" readonly id="aUid" value="' + esc(user.uid) + '"><button class="btn sm navy" id="aCopy" style="flex:0 0 auto;">복사</button></div>' +
    '<div class="row" style="margin-top:12px;">' + (user.isAnonymous ? '<button class="btn sm" id="gLogin">Google 계정으로 로그인</button>' : '<button class="btn sm ghost" id="aOut">로그아웃</button>') + '</div>';
  $('aCopy').onclick = function(){ $('aUid').select(); (navigator.clipboard ? navigator.clipboard.writeText(user.uid) : Promise.reject()).then(function(){ S.toast('UID를 복사했어요', 'ok'); }, function(){ document.execCommand('copy'); }); };
  if($('gLogin')) $('gLogin').onclick = googleLogin;
  if($('aOut')) $('aOut').onclick = function(){ S.auth.signOut().then(function(){ location.reload(); }); };
}

/* ───────── 운영 ───────── */
function startAdmin(){
  db.ref('solo/seasons').on('value', function(s){ seasons = s.val() || {}; renderSeasons(); renderCtl(); });
  db.ref('solo/config').on('value', function(s){
    const c = s.val() || {};
    entryUrl = c.entryUrl || null;
    if(c.currentSeason !== curSid){ curSid = c.currentSeason || null; attachSeason(); }
    renderSeasons(); renderCtl(); renderQR();
  });
  $('nsCreate').onclick = createSeason;
  $('seasonSet').onclick = function(){
    const v = $('seasonSel').value; if(!v) return;
    db.ref('solo/config/currentSeason').set(v).then(function(){ S.toast('현재 기수를 바꿨어요', 'ok'); }, function(e){ S.toast(err(e), 'bad'); });
  };
  $('cStatus').querySelectorAll('.chip').forEach(function(c){ c.onclick = function(){ updSeason({status: c.dataset.v}, '모집 상태를 바꿨어요'); }; });
  $('cApprove').onchange = function(){ updSeason({requireApproval: this.checked}, '승인 설정을 바꿨어요'); };
  $('cSaveTimes').onclick = function(){
    updSeason({picks: Number($('cPicks').value), firstEndsAt: fromLocalInput($('cFirstEnd').value), finalEndsAt: fromLocalInput($('cFinalEnd').value)}, '설정을 저장했어요');
  };
  document.querySelectorAll('[data-phase]').forEach(function(b){ b.onclick = function(){ setPhase(b.dataset.phase); }; });
  $('cRevealFirst').onclick = revealFirst;
  $('cPublish').onclick = publishFinal;
  $('nAdd').onclick = function(){
    const t = $('nText').value.trim(); if(!t || !curSid) return;
    db.ref('solo/announcements/' + curSid).push({text: t, at: S.TS}).then(function(){ $('nText').value = ''; S.toast('공지를 등록했어요', 'ok'); }, function(e){ S.toast(err(e), 'bad'); });
  };
  $('qCurrent').onclick = function(){ $('qUrl').value = S.computedEntryUrl(); checkUrl(); };
  $('qUrl').oninput = checkUrl;
  $('qSave').onclick = saveUrl;
  $('qDown').onclick = downloadQR;
  $('qPrint').onclick = printQR;
}

function attachSeason(){
  seasonListeners.forEach(function(f){ f(); }); seasonListeners = [];
  parts = votes = finals = notices = reports = {};
  renderParts(); renderNotices(); renderReports();
  if(!curSid) return;
  function on(path, cb){ const r = db.ref(path); const f = r.on('value', function(s){ cb(s.val() || {}); }, function(e){ S.toast(path + ': ' + err(e), 'bad'); }); seasonListeners.push(function(){ r.off('value', f); }); }
  on('solo/participants/' + curSid, function(v){ parts = v; renderParts(); renderReports(); renderCtl(); });
  on('solo/votes/' + curSid, function(v){ votes = v; renderParts(); });
  on('solo/finalChoices/' + curSid, function(v){ finals = v; renderParts(); });
  on('solo/announcements/' + curSid, function(v){ notices = v; renderNotices(); });
  on('solo/reports/' + curSid, function(v){ reports = v; renderReports(); });
}

function renderSeasons(){
  const ks = Object.keys(seasons).sort(function(a, b){ return (seasons[b].createdAt || 0) - (seasons[a].createdAt || 0); });
  $('seasonSel').innerHTML = ks.length ? ks.map(function(k){ return '<option value="' + k + '"' + (k === curSid ? ' selected' : '') + '>' + esc(seasons[k].name) + (k === curSid ? ' (현재)' : '') + ' · ' + S.STATUS[seasons[k].status] + '</option>'; }).join('') : '<option value="">기수가 없어요 — 새로 만들어 주세요</option>';
}
function createSeason(){
  const name = $('nsName').value.trim();
  if(!name){ S.toast('기수 이름을 적어 주세요'); return; }
  const ref = db.ref('solo/seasons').push(), had = curSid;
  ref.set({name: name, status: 'recruiting', phase: 'lobby', picks: Number($('nsPicks').value), requireApproval: $('nsApprove').checked,
    firstEndsAt: 0, finalEndsAt: 0, firstRevealed: false, resultsPublished: false, createdAt: S.TS})
    .then(function(){ return had ? null : db.ref('solo/config/currentSeason').set(ref.key); })
    .then(function(){ $('nsName').value = ''; S.toast('기수를 만들었어요' + (had ? ' — "현재 기수로 지정"을 눌러 전환하세요' : ''), 'ok'); }, function(e){ S.toast(err(e), 'bad'); });
}
function updSeason(v, msg){
  if(!curSid) return Promise.resolve();
  return db.ref('solo/seasons/' + curSid).update(v).then(function(){ if(msg) S.toast(msg, 'ok'); }, function(e){ S.toast(err(e), 'bad'); throw e; });
}
function renderCtl(){
  const se = season();
  $('ctl').style.opacity = se ? 1 : .5;
  if(!se){ $('cPhase').textContent = '기수 없음'; $('cInfo').textContent = '먼저 기수를 만들어 주세요.'; return; }
  $('cPhase').textContent = S.PHASES[se.phase];
  const n = Object.keys(parts).length, ap = Object.keys(parts).filter(function(k){ return parts[k].status === 'approved'; }).length;
  $('cInfo').textContent = se.name + ' · ' + S.STATUS[se.status] + ' · 참가자 ' + ap + '명 승인 / 전체 ' + n + '명' +
    (se.firstRevealed ? ' · 첫인상 결과 공개됨' : '') + (se.resultsPublished ? ' · 최종 결과 공개됨' : '');
  $('cStatus').querySelectorAll('.chip').forEach(function(c){ c.classList.toggle('on', c.dataset.v === se.status); });
  $('cApprove').checked = !!se.requireApproval;
  if(document.activeElement !== $('cPicks')) $('cPicks').value = String(se.picks);
  if(document.activeElement !== $('cFirstEnd')) $('cFirstEnd').value = toLocalInput(se.firstEndsAt);
  if(document.activeElement !== $('cFinalEnd')) $('cFinalEnd').value = toLocalInput(se.finalEndsAt);
  document.querySelectorAll('[data-phase]').forEach(function(b){ b.classList.toggle('ghost', b.dataset.phase !== se.phase); });
}
function setPhase(ph){
  const se = season(); if(!se) return;
  const dl = ph === 'first' ? se.firstEndsAt : ph === 'final' ? se.finalEndsAt : 0;
  if(dl && dl < S.now() && !confirm('설정된 마감 시각이 이미 지났어요. 이대로 시작하면 바로 마감 상태가 돼요. 계속할까요?')) return;
  const up = {phase: ph};
  if(ph === 'first' || ph === 'final') up.status = 'running';
  updSeason(up, '진행 단계: ' + S.PHASES[ph]);
}

// 첫인상 결과: Firebase에 저장된 실제 선택 기록(votes)으로 상호 선택만 계산한다.
function revealFirst(){
  const se = season(); if(!se) return;
  if(se.phase === 'lobby' || (se.phase === 'first' && (!se.firstEndsAt || S.now() < se.firstEndsAt))){ hint('먼저 "첫인상 마감"으로 선택을 닫아 주세요. (마감 후에는 규칙상 선택을 바꿀 수 없어 결과가 고정돼요)', 'bad'); return; }
  db.ref('solo/votes/' + curSid).once('value').then(function(s){
    const all = s.val() || {}, pick = {};
    Object.keys(all).forEach(function(u){ pick[u] = ['0','1','2'].map(function(k){ return all[u][k]; }).filter(Boolean); });
    const res = {};
    Object.keys(parts).forEach(function(u){ res[u] = {received: 0}; });
    Object.keys(pick).forEach(function(u){
      pick[u].forEach(function(t){
        if(!res[t]) res[t] = {received: 0};
        res[t].received++;
        if(pick[t] && pick[t].indexOf(u) >= 0){
          if(!res[u]) res[u] = {received: 0};
          res[u].mutual = res[u].mutual || {}; res[u].mutual[t] = nick(t);
        }
      });
    });
    const pairs = Object.keys(res).reduce(function(n, u){ return n + (res[u].mutual ? Object.keys(res[u].mutual).length : 0); }, 0) / 2;
    if(!confirm('첫인상 결과를 공개할까요?\n상호 호감 ' + pairs + '쌍 · 참가자 각자 자신의 결과만 볼 수 있어요.')) return;
    const up = {};
    up['results/' + curSid + '/first'] = res;
    up['seasons/' + curSid + '/firstRevealed'] = true;
    return db.ref('solo').update(up).then(function(){ hint('첫인상 결과를 공개했어요 (상호 호감 ' + pairs + '쌍).', 'ok'); });
  }).catch(function(e){ hint(err(e), 'bad'); });
}

// 최종 결과: finalChoices 에서 A→B, B→A 인 경우만 커플. 마감(closed) 이후에만 계산해 결과가 바뀌지 않게 한다.
function publishFinal(){
  const se = season(); if(!se) return;
  if(se.phase !== 'closed'){ hint('먼저 "최종 선택 마감"을 눌러 주세요.', 'bad'); return; }
  db.ref('solo/finalChoices/' + curSid).once('value').then(function(s){
    const fc = s.val() || {}, res = {}, couples = {};
    Object.keys(parts).forEach(function(u){ res[u] = {partner: false}; });
    Object.keys(fc).forEach(function(a){
      const b = fc[a].target;
      if(fc[b] && fc[b].target === a && parts[a] && parts[b] && parts[a].status === 'approved' && parts[b].status === 'approved'){
        res[a] = {partner: b, partnerNick: nick(b)};
        const key = a < b ? a + '__' + b : b + '__' + a;
        const x = a < b ? a : b, y = a < b ? b : a;
        couples[key] = {a: nick(x), b: nick(y), aEmoji: parts[x].avatar.emoji, bEmoji: parts[y].avatar.emoji};
      }
    });
    const n = Object.keys(couples).length;
    if(!confirm('최종 결과를 공개하고 기수를 종료할까요?\n커플 ' + n + '쌍')) return;
    const up = {};
    up['results/' + curSid + '/final'] = res;
    up['results/' + curSid + '/couples'] = n ? couples : null;
    up['seasons/' + curSid + '/resultsPublished'] = true;
    up['seasons/' + curSid + '/status'] = 'ended';
    return db.ref('solo').update(up).then(function(){ hint('최종 결과를 공개했어요 (커플 ' + n + '쌍).', 'ok'); });
  }).catch(function(e){ hint(err(e), 'bad'); });
}

function renderParts(){
  const ks = Object.keys(parts).sort(function(a, b){ return (parts[a].createdAt || 0) - (parts[b].createdAt || 0); });
  $('pCount').textContent = '(' + ks.length + '명)';
  const recv = {};
  Object.keys(votes).forEach(function(u){ ['0','1','2'].forEach(function(k){ const t = votes[u][k]; if(t) recv[t] = (recv[t] || 0) + 1; }); });
  const ST = {approved: ['승인', 'ok'], pending: ['대기', 'warn'], hidden: ['숨김', 'navy'], blocked: ['차단', 'bad']};
  $('pBody').innerHTML = ks.length ? ks.map(function(k){
    const p = parts[k], st = ST[p.status] || [p.status, ''];
    const sent = votes[k] ? ['0','1','2'].filter(function(x){ return votes[k][x]; }).length : 0;
    const acts = [];
    if(p.status !== 'approved') acts.push('<button class="btn sm" data-act="approved" data-u="' + k + '">' + (p.status === 'pending' ? '승인' : '복구') + '</button>');
    if(p.status === 'approved') acts.push('<button class="btn sm ghost" data-act="hidden" data-u="' + k + '">숨김</button>');
    if(p.status !== 'blocked') acts.push('<button class="btn sm ghost" data-act="blocked" data-u="' + k + '" style="color:var(--bad);">차단</button>');
    return '<tr><td>' + esc(p.avatar ? p.avatar.emoji : '') + '</td><td><b>' + esc(p.nick) + '</b><div class="muted" style="font-size:12px;max-width:260px;">' + esc((p.intro || '').slice(0, 60)) + '</div></td>' +
      '<td>' + esc(S.GENDER[p.gender] || '') + ' · ' + esc(p.age) + '</td><td><span class="pill ' + st[1] + '">' + st[0] + '</span></td>' +
      '<td>보냄 ' + sent + ' · 받음 ' + (recv[k] || 0) + '</td><td>' + (finals[k] ? '→ ' + esc(nick(finals[k].target)) : '-') + '</td>' +
      '<td><div class="row" style="gap:6px;flex-wrap:nowrap;">' + acts.join('') + '</div></td></tr>';
  }).join('') : '<tr><td colspan="7" class="empty">아직 참가자가 없어요. 아래 QR코드를 공유해 보세요.</td></tr>';
  $('pBody').querySelectorAll('[data-act]').forEach(function(b){ b.onclick = function(){ setStatus(b.dataset.u, b.dataset.act); }; });
}
function setStatus(uid, st){
  if(st === 'blocked' && !confirm(nick(uid) + '님을 차단할까요? 이 사용자는 더 이상 선택·선물·신고를 할 수 없어요.')) return;
  const up = {};
  up['participants/' + curSid + '/' + uid + '/status'] = st;
  up['blocked/' + uid] = st === 'blocked' ? true : null;
  db.ref('solo').update(up).then(function(){ S.toast(nick(uid) + ' → ' + st, 'ok'); }, function(e){ S.toast(err(e), 'bad'); });
}

function renderNotices(){
  const ks = Object.keys(notices).sort(function(a, b){ return notices[b].at - notices[a].at; });
  $('nList').innerHTML = ks.length ? ks.map(function(k){ return '<div class="item"><div class="im"><div style="white-space:pre-wrap;">' + esc(notices[k].text) + '</div><div class="id">' + new Date(notices[k].at).toLocaleString('ko-KR') + '</div></div><button class="btn sm ghost" data-nd="' + k + '">삭제</button></div>'; }).join('') : '<p class="muted">등록된 공지가 없어요.</p>';
  $('nList').querySelectorAll('[data-nd]').forEach(function(b){ b.onclick = function(){ db.ref('solo/announcements/' + curSid + '/' + b.dataset.nd).remove().catch(function(e){ S.toast(err(e), 'bad'); }); }; });
}
function renderReports(){
  const ks = Object.keys(reports).sort(function(a, b){ return reports[b].at - reports[a].at; });
  $('rList').innerHTML = ks.length ? ks.map(function(k){ const r = reports[k]; return '<div class="item"><div class="im"><div class="in">' + esc(nick(r.target)) + ' <span class="muted">← ' + esc(nick(r.from)) + '</span></div><div class="id">' + esc(r.reason) + ' · ' + new Date(r.at).toLocaleString('ko-KR') + '</div></div>' +
    '<div style="display:flex;flex-direction:column;gap:6px;"><button class="btn sm ghost" data-rb="' + esc(r.target) + '" style="color:var(--bad);">차단</button><button class="btn sm ghost" data-rd="' + k + '">처리 완료</button></div></div>'; }).join('') : '<p class="muted">신고 내역이 없어요.</p>';
  $('rList').querySelectorAll('[data-rd]').forEach(function(b){ b.onclick = function(){ db.ref('solo/reports/' + curSid + '/' + b.dataset.rd).remove().catch(function(e){ S.toast(err(e), 'bad'); }); }; });
  $('rList').querySelectorAll('[data-rb]').forEach(function(b){ b.onclick = function(){ setStatus(b.dataset.rb, 'blocked'); }; });
}

/* ───────── QR ───────── */
function currentQrUrl(){ return entryUrl || S.computedEntryUrl(); }
function checkUrl(){
  const v = $('qUrl').value.trim();
  if(!v){ $('qHint').textContent = ''; return false; }
  if(!S.isPublicUrl(v)){ $('qHint').textContent = 'https:// 로 시작하는 외부 공개 주소만 쓸 수 있어요. localhost·내부망 주소는 다른 사람 휴대폰에서 열리지 않아요.'; $('qHint').className = 'hint bad'; return false; }
  $('qHint').textContent = '저장하면 이 주소로 QR이 다시 만들어져요.'; $('qHint').className = 'hint ok'; return true;
}
function saveUrl(){
  if(!checkUrl()) return;
  let v = $('qUrl').value.trim();
  db.ref('solo/config/entryUrl').set(v).then(function(){ S.toast('입장 주소를 저장했어요', 'ok'); }, function(e){ S.toast(err(e), 'bad'); });
}
function renderQR(){
  const url = currentQrUrl();
  if(document.activeElement !== $('qUrl')) $('qUrl').value = entryUrl || '';
  $('qShown').textContent = url;
  S.makeQR($('qBox'), url, 240);
  if(!entryUrl){
    $('qHint').innerHTML = S.isPublicUrl(url)
      ? '아직 저장된 배포 주소가 없어 <b>현재 접속 주소</b>로 QR을 만들었어요. 맞다면 "현재 접속 주소 넣기 → 저장"을 눌러 고정하세요.'
      : '⚠️ 지금은 로컬/비공개 주소로 접속 중이라 이 QR은 다른 휴대폰에서 열리지 않아요. 실제 배포 주소를 입력해 저장하세요.';
    $('qHint').className = 'hint ' + (S.isPublicUrl(url) ? '' : 'bad');
  }
}
function poster(){
  const qc = $('qBox').querySelector('canvas');
  return S.drawPoster(qc, currentQrUrl(), season() ? season().name : '');
}
function downloadQR(){
  const c = poster(), a = document.createElement('a');
  a.download = 'cyber-solo-qr.png';
  a.href = c.toDataURL('image/png');
  document.body.appendChild(a); a.click(); a.remove();
}
function printQR(){
  $('printArea').innerHTML = '<img alt="QR 안내문" src="' + poster().toDataURL('image/png') + '">';
  setTimeout(function(){ window.print(); }, 200);
}

boot();
})();
