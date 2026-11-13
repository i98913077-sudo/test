// database.rules.json 생성기 — `node tools/build-rules.mjs` 로 다시 만든다.
// Realtime Database 규칙에는 함수가 없어서 같은 조건식을 여러 번 써야 하므로,
// 여기서 조립해 JSON으로 내보낸다. 결과 파일은 Firebase 콘솔 > Realtime Database > 규칙에 붙여넣거나
// `firebase deploy --only database` 로 배포한다.
import { writeFileSync } from 'node:fs';

const ADMIN = "(auth != null && root.child('solo/admins/' + auth.uid).val() === true)";
const NOT_BLOCKED = "!root.child('solo/blocked/' + auth.uid).exists()";
const SEASON = "root.child('solo/seasons/' + $sid)";
const PART = (uidExpr) => `root.child('solo/participants/' + $sid + '/' + ${uidExpr})`;
const ME_APPROVED = `${PART('auth.uid')}.child('status').val() === 'approved'`;
const TARGET_APPROVED = `${PART('newData.val()')}.child('status').val() === 'approved'`;
const str = (min, max) => `newData.isString() && newData.val().length >= ${min} && newData.val().length <= ${max}`;
const NO_KEY_CHARS = "!newData.val().contains('.') && !newData.val().contains('#') && !newData.val().contains('$') && !newData.val().contains('[') && !newData.val().contains(']') && !newData.val().contains('/')";
const SERVER_TIME = 'newData.isNumber() && newData.val() === now';
const IMMUTABLE = '(!data.exists() || newData.val() === data.val())';
const deadlineOpen = (field) => `(!${SEASON}.child('${field}').exists() || ${SEASON}.child('${field}').val() === 0 || now < ${SEASON}.child('${field}').val())`;
const NONE = { '.validate': false };
const CHAT_OPEN = `${SEASON}.child('chatOpen').val() !== false`;
const ROOM = "root.child('solo/dmRooms/' + $sid + '/' + $room)";
const MEMBER = `auth != null && (${ROOM}.child('a').val() === auth.uid || ${ROOM}.child('b').val() === auth.uid)`;
const OTHER = `(${ROOM}.child('a').val() === auth.uid ? ${ROOM}.child('b').val() : ${ROOM}.child('a').val())`;
const ROOM_OPEN = `${ROOM}.child('closed').val() !== true`;
// 연락처·사진 교환 허용 범위: 'chat'(1:1 대화방에서 언제나, 기본) | 'couple'(최종 커플끼리만) | 'off'
const EXCHANGE_OK = `${SEASON}.child('exchange').val() !== 'off' && (${SEASON}.child('exchange').val() !== 'couple' || root.child('solo/results/' + $sid + '/final/' + auth.uid + '/partner').val() === ${OTHER})`;
const ACTIVE = `${NOT_BLOCKED} && ${ME_APPROVED}`;
const MY_NICK = `${PART('auth.uid')}.child('nick').val()`;
const VIEWER = "(auth != null && root.child('solo/viewers/' + $sid + '/' + auth.uid).exists())";
const JPEG = "newData.isString() && newData.val().beginsWith('data:image/jpeg;base64,') && newData.val().length <= 400000";
// 가상 기프티콘 종류 (실제 결제 없음)
const GIFTS = 'coffee|cake|flower|chicken|icecream|ring|letter|star';

// 첫인상 선택 칸: $slot 은 0~2, 시즌 picks 수만큼만, 서로 다른 상대만.
const slotRule = [
  "$slot.matches(/^[0-2]$/)",
  `($slot === '0' || ($slot === '1' && ${SEASON}.child('picks').val() >= 2) || ($slot === '2' && ${SEASON}.child('picks').val() >= 3))`,
  'newData.isString()',
  'newData.val() !== $uid',
  TARGET_APPROVED,
  "($slot === '0' || newData.parent().child('0').val() !== newData.val())",
  "($slot === '1' || newData.parent().child('1').val() !== newData.val())",
  "($slot === '2' || newData.parent().child('2').val() !== newData.val())",
].join(' && ');

