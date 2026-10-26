// 브라우저 종단 테스트 — 운영자 1명 + 참가자 3명이 각자 다른 브라우저(=다른 기기)로 플레이한다.
// 필요: Firebase 에뮬레이터(npm run emulators), public/ 정적 서버 (python3 -m http.server 8080 --bind 127.0.0.1 --directory ../../public)
// 실행: npm run test:e2e   (스크린샷은 SHOTS 환경변수 폴더, 기본 ./shots)
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import jsQR from 'jsqr';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const SHOTS = process.env.SHOTS || path.join(here, 'shots');
const NS = 'kimkyeongtae-85921-default-rtdb';
const REST = (p) => `http://127.0.0.1:9000/${p}.json?ns=${NS}`;
const owner = { Authorization: 'Bearer owner' };
mkdirSync(SHOTS, { recursive: true });

let passed = 0, failed = 0;
function check(name, cond, extra){ if(cond){ passed++; console.log('  ✓', name); } else { failed++; console.log('  ✗', name, extra || ''); } }

// 이 세션 네트워크에서 CDN이 막혀 있을 수 있어, 같은 버전의 npm 패키지 파일로 대신 응답한다.
const nm = path.join(here, 'node_modules');
async function routeCdn(ctx){
  await ctx.route(/www\.gstatic\.com\/firebasejs\/10\.12\.2\/(.+\.js)$/, (route) => {
    const f = route.request().url().match(/10\.12\.2\/(.+\.js)$/)[1];
    route.fulfill({ contentType: 'application/javascript', body: readFileSync(path.join(nm, 'firebase', f)) });
  });
  await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/qrcodejs\/1\.0\.0\/qrcode\.min\.js$/, (route) =>
    route.fulfill({ contentType: 'application/javascript', body: readFileSync(path.join(nm, 'qrcodejs', 'qrcode.min.js')) }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
}

const browser = await chromium.launch();
async function device(name, mobile){
  const ctx = await browser.newContext(mobile ? { ...devices['iPhone 13'], locale: 'ko-KR' } : { viewport: { width: 1280, height: 900 }, locale: 'ko-KR' });
  await routeCdn(ctx);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.type() === 'prompt' ? d.accept('불쾌한 표현을 했어요') : d.accept());
  page.on('pageerror', (e) => { failed++; console.log('  ✗ [' + name + '] 페이지 오류:', e.message); });
  page.name = name;
  return page;
}
const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: false });
const toastText = async (p) => (await p.locator('#toast').textContent()) || '';

await fetch(REST(''), { method: 'DELETE', headers: owner });

/* ── 운영자 ── */
console.log('\n[운영자 로그인 · 권한]');
const adm = await device('운영자', false);
await adm.goto(BASE + '/solo/admin.html?emu=1');
await adm.waitForSelector('#aUid');
check('관리자 등록 전에는 운영 메뉴가 숨겨짐', await adm.locator('#aMain').isHidden());
const adminUid = await adm.inputValue('#aUid');
await fetch(REST('solo/admins/' + adminUid), { method: 'PUT', headers: owner, body: 'true' }); // 콘솔에서 추가하는 것과 동일
await adm.reload();
await adm.waitForSelector('#aMain:not(.hidden)');
check('콘솔에서 등록한 UID는 운영자로 인식', await adm.locator('#aMain').isVisible());

console.log('\n[기수 생성]');
await adm.click('summary');
await adm.fill('#nsName', '1기 · 가을 특집');
await adm.selectOption('#nsPicks', '2');
await adm.click('#nsCreate');
await adm.waitForFunction(() => document.getElementById('cPhase').textContent.includes('탐색'));
check('기수 생성 후 현재 기수로 지정', (await adm.textContent('#cInfo')).includes('1기'));

console.log('\n[QR코드]');
const qrData = await adm.evaluate(() => { const c = document.querySelector('#qBox canvas'); return { w: c.width, h: c.height, d: Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data) }; });
const qr = jsQR(Uint8ClampedArray.from(qrData.d), qrData.w, qrData.h);
check('QR코드를 해석하면 게임 입장 주소(/solo/)', qr && qr.data === BASE + '/solo/', qr && qr.data);
check('로컬 주소로 만든 QR에는 경고 표시', (await adm.textContent('#qHint')).includes('다른 휴대폰에서 열리지 않아요'));
await adm.fill('#qUrl', 'http://localhost:8080/solo/');
await adm.click('#qSave');
check('localhost 주소는 저장 거부', (await adm.textContent('#qHint')).includes('https://'));
const [dl] = await Promise.all([adm.waitForEvent('download'), adm.click('#qDown')]);
const dlPath = path.join(SHOTS, 'qr-poster.png');
await dl.saveAs(dlPath);
check('QR 이미지 다운로드 (PNG)', dl.suggestedFilename() === 'cyber-solo-qr.png' && readFileSync(dlPath).slice(1, 4).toString() === 'PNG');
await shot(adm, '01-admin');

