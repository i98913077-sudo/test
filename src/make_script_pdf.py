import re, html, subprocess

body = open('/home/claude/film/script_body.txt', encoding='utf-8').read().splitlines()
e = html.escape

out = []
pending = []
sys_buf = []
dial_n = 0
scene_n = 0

def flush_sys():
    global sys_buf
    if sys_buf:
        out.append('<div class="sys">' + '<br>'.join(e(x) for x in sys_buf) + '</div>')
        sys_buf = []

for ln in body:
    if not ln.strip():
        continue
    if ln.startswith('~^ '):
        flush_sys()
        out.append('<div class="actsub">%s</div>' % e(ln[3:]))
        continue
    if ln.startswith('~'):
        sys_buf.append(ln[1:].strip())
        continue
    flush_sys()
    if ln.startswith('## '):
        out.append('<div class="act"><h1>%s</h1>' % e(ln[3:]))  # closed below
        out.append('</div>')
    elif ln.startswith('S# '):
        scene_n += 1
        out.append('@@SCENE@@<div class="scene">%s</div>' % e(ln))
    elif ln.startswith('^ '):
        out.append('<div class="super">자막 &nbsp;|&nbsp; %s</div>' % e(ln[2:]))
    elif ln.startswith('>> '):
        out.append('<div class="trans">%s</div>' % e(ln[3:]))
    elif ln.startswith('@'):
        dial_n += 1
        m = re.match(r'@(\S+)\s+(.*)', ln)
        name, rest = m.group(1), m.group(2)
        par = ''
        pm = re.match(r'^(\([^)]*\))\s*(.*)', rest)
        if pm:
            par, rest = pm.group(1), pm.group(2)
        txt = e(rest)
        txt = re.sub(r'\(([^)]*)\)', r'<i>(\1)</i>', txt)
        out.append('<table class="dl"><tr><td class="n">%s</td><td class="t">%s%s</td></tr></table>'
                   % (e(name), ('<i>%s</i> ' % e(par)) if par else '', txt))
    else:
        out.append('<p class="a">%s</p>' % e(ln))
flush_sys()

joined = []
i = 0
while i < len(out):
    if out[i].startswith('@@SCENE@@') and i + 1 < len(out):
        joined.append('<div style="page-break-inside:avoid">' + out[i][9:] + out[i+1] + '</div>')
        i += 2
    else:
        joined.append(out[i].replace('@@SCENE@@', ''))
        i += 1
body_html = '\n'.join(joined)
# act headings need page breaks: mark
body_html = body_html.replace('<div class="act">', '<div class="act" style="page-break-before:always">')

cover = '''
<div class="cover">
  <div class="c1">영 화 대 본</div>
  <div class="c2">주식법전</div>
  <div class="c3">스피드런</div>
  <div class="c4">원작 &nbsp;《주식시장에 나와서는 안 될 소설: 주식법전 스피드런》</div>
  <div class="c5">장르 &nbsp;일본 애니메이션풍 판타지 드라마 · 한국어판</div>
  <div class="c6">각색 초고</div>
</div>
<div class="page">
<h2>로그라인</h2>
<p class="a">반대매매로 모든 것을 잃고 한강 다리에서 뛰어내린 너구리 &lsquo;너굴이&rsquo;. 암흑 속에서 만난 &lsquo;검사 저승사자&rsquo; 몰빵이는 1602년부터 2026년까지 인류 증시사의 사건 현장을 돌며 &lsquo;주식법전&rsquo;을 완성하라고 명령한다. 424년의 여정이 끝날 무렵 너굴이는 알게 된다. 이 모든 시간이 추락하는 6.8초의 안에서 흘렀다는 것을, 그리고 저승사자의 정체가 자기 자신이라는 것을.</p>

<h2>등장인물</h2>
<table class="cast">
<tr><td class="n">너굴이</td><td>주인공. 네이비 정장을 입은 의인화된 너구리. 확신이 서면 전 재산을 거는 &lsquo;몰빵&rsquo; 투자자였으나, 반대매매로 인생이 무너진다. 424년의 여정에서 처음으로 &lsquo;분산&rsquo;과 &lsquo;출구&rsquo;를 배운다.</td></tr>
<tr><td class="n">몰빵이</td><td>&lsquo;검사 저승사자&rsquo;. 인간. 표정이 없고 단호하며 원칙적이다. 시대마다 따라붙어 너굴이를 지켜본다. 자신의 과거를 묻는 질문에는 한 박자 늦게 답한다. 정체는 너굴이 안의 &lsquo;원칙의 목소리&rsquo;.</td></tr>
<tr><td class="n">상인 · 신사 · 시민들</td><td>시대마다 등장하는 인간들. 모두 사람으로 연출한다. 소문과 정보를 뿌리고, 그 소문에 휩쓸린다.</td></tr>
<tr><td class="n">간호사 · 구조대원</td><td>결말부에서 현실의 목소리로 등장한다.</td></tr>
</table>

<h2>연출 의도</h2>
<p class="a">이 영화는 &lsquo;시스템 창&rsquo;이라는 게임의 문법으로 시작해, 그 문법이 사실은 한 사람의 마음속 구조였다는 사실로 끝난다. 청록색 반투명 창, 낙하 카운트, 조문이 새겨지는 순간의 금빛은 영화 전체를 이어주는 시각 장치다. 시대 장면은 모두 세 가지를 반복한다. &lsquo;소문이 번진다 → 사람들이 몰린다 → 너굴이가 한 걸음 물러서서 계산한다.&rsquo;</p>
<p class="a">복선은 네 개다. ① 몰빵이의 한 박자 늦은 대답, ② 7월 30일 반대매매 플래시백, ③ &ldquo;기억은 관측자의 소관이 아닙니다&rdquo;, ④ 붉은 경고창과 &lsquo;이 루프, 몇 번째지&rsquo; 로그. 10장에서 정체가 밝혀지고, 15장에서 시간이 확정되며, 16장에서 너굴이가 &lsquo;법전&rsquo;이 아닌 자기 의지로 마지막 선택을 한다.</p>
<p class="a">표기: <b>S#</b> 장면 번호 · <b>(V.O.)</b> 화면 밖 목소리 · <b>(O.S.)</b> 화면 밖 위치의 목소리 · <b>(F)</b> 전화 너머 목소리 · 청록 박스는 화면에 뜨는 시스템 창.</p>
</div>
'''

