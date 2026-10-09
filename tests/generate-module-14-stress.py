import pathlib,sys
root=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'.tools/module14-fixtures'))
import numpy as np,pyarrow as pa,pyarrow.parquet as pq
path=root/'test-fixtures/data/parquet/large.parquet'
schema=pa.schema([('id',pa.int64()),('value',pa.float64()),('payload',pa.binary(1024))])
payload=pa.array([bytes([i%251])*1024 for i in range(10000)],type=pa.binary(1024))
with pq.ParquetWriter(path,schema,compression='NONE',use_dictionary=False,write_page_index=True,data_page_size=65536) as writer:
 for start in range(0,1100000,10000):
  writer.write_table(pa.Table.from_arrays([pa.array(np.arange(start,start+10000,dtype=np.int64)),pa.array(np.arange(10000,dtype=np.float64)),payload],schema=schema),row_group_size=10000)
print('Parquet bytes',path.stat().st_size)
