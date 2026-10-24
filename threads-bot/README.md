# Threads 자동 홍보 봇

《주식시장에 나와서는 안 될 비법서》를 Threads에서 자동으로 홍보하는 봇입니다.
Meta 공식 **Threads API**만 쓰기 때문에 계정 정지 위험이 가장 낮은 방식이에요.
켜두면 15분마다 아래 일을 자동으로 합니다.

| 기능 | 하는 일 | 앱 검수 필요? |
|---|---|---|
| **① 자동 게시** (`auto_post`) | 홍보 글 4종을 12시간마다 돌아가며 내 계정에 올림 (`#주식책` 주제 태그) | 아니요 |
| **② 멘션 답글** (`mentions`) | 누가 `@내계정 주식책 추천해줘`처럼 태그하면 답글 — **그록 방식** | 아니요* |
| **③ 내 글 댓글 응대** (`comments`) | 내 글에 "어디서 사요?" 같은 댓글이 달리면 답글 | 아니요 |
| **④ 키워드 댓글** (`rules`) | `주식책`, `책추천` 검색해서 남의 글에 댓글 | **예** |

\* 테스트 단계에서도 쓸 수 있지만, 많은 사람에게 공개하려면 결국 앱 검수를 받는 게 안전합니다.

모든 답글과 게시물에는 교보문고 링크가 붙습니다. 답글은 템플릿 또는 **AI(Claude)**로 만듭니다.
멘션·댓글 응대는 AI가 기본으로 켜져 있어서, 사람이 물어본 내용에 맞춰 답하고 악플이나 상관없는 글은 건너뜁니다.
(`ANTHROPIC_API_KEY`가 없으면 자동으로 템플릿 답글을 씁니다.)

## 1. 설치

```bash
cd threads-bot
pip install -r requirements.txt
cp config.example.json config.json
cp .env.example .env
```

## 2. Threads 액세스 토큰 발급

1. https://developers.facebook.com 에서 앱 만들기 → 사용 사례에서 **"Threads API 액세스"** 선택
2. 권한 추가: `threads_basic`, `threads_content_publish`, `threads_manage_replies`, `threads_read_replies`, `threads_manage_mentions`, `threads_keyword_search`
3. 앱 설정 → Threads 테스터에 내 Threads 계정 추가 → Threads 앱(설정 > 계정 > 웹사이트 권한)에서 초대 수락
4. 그래프 API 탐색기(또는 Threads 사용 사례의 "토큰 생성")에서 사용자 액세스 토큰 발급
5. 장기 토큰(60일)으로 교환한 뒤 `.env`의 `THREADS_ACCESS_TOKEN`에 넣기

```bash
python bot.py --whoami   # "로그인 계정: @내아이디" 가 나오면 성공
```

> ⚠️ **④ 키워드 댓글만 해당:** `threads_keyword_search` 권한은 Meta **앱 검수(App Review)를 통과하기 전**에는
> **내 글만** 검색됩니다. 다른 사람 글에 댓글을 달려면 앱 검수에서 이 권한을 승인받아야 해요.

## 3. 실행

```bash
python bot.py               # 미리보기: 어떤 글에 어떤 댓글을 달지 보여주기만 함
python bot.py --live        # 실제로 댓글 게시 (1회)
python bot.py --live --loop # 15분(설정값)마다 계속 실행
```

처음에는 꼭 `--live` 없이 돌려서 댓글이 어디에 달릴지 확인하세요.

## 4. 홍보 문구 바꾸기

`config.json`에서 고치면 됩니다.

- `auto_post.posts`: 자동으로 올릴 홍보 글 (순서대로 돌아감)
- `mentions.replies`, `comments.replies`, `rules[].replies`: AI를 안 쓸 때 쓰는 답글 문구
- `*.ai_hint`: AI에게 주는 책 소개와 지시
- 순위(400위→66위 등)는 시간이 지나면 틀린 정보가 되니 주기적으로 고쳐주세요.
- 기능을 끄려면 `"enabled": false`

## 5. 설정 (`config.json`)

| 항목 | 설명 |
|---|---|
| `auto_post.every_hours` | 자동 게시 간격(시간) |
| `auto_post.topic_tag` | 게시물 주제 태그 (검색 노출용) |
| `comments.recent_posts` | 댓글을 확인할 내 최근 글 개수 |
| `rules[].keywords` | 검색할 키워드 목록 |
| `rules[].replies` | 템플릿 댓글 목록 (랜덤 선택, `{username}` 쓰면 글쓴이 아이디로 바뀜) |
| `*.link` / `*.link_probability` | 붙일 링크 / 붙일 확률 (현재 1.0 = 항상) |
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

- 하루 답글 수는 적당히 (기본 40개, 멘션·댓글 응대 포함). API 한도(하루 답글 1,000개)까지 쓰지 마세요.
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
