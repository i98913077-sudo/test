import re, json, csv, html
src = open('src/make_script_pdf_c.py', encoding='utf-8').read()
m = re.search(r"APPENDIX = '(.*?)'\ndoc =", src, re.S)
app = m.group(1).encode().decode('unicode_escape').encode('latin1').decode('utf-8') if False else m.group(1).replace('\\n', '\n')
rows = re.findall(r'<tr>(.*?)</tr>', app, re.S)
cuts = []
for r in rows:
    cells = [html.unescape(re.sub(r'<[^>]+>', '', c)).strip() for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', r, re.S)]
    if cells and cells[0].isdigit():
        cuts.append(cells)
hdr = [html.unescape(re.sub(r'<[^>]+>', '', c)) for c in re.findall(r'<th[^>]*>(.*?)</th>', app, re.S)]
print(hdr, len(cuts))
with open('assets/cutlist.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f); w.writerow(hdr); w.writerows(cuts)
json.dump([dict(zip(hdr, c)) for c in cuts], open('assets/cutlist.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
