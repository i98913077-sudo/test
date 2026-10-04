#!/usr/bin/env python3
"""Web-novel serial cut: beats4.json -> /home/user/serial.mp4 (free tools only).
Q lines / quest windows / articles / captions are pulled verbatim from the script; build fails if missing.
"""
import asyncio, csv, json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build2 as B

W, H, FPS, WORK = B.W, B.H, B.FPS, B.WORK
norm = lambda x: re.sub(r"\s+", " ", x).strip()
RAW = [l.rstrip("\n") for l in open(B.SCRIPT, encoding="utf-8")]
SAY = []
for l in RAW:
    if l.startswith("@"):
        sp, _, t = l[1:].partition(" ")
        SAY.append((sp, norm(t), norm(re.sub(r"\([^)]*\)", "", t))))

def find_say(q):
    hit = [x for x in SAY if norm(q) in x[1] or norm(q) in x[2]]
    if not hit:
        raise SystemExit("QUOTE NOT IN SCRIPT: " + q)
    return hit[0][0]

def find_line(prefix, sub):
    for l in RAW:
        if l.startswith(prefix) and sub in l:
            return l[len(prefix):].strip()
    raise SystemExit("LINE NOT IN SCRIPT: %s %s" % (prefix, sub))

def article(n):
    for i, l in enumerate(RAW):
        if l.startswith("~제%d조" % n):
            head, body = l[1:].strip(), []
            for m in RAW[i + 1:i + 8]:
                if m.startswith("~") and not m.startswith("~[") and not m.startswith("~제"):
                    body.append(m[1:].strip())
                else:
                    break
            return head, body
    raise SystemExit("ARTICLE NOT IN SCRIPT %d" % n)

# ---- synthesized SFX ----
SFX = {
    "ding": 'aevalsrc=(0.5*sin(2*PI*1568*t)+0.35*sin(2*PI*2349*t)*gt(t\\,0.1))*exp(-5*t):d=0.8:s=44100',
    "thud": 'aevalsrc=0.9*sin(2*PI*(70-30*t)*t)*exp(-9*t)+0.4*(random(0)-0.5)*exp(-40*t):d=0.6:s=44100',
    "sting": 'aevalsrc=0.6*sin(2*PI*(220-120*t)*t)*exp(-2*t):d=1.2:s=44100',
    "pop": 'aevalsrc=0.6*sin(2*PI*(600+800*t)*t)*exp(-25*t):d=0.25:s=44100',
}
def make_sfx():
    for k, v in SFX.items():
        B.sh("ffmpeg -y -loglevel error -f lavfi -i \"%s\" %s/%s.wav" % (v, WORK, k))
    B.sh("ffmpeg -y -loglevel error -f lavfi -i \"anoisesrc=d=0.6:c=pink:a=0.5\" -af \"highpass=f=500,lowpass=f=4500,afade=t=in:d=0.3,afade=t=out:st=0.3:d=0.3\" %s/whoosh.wav" % WORK)

def vtext(i, j, text):
    p = "%s/s%04d_%d.txt" % (WORK, i, j)
    open(p, "w", encoding="utf-8").write(text)
    return p

def render(s):
    i, dur = s["i"], s["dur"]
    n = int(dur * FPS)
    ins, vf = [], ""
    if s.get("img"):
        ins.append("-i %s/%s.png" % (WORK, s["img"]))
        z, x, y = B.zexpr(s["kind"], n)
        if s["kind"] == "D":
            z, x, y = ("1.14", "iw/2-(iw/zoom/2)+14*sin(on*1.7)", "ih/2-(ih/zoom/2)+9*cos(on*2.3)")
        vf = "zoompan=z='%s':x='%s':y='%s':d=%d:s=%dx%d:fps=%d" % (z, x, y, n, W, H, FPS)
        if s.get("dim"):
            vf += ",eq=brightness=-%.2f" % s["dim"]
    else:
        ins.append("-f lavfi -t %.2f -i color=c=%s:s=%dx%d:r=%d" % (dur, s.get("bg", "0x0b0d17"), W, H, FPS))
        vf = "format=yuv420p"
    for j, (text, color, size, ypos, box) in enumerate(s.get("layers", [])):
        vf += (",drawtext=fontfile=%s:textfile=%s:fontsize=%d:fontcolor=%s:borderw=3:bordercolor=black:"
               "x=(w-text_w)/2:y=%s:line_spacing=10%s") % (B.FONT, vtext(i, j, text), size, color, ypos,
               ":box=1:boxcolor=black@0.55:boxborderw=18" if box else "")
    fl = s.get("flash")
    vf += ",fade=t=in:st=0:d=%.2f%s,fade=t=out:st=%.2f:d=0.12,format=yuv420p" % (
        0.22 if fl else 0.1, ":color=white" if fl else "", dur - 0.12)
    ai, parts = len(ins), []
    if s.get("voice"):
        ins.append("-i %s" % s["voice"])
        parts.append("[%d:a]loudnorm=I=-16:TP=-2:LRA=11,aresample=44100,adelay=%d:all=1[v]" % (ai, s.get("vdelay", 250)))
        ai += 1
    mix = ["[v]"] if s.get("voice") else []
    if s.get("sfx"):
        ins.append("-i %s/%s.wav" % (WORK, s["sfx"]))
        parts.append("[%d:a]aresample=44100,volume=%.2f[s]" % (ai, s.get("sv", 0.55)))
        mix.append("[s]")
    if mix:
        parts.append("%samix=inputs=%d:duration=longest:normalize=0,apad=whole_dur=%.2f,atrim=0:%.2f,aformat=sample_rates=44100:channel_layouts=stereo[a]" % ("".join(mix), len(mix), dur, dur))
        amap = "[a]"
    else:
        ins.append("-f lavfi -t %.2f -i anullsrc=r=44100:cl=stereo" % dur)
        amap = "%d:a" % ai
    fc = "[0:v]%s[vv]" % vf + (";" + ";".join(parts) if parts else "")
    out = "%s/g%04d.mp4" % (WORK, i)
    B.sh("ffmpeg -y -loglevel error %s -filter_complex \"%s\" -map [vv] -map %s -t %.2f -r %d %s %s"
         % (" ".join(ins), fc, amap, dur, FPS, B.ENC, out))
    return out

