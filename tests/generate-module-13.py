"""Self-authored geometry fixtures. Large files are generated locally, not source assets."""
from pathlib import Path
import struct,json,base64,zipfile,io
root=Path('test-fixtures/3d')
for folder in ['mesh','cad','drawing','scene','security']:(root/folder).mkdir(parents=True,exist_ok=True)
mesh=root/'mesh';drawing=root/'drawing'
triangle=struct.pack('<12fH',0,0,1,0,0,0,100,0,0,0,100,0,0)
binary=b'solid binary header'.ljust(80,b' ')+struct.pack('<I',1)+triangle
(mesh/'basic.stl').write_bytes(binary);(mesh/'binary.stl').write_bytes(binary)
(mesh/'ascii.stl').write_text('solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 100 0 0\nvertex 0 100 0\nendloop\nendfacet\nendsolid triangle\n')
obj='o Triangle\nv 0 0 0\nv 100 0 0\nv 0 100 0\nvt 0 0\nvt 1 0\nvt 0 1\nvn 0 0 1\nusemtl Neutral\nf 1/1/1 2/2/1 3/3/1\n'
(mesh/'basic.obj').write_text(obj);(mesh/'materials.obj').write_text('mtllib model.mtl\n'+obj)
(mesh/'model.mtl').write_text('newmtl Neutral\nKd 0.5 0.6 0.7\nmap_Kd texture.png\n')
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP4z8DwHwyBNBAw/AcAR8oI+ItOQ4UAAAAASUVORK5CYII=');(mesh/'texture.png').write_bytes(png)
(mesh/'malicious-path.obj').write_text('mtllib ../../outside.mtl\n'+obj);(mesh/'missing-texture.obj').write_text('mtllib missing.mtl\n'+obj)
ply='ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\n'
(mesh/'basic.ply').write_text(ply+'element face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n100 0 0\n0 100 0\n3 0 1 2\n')
(mesh/'point-cloud.ply').write_text(ply+'end_header\n0 0 0\n100 0 0\n0 100 0\n')
data=struct.pack('<9f',0,0,0,1,0,0,0,1,0)
gltf={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':'Triangle','mesh':0}],'meshes':[{'primitives':[{'attributes':{'POSITION':0}}]}],'buffers':[{'byteLength':len(data),'uri':'data:application/octet-stream;base64,'+base64.b64encode(data).decode()}],'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':len(data)}],'accessors':[{'bufferView':0,'componentType':5126,'count':3,'type':'VEC3','min':[0,0,0],'max':[1,1,0]}]}
(mesh/'basic.gltf').write_text(json.dumps(gltf));gltf['buffers'][0]['uri']='scene.bin';(mesh/'external-resources.gltf').write_text(json.dumps(gltf));(mesh/'scene.bin').write_bytes(data)
del gltf['buffers'][0]['uri'];j=json.dumps(gltf,separators=(',',':')).encode();j+=b' '*((-len(j))%4);glb=struct.pack('<III',0x46546c67,2,28+len(j)+len(data))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(data),0x004e4942)+data;(mesh/'basic.glb').write_bytes(glb)
(mesh/'malformed.glb').write_bytes(glb[:30]);(mesh/'malformed.stl').write_bytes(binary[:85]);(root/'security'/'huge-count.stl').write_bytes(bytes(80)+struct.pack('<I',0xffffffff));(root/'security'/'nan-vertices.obj').write_text('v NaN 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3')
def dxf(entities,blocks=''):
 return '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n'+('0\nSECTION\n2\nBLOCKS\n'+blocks+'0\nENDSEC\n'if blocks else '')+'0\nSECTION\n2\nENTITIES\n'+entities+'0\nENDSEC\n0\nEOF\n'
