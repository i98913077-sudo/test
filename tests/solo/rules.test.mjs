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
const [admin, A, B, C, D, V, F, G] = await Promise.all([client(), client(), client(), client(), client(), client(), client(), client()]);
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
await expectDenied('참가자가 스스로 "이전 기수에서 이어짐" 표시', join(C, sid, profile('옥순', 'F', { fromSeason: '0기' })));
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
await expectOk('관리자가 기수 전체 결과 조회(다음 기수 이어받기용)', get(admin.r(`results/${sid}`)));
await expectDenied('참가자가 기수 전체 결과 조회', get(A.r(`results/${sid}`)));
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

console.log('\n[공용 거실]');
const lmsg = (c, nick, extra) => Object.assign({ uid: c.uid, nick, emoji: '🦊', text: '안녕하세요', at: TS }, extra || {});
await expectOk('A가 공용 거실에 메시지', set(A.r(`lounge/${sid}/m1`), lmsg(A, '광수')));
await expectDenied('A가 남의 닉네임(영숙)으로 사칭', set(A.r(`lounge/${sid}/m2`), lmsg(A, '영숙')));
await expectDenied('A가 남의 uid로 메시지', set(A.r(`lounge/${sid}/m3`), lmsg(B, '광수')));
await expectDenied('참가자가 제작진(staff) 표시', set(A.r(`lounge/${sid}/m4`), lmsg(A, '광수', { staff: true })));
await expectDenied('A가 남의 메시지 수정', set(A.r(`lounge/${sid}/m1`), lmsg(A, '광수', { text: '수정' })));
await expectOk('B가 공용 거실 읽기', get(B.r(`lounge/${sid}`)));
await expectOk('관리자가 제작진으로 말하기', set(admin.r(`lounge/${sid}/s1`), { uid: admin.uid, nick: '제작진', staff: true, text: '공지', at: TS }));
await set(admin.r(`seasons/${sid}/chatOpen`), false);
await expectDenied('운영자가 대화를 닫으면 메시지 불가', set(A.r(`lounge/${sid}/m5`), lmsg(A, '광수')));
await set(admin.r(`seasons/${sid}/chatOpen`), true);

console.log('\n[1:1 데이트 대화]');
const room = A.uid < B.uid ? `${A.uid}__${B.uid}` : `${B.uid}__${A.uid}`;
const [ra, rb] = room.split('__');
await expectOk('A → B 데이트 신청', set(A.r(`dmReq/${sid}/${B.uid}/${A.uid}`), { msg: '이야기 나눠요', at: TS }));
await expectDenied('자기 자신에게 신청', set(A.r(`dmReq/${sid}/${A.uid}/${A.uid}`), { at: TS }));
await expectDenied('남의 이름으로 신청', set(A.r(`dmReq/${sid}/${B.uid}/${C.uid}`), { at: TS }));
await expectOk('B가 받은 신청 조회', get(B.r(`dmReq/${sid}/${B.uid}`)));
await expectDenied('C가 B의 받은 신청 조회', get(C.r(`dmReq/${sid}/${B.uid}`)));
const roomC = A.uid < C.uid ? `${A.uid}__${C.uid}` : `${C.uid}__${A.uid}`;
await expectDenied('신청 없이 C가 A와 대화방 생성', set(C.r(`dmRooms/${sid}/${roomC}`), { a: roomC.split('__')[0], b: roomC.split('__')[1], createdAt: TS }));
await expectDenied('신청을 보낸 A가 스스로 대화방 생성(수락은 받은 사람만)', update(ref(A.db, 'solo'), { [`dmRooms/${sid}/${room}`]: { a: ra, b: rb, createdAt: TS }, [`myRooms/${sid}/${A.uid}/${room}`]: true }));
await expectDenied('방 ID와 멤버 불일치', set(B.r(`dmRooms/${sid}/${room}`), { a: rb, b: ra, createdAt: TS }));
await expectOk('B가 수락 → 대화방 생성 + 양쪽 목록 + 신청 삭제', update(ref(B.db, 'solo'), {
  [`dmRooms/${sid}/${room}`]: { a: ra, b: rb, createdAt: TS }, [`myRooms/${sid}/${A.uid}/${room}`]: true, [`myRooms/${sid}/${B.uid}/${room}`]: true, [`dmReq/${sid}/${B.uid}/${A.uid}`]: null }));
