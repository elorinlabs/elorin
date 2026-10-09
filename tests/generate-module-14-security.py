import pathlib,struct,shutil
root=pathlib.Path(__file__).resolve().parents[1]/'test-fixtures/data'
source=root/'parquet/basic.parquet';b=source.read_bytes();n=struct.unpack('<I',b[-8:-4])[0];at=len(b)-8-n
# Compact-Thrift field path [id], then codec enum SNAPPY=1 -> LZO=3.
# Both are one-byte zigzag enum values; footer length and other offsets stay intact.
footer=b[at:-8];needle=b'\x19\x18\x02id\x15\x02';replacement=b'\x19\x18\x02id\x15\x06'
assert needle in footer
(root/'security/unsupported-codec.parquet').write_bytes(b[:at]+footer.replace(needle,replacement)+b[-8:])
(root/'security/huge-metadata.parquet').write_bytes(b'PAR1'+struct.pack('<I',16*1024*1024)+b'PAR1')
shutil.copyfile(root/'parquet/malformed.parquet',root/'security/malformed-parquet.parquet')
print('Three Parquet security fixtures generated')
