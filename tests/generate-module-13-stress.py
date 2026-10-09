from pathlib import Path
import struct
root=Path('test-fixtures/3d');mesh=root/'mesh';drawing=root/'drawing'
def stl(name,count):
 with (mesh/name).open('wb')as file:
  file.write(b'Elorin generated tiled triangle stress fixture'.ljust(80,b' ')+struct.pack('<I',count))
  chunk=bytearray()
  for i in range(count):
   x=i%1000;y=i//1000;chunk.extend(struct.pack('<12fH',0,0,1,x,y,0,x+1,y,0,x,y+1,0,0))
   if len(chunk)>=1024*1024:file.write(chunk);chunk.clear()
  file.write(chunk)
for name,count in [('100k.stl',100000),('large.stl',1000000),('10m.stl',10000000)]:stl(name,count)
with (mesh/'large-point-cloud.ply').open('w')as file:
 file.write('ply\nformat ascii 1.0\nelement vertex 1000000\nproperty float x\nproperty float y\nproperty float z\nend_header\n')
 for i in range(1000000):file.write(f'{i%1000} {i//1000} {(i%7)/10}\n')
with (drawing/'large.dxf').open('w')as file:
 file.write('0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n')
 for i in range(100000):file.write(f'0\nLINE\n5\n{i:X}\n8\nLayer{i%8}\n10\n{i%1000}\n20\n{i//1000}\n11\n{i%1000+1}\n21\n{i//1000+1}\n')
 file.write('0\nENDSEC\n0\nEOF\n')
print('100k / 1M / 10M STL, 1M points, 100k DXF generated')
