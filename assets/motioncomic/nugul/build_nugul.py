#!/usr/bin/env python3
"""《주식너굴: 사실 그 가격은 처음부터 없었다》 — 코드 애니메이션 판 (크레딧 0).
skia-python 으로 그림 → ffmpeg. 음성은 edge-tts, 자막=음성 문장 단위로 1:1.
Usage: python3 build_nugul.py [preview]   -> /home/user/nugul.mp4  (preview: 장면별 한 컷 PNG만)
"""
import asyncio, json, math, os, random, re, subprocess, sys
import skia
import edge_tts

W, H, FPS = 1280, 720, 25
OUT = "/home/user/nl"; os.makedirs(OUT, exist_ok=True)
FP = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
TF = skia.Typeface.MakeFromFile(FP)
FONTS = {}
def font(sz):
    sz = int(sz)
    if sz not in FONTS:
        FONTS[sz] = skia.Font(TF, sz)
    return FONTS[sz]

def hexc(h, a=255):
    h = h.lstrip("#")
    return skia.ColorSetARGB(a, int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
GOLD, CYAN, RED, GREEN, WHITE = "#FFD866", "#5EE1FF", "#FF5C5C", "#4CD68B", "#FFFFFF"

def P(color, a=255, stroke=0, cap=True):
    p = skia.Paint(AntiAlias=True)
    p.setColor(hexc(color, a))
    if stroke:
        p.setStyle(skia.Paint.kStroke_Style); p.setStrokeWidth(stroke)
        if cap: p.setStrokeCap(skia.Paint.kRound_Cap)
    return p

def rect(c, x, y, w, h, color, a=255, r=0):
    R = skia.Rect.MakeXYWH(x, y, w, h)
    if r: c.drawRoundRect(R, r, r, P(color, a))
    else: c.drawRect(R, P(color, a))
def oval(c, cx, cy, rx, ry, color, a=255):
    c.drawOval(skia.Rect.MakeXYWH(cx - rx, cy - ry, 2 * rx, 2 * ry), P(color, a))
def circ(c, cx, cy, r, color, a=255):
    c.drawCircle(cx, cy, r, P(color, a))
def line(c, x0, y0, x1, y1, color, w=4, a=255):
    c.drawLine(x0, y0, x1, y1, P(color, a, stroke=w))
def poly(c, pts, color, a=255, close=True, stroke=0):
    path = skia.Path(); path.moveTo(*pts[0])
    for q in pts[1:]: path.lineTo(*q)
    if close: path.close()
    c.drawPath(path, P(color, a, stroke=stroke))
def polyline(c, pts, color, w=5, a=255):
    path = skia.Path(); path.moveTo(*pts[0])
    for q in pts[1:]: path.lineTo(*q)
    pp = P(color, a, stroke=w); pp.setStrokeJoin(skia.Paint.kRound_Join)
    c.drawPath(path, pp)

def ease(t): t = max(0, min(1, t)); return t * t * (3 - 2 * t)
def back(t):
    t = max(0, min(1, t)); s = 1.70158
    return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2
def clamp01(x): return max(0.0, min(1.0, x))
def seg(u, a, b): return clamp01((u - a) / (b - a))

def text_w(s, sz): return font(sz).measureText(s)
def txt(c, s, x, y, sz, color=WHITE, align="c", stroke=True, a=255):
    f = font(sz); w = f.measureText(s)
    x0 = x - w / 2 if align == "c" else (x if align == "l" else x - w)
    if stroke:
        sp = P("#000000", a, stroke=max(3, sz // 9)); sp.setStrokeJoin(skia.Paint.kRound_Join)
        c.drawString(s, x0, y, f, sp)
    c.drawString(s, x0, y, f, P(color, a))

def rich(c, s, cx, cy, size, a=255, scale=1.0):
    """{강조}는 금색. \n 줄바꿈. 폭 넘으면 자동 축소."""
    lines = s.split("\n")
    def parts(l): return [(t, i % 2 == 1) for i, t in enumerate(re.split(r"[{}]", l)) if t]
    sz = size
    while max(sum(text_w(t, sz) for t, _ in parts(l)) for l in lines) > 1140 and sz > 28: sz -= 4
    lh = sz * 1.25
    y0 = cy - (len(lines) - 1) * lh / 2
    c.save(); c.translate(cx, cy); c.scale(scale, scale); c.translate(-cx, -cy)
    for i, l in enumerate(lines):
        ps = parts(l); tot = sum(text_w(t, sz) for t, _ in ps); x = cx - tot / 2
        for t, hl in ps:
            txt(c, t, x, y0 + i * lh + sz * 0.35, sz, GOLD if hl else WHITE, align="l", a=a)
            x += text_w(t, sz)
    c.restore()

def wrap(s, sz, maxw):
    out, cur = [], ""
    for ch in s:
        if text_w(cur + ch, sz) > maxw and cur:
            out.append(cur.strip()); cur = ch
        else: cur += ch
    if cur.strip(): out.append(cur.strip())
    return out

def grad_bg(c, top, bot):
    p = skia.Paint()
    p.setShader(skia.GradientShader.MakeLinear([(0, 0), (0, H)], [hexc(top), hexc(bot)]))
    c.drawRect(skia.Rect.MakeWH(W, H), p)

def mix(a, b, t):
    ca = [int(a[i:i + 2], 16) for i in (1, 3, 5)]; cb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#%02x%02x%02x" % tuple(int(x + (y - x) * t) for x, y in zip(ca, cb))

# ---------------------------------------------------------------- characters
def raccoon(c, x, y, s, mood="normal", t=0, facing=1, hand_r=None, hand_l=None, bob=True):
    c.save(); c.translate(x, y + (math.sin(t * 4) * 3 * s if bob else 0)); c.scale(s * facing, s)
    G, D = "#9aa0aa", "#2f323b"
    for i in range(6):
        oval(c, -70 - 22 * i, -80 - 16 * i + 3 * math.sin(t * 3 + i), 30 - 2 * i, 24 - 2 * i, D if i % 2 else G)
    rect(c, -45, -40, 30, 40, "#16254a", r=8); rect(c, 15, -40, 30, 40, "#16254a", r=8)
    oval(c, -30, 0, 28, 10, "#0b0b0f"); oval(c, 30, 0, 28, 10, "#0b0b0f")
    rect(c, -60, -205, 120, 170, "#1d2f5a", r=26)
    poly(c, [(-16, -205), (16, -205), (0, -150)], "#f2f2f2")
    poly(c, [(0, -195), (9, -170), (0, -120), (-9, -170)], "#c4373d")
    hl = hand_l or (-86, -110 + math.sin(t * 3) * 4); hr = hand_r or (86, -110 + math.cos(t * 3) * 4)
    line(c, -52, -185, hl[0], hl[1], "#1d2f5a", 28); line(c, 52, -185, hr[0], hr[1], "#1d2f5a", 28)
    circ(c, hl[0], hl[1], 15, G); circ(c, hr[0], hr[1], 15, G)
    oval(c, 0, -268, 80, 62, G)
    circ(c, -56, -318, 24, G); circ(c, 56, -318, 24, G); circ(c, -56, -316, 12, D); circ(c, 56, -316, 12, D)
    oval(c, -32, -270, 32, 22, D); oval(c, 32, -270, 32, 22, D); rect(c, -16, -278, 32, 14, D)
    oval(c, 0, -244, 40, 28, "#f4f4f4"); oval(c, 0, -258, 11, 7, "#0b0b0f")
    blink = (t % 3.3) < 0.12
    ey = -272
    if mood == "sleep" or blink:
        for sx in (-30, 30): line(c, sx - 10, ey, sx + 10, ey, "#f4f4f4", 4)
    elif mood == "smile":
        for sx in (-30, 30):
            path = skia.Path(); path.moveTo(sx - 10, ey + 4); path.quadTo(sx, ey - 10, sx + 10, ey + 4)
            c.drawPath(path, P("#f4f4f4", stroke=4))
    else:
        r = 15 if mood == "shock" else 11
        for sx in (-30, 30): circ(c, sx, ey, r, "#ffffff"); circ(c, sx + 2 * facing * 0, ey + 1, 3 if mood == "shock" else 5, "#0b0b0f")
        if mood == "tired":
            for sx in (-30, 30):
                rect(c, sx - 14, ey - 16, 28, 16, D); oval(c, sx, ey + 15, 14, 5, "#6a5a8a", 200)
        if mood == "grit":
            line(c, -52, -296, -14, -284, "#0b0b0f", 6); line(c, 52, -296, 14, -284, "#0b0b0f", 6)
    if mood == "shock": oval(c, 0, -228, 9, 11, "#3a0d12")
    elif mood == "smile":
        path = skia.Path(); path.moveTo(-14, -232); path.quadTo(0, -216, 14, -232); c.drawPath(path, P("#0b0b0f", stroke=3))
    elif mood == "grit": line(c, -10, -230, 10, -230, "#0b0b0f", 4)
    elif mood == "tired": line(c, -9, -229, 9, -231, "#0b0b0f", 3)
    c.restore()
    if mood == "sleep":
        for i in range(3):
            tt = (t * 0.7 + i / 3) % 1
            txt(c, "Z", x + 60 * s + tt * 60, y - 330 * s - tt * 90, int(26 + 16 * i), "#cfe3ff", a=int(255 * (1 - tt)))

def fox(c, x, y, s, t=0, facing=1, sign=None, vanish=0.0):
    c.save(); c.translate(x, y + math.sin(t * 5) * 3 * s); c.scale(s * facing, s)
    O = "#f08a2c"
    oval(c, 85, -90, 46, 30, O); oval(c, 110, -100, 22, 14, "#ffffff")
    poly(c, [(-58, -200), (58, -200), (84, 0), (-84, 0)], "#6b3fa0")
    poly(c, [(-14, -200), (14, -200), (0, -150)], "#f2f2f2")
    line(c, -52, -185, -80, -120, "#6b3fa0", 26); line(c, 52, -185, 80, -130, "#6b3fa0", 26)
    circ(c, -80, -118, 13, O); circ(c, 80, -128, 13, O)
    oval(c, 0, -262, 74, 56, O)
    poly(c, [(-62, -295), (-38, -340), (-14, -300)], O); poly(c, [(62, -295), (38, -340), (14, -300)], O)
    poly(c, [(-54, -300), (-40, -326), (-24, -302)], "#7a3a10"); poly(c, [(54, -300), (40, -326), (24, -302)], "#7a3a10")
    poly(c, [(-60, -250), (0, -215), (60, -250), (0, -240)], "#ffffff")
    oval(c, 0, -246, 11, 8, "#111111")
    rect(c, -62, -286, 124, 26, "#0b0b0f", r=10); rect(c, -50, -282, 40, 6, "#ffffff", 120, r=3)
    path = skia.Path(); path.moveTo(-26, -228); path.quadTo(0, -208, 26, -228); c.drawPath(path, P("#0b0b0f", stroke=4))
    for k in (-14, 0, 14): rect(c, k - 5, -226, 10, 8, "#ffffff")
    poly(c, [(-44, -318), (44, -318), (22, -396), (-22, -396)], "#141414")
    rect(c, -52, -322, 104, 10, "#141414", r=5); circ(c, 0, -360, 7, GOLD)
    if sign:
        line(c, 80, -128, 140, -190, "#8b5a2b", 8)
        rect(c, 100, -280, 190, 100, "#f5e6c0", r=8)
        c.restore(); c.save(); c.translate(x, y); c.scale(s, s)
        txt(c, sign[0], 195 * facing, -240, 26, "#7a1f1f", stroke=False); txt(c, sign[1], 195 * facing, -205, 22, "#7a1f1f", stroke=False)
    c.restore()

def sheep(c, x, y, s, t=0, panic=False, facing=1, phase=0.0):
    c.save(); hop = abs(math.sin((t + phase) * (11 if panic else 3))) * (22 if panic else 4) * s
    c.translate(x, y - hop); c.scale(s * facing, s)
    for lx in (-28, -10, 14, 32): rect(c, lx, -30, 8, 30, "#2b2b33")
    for dx, dy, r in ((-30, -60, 30), (0, -75, 34), (30, -60, 30), (-10, -48, 30), (18, -48, 30)): circ(c, dx, dy, r, "#f2f2f2")
    oval(c, 52, -62, 22, 20, "#3a3a44")
    circ(c, 56, -68, 7 if panic else 5, "#ffffff"); circ(c, 57, -68, 2.5, "#000000")
    if panic: oval(c, 66, -48, 5, 7, "#000000"); oval(c, 38, -100 + math.sin(t * 9) * 3, 5, 7, "#7fd4ff")
    c.restore()

def book(c, x, y, s, glow=0.0, t=0):
    c.save(); c.translate(x, y); c.scale(s, s)
    if glow > 0:
        p = skia.Paint(); p.setShader(skia.GradientShader.MakeRadial((0, -80), 190, [hexc(GOLD, int(200 * glow)), hexc(GOLD, 0)]))
        c.drawCircle(0, -80, 190, p)
    rect(c, -62, -160, 124, 160, "#7a1f2b", r=8); rect(c, -62, -160, 14, 160, "#4a0f18", r=6)
    rect(c, -42, -140, 90, 120, "none" if False else "#a8323f", r=4)
    txt(c, "비법서", 6, -88, 28, GOLD, stroke=False)
    line(c, -26, -62, 40, -62, GOLD, 3)
    c.restore()

def phone(c, x, y, w, h):
    rect(c, x - 8, y - 8, w + 16, h + 16, "#0c0f1a", r=34); rect(c, x, y, w, h, "#16213a", r=26)
    rect(c, x + w / 2 - 40, y + 8, 80, 8, "#0c0f1a", r=4)

def bubble(c, x, y, s, color, tc, sz=26, a=255, tail=1):
    w = text_w(s, sz) + 36; h = sz + 26
    rect(c, x, y, w, h, color, a, r=18)
    poly(c, [(x + 18 if tail > 0 else x + w - 18, y + h - 2), (x + 8 if tail > 0 else x + w - 8, y + h + 14), (x + 34 if tail > 0 else x + w - 34, y + h - 2)], color, a)
    txt(c, s, x + 18, y + h / 2 + sz * 0.35, sz, tc, align="l", stroke=False, a=a)
    return w, h

def monitor(c, x, y, w, h, t, seed=0, col=GREEN):
    rect(c, x - 6, y - 6, w + 12, h + 12, "#07080e", r=8); rect(c, x, y, w, h, "#0d1626")
    random.seed(seed); pts = []
    for i in range(14):
        pts.append((x + 10 + i * (w - 20) / 13, y + h * 0.5 + math.sin(i * 1.3 + t * 2 + seed) * h * 0.22 + random.uniform(-6, 6)))
    polyline(c, pts, col, 3)
    rect(c, x + w / 2 - 14, y + h + 6, 28, 18, "#07080e")

def chart_panel(c, x, y, w, h):
    rect(c, x, y, w, h, "#0a1020", 235, r=16)
    for i in range(1, 5): line(c, x + 14, y + h * i / 5, x + w - 14, y + h * i / 5, "#1f2b48", 2)
    for i in range(1, 6): line(c, x + w * i / 6, y + 14, x + w * i / 6, y + h - 14, "#161f38", 2)

def plot(c, pts, prog, color, w=6):
    n = max(2, int(len(pts) * prog)); sub = pts[:n]
    if prog < 1 and n < len(pts):
        f = len(pts) * prog - (n - 1) if n > 1 else 0
        a, b = pts[n - 1], pts[min(n, len(pts) - 1)]
        sub = pts[:n] + [(a[0] + (b[0] - a[0]) * clamp01(f), a[1] + (b[1] - a[1]) * clamp01(f))]
    polyline(c, sub, color, w)
    return sub[-1]

# ---------------------------------------------------------------- scenes (art functions)
class Ctx:  # st=장면 시간, u=장면 진행(0~1), k=샷 번호, lt=샷 내 시간, lu=샷 진행
    pass

def bg_default(c, x): grad_bg(c, "#0a0f22", "#1a2447")

def art_hook(c, x):
    grad_bg(c, "#05060c", "#10142a")
    random.seed(7)
    for i in range(22):
        px = random.uniform(40, W - 40); sp = random.uniform(30, 90); ph = random.uniform(0, 6)
        yy = (H + 40 - ((x.st * sp + ph * 90) % (H + 80)))
        al = int(70 * (1 - abs(yy - H / 2) / (H / 2 + 40)))
        txt(c, "{:,}".format(random.randint(10000, 2999000)), px, yy, random.choice([22, 26, 30]), "#4a6fff", stroke=False, a=max(0, al))

def art_night(c, x):
    grad_bg(c, "#06070f", "#141a33")
    rect(c, 0, 520, W, 200, "#1b1426")
    for i, mx in enumerate((150, 470, 790)): monitor(c, mx, 190, 300, 190, x.st, seed=i * 3, col=[GREEN, CYAN, RED][i])
    rect(c, 90, 505, 1100, 24, "#2b2036", r=6)
    # 시계
    circ(c, 1140, 120, 54, "#e8e8f0"); circ(c, 1140, 120, 48, "#10131f")
    ang = x.st * 6.0
    line(c, 1140, 120, 1140 + 30 * math.sin(ang), 120 - 30 * math.cos(ang), WHITE, 4); line(c, 1140, 120, 1140 + 22 * math.sin(ang / 12), 120 - 22 * math.cos(ang / 12), RED, 5)
    day = 1 + int(x.u * 2.99)
    txt(c, "밤샘 %d일째" % day, 1140, 205, 28, GOLD)
    for i in range(int(1 + x.u * 6)): rect(c, 100 + i * 34, 480, 24, 28, "#e9dcc8", r=4)
    raccoon(c, 600, 560, 1.05, "tired", x.st)

def art_chat(c, x):
    grad_bg(c, "#0a0f22", "#1a2447")
    phone(c, 430, 40, 420, 640)
    rect(c, 450, 60, 380, 56, "#24365e", r=12); txt(c, "정답 가격 단톡방 (999명)", 640, 96, 26, WHITE, stroke=False)
    msgs = [("족집게", "오늘의 정답 가격, 월 만 원도 안 돼요!", 0.12, "#f08a2c", 130), ("양떼", "와, 믿습니다!", 0.42, "#e9e9ef", 250), ("양떼", "구독!", 0.58, "#e9e9ef", 340), ("너굴이", "정답이다… 드디어!", 0.74, "#7fb3ff", 430)]
    for who, m, t0, colr, yy in msgs:
        if x.u > t0:
            p = back((x.u - t0) / 0.06)
            c.save(); c.translate(470, yy); c.scale(p, p); c.translate(-470, -yy)
            txt(c, who, 470, -4 + yy - 24 + 24, 18, "#9fb0d8", align="l", stroke=False)
            bw, bh = text_w(m, 24) + 30, 50
            w, _ = bubble(c, 470, yy + 4, m, colr, "#101830", 24)
            c.restore()
    if x.u > 0.1: fox(c, 1060, 660, 1.0, x.st, facing=-1)
    raccoon(c, 130, 680, 0.8, "tired" if x.u < 0.7 else "smile", x.st)
    for i in range(3): sheep(c, 250 + i * 62, 690, 0.62, x.st, phase=i)

def art_allin(c, x):
    grad_bg(c, "#0a0f22", "#1a2447")
    u = x.u
    chart_panel(c, 180, 70, 920, 400)
    up = [(210 + i * 40, 420 - i * 11 - (6 if i % 3 == 0 else 0)) for i in range(10)]
    crash = [(600, 320), (640, 300), (680, 340), (720, 420), (760, 410), (800, 450), (860, 455), (920, 452), (1000, 456)]
    allp = up + crash
    pr = seg(u, 0.22, 0.62)
    last = plot(c, allp, pr, GREEN if pr < 0.55 else RED)
    circ(c, last[0], last[1], 9, WHITE)
    # 버튼
    press = seg(u, 0.16, 0.24)
    rect(c, 480, 540 + press * 8, 160, 90 - press * 8, "#8c1d22", r=20); rect(c, 480, 520 + press * 10, 160, 80 - press * 10, "#e53b3b", r=20)
    txt(c, "전재산 몰빵", 560, 574 + press * 10, 32, WHITE)
    raccoon(c, 840, 690, 0.95, "grit" if u < 0.55 else "shock", x.st, facing=-1, hand_l=(520 + 280 * 0 + (-250) + press * 20 + 250, 600) if False else None)
    # 잔고
    bal = int(100_000_000 * (1 - seg(u, 0.6, 0.9)))
    txt(c, "잔고  {:,}원".format(bal), 640, 40, 34, RED if u > 0.6 else GOLD)
    if u > 0.66:
        p = back((u - 0.66) / 0.08)
        c.save(); c.translate(640, 270); c.rotate(-12); c.scale(1.6 - 0.6 * min(1, p), 1.6 - 0.6 * min(1, p))
        rect(c, -190, -50, 380, 100, "#3a0508", 190, r=10); c.drawRoundRect(skia.Rect.MakeXYWH(-190, -50, 380, 100), 10, 10, P(RED, stroke=8))
        txt(c, "반대매매", 0, 22, 70, RED); c.restore()
    if u > 0.88: bubble(c, 90, 520, "방이 삭제되었습니다", "#f08a2c", "#101830", 26)
    if u > 0.88: fox(c, 120, 700, 0.8, x.st) if False else None

def art_book(c, x):
    grad_bg(c, "#0a0f22", "#1b1530")
    u = x.u
    rect(c, 0, 600, W, 120, "#1a1424")
    drop = ease(seg(u, 0.0, 0.18)); by = -300 + (600 - -300) * drop
    bounce = 0 if u > 0.22 else 0
    if u < 0.3:
        c.save(); c.translate(640, min(600, by)); rect(c, -120, -120, 240, 120, "#b88a4a", r=6); rect(c, -120, -120, 240, 20, "#d9ad6a", r=4); rect(c, -20, -120, 40, 120, "#e9d3a0", 120); c.restore()
    else:
        rect(c, 520, 480, 240, 120, "#b88a4a", r=6)
        poly(c, [(520, 480), (470, 440), (560, 440), (600, 480)], "#d9ad6a"); poly(c, [(760, 480), (810, 440), (720, 440), (680, 480)], "#d9ad6a")
        rise = ease(seg(u, 0.3, 0.55))
        book(c, 640, 480 - rise * 120, 1.1, glow=seg(u, 0.35, 0.6), t=x.st)
    raccoon(c, 240, 640, 1.0, "shock" if u < 0.55 else "normal", x.st)

def art_contrarian(c, x):
    grad_bg(c, "#0a0f22", "#1a2447")
    u = x.u
    chart_panel(c, 60, 60, 800, 400)
    pts = [(90, 140), (170, 120), (250, 150), (330, 160)] + [(400, 200), (450, 330), (500, 420), (540, 440)] + [(600, 400), (660, 330), (720, 260), (780, 230)]
    pr = seg(u, 0.1, 0.8)
    last = plot(c, pts, pr, CYAN if pr < 0.45 else GREEN)
    circ(c, last[0], last[1], 9, WHITE)
    y318 = 140 + (440 - 140) * 0.318 * 0 + 330
    if u > 0.3:
        al = int(255 * seg(u, 0.3, 0.4))
        for yy in (150 + 0.382 * 290, 150 + 0.5 * 290, 150 + 0.618 * 290):
            rect(c, 70, yy - 3, 780, 6, GOLD, 70 if al else 0)
        line(c, 70, 330, 850, 330, RED, 3, a=al)
        txt(c, "고점 대비 -31.8%", 200, 322, 26, RED, a=al, stroke=False)
    # RSI 게이지
    rect(c, 900, 60, 90, 400, "#0a1020", r=14); rect(c, 900, 60 + 400 * 0.7, 90, 400 * 0.3, "#143a2a", r=0)
    line(c, 900, 60 + 400 * 0.7, 990, 60 + 400 * 0.7, GREEN, 4)
    txt(c, "RSI 30", 945, 500, 28, GREEN)
    rv = 0.45 + 0.35 * math.sin(min(1, pr / 0.55) * math.pi * 0.5) - (0.0 if pr < 0.55 else 0.25 * seg(pr, 0.55, 1.0))
    ry = 60 + 400 * (1 - clamp01(0.62 - 0.35 * ease(seg(pr, 0.0, 0.58)) + 0.4 * ease(seg(pr, 0.6, 1.0))))
    circ(c, 945, ry, 13, GOLD)
    # 양떼는 공포로 도망
    for i in range(5): sheep(c, 1210 - ((x.st * 160 + i * 90) % 520), 650, 0.8, x.st, panic=True, facing=-1, phase=i)
    raccoon(c, 1100, 560, 0.62, "grit", x.st, facing=-1)

def art_volume(c, x):
    grad_bg(c, "#0a0f22", "#1a2447")
    u = x.u
    base = 620
    rect(c, 60, base, 1160, 6, "#333344", r=3)
    random.seed(4)
    for i in range(16):
        h = random.uniform(18, 70) * ease(seg(u, 0.05, 0.3))
        rect(c, 100 + i * 52, base - h, 36, h, "#6b7184", r=4)
    hh = 380 * ease(seg(u, 0.25, 0.5))
    rect(c, 940, base - hh, 100, hh, GOLD, r=8)
    if u > 0.5: txt(c, "거래대금 1위", 990, base - hh - 16, 30, GOLD)
    if u > 0.3: txt(c, "잡주들", 380, base + 44, 26, "#9aa0b5", stroke=False)
    # 도사 + 잡주 유혹
    fx = 300 if u < 0.62 else 300 - 900 * ease(seg(u, 0.62, 0.8)); fr = 0 if u < 0.62 else 720 * ease(seg(u, 0.62, 0.8))
    c.save(); c.translate(fx, 600 - 160 * ease(seg(u, 0.62, 0.75)) * 0 );
    c.restore()
    c.save(); c.translate(fx, 0); c.rotate(fr * 0.0)
    fox(c, 0 + 300 - fx + fx - 0, 560, 0.9, x.st, sign=("이 잡주", "100배!") if u < 0.62 else None) if False else None
    c.restore()
    c.save(); c.translate(fx - 300, 0)
    fox(c, 300, 560, 0.9, x.st, sign=("이 잡주", "100배!"))
    c.restore()
    sw = 0 if u < 0.55 else math.sin(seg(u, 0.55, 0.65) * math.pi) * 60
    raccoon(c, 600, 640, 1.0, "grit", x.st, facing=1, hand_r=(120 - sw, -150 + sw * 0.4))

def art_sleep(c, x):
    u = x.u
    sky_top = mix("#05060f", "#7fc8ff", ease(seg(u, 0.55, 0.85))); sky_bot = mix("#141a33", "#ffe7b0", ease(seg(u, 0.55, 0.85)))
    grad_bg(c, sky_top, sky_bot)
    if u < 0.75: circ(c, 1080, 120 + 200 * ease(seg(u, 0.5, 0.75)), 46, "#f2efd0", int(255 * (1 - seg(u, 0.5, 0.75))))
    else: circ(c, 1080, 400 - 280 * ease(seg(u, 0.75, 0.95)), 60, "#fff0a0")
    rect(c, 0, 560, W, 160, "#20182c"); rect(c, 180, 470, 560, 110, "#d8dbe8", r=18); rect(c, 180, 520, 560, 70, "#4a5aa0", r=12)
    raccoon(c, 460, 520, 0.7, "sleep" if u < 0.62 else "smile", x.st)
    chart_panel(c, 780, 150, 440, 300)
    rect(c, 790, 150 + 300 * 0.7, 420, 300 * 0.3, "#143a2a", 160); line(c, 790, 150 + 300 * 0.7, 1210, 150 + 300 * 0.7, GREEN, 3)
    txt(c, "RSI 30", 1160, 150 + 300 * 0.7 - 8, 22, GREEN, stroke=False)
    pts = [(800, 220), (850, 290), (880, 372), (920, 300), (960, 250), (1000, 380), (1040, 310), (1075, 260), (1110, 376), (1150, 300), (1200, 210)]
    plot(c, pts, seg(u, 0.1, 0.9), CYAN, 5)
    for i, (px, py) in enumerate(((880, 372), (1000, 380), (1110, 376))):
        t0 = (0.3, 0.5, 0.7)[i]
        if u > t0:
            p = back((u - t0) / 0.06); circ(c, px, py, 14 * p, GREEN if i == 2 else GOLD); txt(c, str(i + 1), px, py - 22, 24, WHITE)
    if u > 0.72: txt(c, "다 털린 자리", 1000, 480, 34, GREEN)

def art_twist(c, x):
    u = x.u
    grad_bg(c, "#0a0f22", "#1a2447")
    chart_panel(c, 160, 80, 960, 420)
    random.seed(11)
    lab = [(random.uniform(220, 1040), random.uniform(130, 460), random.randint(1000000, 2299000), random.uniform(0.0, 0.5)) for _ in range(22)]
    for px, py, v, d in lab:
        fade = 1 - seg(u, 0.55 + d * 0.4, 0.62 + d * 0.4)
        txt(c, "{:,}".format(v), px, py - 40 * (1 - fade), 24, "#8fb1ff", a=int(220 * fade), stroke=False)
    pts = [(190, 400), (320, 320), (440, 360), (580, 230), (720, 280), (860, 180), (1010, 240), (1090, 150)]
    plot(c, pts, 1.0, CYAN, 4)
    if u > 0.55: rect(c, 160, 80, 960, 420, "#0a1020", int(255 * seg(u, 0.6, 0.95)), r=16)
    # 도사 → 너굴이 실루엣
    f = 1 - ease(seg(u, 0.18, 0.5))
    c.save(); pa = skia.Paint(); pa.setAlpha(int(255 * f)); c.saveLayer(None, pa); fox(c, 640, 690, 1.05, x.st); c.restore(); c.restore()
    g = ease(seg(u, 0.25, 0.6)) * (1 - ease(seg(u, 0.7, 1.0)))
    c.save(); pa = skia.Paint(); pa.setAlpha(int(200 * g)); c.saveLayer(None, pa); raccoon(c, 640, 690, 1.05, "normal", x.st); c.restore(); c.restore()
    if u > 0.3 and u < 0.62:
        bubble(c, 790, 250, "정답을 갖고 싶던 마음", "#ffffff", "#101830", 26, a=int(255 * ease(seg(u, 0.3, 0.38))))

def art_article(c, x):
    u = x.u
    grad_bg(c, "#120d1e", "#241a3a")
    rect(c, 190, 120, 420, 440, "#f3e7c9", r=14); rect(c, 610, 120, 420, 440, "#ecdcb7", r=14); rect(c, 604, 120, 12, 440, "#b8a073")
    title = "제39조 (검증의 의무)"
    body = ["① 의심을 통과하지 못한", "   판단은 쓰지 않는다.", "② 가격은 없어도,", "   규칙은 있다."]
    n = int(len(title) * ease(seg(u, 0.25, 0.55)))
    txt(c, title[:n], 640, 205, 40, "#3b2a12", stroke=False)
    for i, l in enumerate(body):
        t0 = 0.55 + i * 0.1
        if u > t0:
            m = int(len(l) * seg(u, t0, t0 + 0.1)); txt(c, l[:m], 250 if i < 2 else 650, 300 + i * 52 if i < 2 else 300 + (i - 2) * 52, 30, "#3b2a12", align="l", stroke=False)
    pen_x = 640 + 200 * seg(u, 0.25, 0.55) - 100
    raccoon(c, 1110, 650, 0.9, "grit", x.st, facing=-1, hand_l=(-70, -190 + 10 * math.sin(x.st * 9)))
    if u < 0.55: circ(c, pen_x, 215, 5, "#c4373d")

def art_ending(c, x):
    u = x.u
    grad_bg(c, "#7fc8ff", "#ffe7b0")
    circ(c, 1100, 130, 64, "#fff0a0"); rect(c, 0, 600, W, 120, "#e2c58c")
    raccoon(c, 360, 640, 1.2, "smile", x.st, hand_r=(86, -150))
    rect(c, 470, 470, 40, 44, "#fff", r=6)
    for i in range(3): txt(c, "~", 490 + math.sin(x.st * 3 + i) * 6, 450 - i * 22 - (x.st * 12 % 20), 28, "#ffffff", a=160, stroke=False)
    phone(c, 760, 70, 400, 560)
    rect(c, 776, 90, 368, 54, "#24365e", r=12); txt(c, "규칙 단톡방", 960, 124, 26, WHITE, stroke=False)
    if x.k >= 2 or x.u > 0.62:
        a0 = back((x.u - 0.62) / 0.08) if x.k < 2 else 1
        rect(c, 790, 190, 340, 50, "#f6f6fb", r=14); txt(c, "정답 팝니다", 960, 224, 26, "#101830", stroke=False)
        line(c, 800, 215, 1120, 215, RED, 5, a=int(255 * clamp01(a0)))
        bubble(c, 790, 280, "규칙 나눕니다", "#7fb3ff", "#101830", 26, a=int(255 * clamp01(a0)))
    for i in range(2): sheep(c, 820 + i * 90, 600, 0.7, x.st, phase=i)

def art_recap(c, x):
    grad_bg(c, "#0a0f22", "#1a2447")
    items = [("1", "정답은 없다"), ("2", "반대편에 서라"), ("3", "큰 거래대금"), ("4", "잠이 먼저"), ("5", "검증하라")]
    for i, (n, s) in enumerate(items):
        if x.k - 1 >= i:
            p = back(x.lt / 0.3) if x.k - 1 == i else 1
            y = 150 + i * 105
            c.save(); c.translate(640, y); c.scale(p, p); c.translate(-640, -y)
            rect(c, 270, y - 40, 740, 84, "#16264a", r=18); circ(c, 330, y + 2, 28, GOLD); txt(c, n, 330, y + 14, 36, "#1a1a1a", stroke=False)
            txt(c, s, 410, y + 15, 44, WHITE, align="l"); c.restore()

def art_end(c, x):
    grad_bg(c, "#05060c", "#10142a")
    rich(c, "《{주식너굴}》", 640, 220, 80)
    txt(c, "사실 그 가격은 처음부터 없었다", 640, 300, 38, WHITE)
    if x.k >= 1: txt(c, "다음 편 — 반대편에 서라", 640, 430, 44, CYAN)
    txt(c, "※ 이 영화는 픽션이며, 투자 권유가 아닙니다.", 640, 640, 24, "#9aa0b5", stroke=False)

SCENES = [
    ("hook", None, art_hook), ("night", 1, art_night), ("chat", 2, art_chat), ("allin", 3, art_allin), ("book", 4, art_book),
    ("contrarian", 5, art_contrarian), ("volume", 6, art_volume), ("sleep", 7, art_sleep), ("twist", 8, art_twist),
    ("article", 9, art_article), ("ending", 10, art_ending), ("recap", 11, art_recap), ("end", None, art_end)]

# 샷: (scene, speaker, text(자막=음성), 큰글자 kw, sfx, flash/shake)
SHOTS = [
    ("hook", "N", "정답 가격은, 처음부터 없었다.", "{정답 가격}은,\n처음부터 없었다.", "sting", "flash"),
    ("hook", "N", "이건, 그 가격을 찾아 헤매던 너구리의 이야기다.", "《{주식너굴}》", "pop", ""),
    ("night", "N", "양복 입은 너구리 한 마리가, 사흘째 잠을 자지 않았다.", "{3일} 밤샘", "pop", ""),
    ("night", "N", "이유는 하나. 내일의 정확한 가격을 알고 싶어서.", "내일의 {정확한 가격}", "ding", ""),
    ("chat", "N", "그때 단톡방에 도사 한 명이 나타났다.", "", "whoosh", ""),
    ("chat", "족집게", "오늘의 정답 가격, 월 만 원도 안 돼요!", "", "pop", ""),
    ("chat", "양떼", "와, 믿습니다! 구독!", "", "pop", ""),
    ("chat", "너굴이", "정답이다. 드디어 찾았다!", "", "ding", ""),
    ("allin", "N", "너구리는 전 재산을, 한 방에 몰빵했다.", "{몰빵}", "pop", ""),
    ("allin", "N", "다음 날. 반대매매. 계좌는 텅 비었다.", "{반대매매}", "crash", "shake"),
    ("allin", "족집게", "방이 삭제되었습니다.", "", "pop", ""),
    ("book", "N", "그리고 다음 날, 택배가 하나 도착했다.", "", "thud", ""),
    ("book", "N", "열어 보니 책 한 권. 첫 문장은 이랬다.", "", "sparkle", ""),
    ("book", "비법서", "정답은 없었다. 그 순간의 판단만이 있었다.", "{정답}은 없었다.\n그 순간의 {판단}만 있었다.", "ding", "flash"),
    ("contrarian", "N", "첫 번째 가르침. 시장은 제로섬이다.", "1. {반대편}에 서라", "pop", ""),
    ("contrarian", "N", "남들이 공포로 던질 때, 그 자리가 바닥이다.", "-31.8% · RSI 30", "ding", ""),
    ("contrarian", "양떼", "으아아, 다 팔아!", "", "pop", "shake"),
    ("contrarian", "N", "가파르게 떨어질수록, 반등도 가파르다.", "{각도}가 가파를수록\n반등도 크다", "sparkle", ""),
    ("volume", "N", "두 번째 가르침. 돈이 몰리는 곳만 본다.", "2. {큰 거래대금}", "pop", ""),
    ("volume", "족집게", "이 잡주, 백 배 갑니다!", "", "pop", ""),
    ("volume", "너굴이", "나는 거래대금 맨 위만 본다.", "", "thud", "shake"),
    ("volume", "N", "큰 거래대금일수록, 확률은 예측대로 움직인다.", "큰 수의 법칙", "ding", ""),
    ("sleep", "N", "세 번째 가르침. 잠이 먼저다.", "3. {잠}이 먼저다", "pop", ""),
    ("sleep", "N", "잠 못 잔 머리는, 같은 자리에서 또 속는다.", "", "pop", ""),
    ("sleep", "N", "푹 자고 일어난 아침, 세 번째 과매도가 보였다.", "세 번째 과매도 =\n{다 털린 자리}", "sparkle", "flash"),
    ("sleep", "N", "남들이 다 나간 뒤, 살려주는 자리.", "{살려주는} 자리", "ding", ""),
    ("twist", "N", "그런데 도사는, 어느 순간 사라졌다.", "", "whoosh", ""),
    ("twist", "N", "알고 보니 도사는, 정답을 갖고 싶던 너구리의 마음이었다.", "도사 = {내 마음}", "sting", "flash"),
    ("twist", "N", "화면의 가격표가, 하나씩 지워졌다.", "", "whoosh", ""),
    ("twist", "N", "사실, 그 가격은 처음부터 없었다.", "{가격}은 처음부터 없었다", "thud", "flash"),
    ("article", "N", "가격은 없어도, 규칙은 있다.", "가격은 없어도,\n{규칙}은 있다", "ding", ""),
    ("article", "N", "너구리는 처음으로, 자기 글씨로 마지막 조문을 썼다.", "", "pop", ""),
    ("article", "너굴이", "제삼십구조. 검증의 의무.", "", "thud", ""),
    ("article", "너굴이", "의심을 통과한 판단만, 쓴다.", "", "ding", ""),
    ("ending", "N", "그리고 다시 아침. 큰돈은 못 벌었다.", "", "pop", ""),
    ("ending", "N", "대신 작게, 확률 높은 자리를, 반복했다.", "소액 · {확률 우위} · 반복", "ding", ""),
    ("ending", "N", "그리고 단톡방에는, 이제 이렇게 적혀 있다.", "", "pop", ""),
    ("ending", "너굴이", "정답 팝니다, 말고. 규칙 나눕니다.", "", "sparkle", "flash"),
    ("recap", "N", "속독으로, 한 번에 정리한다.", "{5줄} 요약", "whoosh", ""),
    ("recap", "N", "하나. 정답은 없다.", "", "pop", ""),
    ("recap", "N", "둘. 반대편에 서라.", "", "pop", ""),
    ("recap", "N", "셋. 큰 거래대금.", "", "pop", ""),
    ("recap", "N", "넷. 잠이 먼저.", "", "pop", ""),
    ("recap", "N", "다섯. 검증하라.", "", "ding", "flash"),
    ("end", "N", "주식너굴. 사실, 그 가격은 처음부터 없었다.", "", "thud", ""),
    ("end", "N", "다음 편. 반대편에 서라.", "", "sting", ""),
]

IJ, HS, SH = "ko-KR-InJoonNeural", "ko-KR-HyunsuMultilingualNeural", "ko-KR-SunHiNeural"
VOICE = {"N": (IJ, "-6%", "-22Hz"), "너굴이": (IJ, "+10%", "+22Hz"), "족집게": (HS, "+8%", "+16Hz"), "비법서": (SH, "-8%", "-18Hz"), "양떼": (SH, "+12%", "+30Hz")}
TAGC = {"너굴이": "#7fb3ff", "족집게": "#f08a2c", "비법서": "#e0505f", "양떼": "#e9e9ef"}

async def tts_all(texts, spk):
    sem = asyncio.Semaphore(5)
    async def one(i):
        v, r, p = VOICE[spk[i]]
        out = "%s/v%03d.mp3" % (OUT, i)
        async with sem:
            for a in range(4):
                try:
                    await edge_tts.Communicate(texts[i], v, rate=r, pitch=p).save(out)
                    if os.path.getsize(out) > 1000: return
                except Exception as e:
                    print("tts retry", i, repr(e)[:60], flush=True)
                await asyncio.sleep(1.5)
            raise SystemExit("tts failed %d" % i)
    await asyncio.gather(*[one(i) for i in range(len(texts))])

def sh(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if r.returncode: print("FAIL:", cmd[:200], r.stderr[-400:]); raise SystemExit(1)
    return r.stdout

def dur(p): return float(sh("ffprobe -v error -show_entries format=duration -of csv=p=0 %s" % p).strip())

def make_sfx():
    S = {
        "pop": "aevalsrc=0.7*sin(2*PI*(500+900*t)*t)*exp(-22*t):d=0.25:s=44100",
        "ding": "aevalsrc=(0.55*sin(2*PI*1568*t)+0.35*sin(2*PI*2349*t)*gt(t\\,0.1))*exp(-5*t):d=0.9:s=44100",
        "thud": "aevalsrc=0.95*sin(2*PI*(75-35*t)*t)*exp(-9*t)+0.4*(random(0)-0.5)*exp(-40*t):d=0.6:s=44100",
        "sting": "aevalsrc=0.6*sin(2*PI*(240-130*t)*t)*exp(-2*t):d=1.2:s=44100",
        "crash": "aevalsrc=0.8*(random(0)-0.5)*exp(-5*t)+0.6*sin(2*PI*(90-50*t)*t)*exp(-6*t):d=0.9:s=44100",
        "sparkle": "aevalsrc=0.4*(sin(2*PI*1319*t)*gt(t\\,0)+sin(2*PI*1568*t)*gt(t\\,0.08)+sin(2*PI*2093*t)*gt(t\\,0.16)+sin(2*PI*2637*t)*gt(t\\,0.24))*exp(-4*t):d=0.9:s=44100",
    }
    for k, v in S.items(): sh('ffmpeg -y -loglevel error -f lavfi -i "%s" %s/%s.wav' % (v, OUT, k))
    sh('ffmpeg -y -loglevel error -f lavfi -i "anoisesrc=d=0.7:c=pink:a=0.6" -af "highpass=f=500,lowpass=f=4500,afade=t=in:d=0.35,afade=t=out:st=0.35:d=0.35" %s/whoosh.wav' % OUT)
    sh('ffmpeg -y -loglevel error -f lavfi -i "aevalsrc=0.5*sin(2*PI*55*t)*exp(-7*mod(t\\,0.5))+0.18*sin(2*PI*110*t)*exp(-3*mod(t\\,1))+0.07*(random(0)-0.5)*exp(-30*mod(t+0.25\\,0.5)):d=8:s=44100" %s/bgm.wav' % OUT)

def main():
    preview = len(sys.argv) > 1 and sys.argv[1] == "preview"
    texts = [s[2] for s in SHOTS]; spk = [s[1] for s in SHOTS]
    asyncio.run(tts_all(texts, spk))
    make_sfx()
    sdur = [max(1.7, dur("%s/v%03d.mp3" % (OUT, i)) + 0.25 + 0.4) for i in range(len(SHOTS))]
    starts = [sum(sdur[:i]) for i in range(len(SHOTS))]
    total = sum(sdur)
    scene_idx = {s[0]: i for i, s in enumerate(SCENES)}
    scene_shots = {}
    for i, s in enumerate(SHOTS): scene_shots.setdefault(s[0], []).append(i)
    scene_start = {k: starts[v[0]] for k, v in scene_shots.items()}
    scene_dur = {k: sum(sdur[i] for i in v) for k, v in scene_shots.items()}
    print("shots %d total %.1fs" % (len(SHOTS), total), flush=True)
    surf = skia.Surface(W, H); c = surf.getCanvas()
    art = {s[0]: s[2] for s in SCENES}; chap = {s[0]: s[1] for s in SCENES}

    def draw(f):
        t = f / FPS
        i = max(j for j in range(len(SHOTS)) if starts[j] <= t + 1e-9)
        sc, who, text, kw, sfx, fx = SHOTS[i]
        x = Ctx(); x.st = t - scene_start[sc]; x.u = x.st / scene_dur[sc]; x.lt = t - starts[i]; x.lu = x.lt / sdur[i]
        x.k = scene_shots[sc].index(i)
        c.save()
        if "shake" in fx and x.lt < 0.6:
            a = 14 * (1 - x.lt / 0.6); c.translate(random.uniform(-a, a), random.uniform(-a, a))
        art[sc](c, x)
        if kw:
            p = back(x.lt / 0.32); al = int(255 * clamp01(x.lt / 0.12))
            cy = 150 if sc not in ("hook", "recap", "end") else (H / 2 - 20 if sc == "hook" else 120)
            if sc == "hook": rich(c, kw, W / 2, cy, 84, al, max(0.1, p))
            else:
                rect(c, 0, cy - 62, W, 124, "#000000", int(120 * clamp01(x.lt / 0.12)))
                rich(c, kw, W / 2, cy, 66, al, max(0.1, p))
        # 자막
        if sc not in ("end",):
            lines = wrap(text, 40, 1000)
            if who != "N": lines[0] = lines[0]
            bh = 54 * len(lines) + 20; by = H - bh - 28
            rect(c, 110, by, W - 220, bh, "#000000", 150, r=18)
            for li, l in enumerate(lines):
                tx = W / 2
                txt(c, l, tx, by + 52 + li * 54 - 6, 40, GOLD if who == "N" else WHITE, stroke=False)
            if who != "N":
                tw = text_w(who, 24) + 28; rect(c, 110, by - 34, tw, 32, TAGC[who], r=10); txt(c, who, 124, by - 10, 24, "#101018", align="l", stroke=False)
        c.restore()
        # 진행 바 + 장
        if chap[sc]:
            rect(c, 0, 0, W, 8, "#10142a"); rect(c, 0, 0, W * t / total, 8, GOLD)
            txt(c, "%d / 10" % chap[sc], 40, 52, 26, "#9fb0d8", align="l", stroke=False)
        if "flash" in fx and x.lt < 0.25: rect(c, 0, 0, W, H, "#ffffff", int(200 * (1 - x.lt / 0.25)))
        return surf.makeImageSnapshot().tobytes()

    if preview:
        for sc in [s[0] for s in SCENES]:
            ids = scene_shots[sc]; i = ids[len(ids) // 2]
            f = int((starts[i] + sdur[i] * 0.7) * FPS)
            data = draw(f)
            img = skia.Image.frombytes(data, (W, H), skia.kBGRA_8888_ColorType) if False else None
            surf.makeImageSnapshot().save("%s/prev_%s.png" % (OUT, sc), skia.kPNG)
        print("preview done"); return

    # 음성/효과음 믹스
    wavs = []
    for i in range(len(SHOTS)):
        o = "%s/s%03d.wav" % (OUT, i)
        sh('ffmpeg -y -loglevel error -i %s/v%03d.mp3 -af "loudnorm=I=-16:TP=-2:LRA=11,aresample=44100,adelay=250:all=1,apad=whole_dur=%.3f" -ac 2 -t %.3f %s' % (OUT, i, sdur[i], sdur[i], o))
        wavs.append(o)
    open(OUT + "/l.txt", "w").write("".join("file '%s'\n" % w for w in wavs))
    sh("ffmpeg -y -loglevel error -f concat -safe 0 -i %s/l.txt -c copy %s/narr.wav" % (OUT, OUT))
    ins = ["-i %s/narr.wav" % OUT, "-stream_loop -1 -i %s/bgm.wav" % OUT]
    fl = ["[1:a]volume=0.16,atrim=0:%.2f[bgm]" % total]
    labs = ["[0:a]", "[bgm]"]
    for i, s in enumerate(SHOTS):
        if s[4]:
            n = len(ins); ins.append("-i %s/%s.wav" % (OUT, s[4]))
            fl.append("[%d:a]volume=0.5,adelay=%d:all=1[x%d]" % (n, int((starts[i] + 0.08) * 1000), i)); labs.append("[x%d]" % i)
    fl.append("%samix=inputs=%d:duration=first:normalize=0,alimiter=limit=0.95[a]" % ("".join(labs), len(labs)))
    open(OUT + "/fc.txt", "w").write(";".join(fl))
    sh("ffmpeg -y -loglevel error %s -filter_complex_script %s/fc.txt -map [a] -t %.2f -c:a aac -b:a 128k %s/audio.m4a" % (" ".join(ins), OUT, total, OUT))
    # 영상
    nf = int(total * FPS)
    pr = subprocess.Popen("ffmpeg -y -loglevel error -f rawvideo -pix_fmt bgra -s %dx%d -r %d -i - -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p %s/video.mp4" % (W, H, FPS, OUT), shell=True, stdin=subprocess.PIPE)
    for f in range(nf):
        pr.stdin.write(draw(f))
        if f % 500 == 0: print("frame", f, "/", nf, flush=True)
    pr.stdin.close(); pr.wait()
    sh("ffmpeg -y -loglevel error -i %s/video.mp4 -i %s/audio.m4a -c copy -shortest /home/user/nugul.mp4" % (OUT, OUT))
    print("FINAL /home/user/nugul.mp4 %.1fs %.1fMB" % (dur("/home/user/nugul.mp4"), os.path.getsize("/home/user/nugul.mp4") / 1e6), flush=True)

if __name__ == "__main__":
    main()
