# 사이버 나는 SOLO : 초등교사 편

> "교실 밖에서 시작되는 새로운 인연."

초등교사들이 QR코드로 입장해 캐릭터를 만들고, 다른 참가자의 프로필을 둘러보고, 호감 상대를 고르는 사이버 연애 시뮬레이션입니다. 서로 고르면 커플이 됩니다. 기존 홈페이지(`1-9반 안전 특공대`)가 쓰던 **Firebase 프로젝트 `kimkyeongtae-85921`의 Realtime Database를 그대로 재사용**합니다.

## 파일 구성

| 파일 | 내용 |
|---|---|
| `public/index.html` | 새 홈페이지. 게임 시작, QR 입장, 참가 방법, 실시간 기수·참가 현황 |
| `public/solo/index.html` | 게임 입장 페이지 (QR코드가 가리키는 주소) |
| `public/solo/admin.html` | 운영자 페이지 |
| `public/solo/js/solo-core.js` | Firebase 연결(기존 설정 재사용), 익명 로그인, QR 생성, 공용 함수 |
| `public/solo/js/game.js` | 참가자 화면: 캐릭터 생성, 로비, 첫인상 선택, 최종 선택, 아이템, 결과 |
| `public/solo/js/admin.js` | 운영자 화면: 기수, 진행 단계, 승인·숨김·차단, 결과 계산·공개, 공지, 신고, QR |
| `public/solo/css/solo.css` | 디자인 (아이보리 · 와인 · 네이비, 모바일 우선) |
| `public/safety-squad.html` | 기존 홈페이지 원본. 수정 없이 보존했고 홈 하단에 링크가 있습니다 |
| `database.rules.json` | Realtime Database 보안 규칙 (`tools/build-rules.mjs`로 생성) |
| `firebase.json`, `.firebaserc` | Firebase Hosting/Database 배포 설정 (기존 프로젝트 지정) |
| `tests/solo/` | 에뮬레이터 기반 보안 규칙 테스트, 브라우저 종단 테스트 |

## 기존 Firebase 분석 결과

- 기존 홈페이지는 HTML 파일 하나에 `FIREBASE_CONFIG`를 넣어 compat SDK 10.12.2로 **Realtime Database만** 씁니다. 경로는 `rooms/`와 `leaderboard/` 두 곳입니다.
- Authentication은 쓰지 않습니다. 2026-10-26에 API로 확인했을 때 `CONFIGURATION_NOT_FOUND`가 나왔고, 이 프로젝트에는 아직 Authentication이 설정돼 있지 않습니다.
- Firestore, Hosting 설정, 보안 규칙 파일, 환경변수는 저장소에 없었습니다.
- 그래서 새 Firebase 서비스는 도입하지 않았습니다. **같은 Realtime Database의 `solo/` 아래에만** 게임 데이터를 저장합니다. 꼭 필요한 Authentication(익명 로그인)만 켜면 됩니다.

### 데이터 구조 (`solo/`)

```
admins/{uid}: true                     운영자. 콘솔에서만 추가 가능
blocked/{uid}: true                    차단된 사용자
config/currentSeason, config/entryUrl  현재 기수, QR에 넣을 실제 배포 주소
seasons/{sid}                          기수 정보 (모집 상태, 진행 단계, 선택 인원, 마감 시각, 공개 여부)
participants/{sid}/{uid}               공개 프로필 (닉네임, 연령대, 성별, 성격, 취미, 자기소개, 캐릭터, 승인 상태)
nicknames/{sid}/{닉네임}: uid          닉네임 중복 방지
votes/{sid}/{uid}/{0..2}: 상대uid      첫인상 선택 (비공개)
finalChoices/{sid}/{uid}               최종 선택 (비공개)
results/{sid}/first|final/{uid}        개인 결과 (공개 후 본인만 열람)
results/{sid}/couples                  커플 목록 (공개 후 참가자 열람)
announcements/{sid}                    공지사항
reports/{sid}                          신고 (운영자만 열람)
items/{sid}/{만든사람uid}_{0..9}       참가자가 만든 아이템 (1인 최대 10개, 선물로 소유자 이동)
```

실명, 학교명, 전화번호는 수집하지 않습니다. 보안 규칙도 정해진 필드 외의 값은 저장을 거부합니다.

## 처음 한 번 해야 할 설정 (Firebase 콘솔)

1. **익명 로그인 켜기**: Firebase 콘솔 → Authentication → 시작하기 → Sign-in method → *익명* 사용 설정. 운영자용으로 *Google*도 함께 켜기를 권장합니다.
2. **보안 규칙 적용**: Realtime Database → 규칙에 `database.rules.json` 내용을 붙여넣고 게시합니다. 또는 `firebase deploy --only database`로 배포합니다.
   - 붙여넣기 전에 **지금 규칙과 데이터 탭의 최상위 노드를 확인하세요.** 새 규칙은 `rooms`와 `leaderboard`를 기존처럼 로그인 없이 쓸 수 있게 열어 두고, 그 외 경로는 `solo/` 규칙대로만 허용합니다. 다른 최상위 노드를 쓰는 앱이 있다면 그 경로 규칙도 추가해야 합니다.
