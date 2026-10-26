// 연결 진단: 같은 폴더의 api.php 로 여러 방식의 요청을 보내 결과를 표로 보여준다.
const b64 = (obj) => { const bytes = new TextEncoder().encode(JSON.stringify(obj)); let s = ''; for (const b of bytes) s += String.fromCharCode(b); return `b64:${btoa(s)}`; };
const url = (r) => new URL(`api.php?r=${r}`, document.baseURI).href;
const TESTS = [
  ['GET 버전 확인', 'version', 'GET', null, 'json'],
  ['POST 시험(b64)', 'ping', 'POST', b64({ a: 1 }), 'json'],
  ['POST 시험(일반 JSON)', 'ping', 'POST', JSON.stringify({ a: 1 }), 'json'],
  ['POST 참가(잘못된 닉네임)', 'join', 'POST', b64({ nickname: '<x>' }), 'json'],
  ['POST 관리자 로그인 - 예전 경로 admin/login', 'admin/login', 'POST', b64({ password: 'diag-wrong' }), 'json'],
  ['POST 관리자 로그인 - 새 경로 t/auth', 't/auth', 'POST', b64({ password: 'diag-wrong' }), 'json'],
];
const out = document.getElementById('out');
const rows = [];
for (const [label, r, method, body] of TESTS) {
  let status = '-', kind = '', msg = '';
  try {
    const res = await fetch(url(r), { method, headers: { 'X-Envelope': '1', ...(body ? { 'Content-Type': 'text/plain;charset=UTF-8' } : {}) }, body: body ?? undefined });
    status = res.status;
    const text = (await res.text()).replace(/^﻿/, '').trim();
    try { const j = JSON.parse(text); kind = 'JSON'; msg = j.error ? `${j.status ?? ''} ${j.error}` : (j.ok ? 'ok' : j.version ? `버전 ${j.version}` + (j.crypto_feed ? ` · 코인 시세: ${{ upbit: '업비트 실시간 연결됨', 'upbit-delayed': '업비트(지연)', sample: '샘플(외부 연결 안 됨)' }[j.crypto_feed] ?? j.crypto_feed}` : '') : '정상 응답'); }
    catch { kind = 'HTML(막힘)'; msg = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 60); }
  } catch (e) { kind = '연결 실패'; msg = e.message; }
  rows.push({ label, r, method, status, kind, msg });
}
const ok = (x) => x.kind === 'JSON';
const table = document.createElement('table'); table.className = 'tbl';
const head = table.insertRow(); for (const h of ['시험', '상태', '결과', '내용']) { const th = document.createElement('th'); th.textContent = h; head.append(th); }
for (const x of rows) { const tr = table.insertRow(); for (const v of [x.label, String(x.status), (ok(x) ? '✅ ' : '❌ ') + x.kind, x.msg]) tr.insertCell().textContent = v; }
out.textContent = ''; out.append(table);
const [ver, pingB64, pingJson, join, oldLogin, newLogin] = rows;
let verdict;
if (!ok(ver)) verdict = 'api.php 자체가 실행되지 않아요. 이 페이지가 게임 폴더 안에 있는지, api.php가 같은 폴더에 있는지 확인하세요.';
else if (!ok(pingB64) && !ok(pingJson)) verdict = '호스팅이 POST 요청 자체를 막고 있어요. 닷홈 고객센터에 "api.php로 가는 POST 요청이 404/403으로 막힌다"고 문의해 주세요.';
else if (!ok(oldLogin) && ok(newLogin)) verdict = '호스팅이 주소의 admin/login 같은 단어를 막고 있었어요. 관리자 화면은 이제 새 경로(t/auth)를 쓰므로 로그인할 수 있어요.';
else if (ok(newLogin)) verdict = '모든 요청이 서버에 정상적으로 닿아요. 로그인이 안 되면 비밀번호(config.php)를 확인하세요.';
else verdict = '일부 요청이 막혀요. 아래 결과를 복사해서 알려 주세요.';
document.getElementById('summary').textContent = '진단 결과: ' + verdict;
document.getElementById('copy').value = rows.map((x) => `${x.label} | ${x.status} | ${x.kind} | ${x.msg}`).join('\n') + '\n=> ' + verdict;
