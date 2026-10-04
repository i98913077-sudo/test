#!/usr/bin/env python3
"""《주식법전 스피드런》 — 코드 애니메이션 판 (크레딧 0). build_nugul.py 의 엔진/캐릭터 재사용.
대사(Q)는 src/script_body_c.txt 원문에서 검증한다(없으면 실패).
Usage: python3 build_beop.py [preview]  -> /home/user/beop.mp4
"""
import math, os, random, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_nugul as N
from build_nugul import (raccoon, book, phone, txt, rich, rect, oval, circ, line, poly, polyline, P, hexc, grad_bg,
                         ease, back, seg, clamp01, mix, GOLD, CYAN, RED, GREEN, WHITE, bubble, plot, chart_panel, sheep)
import skia

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "src", "script_body_c.txt")

def qp(c, a, b, d, color, w):
    path = skia.Path(); path.moveTo(*a); path.quadTo(*b, *d); c.drawPath(path, P(color, stroke=w))

def human(c, x, y, s, kind="pro", mood="normal", t=0, facing=1, run=0.0):
    c.save(); c.translate(x, y + math.sin(t * 4) * 2 * s); c.scale(s * facing, s)
    SK = "#f1c9a5"
    if kind == "reaper":
        poly(c, [(-70, -205), (70, -205), (120, 0), (-120, 0)], "#a31d2b")
        coat, hair = "#16161c", "#f4f4f4"
    else:
        coat, hair = "#232c40", "#15151a"
    sw = math.sin(t * 12) * 14 * run
    rect(c, -38 + sw, -50, 30, 50, "#101420", r=8); rect(c, 8 - sw, -50, 30, 50, "#101420", r=8)
    oval(c, -22 + sw, 2, 26, 9, "#07070a"); oval(c, 24 - sw, 2, 26, 9, "#07070a")
    rect(c, -56, -215, 112, 175, coat, r=26)
    poly(c, [(-18, -215), (18, -215), (0, -160)], "#f2f2f2")
    if kind == "pro": poly(c, [(0, -205), (8, -180), (0, -130), (-8, -180)], "#2b5fb8")
    line(c, -48, -195, -78, -120 + sw * 0.5, coat, 26); line(c, 48, -195, 80, -120 - sw * 0.5, coat, 26)
    circ(c, -78, -118, 13, SK); circ(c, 80, -118, 13, SK)
    if kind == "reaper":
        line(c, 84, -120, 90, 2, "#6a4a2a", 7); qp(c, (84, -120), (84, -160), (108, -150), GOLD, 6)
    else:
        rect(c, 66, -112, 64, 46, "#8a5a2b", r=6); rect(c, 88, -122, 20, 12, "#5a3a18", r=4)
    circ(c, 0, -262, 50, SK)
    if kind == "reaper":
        oval(c, 0, -300, 54, 26, hair); poly(c, [(-34, -246), (34, -246), (24, -170), (0, -150), (-24, -170)], hair)
        for sx in (-18, 18): circ(c, sx, -266, 11, "#101010"); circ(c, sx, -266, 9, "#2a2a30")
        line(c, -8, -266, 8, -266, "#101010", 3)
    else:
        oval(c, 0, -292, 52, 28, hair); rect(c, -52, -296, 104, 14, hair)
        for sx in (-18, 18):
            circ(c, sx, -262, 9, "#ffffff"); circ(c, sx, -262, 4, "#101010")
            rect(c, sx - 14, -276, 28, 26, "none" if False else "#00000000") if False else None
        line(c, -32, -276, -6, -272 if mood == "worry" else -276, "#15151a", 4); line(c, 32, -276, 6, -272 if mood == "worry" else -276, "#15151a", 4)
    if kind == "reaper":
        pass
    elif mood == "shout":
        oval(c, 0, -238, 12, 14, "#4a1218")
    elif mood == "smile":
        qp(c, (-14, -240), (0, -226), (14, -240), "#15151a", 3)
    else:
        line(c, -10, -238, 10, -238 if mood != "worry" else -241, "#15151a", 3)
    c.restore()

def rail(c, y, a=255):
    for i in range(-2, 18): line(c, i * 90, y - 80, i * 90, y + 20, "#1a1d2b", 6, a)
    line(c, -200, y - 80, W + 200, y - 80, "#2a2f45", 10, a)

W = N.W