const rules = {
  rules: {
    // ── 같은 DB를 쓰는 기존 게임들 (로그인 없이 사용 중이므로 기존 동작 유지) ──
    // 콘솔 데이터 탭에서 확인된 최상위 노드: rooms, leaderboard, last1rooms, stopGameRooms
    rooms: { '.read': true, '.write': true },
    leaderboard: { '.read': true, '.write': true },
    last1rooms: { '.read': true, '.write': true },
    stopGameRooms: { '.read': true, '.write': true },

    // ── 사이버 나는 SOLO ──
    solo: {
      // 관리자 목록: 앱에서는 절대 쓸 수 없고 Firebase 콘솔에서만 추가한다.
      admins: { $uid: { '.read': 'auth != null && auth.uid === $uid', '.write': false } },
      blocked: {
        '.read': ADMIN,
        $uid: { '.read': 'auth != null && auth.uid === $uid', '.write': ADMIN, '.validate': 'newData.isBoolean()' },
      },
      config: {
        '.read': true,
        '.write': ADMIN,
        currentSeason: { '.validate': str(1, 40) },
        entryUrl: { '.validate': `${str(8, 300)} && newData.val().beginsWith('https://')` },
        $other: NONE,
      },
      seasons: {
        '.read': true,
        $sid: {
          '.write': ADMIN,
          '.validate': "newData.hasChildren(['name', 'status', 'phase', 'picks', 'createdAt'])",
          name: { '.validate': str(1, 40) },
          status: { '.validate': "newData.isString() && newData.val().matches(/^(recruiting|running|ended)$/)" },
          phase: { '.validate': "newData.isString() && newData.val().matches(/^(lobby|first|break|final|closed)$/)" },
          picks: { '.validate': 'newData.isNumber() && newData.val() >= 1 && newData.val() <= 3' },
          requireApproval: { '.validate': 'newData.isBoolean()' },
          firstEndsAt: { '.validate': 'newData.isNumber()' },
          finalEndsAt: { '.validate': 'newData.isNumber()' },
          firstRevealed: { '.validate': 'newData.isBoolean()' },
          resultsPublished: { '.validate': 'newData.isBoolean()' },
          chatOpen: { '.validate': 'newData.isBoolean()' },
          viewersOpen: { '.validate': 'newData.isBoolean()' },
          broadcastLounge: { '.validate': 'newData.isBoolean()' },
          appealOpen: { '.validate': 'newData.isBoolean()' },
          spotlight: { '.validate': str(0, 128) },
          exchange: { '.validate': "newData.isString() && newData.val().matches(/^(chat|couple|off)$/)" },
          createdAt: { '.validate': 'newData.isNumber()' },
          $other: NONE,
        },
      },

      // 공개 프로필 (로그인한 사람만 읽기). 비공개 선택 기록과 분리.
      participants: {
        $sid: {
          '.read': 'auth != null',
          $uid: {
            '.write': `${ADMIN} || (auth != null && auth.uid === $uid && ${NOT_BLOCKED} && ${SEASON}.exists() && newData.exists() && (data.exists() ? data.child('status').val() !== 'blocked' : (${SEASON}.child('status').val() !== 'ended' && !root.child('solo/viewers/' + $sid + '/' + auth.uid).exists())))`,
            '.validate': "newData.hasChildren(['nick', 'age', 'gender', 'lookingFor', 'intro', 'avatar', 'status', 'createdAt'])",
            nick: {
              '.validate': `${str(2, 12)} && ${NO_KEY_CHARS} && ${IMMUTABLE} && newData.parent().parent().parent().parent().child('nicknames/' + $sid + '/' + newData.val().toLowerCase()).val() === $uid`,
            },
            age: { '.validate': str(1, 12) },
            gender: { '.validate': "newData.isString() && newData.val().matches(/^(M|F)$/)" },
            lookingFor: { '.validate': "newData.isString() && newData.val().matches(/^(M|F|A)$/)" },
            personality: { '.validate': str(0, 40) },
            hobby: { '.validate': str(0, 40) },
            intro: { '.validate': str(1, 300) },
            ideal: { '.validate': str(0, 100) },
            style: { '.validate': str(0, 40) },
            // 이전 기수에서 이어진 출연자 표시 (운영자만 기록)
            fromSeason: { '.validate': `${str(1, 40)} && (${ADMIN} || (data.exists() && newData.val() === data.val()))` },
            // 친구 소개로 들어온 경우 소개한 사람의 추천 코드
            ref: { '.validate': `newData.isString() && ${IMMUTABLE} && newData.val() !== $uid && root.child('solo/referrals/' + $sid + '/' + newData.val()).exists()` },
            avatar: {
              '.validate': "newData.hasChildren(['emoji', 'color'])",
              emoji: { '.validate': str(1, 8) },
              color: { '.validate': "newData.isString() && newData.val().matches(/^#[0-9a-fA-F]{6}$/)" },
              $other: NONE,
            },
            status: {
              '.validate': `newData.isString() && newData.val().matches(/^(pending|approved|hidden|blocked)$/) && (${ADMIN} || (data.exists() ? newData.val() === data.val() : newData.val() === (${SEASON}.child('requireApproval').val() === true ? 'pending' : 'approved')))`,
            },
            createdAt: { '.validate': `newData.isNumber() && (data.exists() ? newData.val() === data.val() : newData.val() === now)` },
            $other: NONE,
          },
        },
      },

      // 닉네임 중복 방지: 프로필을 처음 만들 때 같은 업데이트로만 예약할 수 있다.
      nicknames: {
        $sid: {
          '.read': 'auth != null',
          $key: {
            '.write': `${ADMIN} || (auth != null && !data.exists() && ${NOT_BLOCKED} && !${PART('auth.uid')}.exists())`,
            '.validate': `newData.isString() && (${ADMIN} || (newData.val() === auth.uid && newData.parent().parent().parent().child('participants/' + $sid + '/' + auth.uid + '/nick').val().toLowerCase() === $key))`,
          },
        },
      },

      // 첫인상 호감 선택: 본인과 관리자만 읽기. 'first' 단계 + 마감 전에만 쓰기.
      votes: {
        $sid: {
          '.read': ADMIN,
          $uid: {
            '.read': `${ADMIN} || (auth != null && auth.uid === $uid)`,
            '.write': `auth != null && auth.uid === $uid && ${NOT_BLOCKED} && ${ME_APPROVED} && ${SEASON}.child('phase').val() === 'first' && ${deadlineOpen('firstEndsAt')}`,
            $slot: { '.validate': slotRule },
            updatedAt: { '.validate': SERVER_TIME },
          },
        },
      },

      // 최종 선택: 본인과 관리자만 읽기. 'final' 단계 + 마감 전에만 쓰기.
      finalChoices: {
        $sid: {
          '.read': ADMIN,
          $uid: {
            '.read': `${ADMIN} || (auth != null && auth.uid === $uid)`,
            '.write': `auth != null && auth.uid === $uid && ${NOT_BLOCKED} && ${ME_APPROVED} && ${SEASON}.child('phase').val() === 'final' && ${deadlineOpen('finalEndsAt')}`,
            '.validate': "newData.hasChildren(['target', 'at'])",
            target: { '.validate': `newData.isString() && newData.val() !== $uid && ${TARGET_APPROVED}` },
            at: { '.validate': SERVER_TIME },
            $other: NONE,
          },
        },
      },

      // 결과: 관리자가 실제 선택 기록으로 계산해 기록. 공개 플래그가 켜진 뒤 본인 것만 읽기.
      results: {
        $sid: {
          '.read': ADMIN,
          '.write': ADMIN,
          first: { $uid: { '.read': `${ADMIN} || (auth != null && auth.uid === $uid && ${SEASON}.child('firstRevealed').val() === true)` } },
          final: { $uid: { '.read': `${ADMIN} || (auth != null && auth.uid === $uid && ${SEASON}.child('resultsPublished').val() === true)` } },
          couples: { '.read': `${ADMIN} || (auth != null && ${SEASON}.child('resultsPublished').val() === true)` },
        },
      },

      announcements: {
        $sid: {
          '.read': true,
          $id: {
            '.write': ADMIN,
            '.validate': "newData.hasChildren(['text', 'at'])",
            text: { '.validate': str(1, 300) },
            at: { '.validate': 'newData.isNumber()' },
            $other: NONE,
          },
        },
      },

      reports: {
        $sid: {
          '.read': ADMIN,
          $id: {
            '.write': `${ADMIN} || (auth != null && !data.exists() && ${NOT_BLOCKED})`,
            '.validate': `${ADMIN} || newData.hasChildren(['from', 'target', 'reason', 'at'])`,
            from: { '.validate': 'newData.val() === auth.uid' },
            target: { '.validate': str(1, 128) },
            reason: { '.validate': str(1, 200) },
            room: { '.validate': str(1, 300) },
            at: { '.validate': SERVER_TIME },
            $other: NONE,
          },
        },
      },

      // ── 채팅 ──
      // 공용 거실: 승인된 참가자 전체 대화방. 닉네임은 본인 프로필과 같아야 한다(사칭 방지).
      lounge: {
        $sid: {
          '.read': `${ADMIN} || (auth != null && ${ME_APPROVED}) || (${VIEWER} && ${SEASON}.child('broadcastLounge').val() === true)`,
          $id: {
            '.write': `${ADMIN} || (auth != null && !data.exists() && ${ACTIVE} && ${CHAT_OPEN})`,
            '.validate': "newData.hasChildren(['uid', 'nick', 'text', 'at'])",
            uid: { '.validate': 'newData.val() === auth.uid' },
            nick: { '.validate': `${str(1, 12)} && (${ADMIN} ? true : newData.val() === ${MY_NICK})` },
            emoji: { '.validate': str(0, 8) },
            staff: { '.validate': `newData.isBoolean() && ${ADMIN}` },
            text: { '.validate': str(1, 300) },
            at: { '.validate': SERVER_TIME },
            $other: NONE,
          },
        },
      },

      // 1:1 데이트 대화 신청: dmReq/{sid}/{받는사람}/{보낸사람}
      dmReq: {
        $sid: {
          $to: {
            '.read': 'auth != null && auth.uid === $to',
            $from: {
              '.read': 'auth != null && auth.uid === $from',
              '.write': `${ADMIN} || (auth != null && auth.uid === $from && $to !== $from && newData.exists() && ${ACTIVE} && ${CHAT_OPEN} && ${PART('$to')}.child('status').val() === 'approved') || (auth != null && (auth.uid === $to || auth.uid === $from) && !newData.exists())`,
              '.validate': "newData.hasChildren(['at'])",
              msg: { '.validate': str(0, 80) },
              // 슈퍼데이트권: 내가 가진 '데이트권' 아이템을 같은 업데이트로 사용(삭제)해야 한다.
              ticket: { '.validate': "newData.isString() && root.child('solo/items/' + $sid + '/' + newData.val() + '/owner').val() === auth.uid && root.child('solo/items/' + $sid + '/' + newData.val() + '/kind').val() === 'date' && !newData.parent().parent().parent().parent().parent().child('items/' + $sid + '/' + newData.val()).exists()" },
              at: { '.validate': SERVER_TIME },
              $other: NONE,
            },
          },
        },
      },

      // 1:1 대화방: 신청을 받은 사람이 수락할 때만 만들 수 있다. 방 ID = 'uidA__uidB' (사전순)
      dmRooms: {
        $sid: {
          $room: {
            '.read': `${ADMIN} || ${MEMBER}`,
            '.write': `${ADMIN} || (auth != null && !data.exists() && ${ACTIVE} && ${CHAT_OPEN} && ((newData.child('a').val() === auth.uid && root.child('solo/dmReq/' + $sid + '/' + auth.uid + '/' + newData.child('b').val()).exists()) || (newData.child('b').val() === auth.uid && root.child('solo/dmReq/' + $sid + '/' + auth.uid + '/' + newData.child('a').val()).exists())))`,
            '.validate': `newData.hasChildren(['a', 'b', 'createdAt']) && $room === newData.child('a').val() + '__' + newData.child('b').val() && newData.child('a').val() < newData.child('b').val()`,
            a: { '.validate': `${IMMUTABLE} && ${PART('newData.val()')}.child('status').val() === 'approved'` },
            b: { '.validate': `${IMMUTABLE} && ${PART('newData.val()')}.child('status').val() === 'approved'` },
            createdAt: { '.validate': `newData.isNumber() && (data.exists() ? newData.val() === data.val() : newData.val() === now)` },
            closed: { '.write': MEMBER, '.validate': 'newData.isBoolean()' },
            $other: NONE,
          },
        },
      },

      // 내 대화방 목록 (본인만 읽기). 방 수락과 같은 업데이트로 양쪽에 기록된다.
      myRooms: {
        $sid: {
          $uid: {
            '.read': 'auth != null && auth.uid === $uid',
            $room: {
              '.write': `${ADMIN} || (auth != null && (auth.uid === $uid ? true : newData.exists()) && (newData.parent().parent().parent().parent().child('dmRooms/' + $sid + '/' + $room + '/a').val() === auth.uid || newData.parent().parent().parent().parent().child('dmRooms/' + $sid + '/' + $room + '/b').val() === auth.uid) && (newData.parent().parent().parent().parent().child('dmRooms/' + $sid + '/' + $room + '/a').val() === $uid || newData.parent().parent().parent().parent().child('dmRooms/' + $sid + '/' + $room + '/b').val() === $uid))`,
              '.validate': 'newData.val() === true',
            },
          },
        },
      },

      // 1:1 대화 메시지: 두 사람만 읽고 쓴다. 신고 처리를 위해 운영자도 읽을 수 있다(화면에 안내).
      dmMsgs: {
        $sid: {
          $room: {
            '.read': `${ADMIN} || ${MEMBER}`,
            $id: {
              '.write': `${ADMIN} || (${MEMBER} && !data.exists() && ${ACTIVE} && ${CHAT_OPEN} && ${ROOM_OPEN})`,
              '.validate': "newData.hasChildren(['uid', 'text', 'at'])",
              uid: { '.validate': 'newData.val() === auth.uid' },
              text: { '.validate': str(1, 500) },
              at: { '.validate': SERVER_TIME },
              $other: NONE,
            },
          },
        },
      },

      // 읽음 표시 (본인만)
      dmRead: {
        $sid: { $uid: { '.read': 'auth != null && auth.uid === $uid', '.write': 'auth != null && auth.uid === $uid', $room: { '.validate': 'newData.isNumber()' } } },
      },

      // 연락처·사진 교환: 내 것을 올려야만 상대 것을 볼 수 있다(서로 올린 경우에만 교환).
      // 운영자도 내용은 읽을 수 없고, 부적절한 경우 삭제만 할 수 있다.
      dmShare: {
        $sid: {
          $room: {
            $uid: {
              $kind: {
                '.read': `auth != null && (auth.uid === $uid || (${MEMBER} && root.child('solo/dmShare/' + $sid + '/' + $room + '/' + auth.uid + '/' + $kind).exists()))`,
                '.write': `(${ADMIN} && !newData.exists()) || (auth != null && auth.uid === $uid && ${MEMBER} && (!newData.exists() || (${ACTIVE} && ${ROOM_OPEN} && ${EXCHANGE_OK})))`,
                '.validate': `($kind === 'contact' && ${str(1, 100)}) || ($kind === 'photo' && newData.isString() && newData.val().beginsWith('data:image/jpeg;base64,') && newData.val().length <= 400000)`,
              },
            },
          },
        },
      },
      // 교환 상태(누가 올렸는지)만 두 사람이 볼 수 있다. 실제 값은 위 dmShare.
      dmShareState: {
        $sid: {
          $room: {
            '.read': MEMBER,
            $uid: {
              '.write': `(${ADMIN} && !newData.exists()) || (auth != null && auth.uid === $uid && ${MEMBER})`,
              contact: { '.validate': 'newData.val() === true' },
              photo: { '.validate': 'newData.val() === true' },
              $other: NONE,
            },
          },
        },
      },

      // ── 시청자 ──
      // 관람석 등록. 출연자와 시청자는 같은 기기(계정)로 겸할 수 없다(속마음 인터뷰 보호).
      viewers: {
        $sid: {
          '.read': 'auth != null',
          $uid: {
            '.write': `${ADMIN} || (auth != null && auth.uid === $uid && newData.exists() && ${NOT_BLOCKED} && ${SEASON}.exists() && ${SEASON}.child('viewersOpen').val() !== false && !${PART('auth.uid')}.exists())`,
            '.validate': "newData.hasChildren(['nick', 'at'])",
            nick: { '.validate': `${str(1, 12)} && ${NO_KEY_CHARS}` },
            at: { '.validate': `newData.isNumber() && (data.exists() ? newData.val() === data.val() : newData.val() === now)` },
            $other: NONE,
          },
        },
      },

      // 시청자 전용 톡 (출연자는 읽을 수 없음)
      viewerChat: {
        $sid: {
          '.read': `${ADMIN} || ${VIEWER}`,
          $id: {
            '.write': `${ADMIN} || (${VIEWER} && !data.exists() && ${NOT_BLOCKED} && ${CHAT_OPEN})`,
            '.validate': "newData.hasChildren(['uid', 'nick', 'text', 'at'])",
            uid: { '.validate': 'newData.val() === auth.uid' },
            nick: { '.validate': `${str(1, 12)} && (${ADMIN} ? true : newData.val() === root.child('solo/viewers/' + $sid + '/' + auth.uid + '/nick').val())` },
            staff: { '.validate': `newData.isBoolean() && ${ADMIN}` },
            text: { '.validate': str(1, 200) },
            at: { '.validate': SERVER_TIME },
            $other: NONE,
          },
        },
      },

      // 가상 기프티콘 (실제 결제 없음): 시청자 1인당 기수별 최대 20개. ID = '<시청자uid>_<0-9a-j>'
      cheers: {
        $sid: {
          '.read': 'auth != null',
          $id: {
            '.write': `(${ADMIN} && !newData.exists()) || (${VIEWER} && !data.exists() && ${NOT_BLOCKED} && $id.beginsWith(auth.uid + '_') && $id.length === auth.uid.length + 2 && $id.matches(/_[0-9a-j]$/))`,
            '.validate': "newData.hasChildren(['from', 'fromNick', 'to', 'gift', 'at'])",
            from: { '.validate': 'newData.val() === auth.uid' },
            fromNick: { '.validate': str(1, 12) },
            to: { '.validate': `newData.isString() && ${TARGET_APPROVED}` },
            gift: { '.validate': `newData.isString() && newData.val().matches(/^(${GIFTS})$/)` },
            msg: { '.validate': str(0, 60) },
            at: { '.validate': SERVER_TIME },
            $other: NONE,
          },
        },
      },

      // 친구 소개: 추천 코드 = 소개하는 사람의 uid. 소개받은 친구의 프로필에 추천사가 표시된다.
      referrals: {
        $sid: {
          '.read': 'auth != null',
          $code: {
            '.write': `${ADMIN} || (auth != null && $code === auth.uid && newData.exists() && ${NOT_BLOCKED} && (${VIEWER} || ${PART('auth.uid')}.exists()))`,
            '.validate': "newData.hasChildren(['by', 'byNick', 'role', 'at'])",
            by: { '.validate': 'newData.val() === auth.uid' },
            byNick: { '.validate': str(1, 12) },
            role: { '.validate': "newData.isString() && newData.val().matches(/^(viewer|participant)$/)" },
            note: { '.validate': str(0, 100) },
            at: { '.validate': SERVER_TIME },
            $other: NONE,
          },
        },
      },

      // 자기어필 시간: 운영자가 열어 둔 동안 출연자가 소개글(선택: 사진)을 올린다. 출연자·시청자 모두 볼 수 있다.
      appeals: {
        $sid: {
          '.read': 'auth != null',
          $uid: {
            '.write': `${ADMIN} || (auth != null && auth.uid === $uid && (!newData.exists() || (${ACTIVE} && ${SEASON}.child('appealOpen').val() === true)))`,
            '.validate': "newData.hasChildren(['text', 'at'])",
            text: { '.validate': str(1, 500) },
            photo: { '.validate': JPEG },
            at: { '.validate': SERVER_TIME },
            $other: NONE,
          },
        },
      },
      appealLikes: {
        $sid: {
          '.read': 'auth != null',
          $target: {
            $liker: {
              '.write': `auth != null && auth.uid === $liker && $target !== $liker && (!newData.exists() || (${NOT_BLOCKED} && (${VIEWER} || ${ME_APPROVED}) && ${PART('$target')}.child('status').val() === 'approved'))`,
              '.validate': 'newData.val() === true',
            },
          },
        },
      },

      // 속마음 인터뷰: 출연자가 남기면 시청자와 운영자만 본다(다른 출연자는 볼 수 없음).
      interviews: {
        $sid: {
          '.read': `${ADMIN} || ${VIEWER}`,
          $uid: {
            '.read': 'auth != null && auth.uid === $uid',
            $id: {
              '.write': `${ADMIN} || (auth != null && auth.uid === $uid && (!newData.exists() || (!data.exists() && ${ACTIVE})))`,
              '.validate': "newData.hasChildren(['text', 'at'])",
              text: { '.validate': str(1, 300) },
              at: { '.validate': SERVER_TIME },
              $other: NONE,
            },
          },
        },
      },

      // 아이템: 참가자가 직접 만들고(1인 최대 10개) 다른 참가자에게 선물할 수 있다.
      // 아이템 ID는 '<만든사람uid>_<0~9>' 형식이라 개수 제한을 규칙만으로 강제한다.
      items: {
        $sid: {
          '.read': 'auth != null',
          $itemId: {
            '.write': `${ADMIN} || (auth != null && ${NOT_BLOCKED} && ${ME_APPROVED} && (data.exists() ? data.child('owner').val() === auth.uid : ($itemId.beginsWith(auth.uid + '_') && $itemId.length === auth.uid.length + 2 && $itemId.matches(/_[0-9]$/))))`,
            '.validate': "newData.hasChildren(['creator', 'owner', 'name', 'emoji', 'kind', 'createdAt'])",
            creator: { '.validate': `${IMMUTABLE} && (data.exists() || newData.val() === auth.uid)` },
            creatorNick: { '.validate': `${str(1, 12)} && ${IMMUTABLE}` },
            name: { '.validate': `${str(1, 20)} && ${IMMUTABLE}` },
            emoji: { '.validate': `${str(1, 8)} && ${IMMUTABLE}` },
            kind: { '.validate': `newData.isString() && newData.val().matches(/^(gift|letter|date|etc)$/) && ${IMMUTABLE}` },
            desc: { '.validate': `${str(0, 80)} && ${IMMUTABLE}` },
            createdAt: { '.validate': `newData.isNumber() && (data.exists() ? newData.val() === data.val() : newData.val() === now)` },
            owner: {
              '.validate': `newData.isString() && (${ADMIN} || (data.exists() ? (newData.val() === data.val() || (newData.val() !== auth.uid && ${TARGET_APPROVED})) : newData.val() === auth.uid))`,
            },
            gift: {
              '.validate': `${ADMIN} || newData.hasChildren(['from', 'fromNick', 'at'])`,
              from: { '.validate': 'newData.val() === auth.uid' },
              fromNick: { '.validate': str(1, 12) },
              msg: { '.validate': str(0, 80) },
              at: { '.validate': SERVER_TIME },
              $other: NONE,
            },
            $other: NONE,
          },
        },
      },
    },
  },
};

const out = new URL('../database.rules.json', import.meta.url);
writeFileSync(out, JSON.stringify(rules, null, 2) + '\n');
console.log('wrote', out.pathname);
