import re, html, subprocess

body = open('/home/claude/film/script_body_c.txt', encoding='utf-8').read().splitlines()
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
  <div class="c1">영 화 대 본 &nbsp;·&nbsp; 병맛 B급 완결편</div>
  <div class="c2">주식법전</div>
  <div class="c3">스피드런 (제작비 4,500원)</div>
  <div class="c4">원작 &nbsp;《주식시장에 나와서는 안 될 소설: 주식법전 스피드런》 (12장 버전 + 13~20조 완결)</div>
  <div class="c5">장르 &nbsp;일본 애니풍 병맛 B급 타임루프 드라마 · 한국어판</div>
  <div class="c6">※ 본 대본의 괄호 안 제작 현장 설명은 모두 의도된 개그입니다</div>
</div>
<div class="page">
<h2>로그라인</h2>
<p class="a">반대매매로 -8,400만 원을 안고 한강 다리에서 떨어진 너구리 &lsquo;너굴이&rsquo;. 갓 쓴 임시직 저승사자가 제안한다. &ldquo;400년의 버블을 돌며 주식법전 20조를 새기면, 빚을 지워주겠다.&rdquo; 책은 저 혼자 써지고, 허공의 목소리는 &ldquo;예전의 너는 안 그랬는데&rdquo;를 반복하며, 시스템은 점점 고장 난다. 마지막 조문을 쓰는 사람은 너굴이 자신이다.</p>

<h2>등장인물</h2>
<table class="cast">
<tr><td class="n">너굴이</td><td>주인공. 양복 입은 너구리. 아무도 놀라지 않는다. 확신이 서면 전 재산을 거는 도박사. 이번 생에서 처음으로 &lsquo;분산&rsquo;과 &lsquo;의심&rsquo;과 &lsquo;도움 요청&rsquo;을 배운다.</td></tr>
<tr><td class="n">몰빵이</td><td>서울중앙지검 검사. 인간. 이름값을 못 하는 지나치게 원칙적인 남자. 예전 루프마다 한강 다리에서 너굴이를 &lsquo;그냥 지켜봤다&rsquo;. 이번엔 지켜보지 않는다. 아버지가 한 번에 다 걸었다가 다 잃은 과거가 있다.</td></tr>
<tr><td class="n">저승사자 (임시직)</td><td>갓과 두루마기, 가슴에는 인턴 명찰. 퀘스트의 발령자. 정체는 마흔한 번째 루프에서 무너진 미래의 너굴이.</td></tr>
<tr><td class="n">목소리</td><td>너굴이를 지켜보는 &lsquo;알 수 없는 존재&rsquo;. 정체는 저승사자와 같은 미래의 너굴이.</td></tr>
<tr><td class="n">배우 A·B·C·D</td><td>모든 시대의 상인, 하녀, 구두닦이, 택시 기사, 천재, 구조대원을 번갈아 연기한다. 저희 배우가 네 명입니다.</td></tr>
</table>

