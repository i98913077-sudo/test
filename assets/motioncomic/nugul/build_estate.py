#!/usr/bin/env python3
"""《주식법전 스피드런 2: 부동산 편》 — 코드 애니메이션 (크레딧 0). 쿠키 영상(새 퀘스트 '부동산 편')에서 이어짐.
스크립트 원문 대사는 src/script_body_c.txt 로 검증, 새로 쓴 대사는 NEW 목록으로 명시.
Usage: python3 build_estate.py [preview] -> /home/user/estate.mp4
"""
import math, os, random, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_beop as BP
import build_nugul as N
from build_nugul import (raccoon, txt, rich, rect, oval, circ, line, poly, polyline, P, hexc, ease, back, seg, clamp01, mix,
                         GOLD, CYAN, RED, GREEN, WHITE, bubble, plot, chart_panel, phone, grad_bg)
from build_beop import human, rail, art_bench
import skia
W, H = N.W, N.H

def gat(c, x, y, s, rot=0):
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s)
    oval(c, 0, 0, 90, 22, "#101014"); oval(c, 0, -26, 46, 40, "#16161c"); rect(c, -46, -30, 92, 24, "#16161c")
    txt(c, "인턴", 0, 10, 24, "#e8d9a0", stroke=False)
    c.restore()

def quest_box(c, lines, a=255):
    rect(c, 200, 120, 880, 150, "#06121f", int(225 * a / 255), r=18)
    c.drawRoundRect(skia.Rect.MakeXYWH(200, 120, 880, 150), 18, 18, P(CYAN, a, stroke=4))
    for i, l in enumerate(lines): txt(c, l, 640, 175 + i * 52, 36, CYAN, a=a, stroke=False)

def art_intro(c, x):
    art_bench(c, x)
    if x.k >= 2:
        p = ease(seg(x.lt if x.k == 2 else 9, 0, 1.6))
        gat(c, 1300 - 650 * p, 600 - abs(math.sin(x.st * 6)) * 14 * (1 - p), 0.8, rot=(1 - p) * -540)
        if x.k >= 3: quest_box(c, ["[ 새 퀘스트 발생 ]  주식법전(부동산 편) — 스피드런", "집행관 : 검사 몰빵이"])

def art_chat2(c, x):
    grad_bg(c, "#0a0f22", "#1a2447")
    phone(c, 430, 40, 420, 640)
    rect(c, 450, 60, 380, 56, "#24365e", r=12); txt(c, "내 집 마련 단톡방 (1,204명)", 640, 96, 24, WHITE, stroke=False)
    msgs = [("집값은 안 떨어져", 0.05, "#e9e9ef", 140), ("지금 안 사면 평생 못 삼", 0.25, "#e9e9ef", 230), ("영끌 가즈아!!", 0.45, "#e9e9ef", 320), ("오늘 계약 마감", 0.65, "#f08a2c", 410)]
    for m, t0, colr, yy in msgs:
        if x.u > t0:
            p = back((x.u - t0) / 0.06); c.save(); c.translate(470, yy); c.scale(p, p); c.translate(-470, -yy)
            bubble(c, 470, yy, m, colr, "#101830", 24); c.restore()
    raccoon(c, 170, 680, 0.85, "shock" if x.u < 0.6 else "smile", x.st)
    human(c, 1090, 680, 0.8, "pro", "worry", x.st, facing=-1)

