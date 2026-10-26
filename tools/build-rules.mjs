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
          createdAt: { '.validate': 'newData.isNumber()' },
          $other: NONE,
        },
      },

      // 공개 프로필 (로그인한 사람만 읽기). 비공개 선택 기록과 분리.
      participants: {
        $sid: {
          '.read': 'auth != null',
          $uid: {
            '.write': `${ADMIN} || (auth != null && auth.uid === $uid && ${NOT_BLOCKED} && ${SEASON}.exists() && newData.exists() && (data.exists() ? data.child('status').val() !== 'blocked' : ${SEASON}.child('status').val() !== 'ended'))`,
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
            at: { '.validate': SERVER_TIME },
            $other: NONE,
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