/* ── 참가자 ── */
async function onboard(p, nick, gender, look, pick){
  await p.goto(BASE + '/solo/?emu=1');
  await p.waitForSelector('#iEnter:not([disabled])');
  await p.click('#iEnter');
  await p.check('#obAgree'); await p.click('#obNext');
  await p.fill('#obNick', nick); await p.click('#obNext');
  await p.waitForSelector('#obAge');
  await p.click('#obAge .chip >> nth=' + pick);
  await p.click('#obGender .chip[data-v="' + gender + '"]');
  await p.click('#obLook .chip[data-v="' + look + '"]');
  await p.click('#obNext');
  await p.click('#obPers .chip >> nth=0'); await p.click('#obPers .chip >> nth=' + (pick + 2));
  await p.fill('#obHobby', '주말 등산, 보드게임'); await p.click('#obStyle .chip >> nth=1');
  await p.click('#obNext');
  await p.fill('#obIntro', nick + '입니다. 교실 밖에서는 산책을 좋아해요.');
  await p.fill('#obIdeal', '대화가 잘 통하는 사람');
  await p.click('#obNext');
  await p.click('#obEmoji button >> nth=' + pick);
  await p.click('#obNext');
  await p.waitForSelector('#s-app:not(.hidden)');
}

console.log('\n[첫 화면 · 캐릭터 생성]');
const A = await device('광수', true), B = await device('영숙', true), C = await device('옥순', true);
await A.goto(BASE + '/?emu=1');
await A.waitForFunction(() => document.getElementById('hSeason').textContent.includes('1기'));
check('홈페이지에 Firebase의 실제 기수·모집 상태 표시', (await A.textContent('#hStatus')).includes('참가자 모집 중'));
for(const t of ['게임 시작하기', 'QR코드로 입장하기', '참가 방법']) check('홈페이지 버튼: ' + t, await A.getByText(t, { exact: true }).isVisible());
await shot(A, '02-home-mobile');
await A.click('#hQr');
await A.waitForSelector('#mQr img[src^="data:image"]');
check('홈페이지 QR 모달 표시', await A.locator('#mQr img').isVisible());

await onboard(A, '광수', 'M', 'F', 2);
check('A 캐릭터 생성 → 로비 입장', (await A.textContent('#aMe')).includes('광수'));
await B.goto(BASE + '/solo/?emu=1');
await B.waitForSelector('#iEnter:not([disabled])');
await B.click('#iEnter'); await B.check('#obAgree'); await B.click('#obNext');
await B.fill('#obNick', '광수'); await B.click('#obNext');
await B.waitForFunction(() => document.getElementById('obNickHint').textContent.length > 0);
check('닉네임 중복 차단', (await B.textContent('#obNickHint')).includes('이미 사용 중'));
await B.click('#obPrev'); await B.click('#obPrev');
await onboard(B, '영숙', 'F', 'M', 1);
await onboard(C, '옥순', 'F', 'M', 0);
await A.waitForFunction(() => document.querySelectorAll('#t-lobby .pcard').length === 2);
check('A 기기에서 다른 참가자 2명 카드 조회', true);
check('비공개 정보(선택 기록)는 카드에 없음', !(await A.textContent('#t-lobby')).includes('받음'));
await shot(A, '03-lobby-mobile');
await adm.waitForFunction(() => document.querySelectorAll('#pBody tr').length === 3);
check('운영자 화면 참가자 목록 3명', true);