def art_florida(c, x):
    k = x.k; hur = k >= 3
    grad_bg(c, "#2a1a1a" if hur else "#7fd0ff", "#4a4a5a" if hur else "#e8f6ff")
    rect(c, -600, 520, W + 1200, 600, "#2f7a64" if not hur else "#243a3a")
    for i in range(14):
        wx = (i * 120 + x.st * (30 if not hur else 160)) % 1500 - 100
        line(c, wx, 580 + (i % 3) * 20, wx + 60, 580 + (i % 3) * 20, "#9fe8d0" if not hur else "#88aaaa", 3, 140)
    for px in (140, 1130):
        line(c, px, 520, px + 10, 300, "#6a4a2a", 14)
        for a in (-70, -30, 10, 50, 90):
            ang = math.radians(a + (math.sin(x.st * (3 if not hur else 14)) * (4 if not hur else 20)))
            line(c, px + 10, 300, px + 10 + 100 * math.sin(ang), 300 + 40 - 90 * math.cos(ang) * 0.4, "#2f9a4a", 12)
    rect(c, 500, 250, 280, 100, "#f5e6c0", r=10); line(c, 520, 350, 520, 520, "#6a4a2a", 8); line(c, 760, 350, 760, 520, "#6a4a2a", 8)
    txt(c, "해변 분양!", 640, 295, 34, "#7a1f1f", stroke=False); txt(c, "계약금만 내세요", 640, 335, 26, "#7a1f1f", stroke=False)
    mult = 1 + int(7 * ease(seg(x.u, 0.1, 0.65)))
    random.seed(2)
    for i in range(7):
        yy = 470 - ((x.st * 60 + i * 70) % 220) * (1 if not hur else 0.0) - (0 if not hur else (x.st * 220 + i * 90) % 700 - 200)
        xx = 300 + i * 100 + (math.sin(x.st * 2 + i) * 20 if not hur else math.sin(x.st * 9 + i) * 80)
        c.save(); c.translate(xx, yy); c.rotate(math.sin(x.st * 3 + i) * (10 if not hur else 60))
        rect(c, -26, -34, 52, 68, "#fffdf2", r=4); line(c, -16, -16, 16, -16, "#9a9a9a", 3); line(c, -16, -4, 16, -4, "#9a9a9a", 3); c.restore()
    if not hur: txt(c, "계약서 값  ×%d" % mult, 640, 440, 44, GOLD)
    raccoon(c, 170, 690, 0.85, "shock", x.st)
    human(c, 1080, 690, 0.8, "pro", "normal", x.st, facing=-1)
    human(c, 400 if k < 2 else 330, 690, 0.8, "pro", "smile", x.st, coat_c="#9a5a1a", tie_c="#ffd866") if k < 3 else None
    if hur:
        random.seed(8)
        for i in range(60):
            rx = random.uniform(0, W); ry = (random.uniform(0, H) + x.st * 900) % H
            line(c, rx, ry, rx - 18, ry + 40, "#cfe6ff", 2, 150)
        if k == 3 and x.lt < 0.3: rect(c, 0, 0, W, H, "#ffffff", int(160 * (1 - x.lt / 0.3)))

def art_bank(c, x):
    k = x.k
    grad_bg(c, "#2a2230", "#4a3a3a"); rect(c, -600, 560, W + 1200, 600, "#2a1f24")
    rect(c, 360, 420, 560, 28, "#6a4a2a", r=6); rect(c, 390, 448, 24, 120, "#4a321a"); rect(c, 870, 448, 24, 120, "#4a321a")
    rect(c, 440, 340, 400, 84, "#fffdf2", r=6)
    txt(c, "주택담보대출 신청서", 640, 372, 24, "#222222", stroke=False); txt(c, "집값 100% · 소득 확인 안 함", 640, 408, 26, "#a31d2b", stroke=False)
    rect(c, 810, 380, 90, 44, "#e9f2ff", r=4); txt(c, "병원비 할부", 855, 408, 18, "#222233", stroke=False)
    human(c, 1060, 570, 0.95, "pro", "smile", x.st, facing=-1, coat_c="#7a5a2a", tie_c="#ffd866")
    pen = ease(seg(x.lt, 0, 1.2)) if k == 2 else (1.0 if k >= 3 else 0)
    raccoon(c, 190, 640, 1.0, "shock" if k >= 3 else "tired", x.st, hand_r=(120 + 140 * pen, -120 - 10 * pen))
    if k >= 3:
        human(c, 640, 640, 0.9, "pro", "worry", x.st)
        a = ease(seg(x.lt, 0, 0.3)); circ(c, 640, 250, 70 * a, RED, 230); txt(c, "안 돼", 640, 268, 52 * a if a > 0.1 else 1, WHITE) if a > 0.5 else None
    if k == 4: rect(c, 0, 0, W, H, "#1a0000", 80)

