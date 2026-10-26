// 보안 규칙 테스트 — Firebase 에뮬레이터(auth 9099, database 9000)가 떠 있어야 한다.
//   npm run emulators   (다른 터미널)
//   npm run test:rules
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, set, update, get, remove, serverTimestamp } from 'firebase/database';

const NS = 'kimkyeongtae-85921-default-rtdb';
const DB_URL = `http://127.0.0.1:9000/?ns=${NS}`;
const REST = (p) => `http://127.0.0.1:9000/${p}.json?ns=${NS}`;
const owner = { Authorization: 'Bearer owner' };
const TS = serverTimestamp();

let passed = 0, failed = 0;
async function expectOk(name, p){ try{ await p; passed++; console.log('  ✓', name); }catch(e){ failed++; console.log('  ✗', name, '→ 거부됨:', e.message); } }
async function expectDenied(name, p){ try{ await p; failed++; console.log('  ✗', name, '→ 허용되면 안 되는데 허용됨'); }catch(e){ passed++; console.log('  ✓', name, '(거부)'); } }
async function adminWrite(path, val){ const r = await fetch(REST(path), { method: 'PUT', headers: owner, body: JSON.stringify(val) }); if(!r.ok) throw new Error(await r.text()); }

let n = 0;
async function client(){
  const app = initializeApp({ apiKey: 'test', projectId: 'kimkyeongtae-85921', databaseURL: DB_URL }, 'c' + (n++));
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getDatabase(app); connectDatabaseEmulator(db, '127.0.0.1', 9000);
  const { user } = await signInAnonymously(auth);
  return { app, db, uid: user.uid, r: (p) => ref(db, 'solo/' + p) };
}
const profile = (nick, gender, extra) => Object.assign({ nick, age: '30대 초반', gender, lookingFor: gender === 'M' ? 'F' : 'M', personality: '다정함', hobby: '등산', intro: '안녕하세요 ' + nick, ideal: '', style: '', avatar: { emoji: '🦊', color: '#F4E3E8' }, status: 'approved', createdAt: TS }, extra || {});
async function join(c, sid, p){ const up = {}; up[`participants/${sid}/${c.uid}`] = p; up[`nicknames/${sid}/${p.nick.toLowerCase()}`] = c.uid; return update(ref(c.db, 'solo'), up); }

// 초기화 (에뮬레이터 전용 데이터)
await fetch(REST(''), { method: 'DELETE', headers: owner });
const [admin, A, B, C, D] = await Promise.all([client(), client(), client(), client(), client()]);
await adminWrite('solo/admins/' + admin.uid, true);
await adminWrite('rooms/9999/state', { phase: 'lobby' });

console.log('\n[기존 게임 데이터 경로 유지]');
await expectOk('기존 안전 특공대 rooms 읽기/쓰기 (로그인 없이 쓰던 경로 유지)', get(ref(A.db, 'rooms/9999/state')).then(() => set(ref(A.db, 'rooms/9999/x'), 1)));
for(const p of ['leaderboard', 'last1rooms', 'stopGameRooms']) await expectOk('기존 경로 ' + p + ' 읽기/쓰기 유지', set(ref(A.db, p + '/t'), 1).then(() => get(ref(A.db, p))));

console.log('\n[관리자 권한]');
const sid = 's1';
await expectDenied('일반 참가자가 자신을 관리자로 등록', set(A.r('admins/' + A.uid), true));
await expectDenied('일반 참가자가 기수 생성', set(A.r('seasons/hack'), { name: 'x', status: 'recruiting', phase: 'lobby', picks: 3, createdAt: Date.now() }));
await expectOk('관리자가 기수 생성', set(admin.r('seasons/' + sid), { name: '1기', status: 'recruiting', phase: 'lobby', picks: 2, requireApproval: false, firstEndsAt: 0, finalEndsAt: 0, firstRevealed: false, resultsPublished: false, createdAt: TS }));
await expectOk('관리자가 현재 기수 지정', set(admin.r('config/currentSeason'), sid));
await expectDenied('일반 참가자가 현재 기수 변경', set(A.r('config/currentSeason'), 'zzz'));
await expectDenied('일반 참가자가 진행 단계 변경', set(A.r(`seasons/${sid}/phase`), 'final'));
await expectDenied('일반 참가자가 QR 입장 주소 변경', set(A.r('config/entryUrl'), 'https://evil.example.com/'));
await expectDenied('관리자도 http/로컬 주소는 저장 불가', set(admin.r('config/entryUrl'), 'http://localhost:8080/solo/'));