line='0\nLINE\n8\nWalls\n10\n0\n20\n0\n11\n100\n21\n0\n'
circle='0\nCIRCLE\n8\nHoles\n10\n50\n20\n50\n40\n20\n'
text='0\nTEXT\n8\nLabels\n10\n0\n20\n20\n40\n5\n1\nElorin Drawing\n'
(drawing/'basic.dxf').write_text(dxf(line));(drawing/'layers.dxf').write_text(dxf(line+circle+text));(drawing/'text.dxf').write_text(dxf(text+line))
block='0\nBLOCK\n2\nTriangle\n10\n0\n20\n0\n'+line+'0\nENDBLK\n';insert='0\nINSERT\n8\nInserts\n2\nTriangle\n10\n200\n20\n100\n41\n2\n42\n2\n50\n45\n';(drawing/'blocks.dxf').write_text(dxf(insert,block));(drawing/'malformed.dxf').write_text('0\nSECTION\n2\nENTITIES')
for name in ['fbx','dae','usda','usdz','3ds']:(root/'scene'/('basic.'+name)).write_text({'usda':'#usda 1.0\ndef Xform "Root" {}','dae':'<COLLADA></COLLADA>'}.get(name,'Explicit capability fallback fixture'))
with zipfile.ZipFile(root/'archive.zip','w',zipfile.ZIP_DEFLATED)as archive:
 for name in ['materials.obj','model.mtl','texture.png','external-resources.gltf','scene.bin','basic.glb']:archive.write(mesh/name,name)
print('Module 13 fixtures generated')


# Self-authored external textured glTF and USDZ package.
j=json.loads((mesh/'external-resources.gltf').read_text());data=(mesh/'scene.bin').read_bytes()+struct.pack('<6f',0,0,1,0,0,1);j['buffers'][0]['byteLength']=len(data);j['bufferViews'].append({'buffer':0,'byteOffset':36,'byteLength':24});j['accessors'].append({'bufferView':1,'componentType':5126,'count':3,'type':'VEC2'});j['meshes'][0]['primitives'][0].update(attributes={'POSITION':0,'TEXCOORD_0':1},material=0);j.update(materials=[{'name':'Textured','pbrMetallicRoughness':{'baseColorTexture':{'index':0}}}],textures=[{'source':0}],images=[{'uri':'texture.png'}]);(mesh/'external-resources.gltf').write_text(json.dumps(j));(mesh/'scene.bin').write_bytes(data)
with zipfile.ZipFile(root/'archive.zip','w',zipfile.ZIP_DEFLATED)as archive:
 for name in ['materials.obj','model.mtl','texture.png','external-resources.gltf','scene.bin','basic.glb']:archive.write(mesh/name,name)
with zipfile.ZipFile(root/'scene/basic.usdz','w',zipfile.ZIP_STORED)as archive:archive.write(root/'scene/basic.usda','scene.usda')

for endian,name,kind in [('<','binary-le.ply','binary_little_endian'),('>','binary-be.ply','binary_big_endian')]:
 header=f'ply\nformat {kind} 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n'.encode()
 (mesh/name).write_bytes(header+struct.pack(endian+'9f',0,0,0,100,0,0,0,100,0)+struct.pack(endian+'B3i',3,0,1,2))
(mesh/'far-origin.obj').write_text('v 1000000000000 1000000000000 0\nv 1000000000001 1000000000000 0\nv 1000000000000 1000000000001 0\nf 1 2 3\n')
(drawing/'spline.dxf').write_text(dxf('0\nSPLINE\n8\nCurves\n70\n0\n71\n2\n72\n6\n73\n3\n40\n0\n40\n0\n40\n0\n40\n1\n40\n1\n40\n1\n10\n0\n20\n0\n30\n0\n10\n50\n20\n100\n30\n0\n10\n100\n20\n0\n30\n0\n'))
(drawing/'hatch.dxf').write_text(dxf('0\nHATCH\n8\nFill\n91\n1\n92\n2\n72\n0\n73\n1\n93\n3\n10\n0\n20\n0\n10\n100\n20\n0\n10\n0\n20\n100\n97\n0\n'))