3. **운영자 등록**: `…/solo/admin.html`을 엽니다. Google 로그인을 권장합니다. 화면에 나온 **UID**를 복사한 뒤 콘솔 → Realtime Database → 데이터에서 `solo/admins/<UID>`에 `true`를 추가하고 새로고침합니다. 운영자 권한은 앱 안에서 스스로 부여할 수 없습니다.
4. **배포**: `public/` 폴더를 지금 홈페이지가 올라가 있는 곳에 올립니다. Firebase Hosting을 쓴다면 `firebase deploy --only hosting`으로 배포합니다.
   - Google 로그인을 쓴다면 배포 도메인을 Authentication → 설정 → 승인된 도메인에 추가하세요. Firebase Hosting 도메인은 자동으로 추가됩니다.
5. **QR코드**: 운영자 페이지 하단 "게임 접속 QR코드"에서 **실제 배포 주소**(`https://…/solo/`)를 확인하고 저장합니다. 그다음 PNG를 다운로드하거나 인쇄합니다. localhost, 내부망, http 주소는 저장할 수 없습니다(규칙과 화면에서 모두 차단). 주소가 바뀌면 다시 저장하면 QR도 새로 만들어집니다.

## 진행 방법 (운영자)

1. 기수 만들기: 이름, 첫인상 선택 인원(1~3명), 승인제 여부 설정
2. QR 공유 → 참가자 입장 및 캐릭터 생성 (승인제라면 참가자 관리에서 승인)
3. `첫인상 선택 시작` → (마감 시각을 정했다면 자동 마감) `첫인상 마감` → `첫인상 결과 계산·공개`
4. `최종 선택 시작` → `최종 선택 마감` → `최종 결과 계산·공개` (기수 자동 종료)

결과는 운영자 브라우저가 **DB에 저장된 실제 선택 기록**으로 계산합니다. 선택 단계가 닫히면 보안 규칙이 서버에서 선택 변경을 막으므로 결과가 바뀌지 않습니다. 각 참가자의 선택은 한 노드에 덮어쓰는 구조라 중복 제출이나 동시 요청이 있어도 1인 1기록입니다. 결과는 여러 경로를 한 번에 쓰는 원자적 업데이트로 기록합니다.

## 아이템

참가자는 아이템 탭에서 아이콘, 종류(선물/편지/데이트권/기타), 이름, 설명을 정해 아이템을 직접 만들 수 있습니다(1인 최대 10개). 만든 아이템은 메시지와 함께 다른 참가자에게 선물할 수 있습니다. 받은 사람은 그 아이템을 다시 선물하거나 버릴 수 있습니다. 이름, 만든 사람, 보낸 사람은 위조할 수 없도록 규칙으로 검증합니다. 아이템과 선물 기록은 같은 기수 참가자에게 보일 수 있다고 화면에 안내합니다.

## 테스트

```bash
cd tests/solo && npm install
npm run emulators                       # 터미널 1: Auth·Database 에뮬레이터 (Java 필요)
python3 -m http.server 8080 --bind 127.0.0.1 --directory ../../public   # 터미널 2
npm run test:rules                      # 보안 규칙 75개 항목
npm run test:e2e                        # 운영자 1 + 참가자 3 브라우저 시나리오 43개 항목 (Playwright)
```

`localhost`에서 `?emu=1`을 붙여 열면 에뮬레이터에 연결됩니다(예: `http://127.0.0.1:8080/solo/?emu=1`). 배포 주소에서는 이 옵션이 동작하지 않습니다.

## 확인 결과 (2026-10-26)

| 항목 | 결과 |
|---|---|
| 기존 Firebase 프로젝트와 연결 | ⚠️ 코드는 기존 설정을 그대로 재사용함. 작업 환경 네트워크에서 `*.firebaseio.com`이 차단돼 **실서버 연결은 확인하지 못함**. 이 프로젝트는 Auth가 아직 설정되지 않아 위 1번 설정이 필요함 |
| QR코드로 공개 입장 페이지 접속 | ⚠️ QR 디코딩 결과가 입장 주소와 같음(에뮬레이터 환경). **실제 배포 주소와 휴대폰 스캔은 테스트하지 못함** |
| 캐릭터 생성·저장 | ✅ 에뮬레이터 |
| 여러 사용자가 각 기기에서 목록 확인 | ✅ 브라우저 컨텍스트 3개(별도 익명 계정)로 확인 |
| 호감 선택이 DB에 저장 | ✅ |
| 중복·자기 자신·초과·마감 후 선택 차단 | ✅ 화면과 보안 규칙 모두 |
| 서로 선택했을 때만 커플 | ✅ |
| 다른 참가자의 비공개 선택 무단 조회 차단 | ✅ 브라우저 콘솔에서 직접 요청해도 거부 |
| 관리자가 아닌 사용자의 관리자 기능 실행 차단 | ✅ 규칙에서 거부 |
| 모바일 화면 | ✅ iPhone 13 크기 에뮬레이션, 가로 스크롤 없음. 실기기는 미확인 |
