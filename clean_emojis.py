import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

emojis_to_remove = ['✨ ', '🪨 ', '🗼 ', '⛰️ ', '🌊 ', '🏯 ', '🌿 ', '🦇 ', '🏰 ', '🏖️ ', '🦅 ', '🏞️ ', '🏙️ ']
for e in emojis_to_remove:
    content = content.replace(e, '')

# Also fix the medals in app.js
with open('app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

app_js = app_js.replace("const medals = ['🥇', '🥈', '🥉', '4️⃣'];", "const medals = ['<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#fbbf24\" stroke-width=\"2\"><circle cx=\"12\" cy=\"8\" r=\"7\"/><polyline points=\"8.21 13.89 7 23 12 20 17 23 15.79 13.88\"/></svg>', '<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#94a3b8\" stroke-width=\"2\"><circle cx=\"12\" cy=\"8\" r=\"7\"/><polyline points=\"8.21 13.89 7 23 12 20 17 23 15.79 13.88\"/></svg>', '<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#b45309\" stroke-width=\"2\"><circle cx=\"12\" cy=\"8\" r=\"7\"/><polyline points=\"8.21 13.89 7 23 12 20 17 23 15.79 13.88\"/></svg>', '<span style=\"font-size:12px;font-weight:bold;color:#64748b\">4.</span>'];")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(app_js)