def art_seoul(c, x):
    k = x.k
    top, bot = ("#1a2447", "#3a4a8a") if k == 0 else ("#10142a", "#2a1f3a")
    grad_bg(c, top, bot); rect(c, -600, 590, W + 1200, 600, "#1c1c28")
    for i in range(6): rect(c, 720 + i * 90, 160 - (i % 3) * 20, 70, 430 + (i % 3) * 20, "#24304f"); [rect(c, 730 + i * 90 + a * 22, 190 + b * 52 - (i % 3) * 20, 14, 22, "#ffd866" if (a + b + i) % 3 else "#3a4a6a") for a in range(3) for b in range(7)]
    rect(c, 90, 140, 480, 70, "#a31d2b", r=12); txt(c, "모델하우스 오픈런!", 330, 190, 40, WHITE, stroke=False)
    for i in range(6): human(c, 150 + i * 70, 630, 0.42, "pro", "smile", x.st + i, facing=1, coat_c=["#2a6a4a", "#6a2a6a", "#6a4a2a", "#2a4a6a", "#6a6a2a", "#4a2a2a"][i], tie_c="#ffffff")
    raccoon(c, 530, 640, 0.7, "tired" if k else "smile", x.st)
    if k >= 1:
        rate = 1.5 + 4.0 * ease(seg(x.lt, 0.0, 1.6)) if k == 1 else 5.5
        rect(c, 640, 70, 560, 130, "#0c0f1a", 225, r=18)
        txt(c, "금리  %.1f%%" % rate, 790, 120, 36, RED, stroke=False); txt(c, "월 이자  >  월급", 920, 170, 34, GOLD, stroke=False)
    if k >= 2:
        a = ease(seg(x.lt, 0, 0.6)); rect(c, 300, 300, 560, 90, "#0c0f1a", int(235 * a), r=16)
        txt(c, "이 집의 진짜 주인: 은행", 580, 358, 40, WHITE, a=int(255 * a), stroke=False)

def art_basement(c, x):
    k = x.k
    grad_bg(c, "#171a24", "#232738"); rect(c, -600, 590, W + 1200, 600, "#1a1c26")
    rect(c, 880, 120, 280, 90, "#7fb0d8", r=6)
    for i in range(3):
        fx = 920 + ((x.st * 90 + i * 100) % 240); rect(c, fx, 150, 20, 60, "#2a2a30"); rect(c, fx - 6, 205, 32, 10, "#101010", r=4)
    rect(c, 300, 450, 480, 26, "#6a4a2a", r=6); rect(c, 330, 476, 22, 114, "#4a321a"); rect(c, 730, 476, 22, 114, "#4a321a")
    rect(c, 480, 380, 200, 70, "#fffdf2", r=4); txt(c, "대출 계약서", 580, 425, 30, "#222222", stroke=False)
    line(c, 650, 400, 700, 370, "#c4373d", 6)
    human(c, 400, 600, 0.9, "pro", "worry", x.st)
    raccoon(c, 820, 620, 0.9, "grit" if k < 3 else "smile", x.st, facing=-1, hand_r=(-80, -150))
    if k >= 3:
        a = ease(seg(x.lt, 0, 0.4)); c.save(); c.translate(580, 330); c.rotate(-10); rect(c, -140, -40, 280, 80, "#3a0508", int(210 * a), r=10)
        c.drawRoundRect(skia.Rect.MakeXYWH(-140, -40, 280, 80), 10, 10, P(RED, int(255 * a), stroke=6)); txt(c, "보류", 0, 18, 60, RED, a=int(255 * a)); c.restore()

def art_calc(c, x):
    grad_bg(c, "#ffb877", "#ffe7b0"); rect(c, -600, 600, W + 1200, 600, "#c9a46a"); circ(c, 1050, 150, 64, "#fff4b0")
    rect(c, 320, 120, 640, 330, "#f6efd8", r=14); rect(c, 636, 120, 8, 330, "#c9b88a")
    rows = [("월세", 0.1), ("비상금", 0.3), ("버틸 시간", 0.5)]
    for i, (l, t0) in enumerate(rows):
        if x.u > t0 or x.k >= 1:
            yy = 200 + i * 80; txt(c, l, 360, yy, 34, "#3b2a12", align="l", stroke=False)
            line(c, 560, yy + 6, 920, yy + 6, "#9a8a6a", 3)
            m = seg(x.u, t0, t0 + 0.15) if x.k < 1 else 1
            if m > 0.7: polyline(c, [(884, yy - 8), (898, yy + 6), (924, yy - 24)], "#2a8a4a", 7)
    raccoon(c, 220, 690, 0.95, "smile", x.st); human(c, 1090, 690, 0.95, "pro", "smile", x.st, facing=-1)
    if x.k >= 2: txt(c, "주식법전(우리)", 640, 90, 44, "#3b2a12", stroke=False)