def main():
    data = json.load(open(os.path.join(HERE, "beats4.json"), encoding="utf-8"))
    urls = {r[0]: r[1] for r in csv.reader(open(os.path.join(HERE, "manifest.tsv"), encoding="utf-8"), delimiter="\t") if len(r) == 2}
    imgs = {"16_bench"}
    for e in data["eps"]:
        for b in e["beats"]:
            imgs.add(b["image"])
    imgs.add(data["hook"]["image"])
    for k in sorted(imgs - {"open"}):
        B.sh("curl -sf -o %s/%s.png '%s'" % (WORK, k, urls[k]))
    clip = None
    for e in data["eps"]:
        for b in e["beats"]:
            if b.get("clip"):
                clip = "%s/clip_%s.mp4" % (WORK, b["id"])
                B.sh("curl -sf -o %s '%s'" % (clip, b["clip"]))
    B.sh("ffmpeg -y -loglevel error -ss 8 -i %s -frames:v 1 -vf scale=2560:-1 %s/open.png" % (clip, WORK))
    make_sfx()

    jobs, nid = [], [0]
    def voice(text, sp):
        out = "%s/v%04d.mp3" % (WORK, nid[0]); nid[0] += 1
        t = re.sub(r"\s+", " ", re.sub(r"\([^)]*\)", " ", text).replace("…", " ").replace("'", "")).strip()
        jobs.append((t, B.voice_for(sp), out))
        return out
    items = []  # dicts, or ("clip", path)
    SH = ["ㅋ"]

    def say(img, sp, text, show=None, extra=None):
        narr = sp == "내레이션"
        items.append(dict(kind="say", img=img, sp=sp, show=show or ("%s: %s" % (sp, text)), voice=voice(text, sp),
                          color="0xFFE9A8" if narr else "white", shake=text.rstrip().endswith(("!", "?!"))))

    def card(layers, dur, sfx=None, bg="0x0b0d17", img=None, dim=0.0, flash=False, voicep=None):
        items.append(dict(kind="card", layers=layers, dur=dur, sfx=sfx, bg=bg, img=img, dim=dim, flash=flash, voice=voicep))

    # --- cold open hook ---
    hk = data["hook"]
    items.append(dict(kind="say", img=hk["image"], sp="너굴이", show="", voice=None, color="white", shake=True))
    items.pop()
    for kind, text in hk["lines"]:
        sp = find_say(text) if kind == "Q" else "내레이션"
        say(hk["image"], sp, text, show=("%s: %s" % (sp, text)) if kind == "Q" else text)
    card([("주식법전\n스피드런", "0xFFD866", 84, "(h-text_h)/2-30", False), (data["sub"], "white", 34, "h-150", False)], 3.2, "thud", flash=True)
    gags = [find_line("^ ", g) for g in data["gag"]]
    card([(wrap_(g), "yellow", 40, "(h-text_h)/2", False) for g in [gags[0]]], 2.6, "pop", img="01_void_reaper", dim=0.4)

    for n, e in enumerate(data["eps"], 1):
        card([("제 %d 화" % n, "0xFFD866", 50, "(h-text_h)/2-90", False), (wrap_(e["title"], 14), "white", 76, "(h-text_h)/2+20", False),
              ("%d / %d" % (n, len(data["eps"])), "0x8892b0", 28, "h-90", False)], 3.0, "whoosh", flash=False)
        last = e["beats"][-1]["image"]
        for b in e["beats"]:
            if b.get("clip"):
                items.append(("clip", clip))
            for kind, text in b["lines"]:
                sp = find_say(text) if kind == "Q" else "내레이션"
                say(b["image"], sp, text, show=text if kind == "N" else "%s: %s" % (sp, text))
            if n == 1 and b["id"] == "b01":
                pass
        for q in e.get("quests", []):
            qt = find_line("~[", q)
            full = "[" + qt if not qt.startswith("[") else qt
            card([(wrap_(full, 24), "cyan", 40, "(h-text_h)/2", True)], 3.0, "ding", img=last, dim=0.45, flash=True)
        for key in ("article_before", "article"):
            if e.get(key):
                head, body = article(e[key])
                lay = [(head, "0xFFD866", 52, "60", False)]
                lay.append((wrap_("\n".join(x for x in body if not x.startswith("적용"))[:400], 30), "white", 32, "170", False))
                ap = [x for x in body if x.startswith("적용")]
                if ap:
                    lay.append((wrap_(ap[0], 32), "cyan", 30, "h-170", False))
                card(lay, 6.0 if len(body) > 2 else 4.5, "thud", bg="0x14101c", flash=True)
        card([("독자 댓글", "0x8892b0", 28, "70", False)] + [(wrap_("▶ " + c, 26), "white", 40, str(190 + 150 * k), False) for k, c in enumerate(e["comments"])],
             3.4, "pop", bg="0x0b0d17")
        if e.get("quest_cliff"):
            qt = find_line("~[", e["quest_cliff"])
            full = "[" + qt if not qt.startswith("[") else qt
            card([(wrap_(full, 24), "0xFF6B6B", 42, "(h-text_h)/2", True)], 3.2, "sting", img=last, dim=0.55, flash=True)
        if e.get("cliff"):
            items.append(dict(kind="cliff", text=e["cliff"], voice=voice(e["cliff"], "내레이션")))

    # end
    ecs = [find_line("^ ", c) for c in data["end_caps"]]
    card([("— 끝 —", "0xFFD866", 70, "(h-text_h)/2-40", False), ("주식법전 스피드런", "white", 34, "(h-text_h)/2+60", False)], 3.4, "thud", img="16_bench", dim=0.5)
    card([(wrap_(ecs[0], 26), "yellow", 36, "150", False), (wrap_(ecs[1], 26), "white", 36, "330", False)], 7.5, None)

    asyncio.run(B._tts(jobs))
    print("voices:", len(jobs), flush=True)

    segs, order, k, c = [], [], 0, 0
    for it in items:
        if isinstance(it, tuple):
            out = "%s/c%04d.mp4" % (WORK, k)
            B.sh("ffmpeg -y -loglevel error -i %s -vf \"scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,fps=%d,format=yuv420p\" %s %s"
                 % (it[1], W, H, W, H, FPS, B.ENC, out))
            order.append(("file", out)); k += 1
            continue
        s = dict(i=k, kind=B.KINDS[c % 3])
        if it["kind"] == "say":
            narr = it["sp"] == "내레이션"
            d = B.dur_of(it["voice"]) + 0.25 + 0.3
            s.update(img=it["img"], dur=max(1.9, d), voice=it["voice"],
                     layers=[(B.wrap(it["show"], 22), it["color"], 40, "h-text_h-48", False)])
            if it["shake"]:
                s["kind"] = "D"
        elif it["kind"] == "cliff":
            d = B.dur_of(it["voice"]) + 0.25 + 1.1
            s.update(dur=d, voice=it["voice"], sfx="sting", sv=0.35, bg="0x05060c", vdelay=700,
                     layers=[("다음 화 예고 ▶", "0xFF6B6B", 34, "110", False), (wrap_(it["text"], 18), "0xFFE9A8", 54, "(h-text_h)/2+20", False)])
        else:
            s.update(dur=it["dur"], layers=it["layers"], sfx=it["sfx"], bg=it["bg"], img=it["img"], dim=it["dim"], flash=it["flash"], voice=it["voice"])
        segs.append(s); order.append(("seg", len(segs) - 1)); k += 1; c += 1
    print("segments:", len(segs), "planned: %.0fs" % sum(x["dur"] for x in segs), flush=True)
    with ThreadPoolExecutor(4) as ex:
        outs = list(ex.map(render, segs))
    files = [o[1] if o[0] == "file" else outs[o[1]] for o in order]
    open("%s/list4.txt" % WORK, "w").write("".join("file '%s'\n" % f for f in files))
    final = "/home/user/serial.mp4"
    B.sh("ffmpeg -y -loglevel error -f concat -safe 0 -i %s/list4.txt -c copy %s" % (WORK, final))
    print("FINAL", final, "duration=%.1fs" % B.dur_of(final), "size=%.1fMB" % (os.path.getsize(final) / 1e6), flush=True)

def wrap_(t, w=24):
    return B.wrap(t, w)

if __name__ == "__main__":
    main()