def art_bridge(c, x):
    u = x.u
    N.grad_bg(c, "#2a1b4a", "#ff9a5c")
    circ(c, 900, 360, 80, "#ffd9a0", 220)
    rect(c, -600, 470, W + 1200, 600, "#1b2a4a"); line(c, -400, 500, W + 400, 500, "#ffb877", 3, 120)
    poly(c, [(0, 470), (200, 430), (330, 470)], "#18203a"); poly(c, [(980, 470), (1120, 420), (1280, 470)], "#18203a")
    rect(c, -600, 590, W + 1200, 400, "#232a3c"); rail(c, 600)
    for lx in (220, 760, 1250): line(c, lx, 600, lx, 330, "#101420", 8); circ(c, lx, 326, 12, "#fff2b0")
    raccoon(c, 460, 610, 1.0, "tired" if u < 0.7 else "grit", x.st, hand_r=(70, -190), facing=1)
    rect(c, 508, 318, 38, 64, "#0c0f1a", r=6); rect(c, 513, 324, 28, 50, "#ff5c5c", int(170 + 60 * math.sin(x.st * 6)), r=4)
    human(c, 1040, 610, 0.62, "pro", "worry", x.st)
    v = int(84_000_000 * ease(seg(u, 0.15, 0.7)))
    rect(c, 600, 250, 580, 120, "#0c0f1a", 225, r=18)
    txt(c, "계좌", 640, 296, 26, "#9fb0d8", align="l", stroke=False)
    txt(c, "-{:,}원".format(v), 890, 352, 54, RED)

def art_reaper(c, x):
    u = x.u
    N.grad_bg(c, "#05050c", "#14102a")
    random.seed(3)
    for i in range(60):
        sx = random.uniform(0, W); sy = random.uniform(0, 640); tw = 0.5 + 0.5 * math.sin(x.st * 2 + i)
        circ(c, sx, sy, random.choice([1.5, 2.2, 3]), "#ffffff", int(60 + 150 * tw))
    p = skia.Paint(); p.setShader(skia.GradientShader.MakeRadial((880, 330), 300, [hexc("#7a3cff", 90), hexc("#7a3cff", 0)])); c.drawCircle(880, 330, 300, p)
    rect(c, -600, 600, W + 1200, 600, "#0b0b16")
    raccoon(c, 270, 610, 0.95, "shock" if u < 0.5 else "tired", x.st)
    if x.k >= 0:
        a = ease(seg(u, 0.0, 0.2)); c.save(); c.translate(0, (1 - a) * -40); human(c, 880, 610, 1.1, "reaper", "normal", x.st); c.restore()
    if x.u > 0.7: txt(c, "400년 전  →", 640, 600, 40, GOLD)

def art_history(c, x):
    k = {0: 0, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5}.get(x.k, 5); t = x.st
    phases = {0: ("#2a5e9c", "#cfe9ff"), 1: ("#7a2a5e", "#ffd2e8"), 2: ("#7a2a5e", "#ffd2e8"), 3: ("#2a0a0a", "#5a1010"), 4: ("#2a0a0a", "#5a1010"), 5: ("#10142a", "#1a2447")}
    top, bot = phases.get(k, phases[5]); N.grad_bg(c, top, bot)
    years = {0: "1602", 1: "1637", 2: "1637", 3: "1929", 4: "1929", 5: "?"}
    txt(c, years.get(k, "?"), 1100, 80, 56, GOLD)
    rect(c, -600, 600, W + 1200, 600, "#1a1a28" if k >= 3 else ("#6a4a2a" if k < 3 else "#222"))
    if k in (0,):
        poly(c, [(650, 450), (1050, 450), (990, 540), (710, 540)], "#6a3a1a"); line(c, 850, 450, 850, 220, "#4a2a10", 10)
        poly(c, [(850, 230), (1000, 380), (850, 380)], "#f4f4f4"); txt(c, "VOC", 920, 360, 28, "#a31d2b", stroke=False)
        for i in range(5): human(c, 90 + i * 70, 610, 0.34, "pro", "smile", t + i)
        raccoon(c, 520, 610, 0.85, "normal", t)
    elif k in (1, 2):
        for i in range(8):
            px = 90 + i * 130; line(c, px, 600, px, 540, "#2f8a3a", 6)
            poly(c, [(px - 20, 540), (px - 28, 490), (px - 8, 515), (px, 480), (px + 8, 515), (px + 28, 490), (px + 20, 540)], "#e53b6a")
        circ(c, 640, 480, 46, "#e9d6a0"); poly(c, [(640, 380), (610, 440), (670, 440)], "#e9d6a0")
        circ(c, 624, 482, 5, "#101010"); circ(c, 656, 482, 5, "#101010"); line(c, 628, 504, 652, 504, "#101010", 3)
        txt(c, "가격 1,000,000", 640, 340, 30, GOLD, stroke=False) if k == 1 else None
        raccoon(c, 220, 610, 0.85, "shock" if k == 1 else "normal", t)
    else:
        chart_panel(c, 140, 120, 1000, 380)
        pts = [(170, 400), (300, 360), (420, 300), (540, 220), (640, 180), (700, 190), (760, 330), (830, 450), (930, 470), (1100, 480)]
        plot(c, pts, seg(x.lt / x.lu if x.lu else 1, 0.0, 1.0) if False else 1.0, RED if k >= 3 else CYAN, 6)
        raccoon(c, 1080, 610, 0.8, "shock", t, facing=-1)
        human(c, 200, 610, 0.7, "pro", "shout", t) if k == 4 else None