N.CH_TOTAL = 6
N.OUT = "/home/user/es"; os.makedirs(N.OUT, exist_ok=True)
N.FINAL = "/home/user/estate.mp4"
N.RECAP = [("1", "계약서는 땅이 아니다"), ("2", "빚은 확신의 증폭기다"), ("3", "살 곳과 살 값은 다르다"), ("4", "가격이 아니라 버틸 시간을 계산하라"), ("5", "혼자 판단하지 말고, 곁에서 의심받아라")]
N.VOICE.update({"중개인": (N.HS, "+6%", "+10Hz"), "세입자": (N.SH, "+0%", "+8Hz")})
N.TAGC.update({"중개인": "#d9a24a", "세입자": "#cfcfcf"})

def end_art(c, x):
    grad_bg(c, "#05060c", "#10142a")
    rich(c, "《{주식법전} 스피드런 2》", 640, 170, 70); txt(c, "부동산 편", 640, 250, 44, GOLD)
    txt(c, "다음 편 — 선물 편 : 반대편에 서라", 640, 330, 38, CYAN)
    rect(c, 190, 400, 900, 200, "#10203a", 235, r=22)
    txt(c, "마음이 힘들 땐 혼자 버티지 마세요", 640, 460, 36, GOLD)
    txt(c, "자살예방상담전화  109  (24시간)  ·  긴급 구조  119", 640, 520, 34, WHITE)
    txt(c, "※ 이 영화는 픽션이며, 투자 권유가 아닙니다.", 640, 650, 22, "#9aa0b5", stroke=False)

N.SCENES = [("hook", None, N.art_hook), ("intro", 1, art_intro), ("chat2", 1, art_chat2), ("florida", 2, art_florida), ("bank", 3, art_bank),
            ("seoul", 4, art_seoul), ("basement", 5, art_basement), ("calc", 6, art_calc), ("recap", 7, N.art_recap), ("end", None, end_art)]

NEW = {"주식법전(우리).", "이 계약서에 적힌 땅, 실제로 있습니까?", "병원비 할부 중이시죠? 대출 가능합니다!", "이 서류에 서명해도 돼요?", "안 됩니다.",
       "내 집인 줄 알았는데, 은행 집이었어요.", "나도, 사고 싶습니다.", "이번엔 제가, 곁에 있을게요.", "땅은 없는데, 계약서만 비싸요."}

