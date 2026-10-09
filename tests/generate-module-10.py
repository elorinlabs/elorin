"""Deterministic, locally generated OOXML/ODF test packages; no external content."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from html import escape
import base64, json

ROOT=Path(__file__).parent/'fixtures'
S=ROOT/'spreadsheets'; P=ROOT/'presentations'
S.mkdir(parents=True,exist_ok=True); P.mkdir(parents=True,exist_ok=True)
NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
A='http://schemas.openxmlformats.org/drawingml/2006/main'
PN='http://schemas.openxmlformats.org/presentationml/2006/main'
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=')
def rels(items):
 return '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(f'<Relationship Id="{i}" Type="{R}/{t}" Target="{escape(target,quote=True)}"'+(' TargetMode="External"' if external else '')+'/>' for i,t,target,external in items)+'</Relationships>'
def write(path,parts):
 with ZipFile(path,'w',ZIP_DEFLATED) as z:
  for n,v in parts.items(): z.writestr(n,v,compress_type=ZIP_STORED if n=='mimetype' else ZIP_DEFLATED)
def colname(i):
 s='';i+=1
 while i:s=chr(65+(i-1)%26)+s;i=(i-1)//26
 return s
def cell(key,v,t='inlineStr',s=0,f=None):
 body=f'<is><t>{escape(str(v))}</t></is>' if t=='inlineStr' else (f'<v>{escape(str(v))}</v>' if v is not None else '')
 return f'<c r="{key}" t="{t}" s="{s}">'+(f'<f>{escape(f)}</f>' if f is not None else '')+body+'</c>'
def sheet(data,extra='',head=''):
 return f'<worksheet xmlns="{NS}" xmlns:r="{R}">{head}<sheetData>{data}</sheetData>{extra}</worksheet>'
STYLES=f'''<styleSheet xmlns="{NS}"><numFmts count="2"><numFmt numFmtId="164" formatCode="000000"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><fonts count="2"><font/><font><b/><i/><color rgb="FFCC3322"/></font></fonts><fills count="2"><fill/><fill><patternFill patternType="solid"><fgColor rgb="FFFFEEAA"/></patternFill></fill></fills><borders count="2"><border/><border><bottom style="thin"><color rgb="FF778899"/></bottom></border></borders><cellXfs count="9"><xf numFmtId="0"/><xf numFmtId="4"/><xf numFmtId="10"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="11"/><xf numFmtId="7"/><xf numFmtId="0" fontId="1" fillId="1" borderId="1"><alignment horizontal="center"/></xf><xf numFmtId="14"/></cellXfs></styleSheet>'''
def workbook(name,docs=None,extras=None,states=None,date1904=False):
 docs=docs or [sheet('<row r="1">'+cell('A1','Prism Workbook')+cell('B1','数量')+'</row><row r="2">'+cell('A2','00012345678901234567890')+cell('B2',42,'n')+'</row>')]
 states=states or ['visible']*len(docs)
 parts={'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
 'xl/workbook.xml':f'<workbook xmlns="{NS}" xmlns:r="{R}"><workbookPr date1904="{int(date1904)}"/><bookViews><workbookView activeTab="0"/></bookViews><sheets>'+''.join(f'<sheet name="Sheet{i+1}" sheetId="{i+1}" r:id="r{i}" state="{states[i]}"/>' for i in range(len(docs)))+'</sheets><definedNames><definedName name="Example">Sheet1!$A$1</definedName></definedNames></workbook>',
 'xl/_rels/workbook.xml.rels':rels([(f'r{i}','worksheet',f'worksheets/sheet{i+1}.xml',False) for i in range(len(docs))]),'xl/styles.xml':STYLES}
 parts.update({f'xl/worksheets/sheet{i+1}.xml':d for i,d in enumerate(docs)})
 parts.update(extras or {});write(S/name,parts)
workbook('basic.xlsx')
workbook('formulas.xlsx',[sheet('<row r="1">'+cell('A1',3,'n',f='1+2')+cell('B1',None,'n',f='SUM(A1:A99)')+cell('C1',None,'n',f="cmd|' /C calc'!A0")+cell('D1','#DIV/0!','e',f='1/0')+'</row>')])
workbook('formats.xlsx',[sheet('<row r="1">'+''.join(cell(f'{chr(65+i)}1',v,'n',i+1) for i,v in enumerate([1234.5,.125,42,45292.5,12345678,1234.5,9]))+'</row>')])
workbook('dates.xlsx',[sheet('<row r="1">'+cell('A1',59,'n',8)+cell('B1',60,'n',8)+cell('C1',61,'n',8)+'</row>')])
workbook('dates-1904.xlsx',[sheet('<row r="1">'+cell('A1',0,'n',4)+'</row>')],date1904=True)
workbook('merged.xlsx',[sheet('<row r="1">'+cell('A1','Merged across viewport')+'</row>','<mergeCells><mergeCell ref="A1:D4"/></mergeCells>')])
workbook('hidden.xlsx',[sheet('<row r="1">'+cell('A1','Visible')+'</row><row r="2" hidden="1">'+cell('A2','Hidden row')+'</row>',head='<cols><col min="2" max="2" hidden="1"/></cols>'),sheet('<row r="1">'+cell('A1','Hidden sheet')+'</row>'),sheet('<row r="1">'+cell('A1','Very hidden sheet')+'</row>')],states=['visible','hidden','veryHidden'])
workbook('freeze-panes.xlsx',[sheet(''.join(f'<row r="{i}">'+cell(f'A{i}',f'Row {i}')+cell(f'B{i}',i,'n')+'</row>' for i in range(1,201)),head='<sheetViews><sheetView><pane state="frozen" xSplit="1" ySplit="1"/></sheetView></sheetViews>')])
DRAWING=f'<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="{A}" xmlns:r="{R}"><xdr:twoCellAnchor><a:blip r:embed="image"/><a:chart r:id="chart"/></xdr:twoCellAnchor></xdr:wsDr>'
CHART=f'<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:barChart><c:ser><c:tx><c:v>Quarterly sales</c:v></c:tx><c:val><c:numCache><c:pt idx="0"><c:v>42</c:v></c:pt></c:numCache></c:val></c:ser></c:barChart></c:chart></c:chartSpace>'
for name in ['charts.xlsx','images.xlsx']:
 workbook(name,[sheet('<row r="1">'+cell('A1','Objects')+'</row>','<drawing r:id="drawing"/>')],{'xl/worksheets/_rels/sheet1.xml.rels':rels([('drawing','drawing','../drawings/drawing1.xml',False)]),'xl/drawings/drawing1.xml':DRAWING,'xl/drawings/_rels/drawing1.xml.rels':rels([('image','image','../media/image1.png',False),('chart','chart','../charts/chart1.xml',False)]),'xl/media/image1.png':PNG,'xl/charts/chart1.xml':CHART})
workbook('comments.xlsx',extras={'xl/worksheets/_rels/sheet1.xml.rels':rels([('comments','comments','../comments1.xml',False)]),'xl/comments1.xml':f'<comments xmlns="{NS}"><authors><author>Reviewer</author></authors><commentList><comment ref="A1" authorId="0"><text><t>Read-only comment</t></text></comment></commentList></comments>'})
workbook('hyperlinks.xlsx',[sheet('<row r="1">'+cell('A1','Internal')+cell('B1','External')+cell('C1','Unsafe')+'</row>','<hyperlinks><hyperlink ref="A1" location="Sheet1!B1"/><hyperlink ref="B1" r:id="safe"/><hyperlink ref="C1" r:id="unsafe"/></hyperlinks>')],{'xl/worksheets/_rels/sheet1.xml.rels':rels([('safe','hyperlink','https://example.com/',True),('unsafe','hyperlink','javascript:alert(1)',True)])})
workbook('external-links.xlsx',extras={'xl/externalLinks/externalLink1.xml':'<externalLink/>','xl/externalLinks/_rels/externalLink1.xml.rels':rels([('remote','externalLinkPath','https://tracker.invalid/workbook.xlsx',True)]),'xl/connections.xml':'<connections><connection name="Remote database"/></connections>','xl/pivotTables/pivotTable1.xml':'<pivotTableDefinition/>'})
workbook('macros.xlsm',extras={'xl/vbaProject.bin':b'INERT VBA TEST MARKER','xl/embeddings/oleObject1.bin':b'INERT OLE TEST MARKER'})
workbook('sparse.xlsx',[sheet('<row r="1">'+cell('A1','Sparse origin')+'</row><row r="1048576">'+cell('XFD1048576','Far edge')+'</row>')])
workbook('wide.xlsx',[sheet('<row r="1">'+''.join(cell(f'{colname(i)}1',i,'n') for i in range(1000))+'</row>')])
for n,name in [(10000,'large-10k.xlsx'),(100000,'large.xlsx'),(1000000,'large-1m.xlsx')]:
 workbook(name,[sheet(''.join(f'<row r="{i}">'+cell(f'A{i}',i,'n')+'</row>' for i in range(1,n+1)))])
workbook('many-sheets.xlsx',[sheet('<row r="1">'+cell('A1',f'Sheet {i+1}')+'</row>') for i in range(50)])
workbook('malformed.xlsx',['<worksheet><sheetData><row></worksheet>'])
workbook('xxe.xlsx',[f'<!DOCTYPE worksheet [<!ENTITY xxe SYSTEM "file:///C:/secret">]><worksheet xmlns="{NS}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&xxe;</t></is></c></row></sheetData></worksheet>'])
workbook('conditional.xlsx',[sheet('<row r="1">'+cell('A1',1,'n')+'</row>','<conditionalFormatting sqref="A1"><cfRule type="expression"><formula>A1&gt;0</formula></cfRule></conditionalFormatting>')])
write(S/'basic.ods',{'mimetype':'application/vnd.oasis.opendocument.spreadsheet','META-INF/manifest.xml':'<manifest/>','content.xml':'<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="Budget"><table:table-row><table:table-cell office:value-type="string"><text:p>ODS workbook</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="42"/></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>'})
def shape(text='Prism Presentation',x=500000,y=500000,w=8000000,h=1500000,more='',geom='rect'):
 return f'<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{w}" cy="{h}"/></a:xfrm><a:prstGeom prst="{geom}"/><a:solidFill><a:srgbClr val="EEF3FF"/></a:solidFill></p:spPr><p:txBody><a:p><a:r><a:rPr sz="3200" b="1"><a:solidFill><a:srgbClr val="224488"/></a:solidFill>{more}</a:rPr><a:t>{escape(text)}</a:t></a:r></a:p></p:txBody></p:sp>'
def slide(body,extra=''):
 return f'<p:sld xmlns:p="{PN}" xmlns:a="{A}" xmlns:r="{R}" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><p:cSld><p:spTree>{body}</p:spTree></p:cSld>{extra}</p:sld>'
def presentation(name,slides=None,extras=None):
 slides=slides or [slide(shape()),slide(shape('Second slide — 中文'))]
 parts={'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>',
 'ppt/presentation.xml':f'<p:presentation xmlns:p="{PN}" xmlns:r="{R}"><p:sldIdLst>'+''.join(f'<p:sldId id="{256+i}" r:id="r{i}"/>' for i in range(len(slides)))+'</p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>',
 'ppt/_rels/presentation.xml.rels':rels([(f'r{i}','slide',f'slides/slide{i+1}.xml',False) for i in range(len(slides))])}
 parts.update({f'ppt/slides/slide{i+1}.xml':d for i,d in enumerate(slides)});parts.update(extras or {});write(P/name,parts)
presentation('basic.pptx');presentation('text.pptx',[slide(shape('Bold title / 中文 / Arabic مرحبا'))])
PIC='<p:pic><p:spPr><a:xfrm><a:off x="500000" y="2200000"/><a:ext cx="2000000" cy="2000000"/></a:xfrm></p:spPr><p:blipFill><a:blip r:embed="image"/></p:blipFill></p:pic>'
presentation('images.pptx',[slide(shape('Embedded image')+PIC)],{'ppt/slides/_rels/slide1.xml.rels':rels([('image','image','../media/image1.png',False)]),'ppt/media/image1.png':PNG})
TABLE='<p:graphicFrame><p:xfrm><a:off x="500000" y="2200000"/><a:ext cx="8000000" cy="2000000"/></p:xfrm><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Product</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>42</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>'
presentation('tables.pptx',[slide(shape('Table')+TABLE)])
presentation('charts.pptx',[slide(shape('Chart')+'<p:graphicFrame><p:xfrm><a:off x="500000" y="2200000"/><a:ext cx="8000000" cy="2000000"/></p:xfrm><a:graphic><a:graphicData><c:chart r:id="chart"/></a:graphicData></a:graphic></p:graphicFrame>')],{'ppt/slides/_rels/slide1.xml.rels':rels([('chart','chart','../charts/chart1.xml',False)]),'ppt/charts/chart1.xml':CHART})
presentation('notes.pptx',extras={'ppt/slides/_rels/slide1.xml.rels':rels([('notes','notesSlide','../notesSlides/notesSlide1.xml',False)]),'ppt/notesSlides/notesSlide1.xml':f'<p:notes xmlns:p="{PN}" xmlns:a="{A}"><p:sp><p:txBody><a:p><a:r><a:t>Private speaker note needle</a:t></a:r></a:p></p:txBody></p:sp></p:notes>'})
presentation('links.pptx',[slide(shape('Go to second slide',more='<a:hlinkClick r:id="internal" action="ppaction://hlinksldjump"/>')+shape('External link',y=2200000,more='<a:hlinkClick r:id="external"/>')+shape('Unsafe action',y=3600000,more='<a:hlinkClick r:id="unsafe" action="ppaction://program"/>')),slide(shape('Destination'))],{'ppt/slides/_rels/slide1.xml.rels':rels([('internal','slide','slide2.xml',False),('external','hyperlink','https://example.com/',True),('unsafe','hyperlink','file:///C:/calc.exe',True)])})
presentation('animations.pptx',[slide(shape('Static animated slide'),'<p:timing/><p:transition/>')])
presentation('embedded-media.pptx',[slide(shape('Embedded media')+'<p:pic><p:nvPicPr><p:nvPr><a:videoFile r:link="video"/></p:nvPr></p:nvPicPr></p:pic><p:graphicFrame><p:oleObj/></p:graphicFrame>')],{'ppt/slides/_rels/slide1.xml.rels':rels([('video','video','../media/video.mp4',False)]),'ppt/media/video.mp4':b'INERT MEDIA','ppt/embeddings/oleObject1.bin':b'INERT OLE'})
presentation('macros.pptm',extras={'ppt/vbaProject.bin':b'INERT VBA MARKER'})
presentation('many-slides.pptx',[slide(shape(f'Slide {i+1}')) for i in range(1000)])
presentation('malformed.pptx',['<sld><broken></sld>'])
presentation('remote-image.pptx',[slide(PIC.replace('r:embed','r:link'))],{'ppt/slides/_rels/slide1.xml.rels':rels([('image','image','https://tracker.invalid/pixel.png',True)])})
write(P/'basic.odp',{'mimetype':'application/vnd.oasis.opendocument.presentation','content.xml':'<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:presentation><draw:page draw:name="ODP title"><draw:frame svg:x="1cm" svg:y="1cm" svg:width="15cm" svg:height="3cm"><draw:text-box><text:p>OpenDocument presentation</text:p></draw:text-box></draw:frame></draw:page></office:presentation></office:body></office:document-content>'})
# CFB signature and directory marker: intentional legacy-fallback fixtures, not claimed as decoded BIFF/PPT.
for path,marker in [(S/'legacy.xls','Workbook'),(P/'legacy.ppt','PowerPoint Document')]:path.write_bytes(bytes.fromhex('D0CF11E0A1B11AE1')+b'\0'*504+marker.encode('utf-16le')+b'\0'*128)
write(S/'traversal.xlsx',{'[Content_Types].xml':'<Types/>','xl/workbook.xml':'<workbook/>','../escape.xml':'<evil/>'})
write(S/'zip-bomb.xlsx',{'[Content_Types].xml':'<Types/>','xl/workbook.xml':b'x'*(97*1024*1024)})
inventory={str(p.relative_to(ROOT)):p.stat().st_size for folder in [S,P] for p in folder.iterdir()}
Path('docs/qa/module-10-assets.json').write_text(json.dumps(inventory,indent=2),encoding='utf-8')
print(f'Generated {len(inventory)} fixtures.')