console.log('\n[캐릭터 생성 · 닉네임 중복]');
await expectOk('A 캐릭터 생성', join(A, sid, profile('광수', 'M')));
await expectDenied('B가 같은 닉네임(대소문자 무시)으로 생성', join(B, sid, profile('광수', 'F')));
await expectOk('B 캐릭터 생성', join(B, sid, profile('영숙', 'F')));
await expectDenied('C가 스스로 status=approved 외 값(관리자 전용) 설정', join(C, sid, profile('옥순', 'F', { status: 'hidden' })));
await expectDenied('C가 닉네임 예약 없이 프로필만 생성', set(C.r(`participants/${sid}/${C.uid}`), profile('옥순', 'F')));
await expectDenied('C가 남의 uid로 프로필 생성', set(C.r(`participants/${sid}/${A.uid}`), profile('가짜', 'F')));
await expectOk('C 캐릭터 생성', join(C, sid, profile('옥순', 'F')));
await expectDenied('C가 닉네임 추가 예약(사재기)', set(C.r(`nicknames/${sid}/또다른닉`), C.uid));
await expectDenied('A가 자기 닉네임 변경', set(A.r(`participants/${sid}/${A.uid}/nick`), '상철'));
await expectOk('A가 자기소개 수정', set(A.r(`participants/${sid}/${A.uid}/intro`), '수정한 소개'));
await expectDenied('A가 B의 프로필 수정', set(A.r(`participants/${sid}/${B.uid}/intro`), '해킹'));
await expectDenied('A가 스스로 status 변경', set(A.r(`participants/${sid}/${A.uid}/status`), 'hidden'));
await expectDenied('전화번호 같은 정의되지 않은 필드 추가', set(A.r(`participants/${sid}/${A.uid}/phone`), '010'));
await expectOk('다른 참가자가 참가자 목록 조회', get(B.r(`participants/${sid}`)));

console.log('\n[승인제 기수]');
await set(admin.r(`seasons/${sid}/requireApproval`), true);
await expectDenied('승인제에서 D가 approved로 직접 생성', join(D, sid, profile('정숙', 'F')));
await expectOk('승인제에서 D가 pending으로 생성', join(D, sid, profile('정숙', 'F', { status: 'pending' })));
await expectOk('관리자가 D 승인', set(admin.r(`participants/${sid}/${D.uid}/status`), 'approved'));

console.log('\n[첫인상 선택]');
const vote = (c, picks) => { const v = { updatedAt: TS }; picks.forEach((t, i) => v[i] = t); return set(c.r(`votes/${sid}/${c.uid}`), v); };
await expectDenied('로비 단계에서는 선택 불가', vote(A, [B.uid]));
await set(admin.r(`seasons/${sid}/phase`), 'first');
await expectOk('A → B 선택', vote(A, [B.uid]));
await expectDenied('자기 자신 선택', vote(A, [A.uid]));
await expectDenied('같은 상대 중복 선택', vote(A, [B.uid, B.uid]));
await expectDenied('허용 수(2) 초과 선택', vote(A, [B.uid, C.uid, D.uid]));
await expectDenied('존재하지 않는 상대 선택', vote(A, ['nobody']));
await expectOk('A → B, C 선택 (2명)', vote(A, [B.uid, C.uid]));
await expectDenied('A가 B 이름으로 선택 기록', vote({ ...A, uid: B.uid, r: A.r }, [C.uid]));
await expectOk('B → A 선택', vote(B, [A.uid]));
await expectDenied('B가 A의 선택 내용 조회', get(B.r(`votes/${sid}/${A.uid}`)));
await expectDenied('B가 전체 선택 기록 조회', get(B.r(`votes/${sid}`)));
await expectOk('A가 자기 선택 조회', get(A.r(`votes/${sid}/${A.uid}`)));
await expectOk('관리자가 전체 선택 조회', get(admin.r(`votes/${sid}`)));
await set(admin.r(`seasons/${sid}/firstEndsAt`), Date.now() - 1000);
await expectDenied('마감 시각이 지난 뒤 선택 변경', vote(A, [D.uid]));
await set(admin.r(`seasons/${sid}/firstEndsAt`), 0);
await set(admin.r(`seasons/${sid}/phase`), 'break');
await expectDenied('첫인상 마감(break) 후 선택 변경', vote(A, [D.uid]));
await expectDenied('마감 후 선택 삭제', remove(A.r(`votes/${sid}/${A.uid}`)));

console.log('\n[결과 공개]');
await expectDenied('참가자가 결과 직접 기록', set(A.r(`results/${sid}/first/${A.uid}`), { received: 99 }));
await set(admin.r(`results/${sid}/first`), { [A.uid]: { received: 1, mutual: { [B.uid]: '영숙' } }, [B.uid]: { received: 1, mutual: { [A.uid]: '광수' } }, [C.uid]: { received: 1 } });
await expectDenied('공개 전 내 결과 조회', get(A.r(`results/${sid}/first/${A.uid}`)));
await set(admin.r(`seasons/${sid}/firstRevealed`), true);
await expectOk('공개 후 내 결과 조회', get(A.r(`results/${sid}/first/${A.uid}`)));
await expectDenied('공개 후에도 남의 결과 조회', get(C.r(`results/${sid}/first/${A.uid}`)));

