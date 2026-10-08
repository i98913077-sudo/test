# SAFE INVEST — PHP 호스팅용 (너굴이들 모의투자)

가상 포인트(기본 1억 P)로 하는 교육용 모의투자 게임입니다. **실제 돈·실제 주문·투자 권유·수익 보장은 없습니다.**
Node 서버 없이, **일반 PHP 호스팅에 폴더째 올리면** 돌아갑니다. (`../simgame/` 은 Node 서버판, 규칙은 같습니다)

## 필요한 것
- PHP **8.1 이상**, 확장 `pdo_sqlite`, `mbstring` (대부분의 호스팅에 기본 포함)
- Apache 호스팅이면 `.htaccess`가 자동 적용됩니다. (nginx는 아래 "보안" 참고)

## 올리는 순서 (FTP / 파일 관리자)
1. **`config.php` 를 열어 `admin_password` 를 바꿉니다.** (`CHANGE_ME` 상태에서는 관리자 로그인이 막혀 있습니다)
2. 이 폴더(`simgame-php`)를 통째로 호스팅에 올립니다. 예) `public_html/game/` → 주소 `https://racoonstock.shop/game/`
   (폴더 이름은 마음대로 바꿔도 됩니다. 주소는 모두 상대경로라 하위 폴더에서도 동작합니다)
3. **`data/` 폴더에 쓰기 권한**을 줍니다. (FTP 프로그램에서 폴더 우클릭 → 권한 → `755`, 안 되면 `775`, 그래도 안 되면 `777`)
4. 브라우저로 `https://내주소/game/api.php?r=event` 를 열어 `{"event":null}` 이 보이면 서버는 정상입니다.
   - 오류 메시지가 보이면 그 내용대로 조치하세요. (PHP 버전, 확장 모듈, data 폴더 권한 안내가 나옵니다)
5. `https://내주소/game/admin.html` 로그인 → **새 이벤트 만들기** → 너굴이들이 접속하면 **게임 시작**
6. 홈페이지 메뉴에 링크를 겁니다: `<a href="/game/">너굴이들 모의투자</a>`
   또는 iframe: `<iframe src="/game/" width="100%" height="800"></iframe>` (같은 도메인이면 바로 됩니다)

| 주소 | 용도 |
|---|---|
| `/game/` | 너굴이(참가자) 화면 — 모바일 우선 |
| `/game/ranking.html` | 큰 화면용 실시간 전체 순위 (3초 갱신) |
| `/game/admin.html` | 너굴(운영자) 관리자 |

## 보안
- 관리자 비밀번호는 `config.php` 에만 있습니다. `.htaccess`가 `config.php`, `*.sqlite`, `lib/`, `data/` 의 직접 접근을 막습니다.
- DB 파일은 `data/g_<랜덤>.sqlite` 로 만들어집니다. **가능하면 `config.php` 의 `data_dir` 를 웹에서 접근할 수 없는 폴더(`public_html` 바깥)로 바꾸세요.**
- **nginx 호스팅**은 `.htaccess`가 무시됩니다. 아래 규칙을 서버 설정에 넣거나 호스팅 고객센터에 요청하세요.
  ```
  location ~ ^/game/(lib|data|tests)/ { deny all; }
  location ~ ^/game/config\.php$ { deny all; }
  ```
  (그리고 위의 `data_dir` 를 웹 바깥 폴더로 옮기는 것을 강력히 권장합니다)
- 참가자 개인정보는 닉네임 + 자동 참가코드만 저장합니다. 현금·보유·체결가·순위는 모두 서버가 계산합니다.

## 샘플 가격(DEMO MODE)
- 실제 시세가 아닙니다. 서버가 DB에 저장한 비밀 시드로 만든 가상 가격이며 24시간 움직입니다. `config.php` 의 `demo_volatility` 로 출렁임을 조절합니다.

## 알아둘 점
- 한 번에 이벤트 하나만 진행됩니다. 수십 명 규모의 사용에 맞춰져 있습니다. (SQLite)
- 참가자가 브라우저 저장소를 지우면 같은 계정으로 돌아올 수 없습니다. (개인정보를 받지 않는 설계의 trade-off)
- 요청 제한은 접속 IP 기준입니다. 같은 와이파이 사용자를 고려해 넉넉하게 잡혀 있습니다.

## 테스트 (PHP CLI가 있는 PC에서)
```bash
php tests/run.php      # 게임 규칙 + 실제 PHP 서버 HTTP 검증 25개
```
