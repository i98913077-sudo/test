/* 사이버 나는 SOLO — 공통 모듈 (Firebase 연결, 익명 로그인, 공용 헬퍼)
   기존 '1-9반 안전 특공대'와 같은 Firebase 프로젝트·Realtime Database를 그대로 재사용한다.
   게임 데이터는 모두 DB의 /solo 아래에만 저장해 기존 /rooms, /leaderboard 와 섞이지 않는다. */
(function(){
"use strict";

// 기존 홈페이지(safety-squad.html)에 들어 있던 설정과 동일 — 새 프로젝트를 만들지 않는다.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCQgIMPsnAGL046rAy_nK9Mh37WPnqi2k8",
  authDomain: "kimkyeongtae-85921.firebaseapp.com",
  databaseURL: "https://kimkyeongtae-85921-default-rtdb.firebaseio.com",
  projectId: "kimkyeongtae-85921",
  storageBucket: "kimkyeongtae-85921.firebasestorage.app",
  messagingSenderId: "608235504523",
  appId: "1:608235504523:web:688cffd9b9747f9d01258e"
};

// 로컬 테스트용: localhost 에서 ?emu=1 로 열면 Firebase 에뮬레이터에 연결한다 (배포 주소에서는 절대 켜지지 않음).
const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
let useEmu = false;
if(isLocal){
  try{
    const q = new URLSearchParams(location.search).get('emu');
    if(q === '1') sessionStorage.setItem('solo_emu', '1');
    if(q === '0') sessionStorage.removeItem('solo_emu');
    useEmu = sessionStorage.getItem('solo_emu') === '1';
  }catch(e){ useEmu = new URLSearchParams(location.search).get('emu') === '1'; }
}

let db = null, auth = null, initError = null, tOff = 0;
try{
  const cfg = Object.assign({}, FIREBASE_CONFIG);
  if(useEmu) cfg.databaseURL = 'http://127.0.0.1:9000/?ns=' + cfg.projectId + '-default-rtdb';
  firebase.initializeApp(cfg);
  auth = firebase.auth();
  db = firebase.database();
  if(useEmu){
    auth.useEmulator('http://127.0.0.1:9099', {disableWarnings:true});
    db.useEmulator('127.0.0.1', 9000);
  }
  db.ref('.info/serverTimeOffset').on('value', function(s){ tOff = s.val() || 0; });
}catch(e){ initError = e; }

const AUTH_SETUP_HELP = 'Firebase 콘솔 → Authentication → 시작하기 → Sign-in method 에서 "익명(Anonymous)" 로그인을 사용 설정해 주세요.';

function authErrorMessage(e){
  const code = (e && e.code) || '';
  if(/configuration-not-found|operation-not-allowed|admin-restricted-operation/.test(code) || /CONFIGURATION_NOT_FOUND/.test(String(e && e.message))){
    return '이 Firebase 프로젝트에서 익명 로그인이 아직 꺼져 있어요. ' + AUTH_SETUP_HELP;
  }
  if(/network-request-failed/.test(code)) return '인터넷 연결을 확인해 주세요.';
  return '로그인에 실패했어요 (' + (code || (e && e.message) || '알 수 없는 오류') + ')';
}

// 익명 로그인: 같은 브라우저에서는 같은 사용자 ID가 유지된다.
let readyPromise = null;
function ready(){
  if(readyPromise) return readyPromise;
  readyPromise = new Promise(function(resolve, reject){
    if(initError){ reject(new Error('Firebase를 불러오지 못했어요.')); return; }
    const off = auth.onAuthStateChanged(function(user){
      if(user){ off(); resolve(user); return; }
      auth.signInAnonymously().catch(function(e){ off(); readyPromise = null; reject(new Error(authErrorMessage(e))); });
    });
  });
  return readyPromise;
}

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function now(){ return Date.now() + tOff; }
function nickKey(n){ return String(n || '').trim().toLowerCase(); }
const BAD_NICK = /[.#$\[\]\/]/;

function toast(msg, kind){
  let t = $('toast');
  if(!t){ t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(toast._t); toast._t = setTimeout(function(){ t.className = 'toast'; }, 2600);
}

function fmtLeft(ms){
  if(ms <= 0) return '마감';
  const s = Math.floor(ms/1000), d = Math.floor(s/86400), h = Math.floor(s%86400/3600), m = Math.floor(s%3600/60), ss = s%60;
  if(d) return d + '일 ' + h + '시간 남음';
  if(h) return h + '시간 ' + m + '분 남음';
  return m + '분 ' + String(ss).padStart(2,'0') + '초 남음';
}

const PHASES = {
  lobby: '솔로 나라 입장 · 탐색 중',
  first: '첫인상 선택 진행 중',
  break: '첫인상 선택 마감',
  final: '최종 선택 진행 중',
  closed: '최종 선택 마감'
};
const STATUS = { recruiting:'참가자 모집 중', running:'기수 진행 중', ended:'기수 종료' };
const GENDER = { M:'남', F:'여', A:'상관없음' };
const ITEM_KIND = { gift:'선물', letter:'편지', date:'데이트권', etc:'기타' };

// 게임 입장 주소: 관리자가 저장한 실제 배포 주소(config.entryUrl)가 있으면 그것, 없으면 현재 접속 주소 기준 /solo/
function computedEntryUrl(){
  const p = location.pathname;
  const i = p.indexOf('/solo/');
  const base = i >= 0 ? p.slice(0, i + 6) : p.replace(/[^\/]*$/, '') + 'solo/';
  return location.origin + base;
}
function isPublicUrl(u){
  try{
    const x = new URL(u);
    if(x.protocol !== 'https:') return false;
    return !/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.hostname) && x.hostname.indexOf('.') > 0;
  }catch(e){ return false; }
}

// 시즌 정보: config/currentSeason → seasons/{id}
function watchSeason(cb){
  let sRef = null, sCb = null;
  db.ref('solo/config/currentSeason').on('value', function(s){
    if(sRef) sRef.off('value', sCb);
    const sid = s.val();
    if(!sid){ cb(null, null); return; }
    sRef = db.ref('solo/seasons/' + sid);
    sCb = sRef.on('value', function(ss){ cb(sid, ss.val()); });
  }, function(){ cb(null, null); });
}

// QR 포스터(이미지)를 캔버스로 그린다 — 다운로드·인쇄용
function drawPoster(qrCanvas, url, seasonName){
  const W = 1080, H = 1500, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#FBF7EF'; g.fillRect(0,0,W,H);
  const grd = g.createRadialGradient(W/2, 0, 50, W/2, 0, 900);
  grd.addColorStop(0, 'rgba(122,30,58,.20)'); grd.addColorStop(1, 'rgba(122,30,58,0)');
  g.fillStyle = grd; g.fillRect(0,0,W,H);
  g.strokeStyle = '#7A1E3A'; g.lineWidth = 6; g.strokeRect(40,40,W-80,H-80);
  g.textAlign = 'center';
  const text = function(t, y){ g.fillText(t, W/2, y, W - 160); };
  g.fillStyle = '#1F2A44'; g.font = '500 40px "Noto Sans KR", sans-serif';
  text('CYBER  ·  I AM SOLO', 150);
  g.fillStyle = '#7A1E3A'; g.font = '700 100px "Gowun Batang", "Noto Serif KR", serif';
  text('사이버 나는 SOLO', 270);
  g.fillStyle = '#1F2A44'; g.font = '500 46px "Noto Sans KR", sans-serif';
  text('초등교사 편' + (seasonName ? '  ·  ' + seasonName : ''), 340);
  const qs = 640, qx = (W-qs)/2, qy = 400;
  g.fillStyle = '#fff'; g.fillRect(qx-30, qy-30, qs+60, qs+60);
  g.imageSmoothingEnabled = false;
  g.drawImage(qrCanvas, qx, qy, qs, qs);
  g.fillStyle = '#1F2A44'; g.font = '700 40px "Noto Sans KR", sans-serif';
  text('QR코드를 스캔하고 사이버 솔로 나라에 입장하세요.', 1170);
  g.fillStyle = '#555'; g.font = '400 38px "Noto Sans KR", sans-serif';
  text('닉네임을 만들고 당신의 인연을 찾아보세요.', 1235);
  g.fillStyle = '#7A1E3A'; g.font = '500 30px "Noto Sans KR", monospace';
  text(url.length > 60 ? url.slice(0,57) + '…' : url, 1330);
  g.fillStyle = '#999'; g.font = '400 26px "Noto Sans KR", sans-serif';
  text('“교실 밖에서 시작되는 새로운 인연.”', 1400);
  return c;
}

function makeQR(el, url, size){
  el.innerHTML = '';
  new QRCode(el, {text: url, width: size || 240, height: size || 240, colorDark:'#1F2A44', colorLight:'#ffffff', correctLevel: QRCode.CorrectLevel.M});
  return el.querySelector('canvas');
}

window.SOLO = {
  db: db, auth: auth, ready: ready, $: $, esc: esc, now: now, nickKey: nickKey, BAD_NICK: BAD_NICK,
  toast: toast, fmtLeft: fmtLeft, PHASES: PHASES, STATUS: STATUS, GENDER: GENDER, ITEM_KIND: ITEM_KIND,
  computedEntryUrl: computedEntryUrl, isPublicUrl: isPublicUrl, watchSeason: watchSeason,
  drawPoster: drawPoster, makeQR: makeQR, useEmu: useEmu, initError: initError,
  TS: firebase.database && firebase.database.ServerValue ? firebase.database.ServerValue.TIMESTAMP : null,
  AUTH_SETUP_HELP: AUTH_SETUP_HELP, authErrorMessage: authErrorMessage
};
})();