SHOTS = [
    ("hook", "N", "집은, 가격일까. 삶일까.", "{집}은 가격일까,\n삶일까", "sting", "flash"),
    ("hook", "N", "빚이 키운 확신은, 어디까지 갈까.", "{빚}이 키운 확신", "pop", ""),
    ("intro", "너굴이", "마이너스 8천4백만 원이 병원비 320만 원이 되었네요.", "", "pop", ""),
    ("intro", "몰빵이", "개선입니다.", "", "pop", ""),
    ("intro", "N", "그때, 낡은 갓 하나가 굴러왔다.", "", "whoosh", ""),
    ("intro", "몰빵이", "싫습니다.", "", "ding", "flash"),
    ("intro", "너굴이", "같이 가요, 검사님.", "", "pop", ""),
    ("intro", "몰빵이", "싫다고 했습니다.", "", "thud", "shake"),
    ("chat2", "N", "그런데 단톡방은, 이렇게 말하고 있었다.", "", "pop", ""),
    ("chat2", "N", "집값은, 안 떨어진다.", "{집값}은 안 떨어진다", "sting", "flash"),
    ("florida", "N", "1925년, 플로리다. 사람들은 땅을 보지 않고, 계약서만 샀다.", "1925 · {계약서}만 샀다", "whoosh", ""),
    ("florida", "N", "계약서는 팔릴 때마다 비싸졌다. 땅은 늪 그대로인데.", "계약서 값 ↑", "ding", ""),
    ("florida", "몰빵이", "이 계약서에 적힌 땅, 실제로 있습니까?", "", "thud", ""),
    ("florida", "N", "허리케인이 오자, 남은 건 계약서뿐이었다.", "{계약서}는 땅이 아니다", "crash", "shake"),
    ("bank", "N", "2008년, 미국. 직업도 소득도 묻지 않고, 집값 전부를 빌려주던 때.", "2008 · 소득 {확인 안 함}", "whoosh", ""),
    ("bank", "중개인", "병원비 할부 중이시죠? 대출 가능합니다!", "", "pop", ""),
    ("bank", "너굴이", "이 서류에 서명해도 돼요?", "", "pop", ""),
    ("bank", "몰빵이", "안 됩니다.", "", "crash", "shake"),
    ("bank", "N", "빚은 맞을 땐 두 배로 벌게 하고, 틀릴 땐 두 배로 무너뜨린다.", "{빚}은 확신의 증폭기", "ding", "flash"),
    ("seoul", "N", "2021년, 서울. 새벽부터 줄을 서서, 집을 샀다. 빚으로.", "2021 · {오픈런}", "whoosh", ""),
    ("seoul", "N", "금리가 오르자, 한 달 이자가 월급을 넘어섰다.", "월 이자 > 월급", "crash", "shake"),
    ("seoul", "세입자", "내 집인 줄 알았는데, 은행 집이었어요.", "", "pop", ""),
    ("seoul", "N", "집값은 가격이 아니다. 버틸 수 있는 시간이다.", "{버틸 시간}", "ding", ""),
    ("basement", "N", "원칙의 사나이도, 월세 반지하 앞에서는 흔들렸다.", "", "pop", ""),
    ("basement", "몰빵이", "나도, 사고 싶습니다.", "", "pop", ""),
    ("basement", "너굴이", "이번엔 제가, 곁에 있을게요.", "{곁}에서 의심해 줄게요", "sparkle", "flash"),
    ("basement", "몰빵이", "감정이 앞섰습니다.", "", "ding", ""),
    ("calc", "N", "집은 사지 않았다. 대신, 사는 곳과 버틸 시간을 계산했다.", "{살 곳}과 {살 값}은 다르다", "ding", ""),
    ("calc", "N", "진짜 집은, 둘이 같이 쓰는 노트였다.", "", "pop", ""),
    ("calc", "너굴이", "주식법전(우리).", "", "sparkle", ""),
    ("calc", "몰빵이", "괄호는 빼십시오.", "", "thud", ""),
    ("recap", "N", "속독으로, 한 번에 정리한다.", "{5줄} 요약", "whoosh", ""),
    ("recap", "N", "하나. 계약서는 땅이 아니다.", "", "pop", ""),
    ("recap", "N", "둘. 빚은 확신의 증폭기다.", "", "pop", ""),
    ("recap", "N", "셋. 살 곳과 살 값은 다르다.", "", "pop", ""),
    ("recap", "N", "넷. 가격이 아니라, 버틸 시간을 계산하라.", "", "pop", ""),
    ("recap", "N", "다섯. 혼자 판단하지 말고, 곁에서 의심받아라.", "", "ding", "flash"),
    ("end", "N", "마음이 힘들 땐, 혼자 버티지 마세요. 상담전화는 24시간 받습니다.", "", "ding", ""),
    ("end", "N", "다음 편. 선물 편. 반대편에 서라.", "", "sting", ""),
]
N.SHOTS = SHOTS

def verify():
    lines = []
    for l in open(BP.SCRIPT, encoding="utf-8"):
        if l.startswith("@"):
            sp, _, t = l.rstrip("\n")[1:].partition(" ")
            lines.append((sp, re.sub(r"\s+", " ", re.sub(r"\([^)]*\)", " ", t)).replace("…", " ")))
    norm = lambda s: re.sub(r"\s+", " ", s).strip()
    ok = new = 0
    for sc, who, text, *_ in SHOTS:
        if who == "N": continue
        if text in NEW: new += 1; continue
        if not any(sp == who and norm(text) in norm(t) for sp, t in lines):
            raise SystemExit("QUOTE/SPEAKER NOT IN SCRIPT: %s: %s" % (who, text))
        ok += 1
    print("script check OK: %d 원문 대사, %d 신규 대사" % (ok, new), flush=True)

if __name__ == "__main__":
    verify()
    N.main()
