"""Small reproducible fixtures; --large creates ignored 4K/20MP/100MP/400MP files."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageCms
import struct, zlib, sys
ROOT=Path(__file__).parent
ROOT.mkdir(exist_ok=True)
im=Image.new('RGB',(160,80),'#2255bb');d=ImageDraw.Draw(im)
d.rectangle((0,0,79,39),fill='#ff0000');d.rectangle((80,0,159,39),fill='#00ff00');d.rectangle((0,40,79,79),fill='#0000ff');d.rectangle((80,40,159,79),fill='#ffff00')
im.save(ROOT/'basic.png');im.save(ROOT/'photo.jpg',quality=95);im.save(ROOT/'basic.webp',lossless=True);im.save(ROOT/'basic.bmp');im.save(ROOT/'icon.ico',sizes=[(16,16),(32,32),(64,64)])
im.save(ROOT/'高 DPI 图片.png',dpi=(300,300))
transparent=im.convert('RGBA');transparent.putalpha(128);transparent.save(ROOT/'transparent.png')
profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
im.save(ROOT/'profile.jpg',icc_profile=profile)
for orientation in range(1,9):
    exif=Image.Exif();exif[274]=orientation;exif[271]='Prism fixture';exif[272]='Test camera';exif[36867]='2026:10:08 12:00:00';exif[34853]={1:'N',2:(31.,12.,0.),3:'E',4:(121.,30.,0.)}
    im.save(ROOT/f'orientation-{orientation}.jpg',quality=95,exif=exif)
im.save(ROOT/'metadata.jpg',quality=95,exif=exif,icc_profile=profile)
im.convert('CMYK').save(ROOT/'cmyk.jpg',quality=95)
im.save(ROOT/'first-page.tiff',save_all=True,append_images=[im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)],compression='tiff_deflate')
frames=[Image.new('RGB',(160,80),color) for color in ('red','green','blue')]
frames[0].save(ROOT/'animated.gif',save_all=True,append_images=frames[1:],duration=160,loop=0)
frames[0].save(ROOT/'finite.gif',save_all=True,append_images=frames[1:],duration=60)
frames[0].save(ROOT/'animated.webp',save_all=True,append_images=frames[1:],duration=160,loop=0)
frames[0].save(ROOT/'animated.png',save_all=True,append_images=frames[1:],duration=160,loop=0)
try:im.save(ROOT/'basic.avif')
except Exception:pass
(ROOT/'basic.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80"><defs><linearGradient id="g"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect width="160" height="80" fill="url(#g)"/><text x="16" y="46" fill="white">Prism SVG</text></svg>',encoding='utf8')
(ROOT/'unsafe.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80" onload="alert(1)"><script>alert(2)</script><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">bad</div></foreignObject><image href="https://example.invalid/tracker"/><rect width="160" height="80" fill="red"/><use href="#recursive" id="recursive"/><path d="M0 0L80 80" style="stroke:url(file:///secret)"/></svg>',encoding='utf8')
(ROOT/'malformed.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg"><path></svg>',encoding='utf8')
(ROOT/'damaged.png').write_bytes((ROOT/'basic.png').read_bytes()[:40])
def box(name,payload):return struct.pack('>I',len(payload)+8)+name.encode()+payload
(ROOT/'unsupported.heic').write_bytes(box('ftyp',b'heic'+b'\0'*4+b'heic')+box('meta',b'\0'*4+box('iprp',box('ipco',box('ispe',b'\0'*4+struct.pack('>II',160,80))))))
def huge_png(name,width,height):
    def chunk(f,kind,data):f.write(struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)))
    with (ROOT/name).open('wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n');chunk(f,b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0));compress=zlib.compressobj(1)
        for y in range(height):
            row=b'\0'+bytes((y%256,80,160))*width;part=compress.compress(row)
            if part:chunk(f,b'IDAT',part)
        chunk(f,b'IDAT',compress.flush());chunk(f,b'IEND',b'')
if '--large' in sys.argv:
    for name,w,h in [('generated-4k.png',3840,2160),('generated-20mp.png',5000,4000),('generated-100mp.png',10000,10000),('generated-400mp.png',20000,20000)]:huge_png(name,w,h)
    for name,w,h in [('generated-large.jpg',6000,4000),('generated-100mp.jpg',10000,10000)]:
        large=Image.new('RGB',(w,h),'#2255bb');large.save(ROOT/name,quality=85);large.close()
print('Image fixtures ready')
