import re, html, subprocess

body = open('/home/claude/film/script_body_b.txt', encoding='utf-8').read().splitlines()
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
  <div class="c1">영 화 대 본 &nbsp;·&nbsp; 병맛 B급 에디션</div>
  <div class="c2">주식법전</div>
  <div class="c3">스피드런 (제작비 4,500원)</div>
  <div class="c4">원작 &nbsp;《주식시장에 나와서는 안 될 소설: 주식법전 스피드런》</div>
  <div class="c5">장르 &nbsp;일본 애니풍 병맛 B급 판타지 드라마 · 한국어판</div>
  <div class="c6">※ 본 대본의 괄호 안 제작 현장 설명은 모두 의도된 개그입니다</div>
</div>
<div class="page">
<h2>로그라인</h2>
<p class="a">반대매매로 인생이 하한가를 맞은 너구리 &lsquo;너굴이&rsquo;가 한강 다리에서 떨어지자, 냄비를 쓴 검사 저승사자 몰빵이가 나타나 &ldquo;주식법전을 완성하면 살려는 드리겠다&rdquo;고 제안한다. 제작비 4,500원으로 424년을 여행하는 초저예산 시대극. 그러나 마지막 3분만은 진심이다.</p>

<h2>등장인물</h2>
<table class="cast">
<tr><td class="n">너굴이</td><td>주인공. 네이비 정장을 입은 너구리. 아무도 너구리가 양복을 입은 것에 놀라지 않는다. 확신이 서면 전 재산을 거는 &lsquo;몰빵&rsquo; 투자자였으나 424년 동안 분산과 출구를 배운다.</td></tr>
<tr><td class="n">몰빵이</td><td>검사 저승사자. 인간. 표정 0, 예산 0. 17세기에는 돗자리와 냄비를 두르고 등장한다. 정체는 너굴이 안의 &lsquo;원칙의 목소리&rsquo;이며, 야근 수당은 없다.</td></tr>
<tr><td class="n">내레이션</td><td>다큐 성우 톤. 제작비 부족을 자꾸 관객에게 고백한다.</td></tr>
<tr><td class="n">상인 · 신사 · 시민들</td><td>시대마다 같은 스태프 네 명이 번갈아 연기한다. 모두 사람이다. 소문을 퍼뜨리고, 그 소문에 가장 먼저 속는다.</td></tr>
<tr><td class="n">간호사 · 구조대원</td><td>결말부에서 현실의 목소리로 등장한다. 병원비 이야기를 한다.</td></tr>
</table>

<h2>연출 의도</h2>
<p class="a">이 에디션의 규칙은 하나다. <b>웃음은 시장과 시스템을 향한다.</b> 소문에 우르르 몰리는 사람들, 정보를 파는 신사, 돈을 찍어내는 복사기, 달에 간다고 줄 서는 사람들. 웃음의 대상은 언제나 &lsquo;확신&rsquo;이다. 그래서 제작 현장 개그(괄호 지문)와 시대극 개그가 같은 방향을 향한다. 아무것도 아닌 것에 줄을 서는 모습이 가장 웃기고, 가장 아프기 때문이다.</p>
<p class="a">제4막부터는 병맛을 내려놓는다. 낙하 6.8초의 진실, 사라지는 몰빵이, 그리고 &ldquo;나, 살고 싶어&rdquo;는 어떤 농담도 얹지 않는다. 결말의 웃음은 현실이 건네는 병원비 정도에서 멈춘다. 영화의 마지막 자막은 자살예방상담전화 안내다.</p>
<p class="a">표기: <b>S#</b> 장면 번호 · <b>(V.O.)</b> 화면 밖 목소리 · <b>(O.S.)</b> 화면 밖 위치의 목소리 · <b>(F)</b> 전화 너머 목소리 · 청록 박스는 화면에 뜨는 시스템 창 · 괄호 안은 제작 현장 개그.</p>
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
open('/home/claude/film/script_b.html', 'w', encoding='utf-8').write(doc)

subprocess.run(['wkhtmltopdf', '--quiet', '--disable-smart-shrinking', '--page-size', 'A4',
                '--margin-top', '24mm', '--margin-bottom', '22mm', '--margin-left', '24mm', '--margin-right', '24mm',
                '--encoding', 'utf-8', '/home/claude/film/script_b.html', '/home/claude/film/raw_b.pdf'],
               check=True)
print('scenes', scene_n, 'dialogues', dial_n)

# page numbers (skip cover)
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
import io
r = PdfReader('/home/claude/film/raw_b.pdf'); w = PdfWriter()
for i, pg in enumerate(r.pages):
    if i > 0:
        buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=A4)
        c.setFont('Helvetica', 9); c.drawCentredString(A4[0]/2, 28, str(i))
        c.save(); buf.seek(0)
        pg.merge_page(PdfReader(buf).pages[0])
    w.add_page(pg)
w.write(open('/home/claude/film/주식법전_스피드런_영화대본_병맛B급.pdf', 'wb'))
print('pages', len(r.pages))
