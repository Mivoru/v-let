import re
with open('index.html', 'r', encoding='utf-8') as f:
    text = f.read()
matches = re.findall(r'<span class="stat-val">([^<]+)</span><span class="stat-key">Převýšení', text)
for i, m in enumerate(matches):
    print(f'Trip {i+1}: {m}')
