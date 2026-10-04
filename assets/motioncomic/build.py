#!/usr/bin/env python3
"""Motion-comic builder: stills + Ken Burns + burned-in Korean subtitles.
Runs in the Higgsfield sandbox (ffmpeg, curl, CJK font).
Usage: python3 build.py [--test] [UPLOAD_URL]
"""
import csv, os, subprocess, sys, textwrap
from concurrent.futures import ThreadPoolExecutor

W, H, FPS, D = 1280, 720, 25, 6.0
FRAMES = int(D * FPS)
CLIP1 = "https://d2ol7oe51mr4n9.cloudfront.net/user_3CZ4NxhrcqKYJP84LKj5qzklUJg/be7b9b75-46ce-4490-9c2c-cdcf38b4a16b.mp4"
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = "/home/user/mcwork"
os.makedirs(WORK, exist_ok=True)

def font():
    out = subprocess.run("fc-list :lang=ko file", shell=True, capture_output=True, text=True).stdout
    cands = [l.split(":")[0] for l in out.splitlines() if l.strip()]
    for pref in ("wqy", "WenQuan", "Noto", ""):
        for c in cands:
            if pref.lower() in c.lower():
                return c
    raise SystemExit("no Korean font found")
FONT = font()

# kind: A = wide + slow zoom-in, B = zoom + pan right, C = zoom + pan left
Z = {
    "A": ("1+0.12*on/%d" % FRAMES, "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),
    "B": ("1.30+0.05*on/%d" % FRAMES, "(iw-iw/zoom)*(0.10+0.25*on/%d)" % FRAMES, "(ih-ih/zoom)*0.35"),
    "C": ("1.30+0.05*on/%d" % FRAMES, "(iw-iw/zoom)*(0.90-0.25*on/%d)" % FRAMES, "(ih-ih/zoom)*0.45"),
}

# (image key, [(kind, subtitle), ...]) in script order
STORY = [
    ("01_void_reaper", [("A", "(암흑 속, 갓 쓴 저승사자 인턴 등장)"), ("B", "성공하면 마이너스 8천4백만 원이 사라진다."), ("C", "대신 와이파이도 없어.")]),
    ("02_playground", [("A", "(자막) 암스테르담 (※ 대전)"), ("B", "합판 풍차. 비닐 운하. 모래 위의 너굴."), ("C", "…여기가 1602년이라고?")]),
    ("03_queue", [("A", "창구 앞 긴 줄."), ("B", "나도 배의 주인이 될 수 있다잖아요."), ("C", "시드머니, 올립니다!")]),
    ("04_book_redo", [("A", "펼친 책에 저 혼자 글씨가 써진다."), ("B", "(자막) 띄어쓰기 틀렸습니다."), ("C", "빨간 줄이 쭉.")]),
    ("05_tulip", [("A", "튤립 구근 경매. 장내 침묵."), ("B", "(자막) 저는 그냥 양파입니다."), ("C", "…양파라는데요?")]),
    ("06_newton", [("A", "런던, 사과나무 아래. 안개."), ("B", "오, 인지도 있다!"), ("C", "(뉴턴 선생, 사과 맞는 중)")]),
    ("07_board", [("A", "전광판이 붉은 숫자로 쏟아진다."), ("B", "월요일이 문제예요!"), ("C", "진짜인 거랑 지금 사도 되는 건\n다른 질문이잖아요.")]),
    ("08_sandwich", [("A", "서브프라임 샌드위치."), ("B", "속이 뭔지는 저희도 몰라요."), ("C", "(상자를 든 사람들, 리먼 로비)")]),
    ("09_handshake", [("A", "서울 여의도. 처음 보는 검사."), ("B", "처음 뵙겠습니다."), ("C", "(악수) 몰빵이와 너굴, 첫 만남.")]),
    ("10_spaceship_queue", [("A", "골판지 우주선 앞의 줄."), ("B", "안 가면 환불은 없습니다."), ("C", "나야, 나. 미래의 김너굴.")]),
    ("11_tokyo_ghosts", [("A", "몸 없이 시야만 있는 너굴. 도쿄."), ("B", "저 여기 있어요! 제 말 안 들려요?!"), ("C", "나라가 나빠진 게 아니야.")]),
    ("12_copier", [("A", "로 은행 복사기. 삑."), ("B", "털이 있습니다."), ("C", "꼬리는 원래 있어요. 흔드세요.")]),
    ("13_breaker", [("A", "도쿄·서울 전광판이 붉게 번진다."), ("B", "서킷브레이커 발동!"), ("C", "월요일 그만 탓해요.")]),
    ("14_bridge", [("A", "지켜보러 온 게 아닙니다.\n곁에 있으러 왔습니다."), ("B", "너굴 씨!")]),
    ("15_fall_mentor", [("A", "(자막) 관측자 → 실행자"), ("B", "나는 네가 쓰지 못한 마지막 조문이야.\n네가 써."), ("C", "살고 싶다고! 나, 아직 안 끝났어!")]),
    ("14_bridge", [("C", "5분 걸렸습니다! 5분이요!")]),
    ("16_bench", [("A", "지켜보고 있었습니다.\n아니, 곁에 있었습니다."), ("B", "주식법전(우리).\n괄호는 빼십시오."), ("C", "…싫습니다.")]),
]

def sh(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if r.returncode:
        print("CMD FAIL:", cmd[:200], r.stderr[-600:], flush=True)
        raise SystemExit(1)
    return r

def wrap(t):
    if "\n" in t:
        return t
    return "\n".join(textwrap.wrap(t, 24)) if len(t) > 24 else t

def drawtext(tf, size, y):
    return ("drawtext=fontfile=%s:textfile=%s:fontsize=%d:fontcolor=white:borderw=3:bordercolor=black:"
            "x=(w-text_w)/2:y=%s:line_spacing=8" % (FONT, tf, size, y))

AUD = "-f lavfi -t %s -i anullsrc=r=44100:cl=stereo -c:a aac -b:a 96k -shortest" % D
ENC = "-c:v libx264 -preset veryfast -crf 24 -pix_fmt yuv420p -r %d" % FPS

def shot(args):
    idx, key, kind, text = args
    out = "%s/s%03d.mp4" % (WORK, idx)
    tf = "%s/s%03d.txt" % (WORK, idx)
    open(tf, "w", encoding="utf-8").write(wrap(text))
    z, x, y = Z[kind]
    vf = ("zoompan=z='%s':x='%s':y='%s':d=%d:s=%dx%d:fps=%d,%s,"
          "fade=t=in:st=0:d=0.3,fade=t=out:st=%s:d=0.3,format=yuv420p"
          % (z, x, y, FRAMES, W, H, FPS, drawtext(tf, 40, "h-text_h-46"), D - 0.3))
    sh("ffmpeg -y -loglevel error -i %s/%s.png -vf \"%s\" -frames:v %d %s %s %s"
       % (WORK, key, vf, FRAMES, AUD, ENC, out))
    return out

def card(name, secs, lines, size):
    out = "%s/%s.mp4" % (WORK, name)
    tf = "%s/%s.txt" % (WORK, name)
    open(tf, "w", encoding="utf-8").write("\n".join(lines))
    vf = ("%s,fade=t=in:st=0:d=0.5,fade=t=out:st=%s:d=0.5,format=yuv420p"
          % (drawtext(tf, size, "(h-text_h)/2"), secs - 0.5))
    sh("ffmpeg -y -loglevel error -f lavfi -t %s -i color=c=0x101820:s=%dx%d:r=%d -vf \"%s\" "
       "-f lavfi -t %s -i anullsrc=r=44100:cl=stereo -c:a aac -b:a 96k -shortest %s %s"
       % (secs, W, H, FPS, vf, secs, ENC, out))
    return out

def main():
    test = "--test" in sys.argv
    up = [a for a in sys.argv[1:] if a.startswith("http")]
    urls = {}
    for row in csv.reader(open(os.path.join(HERE, "manifest.tsv"), encoding="utf-8"), delimiter="\t"):
        if len(row) == 2:
            urls[row[0]] = row[1]
    keys = sorted({k for k, _ in STORY})
    if test:
        keys = [STORY[0][0]]
    for k in keys:
        sh("curl -sf -o %s/%s.png '%s'" % (WORK, k, urls[k]))
    print("downloaded", len(keys), "images; font:", FONT, flush=True)
    jobs, i = [], 0
    for key, shots in STORY:
        for kind, text in shots:
            if not test or key == STORY[0][0]:
                jobs.append((i, key, kind, text))
            i += 1
    if test:
        jobs = jobs[:3]
    with ThreadPoolExecutor(3) as ex:
        outs = list(ex.map(shot, jobs))
    print("rendered", len(outs), "shots", flush=True)
    title = card("title", 3, ["주식법전 스피드런", "(병맛 모션코믹)"], 64)
    end = card("end", 4, ["— 끝 —", "다음 편: 부동산 편 (로딩 99%)"], 44)
    parts = [title]
    if not test:
        sh("curl -sf -o %s/clip1.src.mp4 '%s'" % (WORK, CLIP1))
        sh("ffmpeg -y -loglevel error -i %s/clip1.src.mp4 -vf \"scale=%d:%d:force_original_aspect_ratio=decrease,"
           "pad=%d:%d:(ow-iw)/2:(oh-ih)/2,fps=%d,format=yuv420p\" -ar 44100 -ac 2 -c:a aac -b:a 96k %s %s/clip1.mp4"
           % (WORK, W, H, W, H, FPS, ENC, WORK))
        parts.append("%s/clip1.mp4" % WORK)
    parts += outs + [end]
    open("%s/list.txt" % WORK, "w").write("".join("file '%s'\n" % p for p in parts))
    final = "/home/user/jubsik_motioncomic%s.mp4" % ("_test" if test else "")
    sh("ffmpeg -y -loglevel error -f concat -safe 0 -i %s/list.txt -c copy %s" % (WORK, final))
    dur = sh("ffprobe -v error -show_entries format=duration -of csv=p=0 %s" % final).stdout.strip()
    size = os.path.getsize(final) / 1e6
    print("FINAL", final, "duration=%ss" % dur, "size=%.1fMB" % size, flush=True)
    if test:
        sh("ffmpeg -y -loglevel error -ss 4.5 -i %s -frames:v 1 -vf scale=640:-1 /home/user/test_frame.jpg" % final)
    if up:
        sh("curl -f -s -X PUT --upload-file %s '%s'" % (final, up[0]))
        print("UPLOADED", flush=True)

main()