await expectDenied('C가 남의 대화방을 자기 목록에 추가', set(C.r(`myRooms/${sid}/${C.uid}/${room}`), true));
await expectDenied('C가 A의 대화방 목록 조회', get(C.r(`myRooms/${sid}/${A.uid}`)));
await expectOk('A가 1:1 메시지 전송', set(A.r(`dmMsgs/${sid}/${room}/d1`), { uid: A.uid, text: '반가워요!', at: TS }));
await expectOk('B가 1:1 메시지 읽기', get(B.r(`dmMsgs/${sid}/${room}`)));
await expectDenied('C가 남의 1:1 대화 읽기', get(C.r(`dmMsgs/${sid}/${room}`)));
await expectDenied('C가 남의 1:1 대화에 끼어들기', set(C.r(`dmMsgs/${sid}/${room}/x`), { uid: C.uid, text: '끼어들기', at: TS }));
await expectDenied('B가 A인 척 메시지', set(B.r(`dmMsgs/${sid}/${room}/d2`), { uid: A.uid, text: '가짜', at: TS }));
await expectOk('관리자가 신고 확인용으로 1:1 대화 읽기', get(admin.r(`dmMsgs/${sid}/${room}`)));

console.log('\n[연락처 · 사진 교환]');
const share = (c, kind, v) => update(ref(c.db, 'solo'), { [`dmShare/${sid}/${room}/${c.uid}/${kind}`]: v, [`dmShareState/${sid}/${room}/${c.uid}/${kind}`]: v ? true : null });
const jpg = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
await expectOk('A가 연락처 올림', share(A, 'contact', '카톡 solo_a'));
await expectDenied('B가 자기 것 없이 A 연락처 열람', get(B.r(`dmShare/${sid}/${room}/${A.uid}/contact`)));
await expectOk('B가 교환 상태(누가 올렸는지)는 확인', get(B.r(`dmShareState/${sid}/${room}`)));
await expectOk('B도 연락처 올림', share(B, 'contact', '010-0000-0000'));
await expectOk('서로 올린 뒤 B가 A 연락처 열람', get(B.r(`dmShare/${sid}/${room}/${A.uid}/contact`)).then((s) => { if(s.val() !== '카톡 solo_a') throw new Error('값 불일치'); }));
await expectDenied('B가 사진은 안 올렸으니 A 사진 열람 불가', share(A, 'photo', jpg).then(() => get(B.r(`dmShare/${sid}/${room}/${A.uid}/photo`))));
await expectDenied('C(제3자)가 연락처 열람', get(C.r(`dmShare/${sid}/${room}/${A.uid}/contact`)));
await expectDenied('관리자도 연락처 내용은 열람 불가', get(admin.r(`dmShare/${sid}/${room}/${A.uid}/contact`)));
await expectDenied('B가 A 이름으로 연락처 기록', set(B.r(`dmShare/${sid}/${room}/${A.uid}/contact`), '가짜'));
await expectDenied('JPEG가 아닌 사진(스크립트 등) 업로드', share(B, 'photo', 'data:image/svg+xml;base64,PHN2Zz4='));
await expectDenied('너무 큰 사진 업로드', share(B, 'photo', 'data:image/jpeg;base64,' + 'A'.repeat(400001)));
await set(admin.r(`seasons/${sid}/exchange`), 'off');
await expectDenied('운영자가 교환을 막으면 업로드 불가', share(B, 'photo', jpg));
await set(admin.r(`seasons/${sid}/exchange`), 'couple');
await expectDenied('커플 전용 모드에서 커플이 아니면 불가', share(B, 'photo', jpg));
await set(admin.r(`results/${sid}/final/${B.uid}`), { partner: A.uid });
await expectOk('커플 전용 모드에서 최종 커플이면 가능', share(B, 'photo', jpg));
await set(admin.r(`seasons/${sid}/exchange`), 'chat');
await expectOk('서로 사진 올린 뒤 B가 A 사진 열람', get(B.r(`dmShare/${sid}/${room}/${A.uid}/photo`)));
await expectOk('A가 내 사진 내리기', share(A, 'photo', null));
await expectDenied('내린 뒤에는 B도 다시 볼 수 없음(빈 값)', get(B.r(`dmShare/${sid}/${room}/${A.uid}/photo`)).then((s) => { if(!s.exists()) throw new Error('없음'); }));
await expectDenied('C가 남의 대화방 종료', set(C.r(`dmRooms/${sid}/${room}/closed`), true));
await expectOk('B가 대화 종료', set(B.r(`dmRooms/${sid}/${room}/closed`), true));
await expectDenied('종료된 방에 메시지', set(A.r(`dmMsgs/${sid}/${room}/d3`), { uid: A.uid, text: '...', at: TS }));

