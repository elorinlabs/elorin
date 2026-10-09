"""CC0 test fixtures generated with existing tools-only pyarrow/h5py, no application dependency."""
import sys, pathlib
root=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'.tools/module14-fixtures'))
import pyarrow as pa, pyarrow.ipc as ipc, h5py, numpy as np
out=root/'test-fixtures/data/module20';out.mkdir(exist_ok=True)
schema=pa.schema([('exact',pa.int64()),('value',pa.float64()),('name',pa.string())])
with pa.OSFile(str(out/'stream.arrow'),'wb') as sink:
 with ipc.new_stream(sink,schema) as writer:
  for i in range(3): writer.write_batch(pa.record_batch([pa.array([9223372036854775807,None],type=pa.int64()),pa.array([i+0.5,float('nan')]),pa.array(['科研中🌈',''])],schema=schema))
with h5py.File(out/'ten-gib.h5','w') as f:
 d=f.create_dataset('tensor',shape=(10240,512,512),dtype='f4',chunks=(1,32,32),compression='gzip',fillvalue=-9999)
 d[0,0,:4]=[1,2,3,4]
 f.create_dataset('scalar',data=np.int64(9223372036854775807));f.create_dataset('empty',shape=(0,3),dtype='f4')
print([(p.name,p.stat().st_size) for p in out.iterdir()])
