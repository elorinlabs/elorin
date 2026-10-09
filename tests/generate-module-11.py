"""Generate original synthetic tones/video and purpose-built MIME/EPUB fixtures."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED,ZIP_STORED
from email.message import EmailMessage
from email import policy
import subprocess,sys,json,struct,base64,shutil
sys.path.insert(0,str(Path('.qa-tools').resolve()))
import imageio_ffmpeg
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
root=Path('test-fixtures');audio=root/'media/audio';video=root/'media/video';pub=root/'publishing';mail=root/'email'
for d in [audio,video,pub,mail]:d.mkdir(parents=True,exist_ok=True)
def ff(args,out):
 subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y',*args,str(out)],check=True)
tone=['-f','lavfi','-i','sine=frequency=440:duration=4:sample_rate=48000']
for ext,codec in [('mp3','libmp3lame'),('wav','pcm_s16le'),('flac','flac'),('ogg','libvorbis'),('opus','libopus'),('aac','aac'),('m4a','aac'),('aiff','pcm_s16be')]:ff(tone+['-c:a',codec],audio/f'basic.{ext}')
ff(tone+['-c:a','libmp3lame','-metadata','title=Prism Test Tone','-metadata','artist=Prism QA','-metadata','album=Synthetic fixtures','-metadata','date=2026'],audio/'metadata.mp3')
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=')
cover=audio/'cover.png';cover.write_bytes(png)
ff(['-i',str(audio/'metadata.mp3'),'-i',str(cover),'-map','0:a','-map','1:v','-c','copy','-id3v2_version','3','-metadata:s:v','title=Album cover','-metadata:s:v','comment=Cover (front)'],audio/'cover.mp3')
clip=['-f','lavfi','-i','testsrc2=size=320x180:rate=24:duration=4','-f','lavfi','-i','sine=frequency=220:duration=4:sample_rate=48000']
ff(clip+['-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-shortest'],video/'basic.mp4')
ff(['-display_rotation','90','-i',str(video/'basic.mp4'),'-c','copy'],video/'portrait.mp4')
ff(clip+['-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8','-c:a','libopus','-shortest'],video/'basic.webm')
ff(['-i',str(video/'basic.mp4'),'-c','copy'],video/'basic.mov')
ff(['-i',str(video/'basic.mp4'),'-c','copy'],video/'basic.mkv')
ff(clip+['-c:v','mpeg4','-c:a','mp3','-shortest'],video/'basic.avi')
ff(['-i',str(video/'basic.mp4'),'-map','0:v','-map','0:a','-map','0:a','-c','copy','-metadata:s:a:0','language=eng','-metadata:s:a:1','language=jpn'],video/'multi-track.mp4')
subtitle=video/'captions.srt';subtitle.write_text('1\n00:00:00,000 --> 00:00:03,000\nPrism subtitle fixture\n',encoding='utf-8')
ff(['-i',str(video/'basic.mp4'),'-i',str(subtitle),'-c','copy','-c:s','mov_text'],video/'subtitle.mp4')
ff(['-f','lavfi','-i','testsrc2=size=320x180:rate=12','-t','2','-c:v','mpeg4','-an','-movflags','+faststart'],video/'unsupported-codec.mp4')
b=(video/'basic.mp4').read_bytes();(video/'corrupted.mp4').write_bytes(b[:128])
(audio/'unsupported-codec.wav').write_bytes(b'RIFF'+struct.pack('<I',40)+b'WAVEfmt '+struct.pack('<IHHIIHH',16,0xffff,1,48000,96000,2,16)+b'data'+struct.pack('<I',4)+b'0000')
shutil.copy(audio/'basic.mp3',audio/'录音 中文.mp3')
# Large valid containers with sparse padding / silent PCM, generated only locally.
large=video/'large-512mb.mp4'
with large.open('wb') as f:
 f.write(b);remaining=512*1024*1024-len(b);f.write(struct.pack('>I4s',remaining,b'free'));f.seek(512*1024*1024-1);f.write(b'\0')
seconds=1800;data_size=48000*2*seconds
with (audio/'large-lossless.wav').open('wb') as f:
 f.write(b'RIFF'+struct.pack('<I',36+data_size)+b'WAVEfmt '+struct.pack('<IHHIIHH',16,1,1,48000,96000,2,16)+b'data'+struct.pack('<I',data_size));f.seek(44+data_size-1);f.write(b'\0')
for size,name in [('1920x1080','1080p.mp4'),('3840x2160','4k.mp4')]:ff(['-f','lavfi','-i',f'color=c=navy:size={size}:rate=2:duration=2','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-movflags','+faststart'],video/name)
def zipwrite(path,parts):
 with ZipFile(path,'w',ZIP_DEFLATED) as z:
  for n,v in parts.items():z.writestr(n,v,compress_type=ZIP_STORED if n=='mimetype' else ZIP_DEFLATED)
def epub(name,chapters=None,extra=None,metadata=''):
 chapters=chapters or ['<h1 id="start">Prism Book</h1><p>First chapter needle 中文.</p><p><strong>Bold</strong> <em>Italic</em></p><a href="chapter2.xhtml#end">Next chapter link</a>','<h1 id="end">Second chapter</h1><p>Closing needle.</p><a href="chapter1.xhtml#start">Back</a>']
 parts={'mimetype':'application/epub+zip','META-INF/container.xml':'<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
 'OPS/package.opf':'<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Prism Test Book</dc:title><dc:creator>Prism QA</dc:creator><dc:language>zh</dc:language><dc:identifier id="id">urn:prism:test</dc:identifier>'+metadata+'</metadata><manifest>'+''.join(f'<item id="ch{i}" href="chapter{i+1}.xhtml" media-type="application/xhtml+xml"/>' for i in range(len(chapters)))+'<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="image" href="image.png" media-type="image/png" properties="cover-image"/><item id="css" href="book.css" media-type="text/css"/></manifest><spine>'+''.join(f'<itemref idref="ch{i}"/>' for i in range(len(chapters)))+'</spine></package>',
 'OPS/nav.xhtml':'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>'+''.join(f'<li><a href="chapter{i+1}.xhtml">Chapter {i+1}</a></li>' for i in range(len(chapters)))+'</ol></nav></body></html>',
 'OPS/image.png':png,'OPS/book.css':'p { text-align: left; line-height: 1.7; } strong {color:#884422;}'}
 for i,body in enumerate(chapters):parts[f'OPS/chapter{i+1}.xhtml']='<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Prism</title><link rel="stylesheet" href="book.css"/></head><body>'+body+'</body></html>'
 parts.update(extra or {});zipwrite(pub/name,parts)
for name in ['basic.epub','toc.epub','links.epub','unicode.epub']:epub(name)
epub('images.epub',['<h1>Local picture</h1><img src="image.png" alt="Local EPUB image"/>'])
epub('tables.epub',['<h1>Table</h1><table><tr><th>Item</th><th>Value</th></tr><tr><td>Prism</td><td>42</td></tr></table>'])
epub('fixed-layout.epub',metadata='<meta property="rendition:layout">pre-paginated</meta>')
epub('unsafe.epub',['<h1>Safe visible content</h1><script>window.unsafeExecuted=true</script><p onclick="alert(1)" style="position:fixed;z-index:999999;color:red;background-image:url(https://tracking.invalid/css)">Untrusted book</p><img src="https://tracking.invalid/pixel" onerror="alert(1)"/><a href="javascript:alert(1)">Unsafe link</a><iframe src="https://tracking.invalid/frame"/><link rel="stylesheet" href="https://tracking.invalid/style"/>'])
epub('malformed.epub',extra={'OPS/chapter1.xhtml':'<html><broken></html>'})
epub('xxe.epub',extra={'OPS/chapter1.xhtml':'<!DOCTYPE html [<!ENTITY xxe SYSTEM "file:///C:/secret">]><html><body>&xxe;</body></html>'})
epub('protected.epub',extra={'META-INF/encryption.xml':'<encryption><EncryptedData><CipherData><CipherReference URI="OPS/chapter1.xhtml"/></CipherData></EncryptedData></encryption>'})
epub('many-chapters.epub',[f'<h1>Chapter {i+1}</h1><p>Search {"FinalUniqueNeedle" if i==119 else "ordinary text"}</p>'+('<p>Reading text.</p>'*100) for i in range(120)])
epub('image-heavy.epub',['<h1>Pictures</h1>'+''.join('<p><img src="image.png" alt="Picture"/></p>' for _ in range(24))])
epub('traversal.epub',extra={'../escape':'blocked'})
epub('zip-bomb.epub',extra={'bomb.bin':b'x'*(97*1024*1024)})
def message(subject='Prism Message'):
 m=EmailMessage(policy=policy.SMTP);m['From']='Alice <alice@example.com>';m['To']='Bob <bob@example.com>';m['Cc']='Carol <carol@example.com>';m['Subject']=subject;m['Date']='Thu, 08 Oct 2026 12:00:00 +0800';m['Message-ID']='<prism-fixture@example.com>';return m
def save(name,m): (mail/name).write_bytes(m.as_bytes())
m=message();m.set_content('Plain message body. Needle 中文.');save('plain.eml',m)
m=message();m.set_content('<html><body><h1>HTML message</h1><p>Needle <b>bold</b> <i>italic</i>.</p><table><tr><td>42</td></tr></table></body></html>',subtype='html');save('html.eml',m)
m=message();m.set_content('Plain alternative needle');m.add_alternative('<h1>Rich alternative needle</h1>',subtype='html');save('multipart.eml',m)
for name,cte,text in [('unicode.eml','base64','中文邮件 café مرحبا'),('quoted-printable.eml','quoted-printable','Quoted café = needle'),('base64.eml','base64','Base64 decoded needle 中文')]:m=message(text);m.set_content(text,cte=cte);save(name,m)
m=message('Attachments');m.set_content('Attachments remain inert. Needle.');m.add_attachment(Path('tests/fixtures/documents/basic.pdf').read_bytes(),maintype='application',subtype='pdf',filename='report.pdf');m.add_attachment(b'{"needle":42}',maintype='application',subtype='json',filename='data.json');m.add_attachment(png,maintype='image',subtype='png',filename='image.png');m.add_attachment(b'Attachment text needle',maintype='text',subtype='plain',filename='note.txt');m.add_attachment(b'INERT EXECUTABLE MARKER',maintype='application',subtype='octet-stream',filename='../../evil.exe');save('attachments.eml',m)
m=message('Inline image');m.set_content('Inline image plain');m.add_alternative('<h1>Inline image</h1><img src="cid:picture1" alt="Mail image"/>',subtype='html');m.get_payload()[1].add_related(png,maintype='image',subtype='png',cid='<picture1>',filename='picture.png');save('inline-images.eml',m)
for name,html in [('remote-images.eml','<p>Remote image message</p><img src="https://tracking.example/pixel"/>'),('unsafe-html.eml','<h1>Safe mail content</h1><script>window.unsafeExecuted=true</script><img src="https://tracking.example/pixel" onerror="alert(1)"/><a href="javascript:alert(1)">Unsafe</a><iframe src="https://tracking.example/frame"></iframe><style>@import "https://tracking.example/css"; body{position:fixed}</style><p onclick="alert(1)" style="position:fixed;background:url(https://tracking.example/css);color:red">Visible needle</p>')]:m=message();m.set_content(html,subtype='html');save(name,m)
m=message('Many attachments');m.set_content('Twenty-five attachments');
for i in range(25):m.add_attachment(f'Attachment {i}'.encode(),maintype='text',subtype='plain',filename=f'file-{i}.txt')
save('many-attachments.eml',m)
m=message('Large HTML');m.set_content('<h1>Large HTML</h1>'+('<p>Reading mail text needle.</p>'*10000),subtype='html');save('large-html.eml',m)
m=message('Large attachment');m.set_content('Large attachment body');m.add_attachment(b'0'*(16*1024*1024),maintype='application',subtype='octet-stream',filename='large.bin');save('large-attachment.eml',m)
(mail/'malformed.eml').write_bytes(b'From: broken\r\nSubject: malformed\r\n\r\n')
for name in ['basic.msg','attachments.msg']:(mail/name).write_bytes(bytes.fromhex('D0CF11E0A1B11AE1')+b'\0'*504+'__substg1.0_0037001F'.encode('utf-16le')+b'\0'*128)
files={str(p):p.stat().st_size for p in root.rglob('*') if p.is_file()}
Path('docs/qa/module-11-assets.json').write_text(json.dumps(files,indent=2,ensure_ascii=False),encoding='utf-8');print(f'Generated {len(files)} assets. FFmpeg is fixture tooling only, not an application dependency.')