console.log('\n[아이템 만들기 · 선물]');
await A.click('.tabs button[data-t="items"]');
await A.click('#itNew');
await A.click('#niE button >> nth=0');
await A.fill('#niN', '퇴근길 붕어빵 쿠폰');
await A.fill('#niD', '함께 먹으면 두 배로 맛있어요');
await A.click('#niOk');
await A.waitForFunction(() => document.querySelector('#t-items').textContent.includes('퇴근길 붕어빵 쿠폰'));
check('A 아이템 생성', (await A.textContent('#itNew')).includes('1/10'));
await shot(A, '04-items-mobile');
await A.click('[data-give]');
await A.selectOption('#gT', { label: '🐰 영숙' }).catch(async () => { const v = await A.$$eval('#gT option', (o) => o.find((x) => x.textContent.includes('영숙')).value); await A.selectOption('#gT', v); });
await A.fill('#gM', '오늘 대화 즐거웠어요!');
await A.click('#gOk');
await B.click('.tabs button[data-t="items"]');
await B.waitForFunction(() => document.querySelector('#t-items').textContent.includes('광수님의 선물'));
check('B 가방에 A의 선물 도착 (메시지 포함)', (await B.textContent('#t-items')).includes('오늘 대화 즐거웠어요!'));

console.log('\n[첫인상 선택]');
check('로비 단계에서는 호감 버튼 없음', (await A.locator('[data-vote]').count()) === 0);
await adm.click('[data-phase="first"]');
await A.click('.tabs button[data-t="lobby"]'); await B.click('.tabs button[data-t="lobby"]'); await C.click('.tabs button[data-t="lobby"]');
await A.waitForSelector('[data-vote]');
const uidOf = (p) => p.evaluate(() => window.SOLO.auth.currentUser.uid);
const [ua, ub, uc] = [await uidOf(A), await uidOf(B), await uidOf(C)];
check('자기 자신 카드/버튼 없음', (await A.locator(`[data-vote="${ua}"]`).count()) === 0);
await A.click(`[data-vote="${ub}"]`);
await A.waitForSelector(`[data-vote="${ub}"].on`);
await A.click(`[data-vote="${uc}"]`);
await A.waitForSelector(`[data-vote="${uc}"].on`);
await B.click(`[data-vote="${ua}"]`); await B.waitForSelector(`[data-vote="${ua}"].on`);
await C.click(`[data-vote="${ua}"]`); await C.waitForSelector(`[data-vote="${ua}"].on`);
await shot(A, '05-first-pick-mobile');
const stored = await (await fetch(REST(`solo/votes`), { headers: owner })).json();
const sid = Object.keys(stored)[0];
check('호감 선택이 Firebase에 저장됨', stored[sid][ua]['0'] === ub && stored[sid][ua]['1'] === uc, JSON.stringify(stored[sid][ua]));
const peek = await B.evaluate((p) => window.SOLO.db.ref(p).once('value').then(() => 'read', (e) => e.code || e.message), `solo/votes/${sid}/${ua}`);
check('B가 브라우저 콘솔로 A의 선택을 몰래 조회 → 거부', /permission/i.test(peek), peek);
const forge = await A.evaluate((p) => window.SOLO.db.ref(p).set({ 0: 'x', 1: 'x', updatedAt: Date.now() }).then(() => 'ok', (e) => e.code || e.message), `solo/votes/${sid}/${ua}`);
check('콘솔로 중복/가짜 선택 강제 저장 → 거부', /permission/i.test(forge), forge);
await adm.click('[data-phase="break"]');
await A.waitForFunction(() => document.querySelectorAll('[data-vote]').length === 0);
check('마감 후 선택 버튼 사라짐', true);
const late = await A.evaluate((a) => window.SOLO.db.ref(a.p).set({ 0: a.c, updatedAt: window.firebase.database.ServerValue.TIMESTAMP }).then(() => 'ok', (e) => e.code || e.message), { p: `solo/votes/${sid}/${ua}`, c: uc });
check('마감 후 콘솔로 선택 변경 → 거부', /permission/i.test(late), late);
await adm.click('#cRevealFirst');
await adm.waitForFunction(() => document.getElementById('cHint').textContent.includes('공개했어요'));
// A→B,C / B→A / C→A 이므로 실제 상호 선택은 A–B, A–C 두 쌍
check('운영자 첫인상 결과 계산·공개 (상호 2쌍)', (await adm.textContent('#cHint')).includes('2쌍'), await adm.textContent('#cHint'));
await A.click('.tabs button[data-t="news"]'); await C.click('.tabs button[data-t="news"]');
await A.waitForFunction(() => document.querySelector('#t-news').textContent.includes('서로 호감'));
check('A: 영숙님과 서로 호감 알림', (await A.textContent('#t-news')).includes('영숙님과 서로 호감'));
check('A: 받은 호감 수 2명', (await A.textContent('#t-news')).includes('2명'));
await C.waitForFunction(() => document.querySelector('#t-news').textContent.includes('나를 선택한 사람 수'));
check('C: 광수님과 서로 호감, 받은 호감 1명', (await C.textContent('#t-news')).includes('광수님과 서로 호감') && (await C.textContent('#t-news')).includes('1명'), await C.textContent('#t-news'));
await B.click('.tabs button[data-t="news"]');
await B.waitForFunction(() => document.querySelector('#t-news').textContent.includes('나를 선택한 사람 수'));
check('B: 상대가 누구를 골랐는지(A→C)는 노출되지 않음', !(await B.textContent('#t-news')).includes('옥순'));
await shot(A, '06-first-result-mobile');

