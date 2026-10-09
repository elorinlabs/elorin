"""Deterministic small fixtures; no network resources or large binary files."""
from pathlib import Path
import base64, struct, zlib, zipfile, sqlite3
root=Path(__file__).parent
texts={'sample.txt':'Hello Prism.\n你好，Prism。\n','sample.md':'# Prism\n\nLocal first.\n','sample.json':'{"name":"Prism","items":[1,2,3]}\n','sample.xml':'<?xml version="1.0"?><project><name>Prism</name></project>','sample.yaml':'name: Prism\nversion: 1\n','sample.toml':'name = "Prism"\n[app]\nlocal = true\n','sample.js':'export const name = "Prism";\n','sample.ts':'export const name: string = "Prism";\n','sample.py':'print("Prism")\n','sample.svg':'\ufeff  <?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>','README':'Prism local reader\n','Dockerfile':'FROM scratch\n','.env':'PRISM_LOCAL=true\n','Makefile':'all:\n\techo Prism\n','.gitignore':'node_modules/\n','sample.csv':'name,count\nPrism,2\nReader,3\n','sample.tsv':'name\tcount\nPrism\t2\nReader\t3\n','invalid.json':'{not valid json}','invalid.xml':'<a><b></a>','shebang':'#!/usr/bin/env python3\nprint("Prism")\n'}
for name,content in texts.items(): (root/name).write_text(content,encoding='utf-8')
def chunk(name,data): return struct.pack('>I',len(data))+name+data+struct.pack('>I',zlib.crc32(name+data)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\0\xff\xff\xff'))+chunk(b'IEND',b'')
(root/'sample.png').write_bytes(png);(root/'fake.jpg').write_bytes(png);(root/'corrupt.png').write_bytes(png[:8])
(root/'sample.gif').write_bytes(base64.b64decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'))
# Signature fixtures are explicitly partial, not format-validity samples.
(root/'sample.jpg').write_bytes(b'\xff\xd8\xff\xe0\0\x10JFIF\0\1\1\0\0\1\0\1\0\0\xff\xd9')
(root/'sample.webp').write_bytes(b'RIFF'+struct.pack('<I',12)+b'WEBPVP8 '+b'\0'*8)
(root/'sample.pdf').write_bytes(b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n')
(root/'unknown.bin').write_bytes(bytes([0,1,255,2,0,128,3,4])*8)
(root/'empty-file').write_bytes(b'')
(root/'utf8-bom.txt').write_bytes(b'\xef\xbb\xbf'+b'Hello Prism\n')
for endian,bom in [('le',b'\xff\xfe'),('be',b'\xfe\xff')]: (root/f'utf16-{endian}.txt').write_bytes(bom+'Hello Prism 你好\n'.encode(f'utf-16{endian}'))
with zipfile.ZipFile(root/'sample.zip','w',compression=zipfile.ZIP_STORED) as archive: archive.writestr('hello.txt','Prism')
with zipfile.ZipFile(root/'sample.xlsx','w',compression=zipfile.ZIP_STORED) as archive:
 archive.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>')
 archive.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>')
db=root/'sample.sqlite'
if db.exists(): db.unlink()
with sqlite3.connect(db) as conn: conn.execute('CREATE TABLE prism (id INTEGER PRIMARY KEY, name TEXT)');conn.execute("INSERT INTO prism (name) VALUES ('Prism')")
(root/'fake.pdf').write_bytes((root/'sample.zip').read_bytes())
