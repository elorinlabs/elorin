"""Self-authored CC0 fixtures. Large files are written in bounded batches."""
import sys, pathlib, sqlite3, zipfile, shutil, decimal, hashlib, json
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'.tools/module14-fixtures'))
import numpy as np, pyarrow as pa, pyarrow.parquet as pq, pyarrow.feather as feather, h5py
from scipy.io import savemat, netcdf_file
root=pathlib.Path(__file__).resolve().parents[1]/'test-fixtures/data'
for name in ('sqlite','parquet','arrow','scientific','security'):(root/name).mkdir(parents=True,exist_ok=True)
def database(name,sql,rows=None):
 p=root/'sqlite'/name
 if p.exists():p.unlink()
 con=sqlite3.connect(p);con.executescript(sql)
 if rows:con.executemany(*rows)
 con.commit();con.close();return p
base="""CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,email TEXT,score REAL,empty TEXT,payload BLOB); INSERT INTO users VALUES(1,'Alice','alice@example.com',3.5,'',X'89504E470D0A1A0A'); INSERT INTO users VALUES(2,'<script>alert(1)</script>',NULL,-0.0,NULL,NULL); INSERT INTO users VALUES(9007199254740993,'大数据','unicode@example.com',42.0,'',X'00010203');"""
database('basic.sqlite',base)
database('multiple-tables.sqlite',base+"CREATE TABLE orders(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),amount INTEGER); INSERT INTO orders VALUES(1,1,1234);")
database('foreign-keys.sqlite',base+"CREATE TABLE orders(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id));")
database('views.sqlite',base+"CREATE VIEW user_names AS SELECT id,name FROM users;")
database('indexes.sqlite',base+"CREATE UNIQUE INDEX email_idx ON users(email) WHERE email IS NOT NULL;")
database('triggers.sqlite',base+"CREATE TRIGGER user_changed AFTER UPDATE ON users BEGIN SELECT 1; END;")
database('blob.sqlite',base+"INSERT INTO users VALUES(3,'Blob','blob@example.com',0,NULL,zeroblob(3000000));")
database('without-rowid.sqlite',"CREATE TABLE records(a TEXT,b INTEGER,value TEXT,PRIMARY KEY(a,b)) WITHOUT ROWID; INSERT INTO records VALUES('A',1,'one'),('A',2,'two');")
database('composite-key.sqlite',"CREATE TABLE records(a TEXT,b INTEGER,value TEXT,PRIMARY KEY(a,b)); INSERT INTO records VALUES('A',1,'one'),('A',2,'two');")
database('mixed-types.sqlite',"CREATE TABLE mixed(id INTEGER PRIMARY KEY,value INTEGER); INSERT INTO mixed VALUES(1,123),(2,'text'),(3,NULL),(4,X'000102');")
database('corrupted.sqlite',base);p=root/'sqlite/corrupted.sqlite';p.write_bytes(p.read_bytes()[:150])
database('huge-string.sqlite',"CREATE TABLE data(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO data VALUES(1,replace(hex(zeroblob(2000000)),'00','x'));")
database('huge-blob.sqlite',"CREATE TABLE data(id INTEGER PRIMARY KEY,value BLOB); INSERT INTO data VALUES(1,zeroblob(8000000));")
p=database('large.sqlite',"CREATE TABLE events(id INTEGER PRIMARY KEY,label TEXT,value INTEGER);")
con=sqlite3.connect(p)
for start in range(0,1000000,10000):con.executemany('INSERT INTO events VALUES(?,?,?)',((i+1,f'event {i}',i*17) for i in range(start,start+10000)))
con.commit();con.close()
table=pa.table({'id':pa.array([1,9007199254740993,None],type=pa.int64()),'name':['Alice','<script>plain text</script>',None],'value':[1.5,float('nan'),float('inf')]})
pq.write_table(table,root/'parquet/basic.parquet',row_group_size=2)
types=pa.table({'int64':pa.array([2**63-1,-2**63,None],pa.int64()),'uint64':pa.array([2**64-1,2**53+1,None],pa.uint64()),'decimal':pa.array([decimal.Decimal('12345678901234567890.123456789'),decimal.Decimal('-0.000000001'),None],pa.decimal128(38,9)),'nanos':pa.array([1700000000123456789,1700000000123456790,None],pa.timestamp('ns')),'bool':[True,False,None]})
for name in ('types','decimal','int64','timestamps'):pq.write_table(types,root/f'parquet/{name}.parquet')
nested=pa.table({'items':pa.array([[1,2],[],None]),'struct':pa.array([{'a':1,'b':'x'},None,{'a':2,'b':'y'}]),'map':pa.array([[('a',1)],[],None],pa.map_(pa.string(),pa.int64()))})
pq.write_table(nested,root/'parquet/nested.parquet')
pq.write_table(pa.table({'category':['red','blue','red']*1000}),root/'parquet/dictionary.parquet',use_dictionary=True)
pq.write_table(table,root/'parquet/compressed.parquet',compression='zstd')
pq.write_table(pa.table({'id':range(100000)}),root/'parquet/many-row-groups.parquet',row_group_size=1000)
(root/'parquet/malformed.parquet').write_bytes(b'PAR1'+b'bad metadata'+b'\xff\xff\xff\xffPAR1')
for name,t in [('basic',table),('dictionary',pa.table({'category':pa.array(['red','blue','red']).dictionary_encode()})),('nested',nested),('precision',types)]:
 with pa.OSFile(str(root/f'arrow/{name}.arrow'),'wb') as sink:
  with pa.ipc.new_file(sink,t.schema) as writer:writer.write_table(t)