console.log('\n[슈퍼데이트권]');
await set(A.r(`items/${sid}/${A.uid}_3`), item(A, { kind: 'date', name: '슈퍼데이트권', emoji: '🎟️' }));
await expectDenied('데이트권을 쓰면서 아이템을 안 지움(재사용 시도)', set(A.r(`dmReq/${sid}/${C.uid}/${A.uid}`), { at: TS, ticket: `${A.uid}_3` }));
await expectDenied('남의 아이템을 데이트권으로 사용', update(ref(D.db, 'solo'), { [`dmReq/${sid}/${C.uid}/${D.uid}`]: { at: TS, ticket: `${A.uid}_3` }, [`items/${sid}/${A.uid}_3`]: null }));
await expectOk('A가 데이트권을 사용해 C에게 슈퍼데이트 신청', update(ref(A.db, 'solo'), { [`dmReq/${sid}/${C.uid}/${A.uid}`]: { at: TS, ticket: `${A.uid}_3` }, [`items/${sid}/${A.uid}_3`]: null }));

console.log('\n[시청자 관람석]');
await expectOk('V 시청자 등록', set(V.r(`viewers/${sid}/${V.uid}`), { nick: '과몰입러', at: TS }));
await expectDenied('출연자 A가 시청자로도 등록', set(A.r(`viewers/${sid}/${A.uid}`), { nick: '몰래', at: TS }));
await expectDenied('시청자 V가 출연자로도 등록', join(V, sid, profile('시청자출연', 'M', { status: 'pending' })));
await expectDenied('V가 남을 시청자로 등록', set(V.r(`viewers/${sid}/${G.uid}`), { nick: 'x', at: TS }));
await expectDenied('생중계가 꺼져 있으면 V는 공용 거실 못 봄', get(V.r(`lounge/${sid}`)));
await set(admin.r(`seasons/${sid}/broadcastLounge`), true);
await expectOk('거실 생중계를 켜면 V가 거실 시청', get(V.r(`lounge/${sid}`)));
await expectDenied('V가 거실에 글쓰기(출연자 전용)', set(V.r(`lounge/${sid}/v1`), { uid: V.uid, nick: '과몰입러', text: 'hi', at: TS }));
await expectDenied('V도 1:1 대화는 못 봄', get(V.r(`dmMsgs/${sid}/${room}`)));
await expectDenied('V도 호감 선택은 못 봄', get(V.r(`votes/${sid}`)));

console.log('\n[속마음 인터뷰]');
await expectOk('B가 속마음 인터뷰 남김', set(B.r(`interviews/${sid}/${B.uid}/i1`), { text: '사실 광수님이 신경 쓰여요', at: TS }));
await expectOk('시청자 V가 인터뷰 열람', get(V.r(`interviews/${sid}`)));
await expectDenied('다른 출연자 C가 인터뷰 열람', get(C.r(`interviews/${sid}`)));
await expectDenied('다른 출연자 C가 B 인터뷰 열람', get(C.r(`interviews/${sid}/${B.uid}`)));
await expectOk('B가 자기 인터뷰 열람', get(B.r(`interviews/${sid}/${B.uid}`)));
await expectDenied('C가 B 이름으로 인터뷰', set(C.r(`interviews/${sid}/${B.uid}/i2`), { text: '가짜', at: TS }));

console.log('\n[시청자톡]');
await expectOk('V가 시청자톡에 메시지', set(V.r(`viewerChat/${sid}/t1`), { uid: V.uid, nick: '과몰입러', text: '영숙님 응원해요', at: TS }));
await expectDenied('V가 다른 닉네임으로 사칭', set(V.r(`viewerChat/${sid}/t2`), { uid: V.uid, nick: '제작진', text: '공지', at: TS }));
await expectDenied('출연자 B가 시청자톡 열람(스포일러 방지)', get(B.r(`viewerChat/${sid}`)));
await expectDenied('출연자 B가 시청자톡에 글쓰기', set(B.r(`viewerChat/${sid}/t3`), { uid: B.uid, nick: '영숙', text: 'hi', at: TS }));

