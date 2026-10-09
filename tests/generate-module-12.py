from pathlib import Path
import zipfile,tarfile,gzip,io,json,struct,zlib,random
root=Path('test-fixtures/archive');root.mkdir(parents=True,exist_ok=True)
payloads={'report.pdf':Path('tests/fixtures/documents/basic.pdf').read_bytes(),'config.json':b'{"hello":"Prism","value":42}','table.csv':b'name,value\nPrism,42\n','readme.md':b'# Archive Markdown\n\nRead inside a file.','photo.png':Path('test-fixtures/media/audio/cover.png').read_bytes(),'tone.mp3':Path('test-fixtures/media/audio/basic.mp3').read_bytes(),'book.epub':Path('test-fixtures/publishing/basic.epub').read_bytes(),'wrong.txt':Path('tests/fixtures/documents/basic.pdf').read_bytes(),'no-extension':b'{"detected":true}'}
def zipbytes(items,compression=zipfile.ZIP_DEFLATED):
 b=io.BytesIO()
 with zipfile.ZipFile(b,'w',compression=compression,allowZip64=True)as z:
  for name,data in items:z.writestr(name,data)
 return b.getvalue()
def write(name,items,compression=zipfile.ZIP_DEFLATED):(root/name).write_bytes(zipbytes(items,compression))
write('basic.zip',payloads.items());write('folders.zip',[('docs/report.pdf',payloads['report.pdf']),('src/config.json',payloads['config.json']),('empty/',b'')]);write('unicode.zip',[(n,b'Unicode')for n in ['中文/文件.txt','日本語.txt','emoji😀.txt','مرحبا.txt','e\u0301.txt']]);write('empty-folders.zip',[('empty/',b''),('deep/empty/',b'')]);write('empty.zip',[]);write('duplicate-paths.zip',[('same.txt',b'first'),('same.txt',b'second'),('Readme.txt',b'upper'),('README.txt',b'other')]);inner=zipbytes([('folder/answer.json',b'{"nested":42}')]);write('nested.zip',[('archives/inner.zip',inner)]);write('many-files.zip',[(f'files/file-{i:05}.txt',str(i).encode())for i in range(10000)]);write('huge-entry-count.zip',[(f'file-{i:06}.txt',b'x')for i in range(120001)]);write('100k-entries.zip',[(f'file-{i:06}.txt',b'x')for i in range(100000)]);write('zip-slip.zip',[('../../outside.txt',b'blocked'),('safe.txt',b'safe')]);write('absolute-path.zip',[(n,b'blocked')for n in ['/etc/passwd','C:/Windows/evil.dll','//server/share/file','a\\..\\evil','%2e%2e/evil','CON.txt','tail.','safe.txt']]);write('deep-path.zip',[('/'.join(['a']*70)+'.txt',b'blocked')]);write('high-ratio.zip',[('zeros.bin',bytes(70*1024*1024))]);write('large-entry.zip',[('large.bin',bytes(40*1024*1024))],zipfile.ZIP_STORED);write('crc-bad.zip',[('bad.txt',b'Integrity text')],zipfile.ZIP_STORED)
b=bytearray((root/'crc-bad.zip').read_bytes());at=b.find(b'Integrity text');b[at]=88;(root/'crc-bad.zip').write_bytes(b)
b=(root/'basic.zip').read_bytes();(root/'corrupted.zip').write_bytes(b[:100]);(root/'malformed.zip').write_bytes(b'PK\x03\x04broken')
nested=zipbytes([('answer.json',b'{"end":true}')])
for i in range(11):nested=zipbytes([('nested.zip',nested)])
(root/'nested-bomb.zip').write_bytes(nested)
def tarbytes(items):
 b=io.BytesIO()
 with tarfile.open(fileobj=b,mode='w',format=tarfile.PAX_FORMAT)as t:
  for name,data in items:
   info=tarfile.TarInfo(name);info.size=len(data);info.mtime=1791417600;t.addfile(info,io.BytesIO(data))
 return b.getvalue()
t=tarbytes([('docs/readme.txt',b'TAR text'),('config.json',payloads['config.json'])]);(root/'basic.tar').write_bytes(t);(root/'basic.tgz').write_bytes(gzip.compress(t));(root/'single.log.gz').write_bytes(gzip.compress(b'Prism compressed log\nneedle\n'))
b=io.BytesIO()
with tarfile.open(fileobj=b,mode='w')as t:
 for name,type,target in [('link',tarfile.SYMTYPE,'../../outside'),('hard',tarfile.LNKTYPE,'../../outside'),('fifo',tarfile.FIFOTYPE,'')]:
  i=tarfile.TarInfo(name);i.type=type;i.linkname=target;t.addfile(i)
 i=tarfile.TarInfo('safe.txt');i.size=4;t.addfile(i,io.BytesIO(b'safe'))
(root/'symlink-escape.tar').write_bytes(b.getvalue())
# Valid ZIP traditional encryption generated without external programs. Password: prism-test.
data=b'Protected archive text';crc=zlib.crc32(data)&0xffffffff;keys=[0x12345678,0x23456789,0x34567890]
table=[]
for n in range(256):
 c=n
 for _ in range(8):c=(c>>1)^0xedb88320 if c&1 else c>>1
 table.append(c)
def update(byte):
 keys[0]=(keys[0]>>8)^table[(keys[0]^byte)&255];keys[1]=((keys[1]+(keys[0]&255))*134775813+1)&0xffffffff;keys[2]=(keys[2]>>8)^table[(keys[2]^(keys[1]>>24))&255]
for c in b'prism-test':update(c)
plain=bytes(range(11))+bytes([crc>>24])+data;encrypted=bytearray()
for c in plain:
 temp=(keys[2]|2)&65535;encrypted.append(c^((temp*(temp^1)>>8)&255));update(c)
name=b'secret.txt';local=struct.pack('<IHHHHHIIIHH',0x04034b50,20,1,0,0,0,crc,len(encrypted),len(data),len(name),0)+name+encrypted;central=struct.pack('<IHHHHHHIIIHHHHHII',0x02014b50,20,20,1,0,0,0,crc,len(encrypted),len(data),len(name),0,0,0,0,0,0)+name;(root/'password.zip').write_bytes(local+central+struct.pack('<IHHHHIIH',0x06054b50,0,0,1,1,len(central),len(local),0))
# Header-only capability fixtures; no claim to decode genuine 7z/RAR content.
(root/'basic.7z').write_bytes(b'7z\xbc\xaf\x27\x1c'+bytes(26));(root/'basic.rar').write_bytes(b'Rar!\x1a\x07\x01\0'+bytes(24))
import bz2,lzma
(root/'single.bz2').write_bytes(bz2.compress(b'BZ2 fallback'));(root/'single.xz').write_bytes(lzma.compress(b'XZ fallback'));(root/'single.zst').write_bytes(bytes([40,181,47,253])+bytes(20))
Path('docs/qa/module-12-fixtures.json').write_text(json.dumps({str(p):p.stat().st_size for p in root.iterdir()},indent=2),encoding='utf-8')
print(len(list(root.iterdir())),'fixtures generated')
