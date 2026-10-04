import re, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'src/script_body_c.txt'
L = open(p, encoding='utf-8').read().splitlines()
scenes = [l for l in L if l.startswith('S# ')]
acts = [l for l in L if l.startswith('## ')]
dl = [l for l in L if l.startswith('@')]
who = {}
for l in dl:
    m = re.match(r'@(\S+)', l); who[m.group(1)] = who.get(m.group(1), 0) + 1
print(f'# 대본 통계 ({p})\n\n- 막: {len(acts)}\n- 장면: {len(scenes)}\n- 대사: {len(dl)}\n\n## 인물별 대사 수')
for k, v in sorted(who.items(), key=lambda x: -x[1]): print(f'- {k}: {v}')