def art_bookp(c, x):
    u = x.u
    N.grad_bg(c, "#120d1e", "#241a3a")
    rect(c, -600, 590, W + 1200, 600, "#1a1424")
    book(c, 600, 590, 1.5, glow=0.8, t=x.st)
    raccoon(c, 270, 610, 1.0, "smile" if x.k == 1 else "grit", x.st, hand_r=(80, -190 + 8 * math.sin(x.st * 7)))
    if x.k >= 2:
        h = ease(seg(x.lt, 0.0, 0.8)); c.save(); c.translate((1 - h) * 360, 0); human(c, 1000, 610, 1.0, "pro", "normal", x.st, facing=-1); c.restore()
    for i, l in enumerate(("조문", "한 줄", "추가")):
        pass

def art_final(c, x):
    u = x.u; k = x.k
    if k <= 1:
        N.grad_bg(c, "#2a1b4a", "#ff9a5c"); rect(c, -600, 590, W + 1200, 600, "#232a3c"); rail(c, 600)
        txt(c, "2026.06.19  17:12", 640, 120, 44, GOLD)
        raccoon(c, 520, 610, 1.0, "grit", x.st)
        human(c, 980 - 360 * ease(seg(x.lt, 0, 0.9)) if k == 1 else 980, 610, 0.9, "pro", "shout", x.st, facing=-1, run=1.0 if k == 1 else 0.0)
    else:
        N.grad_bg(c, "#0a0f22", "#7fa6ff")
        random.seed(5)
        for i in range(12):
            cx = (random.uniform(0, W) + x.st * 40) % (W + 200) - 100; cy = random.uniform(80, 560) - ((x.st * 90) % 700) * 0.0
            oval(c, cx, (cy + x.st * 120) % 720, 90, 26, "#ffffff", 70)
        c.save(); c.translate(640, 360); c.rotate(math.sin(x.st * 1.5) * 18 + 180 * 0); c.scale(0.7, 0.7)
        raccoon(c, 0, 160, 1.0, "shock" if k < 4 else "grit", x.st, bob=False); c.restore()
        if k >= 3:
            g = 0.55 + 0.1 * math.sin(x.st * 3)
            c.save(); pa = skia.Paint(); pa.setAlpha(int(255 * g)); c.saveLayer(None, pa)
            raccoon(c, 1000, 600, 0.9, "smile", x.st, facing=-1); c.restore(); c.restore()
        txt(c, "낙하 잔여시간  %.1f초" % max(0.0, 6.8 - 6.2 * min(1, x.st / 12)), 640, 90, 36, "#ffffff")

def art_rescue(c, x):
    u = x.u
    N.grad_bg(c, "#050912", "#10203a")
    sweep = (math.sin(x.st * 6) + 1) / 2
    for i, colr in enumerate(("#ff3b3b", "#3b7bff")):
        a = int(110 * (sweep if i == 0 else 1 - sweep)); p = skia.Paint(); p.setShader(skia.GradientShader.MakeRadial((200 + i * 880, 120), 520, [hexc(colr, a), hexc(colr, 0)])); c.drawCircle(200 + i * 880, 120, 520, p)
    rect(c, -600, 560, W + 1200, 600, "#0f2a4a"); line(c, -400, 600, W + 400, 600, "#2a5a9a", 3, 140)
    boat = 160 + 700 * ease(seg(u, 0.0, 0.8))
    poly(c, [(boat - 120, 560), (boat + 120, 560), (boat + 90, 610), (boat - 90, 610)], "#d8dde8"); rect(c, boat - 40, 520, 80, 40, "#aab4c8"); circ(c, boat, 510, 8, "#ff3b3b" if sweep > 0.5 else "#3b7bff")
    human(c, 1060, 610, 0.9, "pro", "shout", x.st, facing=-1)
    txt(c, "119", 1060, 250, 70, GOLD) if x.k == 0 else None
    raccoon(c, 360, 610, 0.9, "tired", x.st)