console.log('\n[최종 선택 · 커플 매칭]');
await adm.click('[data-phase="final"]');
for(const p of [A, B, C]) await p.click('.tabs button[data-t="lobby"]');
await A.waitForSelector(`[data-final="${ub}"]`);
await A.click(`[data-final="${ub}"]`); await A.waitForSelector(`[data-final="${ub}"].on`);
await B.waitForSelector(`[data-final="${ua}"]`); await B.click(`[data-final="${ua}"]`); await B.waitForSelector(`[data-final="${ua}"].on`);
await C.waitForSelector(`[data-final="${ua}"]`); await C.click(`[data-final="${ua}"]`); await C.waitForSelector(`[data-final="${ua}"].on`);
await adm.click('[data-phase="closed"]');
await adm.waitForFunction(() => document.getElementById('cPhase').textContent.includes('최종 선택 마감'));
await adm.click('#cPublish');
await adm.waitForFunction(() => document.getElementById('cHint').textContent.includes('최종 결과를 공개'));
check('운영자 최종 결과: 커플 1쌍', (await adm.textContent('#cHint')).includes('1쌍'));
for(const p of [A, B, C]) await p.click('.tabs button[data-t="news"]');
await A.waitForFunction(() => document.querySelector('#t-news').textContent.includes('커플 성사'));
check('A: 커플 성사 (서로 선택)', true);
await B.waitForFunction(() => document.querySelector('#t-news').textContent.includes('커플 성사'));
check('B: 커플 성사 (서로 선택)', true);
await C.waitForFunction(() => document.querySelector('#t-news').textContent.includes('솔로'));
check('C: 일방 선택이라 솔로', !(await C.textContent('#t-news')).includes('커플 성사!'));
check('결과 화면에 커플 목록·기수 종료 안내', /(광수 💞 영숙|영숙 💞 광수)/.test(await C.textContent('#t-news')) && (await C.textContent('#t-news')).includes('종료'), await C.textContent('#t-news'));
await shot(A, '07-final-result-mobile');
await shot(C, '08-solo-result-mobile');

console.log('\n[신고 · 운영자 권한]');
await C.click('.tabs button[data-t="lobby"]');
await C.click(`[data-report="${ua}"]`);
await adm.waitForFunction(() => document.getElementById('rList').textContent.includes('불쾌한'));
check('신고가 운영자 화면에 표시', true);
await B.goto(BASE + '/solo/admin.html?emu=1');
await B.waitForSelector('#aUid');
check('일반 참가자는 운영자 페이지 메뉴 없음', await B.locator('#aMain').isHidden());
const hack = await B.evaluate((s) => window.SOLO.db.ref('solo/seasons/' + s + '/phase').set('first').then(() => 'ok', (e) => e.code || e.message), sid);
check('일반 참가자가 콘솔로 진행 단계 변경 → 거부', /permission/i.test(hack), hack);
const selfAdmin = await B.evaluate(() => window.SOLO.db.ref('solo/admins/' + window.SOLO.auth.currentUser.uid).set(true).then(() => 'ok', (e) => e.code || e.message));
check('일반 참가자가 스스로 관리자 등록 → 거부', /permission/i.test(selfAdmin), selfAdmin);
const rep = await B.evaluate((s) => window.SOLO.db.ref('solo/reports/' + s).once('value').then(() => 'read', (e) => e.code || e.message), sid);
check('일반 참가자가 신고 내역 조회 → 거부', /permission/i.test(rep), rep);
await shot(B, '09-admin-denied-mobile');

console.log('\n[모바일 레이아웃]');
for(const p of [A, C]){
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(p.name + ': 가로 스크롤 없음 (iPhone 13 폭)', over <= 0, 'overflow ' + over);
}

console.log(`\n결과: ${passed} 통과, ${failed} 실패  (스크린샷: ${SHOTS})`);
await browser.close();
process.exit(failed ? 1 : 0);