console.log('\n[최종 선택]');
await expectDenied('최종 선택 기간 전 제출', set(A.r(`finalChoices/${sid}/${A.uid}`), { target: B.uid, at: TS }));
await set(admin.r(`seasons/${sid}/phase`), 'final');
await expectOk('A 최종 → B', set(A.r(`finalChoices/${sid}/${A.uid}`), { target: B.uid, at: TS }));
await expectDenied('최종 선택 자기 자신', set(C.r(`finalChoices/${sid}/${C.uid}`), { target: C.uid, at: TS }));
await expectDenied('최종 선택에 추가 필드(여러 명)', set(C.r(`finalChoices/${sid}/${C.uid}`), { target: A.uid, at: TS, target2: B.uid }));
await expectDenied('C가 A의 최종 선택 조회', get(C.r(`finalChoices/${sid}/${A.uid}`)));
await set(admin.r(`seasons/${sid}/phase`), 'closed');
await expectDenied('최종 마감 후 변경', set(A.r(`finalChoices/${sid}/${A.uid}`), { target: C.uid, at: TS }));
await expectDenied('결과 공개 전 커플 목록 조회', get(A.r(`results/${sid}/couples`)));

console.log('\n[아이템]');
const item = (c, extra) => Object.assign({ creator: c.uid, creatorNick: 'x', owner: c.uid, name: '장미', emoji: '🌹', kind: 'gift', desc: '', createdAt: TS }, extra || {});
await expectOk('A 아이템 생성 (슬롯 0)', set(A.r(`items/${sid}/${A.uid}_0`), item(A)));
await expectOk('A 아이템 생성 (슬롯 9)', set(A.r(`items/${sid}/${A.uid}_9`), item(A)));
await expectDenied('슬롯 범위 밖 ID (개수 제한 우회)', set(A.r(`items/${sid}/${A.uid}_10`), item(A)));
await expectDenied('임의 ID로 생성', set(A.r(`items/${sid}/free_item`), item(A)));
await expectDenied('남의 슬롯에 생성', set(A.r(`items/${sid}/${B.uid}_0`), item(A)));
await expectDenied('만든 사람을 남으로 위장', set(A.r(`items/${sid}/${A.uid}_1`), item(A, { creator: B.uid })));
const made = (await get(A.r(`items/${sid}/${A.uid}_0/createdAt`))).val();
const keep = { createdAt: made };
await expectDenied('선물하면서 생성 시각 위조', set(A.r(`items/${sid}/${A.uid}_0`), item(A, { createdAt: 1, owner: B.uid, gift: { from: A.uid, fromNick: '광수', at: TS } })));
await expectOk('A가 B에게 선물', set(A.r(`items/${sid}/${A.uid}_0`), item(A, { ...keep, owner: B.uid, gift: { from: A.uid, fromNick: '광수', msg: '반가워요', at: TS } })));
await expectDenied('선물 후 A가 다시 수정', set(A.r(`items/${sid}/${A.uid}_0`), item(A, keep)));
await expectDenied('B가 받은 아이템 이름 변경', set(B.r(`items/${sid}/${A.uid}_0/name`), '바꾼이름'));
await expectDenied('B가 선물 보낸 사람을 위장', set(B.r(`items/${sid}/${A.uid}_0`), item(A, { ...keep, owner: C.uid, gift: { from: A.uid, fromNick: '광수', at: TS } })));
await expectOk('B가 C에게 다시 선물', set(B.r(`items/${sid}/${A.uid}_0`), item(A, { ...keep, owner: C.uid, gift: { from: B.uid, fromNick: '영숙', msg: '', at: TS } })));
await expectDenied('A가 남(C)의 아이템 삭제', remove(A.r(`items/${sid}/${A.uid}_0`)));
await expectOk('A가 자기 아이템 삭제', remove(A.r(`items/${sid}/${A.uid}_9`)));

console.log('\n[신고 · 차단]');
await expectOk('C가 신고 접수', set(C.r(`reports/${sid}/r1`), { from: C.uid, target: A.uid, reason: '부적절한 메시지', at: TS }));
await expectDenied('남의 이름으로 신고', set(C.r(`reports/${sid}/r2`), { from: B.uid, target: A.uid, reason: 'x', at: TS }));
await expectDenied('참가자가 신고 내역 조회', get(A.r(`reports/${sid}`)));
await expectOk('관리자가 신고 내역 조회', get(admin.r(`reports/${sid}`)));
await update(ref(admin.db, 'solo'), { [`participants/${sid}/${A.uid}/status`]: 'blocked', [`blocked/${A.uid}`]: true });
await expectDenied('차단된 A가 아이템 생성', set(A.r(`items/${sid}/${A.uid}_2`), item(A)));
await expectDenied('차단된 A가 프로필 수정', set(A.r(`participants/${sid}/${A.uid}/intro`), '다시'));
await expectDenied('차단된 A가 신고 남발', set(A.r(`reports/${sid}/r3`), { from: A.uid, target: B.uid, reason: 'x', at: TS }));
await expectDenied('참가자가 차단 해제', remove(A.r(`blocked/${A.uid}`)));

console.log(`\n결과: ${passed} 통과, ${failed} 실패`);
await Promise.all([admin, A, B, C, D].map((c) => deleteApp(c.app)));
process.exit(failed ? 1 : 0);