feather.write_feather(table,root/'arrow/basic.feather',compression='uncompressed')
with pa.OSFile(str(root/'arrow/large.arrow'),'wb') as sink:
 schema=pa.schema([('id',pa.int64()),('value',pa.float64())])
 with pa.ipc.new_file(sink,schema) as writer:
  for at in range(0,2000000,10000):writer.write_batch(pa.record_batch([pa.array(np.arange(at,at+10000,dtype=np.int64)),pa.array(np.arange(10000,dtype=np.float64))],schema=schema))
for name in ('basic','groups','datasets','chunked','compressed','compound','links'):
 with h5py.File(root/f'scientific/{name}.h5','w') as f:
  f.attrs['title']=np.bytes_('Elorin experiment');g=f.create_group('measurements');g.create_dataset('temperature',data=np.arange(120,dtype=np.float32).reshape(3,4,10),chunks=(1,4,10),compression='gzip',shuffle=True,fletcher32=True)
  g['temperature'].attrs['units']=np.bytes_('kelvin');f.create_dataset('int64',data=np.array([2**63-1,-2**63],dtype=np.int64));f.create_dataset('compound',data=np.array([(1,2.5),(2,4.5)],dtype=[('id','<i8'),('value','<f8')]))
  f.create_dataset('complex',data=np.array([3+4j,1-2j]));f['soft']=h5py.SoftLink('/measurements');f['external']=h5py.ExternalLink('secret.h5','/private');g['cycle']=f['/']
with h5py.File(root/'scientific/large.h5','w') as f:
 d=f.create_dataset('volume',shape=(1000,512,512),dtype='f4',chunks=(1,64,64),compression='gzip',fillvalue=-9999)
 d[0,:64,:64]=np.arange(4096,dtype=np.float32).reshape(64,64);d.attrs['units']=np.bytes_('kelvin')
(root/'scientific/malformed.h5').write_bytes(b'\x89HDF\r\n\x1a\nBAD')
for name in ('basic','dimensions','variables','scaled','missing','large'):
 with netcdf_file(root/f'scientific/{name}.nc','w',version=2) as f:
  f.createDimension('time',3 if name!='large' else 1000);f.createDimension('lat',4 if name!='large' else 512);f.createDimension('lon',5 if name!='large' else 512)
  t=f.createVariable('time','i',('time',));t[:]=np.arange(t.shape[0]);t.units=b'hours since 1970-01-01';f.title=b'Elorin fixture'
  v=f.createVariable('temperature','h',('time','lat','lon'));v._FillValue=np.int16(-9999);v.scale_factor=np.float64(.1);v.add_offset=np.float64(273.15);v.units=b'kelvin'
  v[:]=0;v[0,0,:5]=np.array([-9999,10,20,30,40],np.int16)
savemat(root/'scientific/basic.mat',{'values':np.arange(12).reshape(3,4),'complex':np.array([3+4j])})
with h5py.File(root/'scientific/v73.mat','w',userblock_size=512) as f:f.create_dataset('values',data=np.arange(12,dtype=np.float64).reshape(3,4))
with open(root/'scientific/v73.mat','r+b') as f:f.write(b'MATLAB 7.3 MAT-file, Elorin self-authored HDF5 fixture'.ljust(128,b' '))
for src,dst in [('links.h5','external-link.h5'),('links.h5','link-cycle.h5')]:shutil.copyfile(root/'scientific'/src,root/'security'/dst)
with h5py.File(root/'security/unsupported-filter.h5','w') as f:f.create_dataset('custom',shape=(10,),dtype='i4',chunks=(10,),compression=32000,allow_unknown_filter=True)
with h5py.File(root/'security/deep-groups.h5','w') as f:
 g=f
 for i in range(40):g=g.create_group(f'g{i}')
shutil.copyfile(root/'scientific/large.nc',root/'security/huge-dataset.nc')
(root/'security/malformed.mat').write_bytes(b'MATLAB 5.0 MAT-file corrupted')
with zipfile.ZipFile(root/'archive.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
 for src,name in [(root/'sqlite/basic.sqlite','database.sqlite'),(root/'parquet/basic.parquet','data.parquet'),(root/'scientific/basic.h5','experiment.h5')]:z.write(src,name)
manifest={str(p.relative_to(root)):{'bytes':p.stat().st_size} for p in root.rglob('*') if p.is_file()}
import netCDF4
with netCDF4.Dataset(root/'scientific/netcdf4.nc','w') as f:
 f.createDimension('time',3);f.createDimension('sensor',4);t=f.createVariable('time','i4',('time',));t[:]=[0,1,2]
 v=f.createVariable('temperature','i2',('time','sensor'),fill_value=-9999,zlib=True);v.set_auto_maskandscale(False);v[:]=np.arange(12,dtype=np.int16).reshape(3,4);v[0,0]=-9999;v.scale_factor=.1;v.add_offset=273.15;v.units='kelvin';f.title='NetCDF4 Elorin fixture'
(root/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
print(json.dumps(manifest,indent=2))