def art_bench(c, x):
    u = x.u
    N.grad_bg(c, "#ffb877", "#ffe7b0")
    circ(c, 1000, 170, 70, "#fff4b0"); rect(c, -600, 600, W + 1200, 600, "#c9a46a")
    rect(c, 330, 440, 620, 30, "#6a4a2a", r=8); rect(c, 350, 380, 580, 22, "#6a4a2a", r=8); rect(c, 380, 470, 24, 130, "#4a321a"); rect(c, 880, 470, 24, 130, "#4a321a")
    raccoon(c, 520, 475, 0.72, "smile", x.st, bob=False)
    human(c, 770, 475, 0.72, "pro", "smile", x.st, facing=-1)

def art_recap_wrap(c, x): N.art_recap(c, x)

N.CH_TOTAL = 7
N.OUT = "/home/user/bp"; os.makedirs(N.OUT, exist_ok=True)
N.FINAL = "/home/user/beop.mp4"
N.RECAP = [("1", "확신을 의심하라"), ("2", "시대가 바뀌어도 사람은 같다"), ("3", "규칙은 무너질 때마다 쓰인다"), ("4", "지켜보지 말고 곁에 있어라"), ("5", "혼자 판단하지 말고, 혼자 버티지 말라")]
N.SCENES = [("hook", None, N.art_hook), ("bridge", 1, art_bridge), ("reaper", 2, art_reaper), ("history", 3, art_history), ("bookp", 4, art_bookp),
            ("final", 5, art_final), ("rescue", 6, art_rescue), ("bench", 7, art_bench), ("recap", 8, N.art_recap), ("end", None, N.art_end)]
N.VOICE.update({"저승사자": (N.HS, "-14%", "-32Hz"), "몰빵이": (N.HS, "-10%", "-6Hz"), "하녀": (N.SH, "+6%", "+18Hz"), "구근": (N.SH, "+10%", "+30Hz"),
                "직원": (N.SH, "+4%", "+2Hz"), "미래의너굴이": (N.IJ, "-8%", "-12Hz")})
N.TAGC.update({"저승사자": "#b06bff", "몰빵이": "#6bb0ff", "하녀": "#ffd0e8", "구근": "#a8e6a0", "직원": "#cfcfcf", "미래의너굴이": "#9fc8ff"})

def end_art(c, x):
    N.grad_bg(c, "#05060c", "#10142a")
    rich(c, "《{주식법전} 스피드런》", 640, 190, 76)
    txt(c, "확신이 클수록, 남의 의심이 나를 살린다", 640, 270, 36, WHITE)
    box_y = 330; rect(c, 190, box_y, 900, 250, "#10203a", 235, r=22)
    txt(c, "마음이 힘들 땐 혼자 버티지 마세요", 640, box_y + 70, 40, GOLD)
    txt(c, "자살예방상담전화  109  (24시간)", 640, box_y + 140, 40, WHITE)
    txt(c, "긴급 구조  119", 640, box_y + 200, 40, WHITE)
    txt(c, "※ 이 영화는 픽션이며, 제작비 4,500원 중 남은 돈은 없습니다.", 640, 650, 22, "#9aa0b5", stroke=False)
N.SCENES[-1] = ("end", None, end_art)

