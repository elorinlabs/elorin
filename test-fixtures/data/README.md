# Module 14 fixtures

All dataset contents are self-authored, synthetic, and released under CC0. They contain no user database, scientific measurement, proprietary sample, or MATLAB object code.

Generators:

- D:/Prism/tests/generate-module-14.py
- D:/Prism/tests/generate-module-14-stress.py

Python libraries are fixture-generation tools only; Elorin does not require Python, h5py, pyarrow, scipy or NetCDF4 to view these files.

`large.sqlite`: 1,000,000 real records, 25,559,040 bytes. `large.parquet`: 1,100,000 records / 110 row groups, uncompressed, 1,146,612,493 bytes. `large.arrow`: 2,000,000 records in bounded record batches. `large.nc`: 1000×512×512 int16 variable (physically about 500 MiB). `large.h5`: 1000×512×512 float32 logical dataset, sparse chunked allocation; its logical size exceeds 1 GiB, but its physical file is small. Do not describe it as a 1 GiB physical HDF5 benchmark.

`v73.mat` has a MATLAB-style user block and actual HDF5 numeric dataset, for shared-backend validation; it is not a claim of complete MATLAB v7.3 object/cell/struct semantics. `basic.mat` is a real MAT v5 file and deliberately exercises the explicit limited-preview fallback.

The archive contains a real SQLite database, Parquet file and HDF5 file. Security fixtures include unknown HDF5 filter, external link, cyclic hard link, deep groups, oversized BLOB/text, invalid Parquet footer and malformed MAT/HDF5.

`netcdf4.nc` was generated with NetCDF4 1.7.4; it contains a compressed int16 variable, `_FillValue`, scale/offset and dimension scales, and is verified through the HDF5 engine.
