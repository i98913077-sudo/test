# Threads 키워드 자동 댓글 봇

Threads에서 `주식책`, `책추천` 같은 키워드로 최근 글을 검색해서 자동으로 댓글을 다는 봇입니다.
Meta 공식 **Threads API**를 사용합니다. 댓글은 두 가지 방식으로 만들 수 있어요.

- **템플릿 모드** (기본): 키워드별로 미리 써둔 댓글 중 하나를 랜덤으로 골라 답니다.
- **AI 모드** (Grok 봇처럼): Claude가 글 내용을 읽고 그 글에 맞는 댓글을 직접 씁니다. 댓글을 달기 어색한 글이면 알아서 건너뜁니다.

## 1. 설치

```bash
cd threads-bot
pip install -r requirements.txt
cp config.example.json config.json
cp .env.example .env
```

## 2. Threads 액세스 토큰 발급

1. https://developers.facebook.com 에서 앱 만들기 → 사용 사례에서 **"Threads API 액세스"** 선택
2. 권한 추가: `threads_basic`, `threads_content_publish`, `threads_manage_replies`, `threads_keyword_search`
3. 앱 설정 → Threads 테스터에 내 Threads 계정 추가 → Threads 앱(설정 > 계정 > 웹사이트 권한)에서 초대 수락
4. 그래프 API 탐색기(또는 Threads 사용 사례의 "토큰 생성")에서 사용자 액세스 토큰 발급
5. 장기 토큰(60일)으로 교환한 뒤 `.env`의 `THREADS_ACCESS_TOKEN`에 넣기

```bash
python bot.py --whoami   # "로그인 계정: @내아이디" 가 나오면 성공
```

> ⚠️ **중요:** `threads_keyword_search` 권한은 Meta **앱 검수(App Review)를 통과하기 전**에는
> **내 글만** 검색됩니다. 다른 사람 글에 댓글을 달려면 앱 검수에서 이 권한을 승인받아야 해요.

## 3. 실행

```bash
python bot.py               # 미리보기: 어떤 글에 어떤 댓글을 달지 보여주기만 함
python bot.py --live        # 실제로 댓글 게시 (1회)
python bot.py --live --loop # 30분(설정값)마다 계속 실행
```

처음에는 꼭 `--live` 없이 돌려서 댓글이 어디에 달릴지 확인하세요.

## 4. 책 홍보 설정

`config.example.json` 첫 번째 규칙에 《주식시장에 나와서는 안 될 비법서》 홍보가 들어가 있습니다.

- `주식책`, `주식 책 추천`, `투자책 추천`, `주식 공부 책`을 검색해서 책을 추천하는 댓글을 답니다.
- 홍보 문구 5개를 돌아가며 써서 같은 문장이 반복되지 않게 합니다.
- 교보문고 링크는 **모든 댓글에** 붙습니다 (`link_probability: 1.0`). 스팸 신고가 늘면 0.3 정도로 낮추세요.
- AI 모드를 켜면 글쓴이 말에 먼저 반응한 뒤 책을 자연스럽게 추천합니다. 주식책과 상관없는 글은 건너뜁니다.
- 순위 같은 수치(400위→66위 등)는 시간이 지나면 틀린 정보가 되니 주기적으로 `config.json`을 고쳐주세요.

## 5. 설정 (`config.json`)

| 항목 | 설명 |
|---|---|
| `rules[].keywords` | 검색할 키워드 목록 |
| `rules[].replies` | 템플릿 댓글 목록 (랜덤 선택, `{username}` 쓰면 글쓴이 아이디로 바뀜) |
| `rules[].link` | 홍보 링크 (예: 교보문고 상품 페이지) |
| `rules[].link_probability` | 링크를 붙일 확률 (기본 0.3 = 댓글 10개 중 약 3개) |
| `rules[].ai_hint` | AI 모드일 때 이 키워드 그룹에 줄 추가 지시 |
| `rules[].ai` | 이 규칙만 AI 모드 켜기/끄기 (`true`/`false`, 생략하면 `ai.enabled` 따름) |
| `exclude_words` | 이 단어가 들어간 글은 건너뜀 (광고, 협찬 등) |
| `search_type` | `RECENT`(최신순) 또는 `TOP`(인기순) |
| `max_post_age_hours` | 이 시간보다 오래된 글은 건너뜀 |
| `skip_replies` | 다른 글의 댓글은 건너뛰기 |
| `one_reply_per_user_per_day` | 같은 사람에게 하루 1번만 댓글 |
| `max_replies_per_run` / `max_replies_per_day` | 1회 실행당 / 하루 최대 댓글 수 |
| `delay_seconds` | 댓글 사이 랜덤 대기 시간 `[최소, 최대]` 초 |
| `loop_interval_minutes` | `--loop` 실행 간격(분) |
| `ai.enabled` | AI 모드 켜기 (`.env`에 `ANTHROPIC_API_KEY` 필요) |
| `ai.model` / `ai.effort` | 사용할 Claude 모델 / 생각 깊이(`low` 추천) |
| `ai.persona` | 봇 말투·성격 |

한 번 댓글 단 글은 `state.json`에 기록돼서 중복으로 달지 않습니다.

## 6. 계정 정지 안 당하려면

자동 댓글은 Threads 커뮤니티 가이드라인상 **스팸으로 신고되기 쉽습니다.** 기본값을 보수적으로 잡아뒀어요.

- 하루 댓글 수는 낮게 (기본 15개). API 한도(하루 답글 1,000개)까지 쓰지 마세요.
- 똑같은 문구 반복 금지 → 템플릿을 여러 개 넣거나 AI 모드 사용
- 링크·홍보 문구를 매번 넣으면 거의 확실히 스팸 처리됩니다
- 댓글 간격은 넉넉하게 (기본 90~240초)

## 서버에서 24시간 돌리기 (선택)

```bash
nohup python bot.py --live --loop > bot.log 2>&1 &
```

또는 cron으로 30분마다 1회 실행:

```
*/30 * * * * cd /경로/threads-bot && python bot.py --live >> bot.log 2>&1
```
