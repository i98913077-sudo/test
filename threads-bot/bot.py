#!/usr/bin/env python3
"""Threads 자동 홍보 봇.

공식 Threads API(graph.threads.net)로 아래 일을 자동으로 합니다.
켜고 끄는 건 config.json에서 합니다.

  1. mentions  : 누가 @내계정 을 태그하면 답글 (그록 방식)
  2. comments  : 내 글에 달린 댓글에 답글
  3. auto_post : 홍보 글을 정해진 간격마다 내 계정에 게시
  4. rules     : 키워드 검색해서 남의 글에 댓글 (Meta 앱 검수 후 동작)

    python bot.py               # 1회 실행, 미리보기(실제 게시 X)
    python bot.py --live        # 1회 실행, 실제로 댓글 게시
    python bot.py --live --loop # config의 간격마다 계속 실행
    python bot.py --whoami      # 토큰 확인
"""

import argparse
import json
import os
import random
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

API = "https://graph.threads.net/v1.0"
HERE = Path(__file__).resolve().parent
MAX_TEXT = 500  # Threads 글자 수 제한
POST_FIELDS = "id,text,username,timestamp,permalink,is_reply"


def log(msg):
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}", flush=True)


def load_dotenv(path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


# ---------------------------------------------------------------- Threads API

class Threads:
    def __init__(self, token):
        self.token = token
        self.http = requests.Session()

    def _call(self, method, path, **params):
        params["access_token"] = self.token
        r = self.http.request(method, f"{API}/{path}", params=params, timeout=30)
        data = r.json() if r.content else {}
        if r.status_code >= 400 or "error" in data:
            err = data.get("error", {})
            raise RuntimeError(f"{method} /{path} 실패 ({r.status_code}): {err.get('message', r.text)}")
        return data

    def me(self):
        return self._call("GET", "me", fields="id,username")

    def search(self, keyword, search_type="RECENT", limit=25):
        data = self._call("GET", "keyword_search", q=keyword,
                          search_type=search_type, fields=POST_FIELDS, limit=limit)
        return data.get("data", [])

    def mentions(self, limit=25):
        return self._call("GET", "me/mentions", fields=POST_FIELDS, limit=limit).get("data", [])

    def my_posts(self, limit=10):
        return self._call("GET", "me/threads", fields=POST_FIELDS, limit=limit).get("data", [])

    def replies(self, post_id):
        return self._call("GET", f"{post_id}/replies", fields=POST_FIELDS).get("data", [])

    def publish(self, text, reply_to_id=None, topic_tag=None):
        params = {"media_type": "TEXT", "text": text}
        if reply_to_id:
            params["reply_to_id"] = reply_to_id
        if topic_tag:
            params["topic_tag"] = topic_tag
        container = self._call("POST", "me/threads", **params)
        time.sleep(3)  # 컨테이너 처리 대기
        return self._call("POST", "me/threads_publish", creation_id=container["id"])

    def reply(self, post_id, text):
        return self.publish(text, reply_to_id=post_id)


# ---------------------------------------------------------------- 댓글 생성

def template_reply(rule, post):
    text = random.choice(rule["replies"])
    return text.replace("{username}", post.get("username", ""))


def ai_reply(ai_cfg, rule, post, parent=None):
    import anthropic  # AI 모드에서만 필요

    client = anthropic.Anthropic()
    hint = rule.get("ai_hint", "")
    context = ""
    if parent:
        context = f"내가 쓴 원래 글:\n<my_post>\n{parent.get('text', '')}\n</my_post>\n\n그 글에 달린 댓글:\n"
    prompt = (
        f"다음은 Threads 게시글입니다.\n\n{context}<post>\n{post.get('text', '')}\n</post>\n\n"
        f"이 글에 달 댓글을 한국어로 하나만 작성하세요. {hint}\n"
        f"- {ai_cfg.get('max_chars', 200)}자 이내, 자연스러운 반말/존댓말은 글쓴이 말투에 맞추기\n"
        "- 글 내용에 실제로 반응할 것 (복붙 같은 홍보 문구 금지)\n"
        "- 댓글 본문만 출력 (따옴표, 설명 없이)\n"
        "- 이 글에 댓글을 다는 것이 어색하거나 부적절하면 SKIP 한 단어만 출력"
    )
    response = client.beta.messages.create(
        model=ai_cfg.get("model", "claude-opus-5-5"),
        max_tokens=2000,
        system=ai_cfg.get("persona", ""),
        output_config={"effort": ai_cfg.get("effort", "low")},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        messages=[{"role": "user", "content": prompt}],
    )
    if response.stop_reason == "refusal":
        return None
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    if not text or text.upper().startswith("SKIP"):
        return None
    return text


def maybe_add_link(rule, text):
    """홍보 링크는 매번이 아니라 link_probability 확률로만 붙인다 (스팸 판정 방지)."""
    link = rule.get("link")
    if not link or random.random() >= rule.get("link_probability", 0.3):
        return text
    text = text[:MAX_TEXT - len(link) - 1]
    return f"{text}\n{link}"


# ---------------------------------------------------------------- 상태 저장

class State:
    def __init__(self, path):
        self.path = path
        self.data = {"replied": [], "daily": {}, "users": {}}
        if path.exists():
            self.data.update(json.loads(path.read_text(encoding="utf-8")))

    @staticmethod
    def today():
        return datetime.now().strftime("%Y-%m-%d")

    def replied(self, post_id):
        return post_id in self.data["replied"]

    def today_count(self):
        return self.data["daily"].get(self.today(), 0)

    def user_replied_today(self, username):
        return self.data["users"].get(username) == self.today()

    def last_auto_post(self):
        ts = self.data.get("last_auto_post")
        return datetime.fromisoformat(ts) if ts else None

    def next_auto_post_index(self):
        return self.data.get("auto_post_index", 0)

    def record_auto_post(self):
        self.data["last_auto_post"] = datetime.now(timezone.utc).isoformat()
        self.data["auto_post_index"] = self.next_auto_post_index() + 1

    def record(self, post_id, username):
        self.data["replied"] = (self.data["replied"] + [post_id])[-5000:]
        self.data["daily"] = {self.today(): self.today_count() + 1}
        self.data["users"][username] = self.today()

    def save(self):
        today = self.today()
        self.data["users"] = {u: d for u, d in self.data["users"].items() if d == today}
        self.path.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------- 메인 로직

def is_recent(post, max_age_hours):
    ts = post.get("timestamp")
    if not ts:
        return True
    posted = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S%z")
    return datetime.now(timezone.utc) - posted <= timedelta(hours=max_age_hours)


def skip_reason(post, cfg, state, me, rule):
    text = post.get("text") or ""
    if post.get("username") == me["username"]:
        return "내 글"
    if state.replied(post["id"]):
        return "이미 댓글 담"
    if rule.get("skip_replies", cfg.get("skip_replies", True)) and post.get("is_reply"):
        return "댓글(답글)임"
    if any(w in text for w in cfg.get("exclude_words", [])):
        return "제외 단어 포함"
    if not is_recent(post, rule.get("max_post_age_hours", cfg.get("max_post_age_hours", 24))):
        return "오래된 글"
    if (rule.get("one_reply_per_user_per_day", cfg.get("one_reply_per_user_per_day", True))
            and state.user_replied_today(post.get("username"))):
        return "오늘 이미 이 사용자에게 댓글 담"
    return None


class Runner:
    """한 번 실행(run)에서 댓글 수 한도와 게시를 관리한다."""

    def __init__(self, api, cfg, state, me, live):
        self.api, self.cfg, self.state, self.me, self.live = api, cfg, state, me, live
        self.per_run = cfg.get("max_replies_per_run", 5)
        self.per_day = cfg.get("max_replies_per_day", 30)
        self.done = 0

    def full(self):
        return self.done >= self.per_run or self.state.today_count() >= self.per_day

    def wait(self):
        delay_min, delay_max = self.cfg.get("delay_seconds", [60, 180])
        wait = random.uniform(delay_min, delay_max)
        log(f"  {wait:.0f}초 대기")
        time.sleep(wait)

    def handle(self, rule, post, parent=None):
        """조건에 맞으면 post에 댓글을 단다."""
        if self.full() or skip_reason(post, self.cfg, self.state, self.me, rule):
            return
        ai_cfg = self.cfg.get("ai", {})
        use_ai = rule.get("ai", ai_cfg.get("enabled", False))
        text = None
        if use_ai:
            try:
                text = ai_reply(ai_cfg, rule, post, parent)
            except Exception as e:  # 키가 없거나 API 오류면 템플릿으로 대신 답한다
                log(f"  AI 실패, 템플릿 사용: {e}")
                text = template_reply(rule, post)
        else:
            text = template_reply(rule, post)
        if not text:
            log(f"  건너뜀 (AI가 SKIP): {post.get('permalink')}")
            if self.live:
                self.state.record(post["id"], post.get("username"))
            return
        text = maybe_add_link(rule, text[:MAX_TEXT])

        snippet = (post.get("text") or "").replace("\n", " ")[:60]
        log(f"  @{post.get('username')}: {snippet}")
        log(f"  └ 댓글: {text}")

        if not self.live:
            log("  (미리보기 모드 - 게시 안 함. 실제 게시는 --live)")
            self.done += 1
            return
        try:
            self.api.reply(post["id"], text)
        except RuntimeError as e:
            log(f"  게시 실패: {e}")
            return
        self.state.record(post["id"], post.get("username"))
        self.state.save()
        self.done += 1
        log(f"  게시 완료 ({post.get('permalink')})")
        self.wait()

    def mentions(self):
        rule = self.cfg.get("mentions", {})
        if not rule.get("enabled"):
            return
        try:
            posts = self.api.mentions()
        except RuntimeError as e:
            log(f"멘션 가져오기 실패: {e}")
            return
        log(f"[멘션] {len(posts)}개")
        for post in posts:
            self.handle(rule, post)

    def comments(self):
        rule = self.cfg.get("comments", {})
        if not rule.get("enabled"):
            return
        try:
            my_posts = self.api.my_posts(rule.get("recent_posts", 10))
        except RuntimeError as e:
            log(f"내 글 가져오기 실패: {e}")
            return
        for parent in my_posts:
            if self.full() or parent.get("is_reply"):
                continue
            try:
                replies = self.api.replies(parent["id"])
            except RuntimeError as e:
                log(f"댓글 가져오기 실패: {e}")
                continue
            if replies:
                log(f"[내 글 댓글] {(parent.get('text') or '')[:30]!r} 에 댓글 {len(replies)}개")
            for post in replies:
                self.handle(rule, post, parent)

    def auto_post(self):
        rule = self.cfg.get("auto_post", {})
        if not rule.get("enabled") or not rule.get("posts"):
            return
        last = self.state.last_auto_post()
        every = timedelta(hours=rule.get("every_hours", 12))
        if last and datetime.now(timezone.utc) - last < every:
            log(f"[자동 게시] 다음 게시: {(last + every).astimezone():%m-%d %H:%M}")
            return
        posts = rule["posts"]
        text = posts[self.state.next_auto_post_index() % len(posts)]
        text = maybe_add_link(rule, text[:MAX_TEXT])
        log(f"[자동 게시] {text}")
        if not self.live:
            log("  (미리보기 모드 - 게시 안 함. 실제 게시는 --live)")
            return
        try:
            self.api.publish(text, topic_tag=rule.get("topic_tag"))
        except RuntimeError as e:
            log(f"  게시 실패: {e}")
            return
        self.state.record_auto_post()
        self.state.save()
        log("  게시 완료")

    def keywords(self):
        for rule in self.cfg.get("rules", []):
            if not rule.get("enabled", True):
                continue
            for keyword in rule["keywords"]:
                if self.full():
                    return
                try:
                    posts = self.api.search(keyword, self.cfg.get("search_type", "RECENT"))
                except RuntimeError as e:
                    log(f"검색 실패 '{keyword}': {e}")
                    continue
                log(f"[키워드] '{keyword}' 검색 결과 {len(posts)}개")
                for post in posts:
                    self.handle(rule, post)


def run_once(api, cfg, state, me, live):
    runner = Runner(api, cfg, state, me, live)
    runner.auto_post()
    # 사람들이 먼저 말 건 것(멘션, 내 글 댓글)부터 답한다.
    runner.mentions()
    runner.comments()
    runner.keywords()
    if runner.full():
        log(f"한도 도달 (이번 실행 {runner.done}/{runner.per_run}, "
            f"오늘 {state.today_count()}/{runner.per_day})")
    return runner.done


def main():
    parser = argparse.ArgumentParser(description="Threads 자동 홍보 봇")
    parser.add_argument("--config", default=str(HERE / "config.json"))
    parser.add_argument("--live", action="store_true", help="실제로 댓글 게시 (기본은 미리보기)")
    parser.add_argument("--loop", action="store_true", help="config의 간격마다 반복 실행")
    parser.add_argument("--whoami", action="store_true", help="토큰 계정 확인 후 종료")
    args = parser.parse_args()

    load_dotenv(HERE / ".env")
    token = os.environ.get("THREADS_ACCESS_TOKEN")
    if not token:
        sys.exit("THREADS_ACCESS_TOKEN이 없습니다. .env 파일을 만들거나 환경변수로 설정하세요 (README 참고).")

    config_path = Path(args.config)
    if not config_path.exists():
        sys.exit(f"{config_path} 가 없습니다. config.example.json을 복사해서 만드세요.")
    cfg = json.loads(config_path.read_text(encoding="utf-8"))

    api = Threads(token)
    me = api.me()
    log(f"로그인 계정: @{me['username']}")
    if args.whoami:
        return

    state = State(HERE / "state.json")
    while True:
        n = run_once(api, cfg, state, me, args.live)
        state.save()
        log(f"이번 실행에서 {n}개 처리, 오늘 누적 {state.today_count()}개")
        if not args.loop:
            break
        interval = cfg.get("loop_interval_minutes", 30)
        log(f"{interval}분 후 다시 실행")
        time.sleep(interval * 60)


if __name__ == "__main__":
    main()
