"""Prepare exact supplied artwork for web and native icon packaging; no redrawing."""
from pathlib import Path
from PIL import Image
import base64
import json

root = Path(__file__).resolve().parents[1]
source = Image.open(root / 'src-tauri/icons/logo-source.png').convert('RGBA')
# Ignore nearly transparent scan noise when measuring, but preserve source pixels.
visible = source.getchannel('A').point(lambda value: 255 if value > 127 else 0)
left, top, right, bottom = visible.getbbox()
padding = 4
logo = source.crop((left-padding, top-padding, right+padding, bottom+padding))
logo.save(root / 'public/assets/logo.png')
# The supplied artwork has a transparent gap between the symbol and the wordmark.
columns = [visible.crop((x, 0, x+1, source.height)).getbbox() is not None for x in range(left, right)]
gap_start = next(x for x in range(left+100, right-20)
                 if not any(columns[x-left:x-left+20]))
symbol = source.crop((left-padding, top-padding, gap_start+padding, bottom+padding))
canvas = Image.new('RGBA', (1024, 1024))
scale = 944 / max(symbol.size)
symbol = symbol.resize((round(symbol.width * scale), round(symbol.height * scale)), Image.Resampling.LANCZOS)
canvas.alpha_composite(symbol, ((1024-symbol.width)//2, (1024-symbol.height)//2))
canvas.save(root / 'public/assets/brand-mark.png')
# Keep the legacy SVG entry point consistent for external tooling.
payload = base64.b64encode((root / 'public/assets/brand-mark.png').read_bytes()).decode()
(root / 'src-tauri/icons/prism.svg').write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><image width="1024" height="1024" href="data:image/png;base64,{payload}"/></svg>\n', encoding='utf-8')
print(json.dumps({'source': source.size, 'wordmark': logo.size, 'symbolBoundary': gap_start,
                  'icon': canvas.size}))