SHOTS = [
    ("hook", "N", "확신은, 어떻게 사람을 무너뜨리는가.", "{확신}은\n어떻게 사람을 무너뜨리는가", "sting", "flash"),
    ("hook", "N", "그리고, 무엇이 그를 살리는가.", "무엇이 그를 {살리는가}", "pop", ""),
    ("bridge", "N", "2026년 6월 19일. 한강 다리 위에, 한 남자가 서 있었다.", "2026.06.19", "pop", ""),
    ("bridge", "N", "전 재산을 한 종목에 걸었고, 계좌는 마이너스 8,400만 원이 되었다.", "-8,400만 원", "crash", "shake"),
    ("bridge", "N", "그는 틀렸다고 생각한 적이 없었다. 틀릴 수 있다는 생각 자체를, 해 본 적이 없었다.", "{확신}", "ding", ""),
    ("reaper", "N", "눈을 떠 보니, 저승이었다.", "", "whoosh", ""),
    ("reaper", "저승사자", "위험을 못 봐서가 아니야. 위험을 알면서도, 확신이 서면 다 걸기 때문이지.", "", "thud", ""),
    ("reaper", "N", "그래서 숙제가 주어졌다. 400년 전 시장으로 가서, 확신을 의심하는 법을 배워 올 것.", "{확신}을 의심하는 법", "ding", "flash"),
    ("history", "N", "1602년. 세계 최초의 주식시장. 사람들은 벌써 확신하고 있었다.", "1602 · 최초의 {확신}", "whoosh", ""),
    ("history", "하녀", "나도 배의 주인이 될 수 있다잖아요.", "", "pop", ""),
    ("history", "N", "1637년. 튤립 한 송이가, 집 한 채보다 비쌌다.", "1637 · {튤립}", "pop", ""),
    ("history", "구근", "저는 그냥 양파입니다.", "", "pop", "shake"),
    ("history", "N", "1929년. 전광판이 붉게 물든다. 사람들은 이번에도 같은 말을 한다.", "1929 · {대공황}", "crash", "shake"),
    ("history", "직원", "월요일이 문제예요!", "", "pop", ""),
    ("history", "N", "시대는 바뀌어도, 사람은 똑같이 확신하고 똑같이 무너졌다.", "시대는 변해도 {사람}은 같다", "ding", "flash"),
    ("bookp", "N", "무너질 때마다, 책에 규칙 한 줄이 새겨졌다.", "{조문} 한 줄", "sparkle", ""),
    ("bookp", "너굴이", "이 책, 맞춤법 검사까지 해요?", "", "pop", ""),
    ("bookp", "N", "그리고 그 모든 여정을, 말없이 지켜보는 사람이 있었다.", "", "whoosh", ""),
    ("bookp", "몰빵이", "처음 뵙겠습니다.", "검사, {몰빵이}", "ding", "flash"),
    ("final", "N", "그리고 다시, 2026년 6월 19일 17시 12분. 그 다리 위.", "", "sting", ""),
    ("final", "몰빵이", "지켜보러 온 게 아닙니다. 곁에 있으러 왔습니다.", "{곁}에 있으러 왔다", "thud", "shake"),
    ("final", "N", "이번에 필요한 건 규칙이 아니었다. 그의 마지막 한마디였다.", "", "pop", ""),
    ("final", "미래의너굴이", "나는 네가 쓰지 못한 마지막 조문이야. 네가 써.", "", "ding", ""),
    ("final", "너굴이", "살고 싶다고! 나, 아직 안 끝났어!", "{살고 싶다}", "crash", "flash"),
    ("rescue", "몰빵이", "5분 걸렸습니다! 5분이요!", "", "thud", "shake"),
    ("rescue", "N", "관측자는 그날, 실행자가 되었다.", "지켜보는 사람에서\n{곁에 있는 사람}으로", "sparkle", "flash"),
    ("bench", "몰빵이", "지켜보고 있었습니다.", "", "pop", ""),
    ("bench", "몰빵이", "아니, 곁에 있었습니다.", "", "ding", "flash"),
    ("bench", "N", "확신은 혼자 두면 자란다. 그래서, 곁에서 함께 의심해 줄 사람이 필요하다.", "{의심}해 줄 사람", "ding", ""),
    ("recap", "N", "속독으로, 한 번에 정리한다.", "{5줄} 요약", "whoosh", ""),
    ("recap", "N", "하나. 확신을 의심하라.", "", "pop", ""),
    ("recap", "N", "둘. 시대가 바뀌어도, 사람은 같다.", "", "pop", ""),
    ("recap", "N", "셋. 규칙은, 무너질 때마다 쓰인다.", "", "pop", ""),
    ("recap", "N", "넷. 지켜보지 말고, 곁에 있어라.", "", "pop", ""),
    ("recap", "N", "다섯. 혼자 판단하지 말고, 혼자 버티지 말라.", "", "ding", "flash"),
    ("end", "N", "마음이 힘들 땐, 혼자 버티지 마세요. 상담전화는 24시간 받습니다.", "", "ding", ""),
    ("end", "N", "주식법전 스피드런.", "", "thud", ""),
]
N.SHOTS = SHOTS

def verify():
    lines = []
    for l in open(SCRIPT, encoding="utf-8"):
        if l.startswith("@"):
            sp, _, t = l.rstrip("\n")[1:].partition(" ")
            lines.append((sp, re.sub(r"\s+", " ", re.sub(r"\([^)]*\)", " ", t)).replace("…", " ")))
    norm = lambda s: re.sub(r"\s+", " ", s).strip()
    for sc, who, text, *_ in SHOTS:
        if who == "N": continue
        if not any(sp == who and norm(text) in norm(t) for sp, t in lines):
            raise SystemExit("QUOTE/SPEAKER NOT IN SCRIPT: %s: %s" % (who, text))
    ends = open(SCRIPT, encoding="utf-8").read()
    assert "자살예방상담전화 109(24시간) 또는 119" in ends
    print("script check OK", flush=True)

if __name__ == "__main__":
    verify()
    N.main()