css = '''
body{font-family:"Noto Serif CJK KR",serif;font-size:10.5pt;line-height:1.75;color:#111;margin:0}
.cover{page-break-after:always;text-align:center;padding-top:60mm}
.c1{font-size:13pt;letter-spacing:14px;color:#555}
.c2{font-size:46pt;font-weight:700;margin-top:18mm;letter-spacing:6px}
.c3{font-size:22pt;margin-top:4mm;letter-spacing:10px;color:#333}
.c4{font-size:10.5pt;margin-top:40mm;color:#444}
.c5{font-size:10.5pt;margin-top:3mm;color:#444}
.c6{font-size:10pt;margin-top:24mm;color:#888}
.page{}
h2{font-family:"Noto Sans CJK KR",sans-serif;font-size:13pt;border-bottom:1.2px solid #111;padding-bottom:2px;margin:12mm 0 4mm}
h1{font-family:"Noto Sans CJK KR",sans-serif;font-size:22pt;margin:30mm 0 2mm;text-align:center}
.act{text-align:center}
.actsub{text-align:center;color:#666;font-size:10.5pt;margin-bottom:12mm;font-family:"Noto Sans CJK KR",sans-serif}
.scene{font-family:"Noto Sans CJK KR",sans-serif;font-weight:700;font-size:11pt;margin:9mm 0 3mm;padding:1.5mm 2mm;background:#ececec;page-break-after:avoid}
p.a{margin:0 0 2.6mm;text-align:justify;word-break:keep-all}
.super{margin:3mm 0;padding:1.2mm 3mm;border-left:3px solid #111;font-family:"Noto Sans CJK KR",sans-serif;font-size:10pt;background:#f6f6f6}
.trans{text-align:right;font-family:"Noto Sans CJK KR",sans-serif;font-size:9.5pt;font-weight:700;margin:4mm 0 0;letter-spacing:1px}
table.dl{border-collapse:collapse;margin:0 0 2.2mm 8mm;width:158mm;page-break-inside:avoid}
table.dl td{vertical-align:top;padding:0}
td.n{width:28mm;font-family:"Noto Sans CJK KR",sans-serif;font-weight:700;font-size:10pt;padding-right:3mm}
td.t{word-break:keep-all}
.sys{margin:3mm 8mm 4mm;padding:2.5mm 4mm;border:1.4px solid #138a8a;background:#eaf7f7;color:#0b4f4f;font-family:"Noto Sans CJK KR",sans-serif;font-size:9.3pt;line-height:1.6;page-break-inside:avoid}
table.cast{border-collapse:collapse;width:100%}
table.cast td{vertical-align:top;padding:2mm 0;border-bottom:.5px solid #bbb;font-size:10pt}
table.cast td.n{width:36mm;font-size:10.5pt}
i{font-style:normal;color:#555}
'''

doc = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>%s</style></head><body>%s%s</body></html>' % (css, cover, body_html)
open('/home/claude/film/script.html', 'w', encoding='utf-8').write(doc)

subprocess.run(['wkhtmltopdf', '--quiet', '--disable-smart-shrinking', '--page-size', 'A4',
                '--margin-top', '24mm', '--margin-bottom', '22mm', '--margin-left', '24mm', '--margin-right', '24mm',
                '--encoding', 'utf-8', '/home/claude/film/script.html', '/home/claude/film/raw.pdf'],
               check=True)
print('scenes', scene_n, 'dialogues', dial_n)

# page numbers (skip cover)
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
import io
r = PdfReader('/home/claude/film/raw.pdf'); w = PdfWriter()
for i, pg in enumerate(r.pages):
    if i > 0:
        buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=A4)
        c.setFont('Helvetica', 9); c.drawCentredString(A4[0]/2, 28, str(i))
        c.save(); buf.seek(0)
        pg.merge_page(PdfReader(buf).pages[0])
    w.add_page(pg)
w.write(open('/home/claude/film/주식법전_스피드런_영화대본.pdf', 'wb'))
print('pages', len(r.pages))
