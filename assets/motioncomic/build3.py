#!/usr/bin/env python3
"""Philosophical skeleton cut: beats.json -> one video.
N lines = newly written narration; Q lines = verbatim script lines (speaker looked up in the
script, build fails if a quote is not found). pre/post = clip slots (only b01 has a clip now).
Usage: python3 build3.py   -> /home/user/skeleton.mp4
"""
import asyncio, csv, json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build2 as B

CLIP_SUBS = [(0.0, 2.4, "미쳤네, 진짜."), (2.8, 6.4, "당신이 무너지는 걸, 그냥 지켜보겠습니다."), (6.4, 8.4, "아, 진짜 얄밉네, 저 인간."), (8.4, 10.0, "으아아아!")]  # transcribed from the clip audio
norm = lambda x: re.sub(r"\s+", " ", x).strip()

def script_lines():
    out = []
    for l in open(B.SCRIPT, encoding="utf-8"):
        if l.startswith("@"):
            sp, _, t = l.rstrip("\n")[1:].partition(" ")
            out.append((sp, norm(t), norm(re.sub(r"\([^)]*\)", "", t))))
    return out

def main():
    beats = json.load(open(os.path.join(HERE, sys.argv[1] if len(sys.argv) > 1 else "beats.json"), encoding="utf-8"))
    SL = script_lines()
    urls = {r[0]: r[1] for r in csv.reader(open(os.path.join(HERE, "manifest.tsv"), encoding="utf-8"), delimiter="\t") if len(r) == 2}
    imgs = {b["image"] for a in beats["acts"] for b in a["beats"]}
    for k in sorted(imgs - {"open"}):
        B.sh("curl -sf -o %s/%s.png '%s'" % (B.WORK, k, urls[k]))
    clips = {}
    for a in beats["acts"]:
        for b in a["beats"]:
            for slot in ("pre", "post"):
                if b.get(slot) and b[slot].get("clip"):
                    p = "%s/clip_%s_%s.src.mp4" % (B.WORK, b["id"], slot)
                    B.sh("curl -sf -o %s '%s'" % (p, b[slot]["clip"]))
                    clips[(b["id"], slot)] = p
    if "open" in imgs:
        first = [p for (i, s), p in clips.items() if i == "b01"][0]
        B.sh("ffmpeg -y -loglevel error -ss 8 -i %s -frames:v 1 -vf scale=2560:-1 %s/open.png" % (first, B.WORK))
    # flatten into items, resolve speakers, collect TTS jobs
    items, jobs, n = [], [], 0
    def card(img, lines, secs, size=60):
        items.append(("card", img, "\n".join(lines), secs, size))
    card("open", [beats["title"].split(" — ")[0], beats.get("sub", "뼈대판 · 철학 편")], 3.2, 52)
    for a in beats["acts"]:
        card(a["beats"][0]["image"], [a["card"][0], a["card"][1]], 3.0, 60)
        for b in a["beats"]:
            if (b["id"], "pre") in clips:
                items.append(("clip", clips[(b["id"], "pre")]))
            flat = []
            for kind, text in b["lines"]:
                if kind == "N":
                    flat += [("N", t) for t in re.split(r"(?<=[.!?])\s+", text.strip()) if t]
                else:
                    flat.append((kind, text))
            for kind, text in flat:
                if kind == "N":
                    sp, show, say = "내레이션", text, text
                else:
                    hit = [x for x in SL if norm(text) in x[1] or norm(text) in x[2]]
                    if not hit:
                        raise SystemExit("QUOTE NOT IN SCRIPT: " + text)
                    sp = hit[0][0]; show = ("%s: %s" % (sp, text)) if sp in ("너굴이", "몰빵이", "저승사자", "미래의너굴이", "목소리") else text
                    say = text.replace("(", " ").replace(")", " ")
                say = re.sub(r"\s+", " ", say.replace("…", " ").strip())
                out = "%s/n%04d.mp3" % (B.WORK, n)
                jobs.append((say, B.voice_for(sp), out))
                items.append(("say", b["image"], sp, show, out))
                n += 1
            if (b["id"], "post") in clips:
                items.append(("clip", clips[(b["id"], "post")]))
    card("16_bench", ["— 끝 —"], 3.5, 60)
    asyncio.run(B._tts(jobs))
    print("voices:", len(jobs), flush=True)
    segs, order, k, c = [], [], 0, 0
    for it in items:
        if it[0] == "clip":
            out = "%s/c%04d.mp4" % (B.WORK, k)
            vf = "scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,fps=%d" % (B.W, B.H, B.W, B.H, B.FPS)
            for j, (a, z, tx) in enumerate(CLIP_SUBS if it[1].endswith("clip_b01_pre.src.mp4") else []):
                tf = "%s/cs%d_%d.txt" % (B.WORK, k, j)
                open(tf, "w", encoding="utf-8").write(tx)
                vf += (",drawtext=fontfile=%s:textfile=%s:fontsize=40:fontcolor=white:borderw=3:bordercolor=black:"
                       "x=(w-text_w)/2:y=h-text_h-48:enable='between(t,%s,%s)'") % (B.FONT, tf, a, z)
            B.sh("ffmpeg -y -loglevel error -i %s -vf \"%s,format=yuv420p\" %s %s" % (it[1], vf, B.ENC, out))
            order.append(("file", out)); k += 1
            continue
        if it[0] == "card":
            _, img, text, secs, size = it
            segs.append((k, img, B.KINDS[c % 3], text, "white", size, "(h-text_h)/2", None, secs, True))
        else:
            _, img, sp, show, path = it
            d = B.dur_of(path) + 0.45 + 0.55 + (0.35 if sp == "내레이션" else 0)
            narr = sp == "내레이션"
            segs.append((k, img, B.KINDS[c % 3], B.wrap(show, 22), "0xFFE9A8" if narr else "white",
                         40, "h-text_h-48", path, max(2.4, d), False))
        order.append(("seg", len(segs) - 1)); k += 1; c += 1
    print("segments:", len(segs), "planned: %.0fs" % sum(s[8] for s in segs), flush=True)
    with ThreadPoolExecutor(4) as ex:
        outs = list(ex.map(B.render, segs))
    files = [o[1] if o[0] == "file" else outs[o[1]] for o in order]
    open("%s/list3.txt" % B.WORK, "w").write("".join("file '%s'\n" % f for f in files))
    final = sys.argv[2] if len(sys.argv) > 2 else "/home/user/skeleton.mp4"
    B.sh("ffmpeg -y -loglevel error -f concat -safe 0 -i %s/list3.txt -c copy %s" % (B.WORK, final))
    print("FINAL", final, "duration=%.1fs" % B.dur_of(final), "size=%.1fMB" % (os.path.getsize(final) / 1e6), flush=True)

if __name__ == "__main__":
    main()