<h2>연출 의도</h2>
<p class="a">이 영화는 &lsquo;시스템 창&rsquo;이라는 게임의 문법으로 시작해, 그 문법이 사실은 한 사람의 마지막 6.8초였다는 감정으로 끝난다. 웃음은 언제나 &lsquo;확신&rsquo;을 향한다. 소문에 우르르 몰리는 사람들, 설명 못 하는 코인, 닻이 바다에 묶인 프로토콜. 아무것도 아닌 것에 줄을 서는 모습이 가장 웃기고 가장 아프다.</p>
<p class="a">영화 전체를 이어주는 장치는 다섯 개다. ① 저 혼자 써지는 반듯한 필체의 법전(9장부터 필체가 두 개가 된다), ② &ldquo;그냥 지켜보게요&rdquo;라는 몰빵이의 첫 대사와 그 회수, ③ &ldquo;예전의 너답지 않아&rdquo;로 이어지는 목소리, ④ &ldquo;처음 뵙겠습니다&rdquo;의 반복, ⑤ 매번 나오는 같은 배우 네 명.</p>
<p class="a">결말은 한 줄이다. 확신은 혼자 두면 자란다. 그래서 마지막 조문은 &lsquo;혼자 버티지 말라&rsquo;다. 제4막까지는 병맛이고, 마지막 낙하부터는 진심이다.</p>
<p class="a">표기: <b>S#</b> 장면 번호 · <b>(V.O.)</b> 화면 밖 목소리 · <b>(O.S.)</b> 화면 밖 위치의 목소리 · <b>(F)</b> 전화 너머 목소리 · 청록 박스는 화면에 뜨는 시스템 창 · 괄호 안은 제작 현장 개그.</p>
</div>
<div class="page" style="page-break-before:always">
<h2>주식법전 20조 한눈에 보기</h2>
<table class="cast">
<tr><td class="n">제1조</td><td>1602 암스테르담 · 위험의 공정한 배분 — 100만 → 300만 (개변 -7,120만)</td></tr>
<tr><td class="n">제2조</td><td>1637 튤립 · 가치 없는 상승의 위험 — 300만 유지 (-5,840만)</td></tr>
<tr><td class="n">제3조</td><td>1720 런던 · 판단의 자기복제 금지 — 450만 (-4,590만)</td></tr>
<tr><td class="n">제4조</td><td>1929 뉴욕 · 레버리지가 만드는 가짜 수요 — 450만 (-3,110만)</td></tr>
<tr><td class="n">제5조</td><td>1987 블랙먼데이 · 자동화된 공포 — 414만 (-1,890만)</td></tr>
<tr><td class="n">제6조</td><td>2000 닷컴 · 진실과 가격의 분리 — 497만 (-670만)</td></tr>
<tr><td class="n">제7조</td><td>2008 리먼 · 위험분산의 착시 — 745만 (빚 0원, 숨겨진 퀘스트 「원인」 발생)</td></tr>
<tr><td class="n">제8조</td><td>2020 서울 · 공포와 탐욕의 대칭 — 968만 (목소리의 정체 공개)</td></tr>
<tr><td class="n">제9조</td><td>197? 오일쇼크 · 환경의 판결 — 968만 (필체 두 개, 순서 붕괴)</td></tr>
<tr><td class="n">제10조</td><td>1990 도쿄 · 성공과 가격의 분리 — 823만 (관측자/실행자 교체)</td></tr>
<tr><td class="n">제11조</td><td>1997 방콕·서울 · 신뢰의 국경 없음 — 823만</td></tr>
<tr><td class="n">제12조</td><td>2015 상하이 · 정책이 밀어 올린 가격의 한계 — 905만</td></tr>
<tr><td class="n">제13조</td><td>1720 파리 · 화폐의 약속 — 1,086만 (몸 교체, 몰빵이의 과거)</td></tr>
<tr><td class="n">제14조</td><td>1998 뉴욕 · 모델이 아는 건 과거뿐 — 1,086만</td></tr>
<tr><td class="n">제15조</td><td>2017 서울 · 설명할 수 없는 이야기의 한계 — 1,303만</td></tr>
<tr><td class="n">제16조</td><td>2022 서울 · 수익률은 누군가의 지갑에서 나온다 — 1,303만</td></tr>
<tr><td class="n">제17조</td><td>2024 도쿄·서울 · 공짜 돈의 끝 — 1,439만 (최종 좌표 확정)</td></tr>
<tr><td class="n">제18조</td><td>2026.06.19 오전 · 의심은 모욕이 아니라 안전장치다</td></tr>
<tr><td class="n">제19조</td><td>2026.06.19 한강 다리 · 방관의 금지 (몰빵이가 직접 씀)</td></tr>
<tr><td class="n">제20조</td><td>낙하 6.8초 · 혼자 판단하지 말고, 혼자 버티지 말라 (너굴이의 필체)</td></tr>
</table>
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
table.cut{border-collapse:collapse;width:100%;font-size:9pt}table.cut th{background:#222;color:#fff;font-family:'Noto Sans CJK KR',sans-serif;padding:1.2mm;text-align:left}table.cut td{vertical-align:top;padding:1.2mm;border-bottom:.4px solid #bbb}td.cn{width:8mm;text-align:center;font-weight:700}td.cs{width:17mm;white-space:nowrap}
'''

APPENDIX = '\n<div style="page-break-before:always">\n<h2>부록. 힉스필드 제작 컷 리스트 (핵심 43컷)</h2>\n<p class="a">한 컷은 5초 안팎의 영상 한 개를 뜻한다. 전체를 만들면 약 4분 분량의 하이라이트가 된다. 전 장면을 다 만들려면 컷 수가 몇 배로 늘어난다.</p>\n<table class="cut">\n<tr><th>컷</th><th>장면</th><th>화면</th><th>대사 · 자막</th></tr>\n<tr><td class="cn">1</td><td class="cs">S#1</td><td>한강 다리 난간에 기대 선 양복 입은 너구리, 해질녘, 스마트폰 숫자 -84,000,000원 클로즈업</td><td>(혼잣말) 미쳤네, 진짜.</td></tr><tr><td class="cn">2</td><td class="cs">S#1-1</td><td>검찰청 복도, 서류 파일을 든 무표정한 검사</td><td>당신이 무너지는 걸, 그냥 지켜보게요.</td></tr><tr><td class="cn">3</td><td class="cs">S#2</td><td>너구리가 난간을 넘어 뒤로 떨어짐. 표지판의 상담 전화번호가 바람에 흔들림</td><td>아, 진짜 얄밉네, 저 인간.</td></tr><tr><td class="cn">4</td><td class="cs">S#3</td><td>암흑 속에 떠 있는 너구리 앞에 갓 쓴 저승사자(인턴 명찰), 청록 퀘스트 창</td><td>성공하면 마이너스 8천4백만 원이 사라진다.</td></tr><tr><td class="cn">5</td><td class="cs">S#3</td><td>저승사자가 손가락을 튕기고 빛이 터지며 너구리가 빨려 들어감</td><td>대신 와이파이도 없어.</td></tr><tr><td class="cn">6</td><td class="cs">S#4</td><td>1602 암스테르담 놀이터 세트, 비닐 운하, 합판 풍차, 모래 위에서 깨어나는 너구리</td><td>(자막) 암스테르담 (※ 대전)</td></tr><tr><td class="cn">7</td><td class="cs">S#5</td><td>창구 줄, 동전 주머니를 올린 하녀 뒤에서 시드머니를 올리는 너구리</td><td>나도 배의 주인이 될 수 있다잖아요.</td></tr><tr><td class="cn">8</td><td class="cs">S#6</td><td>펼친 빈 책에 저 혼자 반듯한 글씨가 써지고 빨간 줄이 그어짐</td><td>(자막) 띄어쓰기 틀렸습니다.</td></tr><tr><td class="cn">9</td><td class="cs">S#7-8</td><td>튤립 구근이 말하는 순간(스태프가 입으로 연기), 경매장 침묵</td><td>(자막) 저는 그냥 양파입니다.</td></tr><tr><td class="cn">10</td><td class="cs">S#9</td><td>런던 사과나무 아래 뉴턴이 사과를 맞음, 안개</td><td>오, 인지도 있다!</td></tr><tr><td class="cn">11</td><td class="cs">S#10</td><td>구두닦이 소년이 손님에게 주식을 권함, 1929 재즈</td><td>손님, 저도 어제 주식 하나 샀어요.</td></tr><tr><td class="cn">12</td><td class="cs">S#11</td><td>1987 객장, 전광판이 붉은 숫자로 쏟아짐</td><td>월요일이 문제예요!</td></tr><tr><td class="cn">13</td><td class="cs">S#12</td><td>2000 PER 8,000배 시세판, 너구리가 숫자를 읽음</td><td>진짜인 거랑 지금 사도 되는 건 다른 질문이잖아요.</td></tr><tr><td class="cn">14</td><td class="cs">S#13</td><td>서브프라임 샌드위치를 든 직원, 리먼 로비의 상자를 든 사람들</td><td>속이 뭔지는 저희도 몰라요.</td></tr><tr><td class="cn">15</td><td class="cs">S#13</td><td>빚 0원 창에 환호하는 너구리, 곧바로 붉게 바뀌는 숨겨진 퀘스트 창</td><td>(목소리) 넌 확신을 의심하지 못해서 뛰어내렸다.</td></tr><tr><td class="cn">16</td><td class="cs">S#14</td><td>서울 여의도에서 처음 보는 검사 몰빵이와 악수를 청하는 너구리</td><td>처음 뵙겠습니다.</td></tr><tr><td class="cn">17</td><td class="cs">S#15</td><td>골판지 우주선 앞에 줄을 선 시민들</td><td>안 가면 환불은 없습니다.</td></tr><tr><td class="cn">18</td><td class="cs">S#15</td><td>창에 \'진짜 반전\' 문구, 허공의 목소리</td><td>나야, 나. 미래의 김너굴.</td></tr><tr><td class="cn">19</td><td class="cs">S#16</td><td>의자에 바퀴 단 자동차 줄, 낙타 탈을 쓴 스태프</td><td>휘발유 말고 저 타세요.</td></tr><tr><td class="cn">20</td><td class="cs">S#17</td><td>몸 없이 시야만 있는 너구리, 도쿄 거리를 걷는 몰빵이</td><td>저 여기 있어요! 제 말 안 들려요?!</td></tr><tr><td class="cn">21</td><td class="cs">S#17</td><td>너구리와 검사의 시야가 겹치며 둘이 같은 입으로 말함</td><td>나라가 나빠진 게 아니야.</td></tr><tr><td class="cn">22</td><td class="cs">S#19</td><td>상하이 객장, 택시 기사가 집값 이야기를 함</td><td>저희 배우가 네 명입니다.</td></tr><tr><td class="cn">23</td><td class="cs">S#20</td><td>로 은행 복사기, 모니터에 \'토너 부족\', 지폐 A4 용지 날림</td><td>(복사기) 삑.</td></tr><tr><td class="cn">24</td><td class="cs">S#20</td><td>너구리 정장 속의 검사와 검사 정장 속의 너구리, 몸이 바뀜</td><td>털이 있습니다. / 꼬리는 원래 있어요. 흔드세요.</td></tr><tr><td class="cn">25</td><td class="cs">S#20</td><td>지폐 다발을 바라보는 너구리 몸 속 몰빵이의 번들거리는 눈</td><td>한 방에 다 걸면, 어떻게 됩니까.</td></tr><tr><td class="cn">26</td><td class="cs">S#21</td><td>노벨상 메달을 건 천재 네 명, 칠판에 수식</td><td>우주가 생기고 한 번도 없을 확률입니다.</td></tr><tr><td class="cn">27</td><td class="cs">S#22</td><td>코인 치킨집, 백서 첫 장부터 고양이 그림</td><td>백서에 고양이가 있어요.</td></tr><tr><td class="cn">28</td><td class="cs">S#23</td><td>서버실 천장에 매달린 종이 닻 모형, 줄이 끊어짐</td><td>배가 닻을 자기 자신한테 묶었어요.</td></tr><tr><td class="cn">29</td><td class="cs">S#24</td><td>도쿄·서울 전광판이 붉게 번지고 서킷브레이커 발동</td><td>월요일 그만 탓해요.</td></tr><tr><td class="cn">30</td><td class="cs">S#24</td><td>붉은 창 \'2026년 6월 19일 17시 12분, 한강 다리\'</td><td>여기서부턴, 내가 아는 곳이야.</td></tr><tr><td class="cn">31</td><td class="cs">S#25</td><td>증권사 객장, 하이닉스 매수 버튼을 누르는 과거의 너구리와 몸 없는 현재의 너구리</td><td>야! 사지 마! 사지 말라고!</td></tr><tr><td class="cn">32</td><td class="cs">S#25</td><td>관측자의 목소리가 안 닿는 과거의 너구리, 무표정한 검사의 옆얼굴</td><td>이번엔 지켜보지 않겠습니다.</td></tr><tr><td class="cn">33</td><td class="cs">S#26</td><td>검사가 서류 가방을 떨어뜨리고 119에 전화, 난간 앞에 선 과거의 너구리</td><td>지켜보러 온 게 아닙니다. 곁에 있으러 왔습니다.</td></tr><tr><td class="cn">34</td><td class="cs">S#26</td><td>검사가 코트 자락을 붙잡았다가 놓침, 너구리가 난간 너머로</td><td>너굴 씨!</td></tr><tr><td class="cn">35</td><td class="cs">S#27</td><td>낙하 슬로 모션, 스마트폰 숫자가 멀어짐, 시야가 몸속으로 들어감</td><td>(자막) 관측자 → 실행자</td></tr><tr><td class="cn">36</td><td class="cs">S#28</td><td>낙하 중 갓이 벗겨지며 드러나는 미래의 너구리(눈 밑 거뭇함)</td><td>인턴이었지.</td></tr><tr><td class="cn">37</td><td class="cs">S#28</td><td>미래의 너구리가 지폐 조각으로 사라지고 갓에 \'인턴\' 글자</td><td>나는 네가 쓰지 못한 마지막 조문이야. 네가 써.</td></tr><tr><td class="cn">38</td><td class="cs">S#28</td><td>낙하 잔여시간 0.6초, 너구리가 팔을 뻗음</td><td>살고 싶다고! 나, 아직 안 끝났어!</td></tr><tr><td class="cn">39</td><td class="cs">S#29</td><td>한강 수면, 순찰정 라이트, 구조대원 네 명</td><td>저희 배우가 네 명입니다.</td></tr><tr><td class="cn">40</td><td class="cs">S#29</td><td>다리 위에서 찢어진 코트로 외치는 검사</td><td>5분 걸렸습니다! 5분이요!</td></tr><tr><td class="cn">41</td><td class="cs">S#30</td><td>병실, 의자에서 졸다 깨는 검사</td><td>지켜보고 있었습니다. 아니, 곁에 있었습니다.</td></tr><tr><td class="cn">42</td><td class="cs">S#31</td><td>벤치에서 한 권의 노트에 두 개의 필체로 쓰는 두 사람</td><td>주식법전(우리). / 괄호는 빼십시오.</td></tr><tr><td class="cn">43</td><td class="cs">S#32</td><td>엔딩 크레딧 뒤 구르는 갓, 새 퀘스트 창 \'부동산 편\', 로딩 99%</td><td>…싫습니다.</td></tr>\n</table>\n<h2>제작 방식 메모</h2>\n<p class="a">① 컷끼리 이어 붙이려면 각 컷의 마지막 장면과 다음 컷의 첫 장면을 같은 그림으로 맞춘다. 앞서 만든 영상에서 장면이 튄 이유는 컷마다 시작 그림만 따로 줬기 때문이다. ② 너굴이(양복 입은 너구리)와 몰빵이(인간 검사)의 캐릭터 시트를 모든 컷의 기준 그림으로 쓴다. ③ 한국어 대사는 영상 AI가 영어로 읽거나 다르게 발음할 수 있어서, 자막을 입히고 필요하면 별도 더빙으로 보강한다. ④ 컷당 크레딧은 영상 모델과 길이에 따라 달라지므로, 만들기 전에 비용부터 확인한다.</p>\n</div>\n'
doc = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>%s</style></head><body>%s%s</body></html>' % (css, cover, body_html + APPENDIX)
open('/home/claude/film/script_c.html', 'w', encoding='utf-8').write(doc)

subprocess.run(['wkhtmltopdf', '--quiet', '--disable-smart-shrinking', '--page-size', 'A4',
                '--margin-top', '24mm', '--margin-bottom', '22mm', '--margin-left', '24mm', '--margin-right', '24mm',
                '--encoding', 'utf-8', '/home/claude/film/script_c.html', '/home/claude/film/raw_c.pdf'],
               check=True)
print('scenes', scene_n, 'dialogues', dial_n)

# page numbers (skip cover)
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
import io
r = PdfReader('/home/claude/film/raw_c.pdf'); w = PdfWriter()
for i, pg in enumerate(r.pages):
    if i > 0:
        buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=A4)
        c.setFont('Helvetica', 9); c.drawCentredString(A4[0]/2, 28, str(i))
        c.save(); buf.seek(0)
        pg.merge_page(PdfReader(buf).pages[0])
    w.add_page(pg)
w.write(open('/home/claude/film/주식법전_스피드런_완결대본_병맛B급.pdf', 'wb'))
print('pages', len(r.pages))