console.log('\n[가상 기프티콘]');
const cheer = (c, to, extra) => Object.assign({ from: c.uid, fromNick: '과몰입러', to, gift: 'coffee', msg: '화이팅', at: TS }, extra || {});
await expectOk('V가 B에게 기프티콘(슬롯 0)', set(V.r(`cheers/${sid}/${V.uid}_0`), cheer(V, B.uid)));
await expectOk('V가 슬롯 j(20번째)', set(V.r(`cheers/${sid}/${V.uid}_j`), cheer(V, B.uid, { gift: 'flower' })));
await expectDenied('슬롯 범위 밖(21번째)', set(V.r(`cheers/${sid}/${V.uid}_k`), cheer(V, B.uid)));
await expectDenied('이미 보낸 기프티콘 덮어쓰기', set(V.r(`cheers/${sid}/${V.uid}_0`), cheer(V, C.uid)));
await expectDenied('목록에 없는 기프티콘 종류', set(V.r(`cheers/${sid}/${V.uid}_1`), cheer(V, B.uid, { gift: 'cash' })));
await expectDenied('출연자가 아닌 대상에게', set(V.r(`cheers/${sid}/${V.uid}_1`), cheer(V, V.uid)));
await expectDenied('시청자가 아닌 출연자 C가 기프티콘', set(C.r(`cheers/${sid}/${C.uid}_0`), cheer(C, B.uid)));
await expectOk('출연자 B가 받은 기프티콘 확인', get(B.r(`cheers/${sid}`)));

console.log('\n[친구 소개]');
await expectOk('V가 친구 소개 링크 생성', set(V.r(`referrals/${sid}/${V.uid}`), { by: V.uid, byNick: '과몰입러', role: 'viewer', note: '제 친구 최고예요', at: TS }));
await expectDenied('남의 코드로 소개 링크 생성', set(V.r(`referrals/${sid}/${G.uid}`), { by: V.uid, byNick: '과몰입러', role: 'viewer', at: TS }));
await expectOk('F가 V의 소개로 출연', join(F, sid, profile('영식', 'M', { status: 'pending', ref: V.uid })));
await expectDenied('없는 소개 코드로 출연', join(G, sid, profile('영철', 'M', { status: 'pending', ref: 'nobodyxyz' })));
await expectDenied('F가 소개자 바꾸기', set(F.r(`participants/${sid}/${F.uid}/ref`), C.uid));

console.log('\n[자기어필]');
await expectDenied('자기어필 시간이 아닐 때 어필', set(B.r(`appeals/${sid}/${B.uid}`), { text: '저는요', at: TS }));
await set(admin.r(`seasons/${sid}/appealOpen`), true);
await expectOk('자기어필 시간에 B가 어필(사진 포함)', set(B.r(`appeals/${sid}/${B.uid}`), { text: '주말엔 캠핑 요리사!', photo: jpg, at: TS }));
await expectDenied('C가 B의 어필 수정', set(C.r(`appeals/${sid}/${B.uid}`), { text: '해킹', at: TS }));
await expectDenied('JPEG 아닌 어필 사진', set(C.r(`appeals/${sid}/${C.uid}`), { text: '어필', photo: 'javascript:alert(1)', at: TS }));
await expectOk('시청자 V가 어필에 좋아요', set(V.r(`appealLikes/${sid}/${B.uid}/${V.uid}`), true));
await expectOk('출연자 C가 어필에 좋아요', set(C.r(`appealLikes/${sid}/${B.uid}/${C.uid}`), true));
await expectDenied('B가 자기 어필에 좋아요', set(B.r(`appealLikes/${sid}/${B.uid}/${B.uid}`), true));
await expectDenied('V가 남의 이름으로 좋아요', set(V.r(`appealLikes/${sid}/${B.uid}/${G.uid}`), true));
await expectDenied('참가자가 스포트라이트 지정', set(A.r(`seasons/${sid}/spotlight`), A.uid));
await expectOk('관리자가 스포트라이트 지정', set(admin.r(`seasons/${sid}/spotlight`), B.uid));

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

await update(ref(admin.db, 'solo'), { [`blocked/${V.uid}`]: true });
await expectDenied('차단된 시청자 V가 시청자톡', set(V.r(`viewerChat/${sid}/t9`), { uid: V.uid, nick: '과몰입러', text: '악플', at: TS }));
await expectDenied('차단된 시청자 V가 기프티콘', set(V.r(`cheers/${sid}/${V.uid}_2`), cheer(V, B.uid)));
await expectDenied('차단된 A가 1:1 신청', set(A.r(`dmReq/${sid}/${D.uid}/${A.uid}`), { at: TS }));

console.log(`\n결과: ${passed} 통과, ${failed} 실패`);
await Promise.all([admin, A, B, C, D, V, F, G].map((c) => deleteApp(c.app)));
process.exit(failed ? 1 : 0);
