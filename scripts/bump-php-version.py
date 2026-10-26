#!/usr/bin/env python3
"""PHP판(simgame-php)의 버전 표시를 한 번에 바꾼다.
- 화면 파일(HTML/JS)의 주소에 ?v=<버전>을 붙여 브라우저가 옛 파일을 재사용하지 못하게 한다.
- api.php 의 APP_VERSION 을 같은 값으로 맞춘다. (관리자 화면/api.php?r=version 에서 확인 가능)
사용법: python3 scripts/bump-php-version.py 2026.10.25-envelope
"""
import re, sys, pathlib
ver = sys.argv[1] if len(sys.argv) > 1 else None
if not ver or not re.fullmatch(r'[0-9A-Za-z._-]+', ver):
    sys.exit('버전 문자열을 영문/숫자/./_/- 로 입력하세요')
root = pathlib.Path(__file__).resolve().parent.parent / 'simgame-php'
def sub(path, pattern, repl):
    p = root / path; s = p.read_text(encoding='utf-8'); n = re.sub(pattern, repl, s); p.write_text(n, encoding='utf-8'); return s != n
for html in ['index.html', 'ranking.html', 'admin.html', 'check.html']:
    sub(html, r'(href="css/style\.css)(\?v=[^"]*)?"', rf'\1?v={ver}"')
    sub(html, r'(src="js/[a-z]+\.js)(\?v=[^"]*)?"', rf'\1?v={ver}"')
for js in (root / 'js').glob('*.js'):
    sub(f'js/{js.name}', r"(from '\./(?:common|chart)\.js)(\?v=[^']*)?'", rf"\1?v={ver}'")
sub('api.php', r"const APP_VERSION = '[^']*';", f"const APP_VERSION = '{ver}';")
print('버전을', ver, '로 맞췄습니다')
