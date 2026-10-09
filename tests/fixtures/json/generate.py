"""Deterministic fixtures; large.json has 90,001 nodes and exercises the worker."""
import json
from pathlib import Path

root = Path(__file__).parent
def write(name, value):
    (root / name).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

write('basic.json', {'name':'Prism', 'version':'0.5.0', 'active':True, 'modules':[{'id':1,'name':'Shell','complete':True},{'id':5,'name':'JSON Viewer','complete':False}], 'metadata':{'language':'TypeScript','runtime':'Tauri'}, 'emptyObject':{}, 'emptyArray':[], 'nothing':None})
write('array-root.json', [{'name':'Alice','age':28},{'name':'Bob','age':31}])
write('primitives.json', 42)
write('unicode.json', {'name':'棱镜', 'city':'東京', 'emoji':'🪩', 'korean':'한국어', 'rtl':'مرحبا', 'a/b':{'~key':'escaped'}, 'user.name':'literal key', '':'empty key', 'lines':'hello\nworld'})
deep = {'value':'bottom'}
for level in range(50): deep = {f'level{level}':deep}
write('deep.json', deep)
write('large.json', [{'id':i,'name':f'User {i}','email':f'user{i}@example.test','active':bool(i%2),'score':i/10,'tags':['reader','json']} for i in range(10000)])
(root / 'invalid.json').write_text('{\n  "name": "Prism",\n}\n', encoding='utf-8')
(root / 'duplicate-keys.json').write_text('{"name":"Prism","name":"Prism Viewer","nested":{"x":1,"x":2}}', encoding='utf-8')
write('unsafe.json', {'html':"<script>alert('xss')</script>", 'url':'javascript:alert(1)', 'markup':'<img src=x onerror=alert(1)>', '__proto__':{'polluted':True}, 'constructor':'data only'})
(root / 'big-number.json').write_text('{"maxSafe":9007199254740991,"unsafeInteger":9223372036854775807,"largeDecimal":12345678901234567890.123456789,"exponent":1e400,"negativeZero":-0}', encoding='utf-8')
write('geo.json', {'type':'FeatureCollection','features':[{'type':'Feature','properties':{'name':'Prism'},'geometry':{'type':'Point','coordinates':[121.47,31.23]}}]})
write('sample.geojson', {'type':'Point','coordinates':[121.47,31.23]})
(root / 'sample.jsonl').write_text('{"id":1}\n{"id":2}\n', encoding='utf-8')
(root / 'empty.json').write_text('', encoding='utf-8')
write('long-string.json', {'description':'Long Unicode 文本. ' * 2000})
