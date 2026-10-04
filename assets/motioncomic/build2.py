#!/usr/bin/env python3
"""Faithful motion comic: every '@' dialogue line, '^' caption and '~[' quest window of
src/script_body_c.txt, in script order, one act per video.
Usage: python3 build2.py ACT_NO(1-5)   -> /home/user/act{N}.mp4
Runs in the Higgsfield sandbox (ffmpeg, curl, CJK font, edge-tts).
"""
import asyncio, csv, os, re, subprocess, sys, textwrap
from concurrent.futures import ThreadPoolExecutor

W, H, FPS = 1280, 720, 25
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "..", "src", "script_body_c.txt")
WORK = "/home/user/w2"
os.makedirs(WORK, exist_ok=True)
CLIP1 = "https://d2ol7oe51mr4n9.cloudfront.net/user_3CZ4NxhrcqKYJP84LKj5qzklUJg/be7b9b75-46ce-4490-9c2c-cdcf38b4a16b.mp4"

# scene id -> keyframe ('open' = frame of the Kling bridge clip). Scenes without their own
# artwork reuse the closest keyframe; the scene title card says where/when we are.
SCENE_IMG = {
    "0": "open", "1": "open", "1-1": "open", "2": "open", "3": "01_void_reaper",
    "4": "02_playground", "5": "03_queue", "6": "04_book_redo", "7": "05_tulip", "8": "05_tulip",
    "9": "06_newton", "10": "07_board", "11": "07_board", "12": "07_board", "13": "08_sandwich",
    "14": "09_handshake", "15": "10_spaceship_queue", "16": "10_spaceship_queue",
    "17": "11_tokyo_ghosts", "18": "13_breaker", "19": "13_breaker", "20": "12_copier",
    "21": "05_tulip", "22": "03_queue", "23": "12_copier", "24": "13_breaker", "25": "07_board",
    "26": "14_bridge", "27": "15_fall_mentor", "28": "15_fall_mentor", "29": "14_bridge",
    "30": "16_bench", "31": "16_bench", "32": "01_void_reaper",
}

# speaker -> (edge voice, rate, pitch)
IJ, HS, SH = "ko-KR-InJoonNeural", "ko-KR-HyunsuMultilingualNeural", "ko-KR-SunHiNeural"
VOICES = {
    "너굴이": (IJ, "+10%", "+22Hz"), "과거의너굴이": (IJ, "+14%", "+26Hz"),
    "미래의너굴이": (IJ, "-8%", "-12Hz"), "몰빵이": (HS, "-10%", "-6Hz"),
    "몰빵이/너굴이": (HS, "-6%", "+4Hz"), "저승사자": (HS, "-14%", "-32Hz"),
    "목소리": (SH, "-10%", "-28Hz"), "내레이션": (IJ, "-6%", "-22Hz"),
    "하녀": (SH, "+6%", "+18Hz"), "이웃": (SH, "+0%", "+8Hz"), "직원": (SH, "+4%", "+2Hz"),
    "빵집주인": (SH, "-4%", "-6Hz"), "구근": (SH, "+10%", "+30Hz"), "책": (SH, "-8%", "-18Hz"),
    "우주선": (HS, "+0%", "-22Hz"), "낙타": (IJ, "+6%", "-18Hz"),
}
SPREAD = [(HS, "+0%", "+14Hz"), (IJ, "+0%", "-6Hz"), (HS, "+4%", "-14Hz"), (IJ, "-4%", "+6Hz"),
          (HS, "-4%", "+4Hz")]

def voice_for(name):
    if name in VOICES:
        return VOICES[name]
    return SPREAD[sum(map(ord, name)) % len(SPREAD)]

def parse(act):
    acts, cur, scene = [], None, "0"
    events = {}
    n = 0
    for line in open(SCRIPT, encoding="utf-8"):
        line = line.rstrip("\n")
        if line.startswith("## "):
            n += 1
            events[n] = [("act", line[3:].strip())]
            scene = "0"
            continue
        if n != act:
            continue
        ev = events[n]
        m = re.match(r"S# ([\d\-]+)\.\s*(.*)", line)
        if m:
            scene = m.group(1)
            ev.append(("scene", scene, m.group(2).strip()))
        elif line.startswith("@"):
            name, _, text = line[1:].partition(" ")
            ev.append(("say", scene, name, text))
        elif line.startswith("^ "):
            ev.append(("cap", scene, line[2:].strip()))
        elif line.startswith("~["):
            ev.append(("ui", scene, line[1:].strip()))
    return events[act]

def clean_say(text):
    t = re.sub(r"\([^)]*\)", "", text)          # stage directions
    t = t.replace("…", " ").replace("※", "").replace("→", "에서")
    return re.sub(r"\s+", " ", t).strip()

def sh(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if r.returncode:
        print("CMD FAIL:", cmd[:240], r.stderr[-500:], flush=True)
        raise SystemExit(1)
    return r

def font():
    out = subprocess.run("fc-list :lang=ko file", shell=True, capture_output=True, text=True).stdout
    c = [l.split(":")[0] for l in out.splitlines() if l.strip()]
    for pref in ("wqy", "Noto", ""):
        for x in c:
            if pref.lower() in x.lower():
                return x
    raise SystemExit("no Korean font")
FONT = font()

async def _tts(jobs):
    import edge_tts
    sem = asyncio.Semaphore(6)
    avail = {v["ShortName"] for v in await edge_tts.list_voices()}
    async def one(text, v, out):
        voice, rate, pitch = v
        if voice not in avail:
            voice, rate, pitch = IJ, "-10%", "-20Hz"
        async with sem:
            for attempt in range(4):
                try:
                    await edge_tts.Communicate(text, voice, rate=rate, pitch=pitch).save(out)
                    if os.path.getsize(out) > 1000:
                        return
                except Exception as e:
                    print("tts retry", attempt, repr(e)[:80], flush=True)
                await asyncio.sleep(1.5)
            raise SystemExit("tts failed: " + text)
    await asyncio.gather(*[one(*j) for j in jobs])

def dur_of(path):
    return float(sh("ffprobe -v error -show_entries format=duration -of csv=p=0 %s" % path).stdout.strip())

KINDS = ["A", "B", "C"]
def zexpr(kind, n):
    if kind == "A":
        return ("1+0.10*on/%d" % n, "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)")
    if kind == "B":
        return ("1.28+0.04*on/%d" % n, "(iw-iw/zoom)*(0.10+0.25*on/%d)" % n, "(ih-ih/zoom)*0.35")
    return ("1.28+0.04*on/%d" % n, "(iw-iw/zoom)*(0.90-0.25*on/%d)" % n, "(ih-ih/zoom)*0.45")

def wrap(t, width=22):
    out = []
    for para in t.split("\n"):
        out += textwrap.wrap(para, width) or [""]
    return "\n".join(out)

ENC = "-c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p -r %d -c:a aac -b:a 112k -ac 2 -ar 44100" % FPS

def render(seg):
    i, img, kind, text, color, size, ypos, voice, dur, dim = seg
    n = int(dur * FPS)
    tf = "%s/t%04d.txt" % (WORK, i)
    open(tf, "w", encoding="utf-8").write(text)
    z, x, y = zexpr(kind, n)
    vf = "zoompan=z='%s':x='%s':y='%s':d=%d:s=%dx%d:fps=%d" % (z, x, y, n, W, H, FPS)
    if dim:
        vf += ",eq=brightness=-0.38"
    vf += (",drawtext=fontfile=%s:textfile=%s:fontsize=%d:fontcolor=%s:borderw=3:bordercolor=black:"
           "x=(w-text_w)/2:y=%s:line_spacing=8" % (FONT, tf, size, color, ypos))
    vf += ",fade=t=in:st=0:d=0.15,fade=t=out:st=%.2f:d=0.15,format=yuv420p" % (dur - 0.15)
    if voice:
        ain = "-i %s" % voice
        af = "-af \"loudnorm=I=-16:TP=-2:LRA=11,aresample=44100,adelay=450:all=1,apad=whole_dur=%.2f\"" % dur
    else:
        ain = "-f lavfi -t %.2f -i anullsrc=r=44100:cl=stereo" % dur
        af = ""
    out = "%s/g%04d.mp4" % (WORK, i)
    sh("ffmpeg -y -loglevel error -i %s/%s.png %s -vf \"%s\" %s -t %.2f -frames:v %d %s %s"
       % (WORK, img, ain, vf, af, dur, n, ENC, out))
    return out

def main():
    act = int(sys.argv[1])
    ev = parse(act)
    urls = {r[0]: r[1] for r in csv.reader(open(os.path.join(HERE, "manifest.tsv"), encoding="utf-8"), delimiter="\t") if len(r) == 2}
    need = {SCENE_IMG[e[1]] for e in ev if e[0] in ("scene", "say", "cap", "ui")} | {"open"}
    for k in sorted(need - {"open"}):
        sh("curl -sf -o %s/%s.png '%s'" % (WORK, k, urls[k]))
    sh("curl -sf -o %s/clip1.mp4 '%s'" % (WORK, CLIP1))
    sh("ffmpeg -y -loglevel error -ss 8 -i %s/clip1.mp4 -frames:v 1 -vf scale=2560:-1 %s/open.png" % (WORK, WORK))
    # voices
    says = [(i, e) for i, e in enumerate(ev) if e[0] == "say"]
    jobs, vpath = [], {}
    for i, e in says:
        t = clean_say(e[3])
        if not t:
            continue
        out = "%s/v%04d.mp3" % (WORK, i)
        jobs.append((t, voice_for(e[2]), out))
        vpath[i] = (out, t)
    asyncio.run(_tts(jobs))
    print("voices:", len(jobs), flush=True)
    # segments
    segs, k, c = [], 0, 0
    def add(img, text, color, size, ypos, voice, dur, dim=False):
        nonlocal k, c
        segs.append((k, img, KINDS[c % 3], text, color, size, ypos, voice, dur, dim))
        k += 1; c += 1
    title = ev[0][1]
    add("open" if act == 1 else SCENE_IMG["0"], "제%d막\n%s" % (act, title.split("— ", 1)[-1]), "white", 56, "(h-text_h)/2", None, 3.2, True)
    for i, e in enumerate(ev):
        if e[0] == "scene":
            add(SCENE_IMG[e[1]], "S# %s\n%s" % (e[1], wrap(re.sub(r"\([^)]*\)", "", e[2]).strip(), 26)), "white", 42, "(h-text_h)/2", None, 2.4, True)
        elif e[0] == "cap":
            add(SCENE_IMG[e[1]], wrap(e[2], 24), "yellow", 44, "(h-text_h)/2", None, 2.6)
        elif e[0] == "ui":
            add(SCENE_IMG[e[1]], wrap(e[2], 26), "cyan", 38, "(h-text_h)/2", None, 2.3)
        elif e[0] == "say" and i in vpath:
            path, t = vpath[i]
            d = max(1.9, dur_of(path) + 0.45 + 0.45)
            add(SCENE_IMG[e[1]], wrap("%s: %s" % (e[2], t), 24), "white", 38, "h-text_h-44", path, d)
    total = sum(s[8] for s in segs)
    print("segments:", len(segs), "planned duration: %.0fs" % total, flush=True)
    with ThreadPoolExecutor(4) as ex:
        outs = list(ex.map(render, segs))
    open("%s/list.txt" % WORK, "w").write("".join("file '%s'\n" % o for o in outs))
    final = "/home/user/act%d.mp4" % act
    sh("ffmpeg -y -loglevel error -f concat -safe 0 -i %s/list.txt -c copy %s" % (WORK, final))
    print("FINAL", final, "duration=%.1fs" % dur_of(final), "size=%.1fMB" % (os.path.getsize(final) / 1e6), flush=True)

main()
