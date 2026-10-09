# Elorin 格式覆盖清单

此清单从唯一格式 catalogue 与实际 Viewer AST 提取。已验证等级仅来自执行证据；空等级表示尚无内容验证，不以扩展名推断 L0。true 是已有证据，null 表示尚无证据，不等价于实现不存在。L3/L4 不承诺所有 codec/变体。

| 格式 | 扩展名 | 真实注册 Viewer | 已执行验证等级 | 验证状态 |
| --- | --- | --- | --- | --- |
| parquet | parquet | columnar | 未验证 | NOT_VERIFIED |
| arrow | arrow | columnar | 未验证 | NOT_VERIFIED |
| feather | feather | columnar | 未验证 | NOT_VERIFIED |
| hdf5 | h5, hdf5 | scientific | 未验证 | NOT_VERIFIED |
| netcdf | nc, netcdf | scientific | 未验证 | NOT_VERIFIED |
| mat | mat | scientific | L3 | passed-declared-scope |
| stl | stl | mesh | 未验证 | NOT_VERIFIED |
| obj | obj | mesh | 未验证 | NOT_VERIFIED |
| ply | ply | mesh | 未验证 | NOT_VERIFIED |
| gltf | gltf | mesh | 未验证 | NOT_VERIFIED |
| glb | glb | mesh | 未验证 | NOT_VERIFIED |
| step | step | cad | 未验证 | NOT_VERIFIED |
| stp | stp | cad | 未验证 | NOT_VERIFIED |
| iges | iges | cad | 未验证 | NOT_VERIFIED |
| igs | igs | cad | 未验证 | NOT_VERIFIED |
| jt | jt | cad | 未验证 | NOT_VERIFIED |
| skp | skp | cad | 未验证 | NOT_VERIFIED |
| 3dm | 3dm | cad | 未验证 | NOT_VERIFIED |
| sldprt | sldprt | cad | 未验证 | NOT_VERIFIED |
| sldasm | sldasm | cad | 未验证 | NOT_VERIFIED |
| catpart | catpart | cad | 未验证 | NOT_VERIFIED |
| catproduct | catproduct | cad | 未验证 | NOT_VERIFIED |
| fbx | fbx | scene | 未验证 | NOT_VERIFIED |
| dae | dae | scene | 未验证 | NOT_VERIFIED |
| usd | usd | scene | 未验证 | NOT_VERIFIED |
| usda | usda | scene | 未验证 | NOT_VERIFIED |
| usdc | usdc | scene | 未验证 | NOT_VERIFIED |
| usdz | usdz | scene | 未验证 | NOT_VERIFIED |
| 3ds | 3ds | scene | L3 | passed-declared-scope |
| c4d | c4d | scene | 未验证 | NOT_VERIFIED |
| blend | blend | scene | 未验证 | NOT_VERIFIED |
| max | max | scene | 未验证 | NOT_VERIFIED |
| dxf | dxf | cad-drawing | 未验证 | NOT_VERIFIED |
| dwg | dwg | cad-drawing | 未验证 | NOT_VERIFIED |
| text | txt, log | core.text-fallback | 未验证 | NOT_VERIFIED |
| markdown | md, markdown, mdown, mkd, mkdn | markdown | 未验证 | NOT_VERIFIED |
| json | json, geojson, jsonl, ndjson | json | 未验证 | NOT_VERIFIED |
| yaml | yaml, yml | core.text-fallback | 未验证 | NOT_VERIFIED |
| xml | xml | core.text-fallback | 未验证 | NOT_VERIFIED |
| toml | toml | core.text-fallback | 未验证 | NOT_VERIFIED |
| javascript | js, mjs, cjs | core.text-fallback | 未验证 | NOT_VERIFIED |
| typescript | ts, mts, cts | core.text-fallback | 未验证 | NOT_VERIFIED |
| jsx | jsx | core.text-fallback | 未验证 | NOT_VERIFIED |
| tsx | tsx | core.text-fallback | 未验证 | NOT_VERIFIED |
| python | py, pyw | core.text-fallback | 未验证 | NOT_VERIFIED |
| c | c, h | core.text-fallback | 未验证 | NOT_VERIFIED |
| cpp | cpp, cc, cxx, hpp | core.text-fallback | 未验证 | NOT_VERIFIED |
| java | java | core.text-fallback | 未验证 | NOT_VERIFIED |
| go | go | core.text-fallback | 未验证 | NOT_VERIFIED |
| rust | rs | core.text-fallback | 未验证 | NOT_VERIFIED |
| html | htm, html | core.text-fallback | 未验证 | NOT_VERIFIED |
| css | css | core.text-fallback | 未验证 | NOT_VERIFIED |
| csv | csv | csv | 未验证 | NOT_VERIFIED |
| tsv | tsv, tab | csv | 未验证 | NOT_VERIFIED |
| mp3 | mp3 | audio | L1 | passed-declared-scope |
| wav | wav | audio | L1 | passed-declared-scope |
| flac | flac | audio | L1 | passed-declared-scope |
| aac | aac | audio | 未验证 | NOT_VERIFIED |
| m4a | m4a | audio | L1 | passed-declared-scope |
| ogg | ogg | audio | L1 | passed-declared-scope |
| opus | opus | audio | L1 | passed-declared-scope |
| wma | wma | audio | 未验证 | NOT_VERIFIED |
| aiff | aiff, aif | audio | 未验证 | NOT_VERIFIED |
| mp4 | mp4 | video | 未验证 | NOT_VERIFIED |
| webm | webm | video | 未验证 | NOT_VERIFIED |
| mov | mov | video | 未验证 | NOT_VERIFIED |
| mkv | mkv | video | 未验证 | NOT_VERIFIED |
| avi | avi | video | 未验证 | NOT_VERIFIED |
| mpeg | mpeg, mpg | video | 未验证 | NOT_VERIFIED |
| m4v | m4v | video | 未验证 | NOT_VERIFIED |
| epub | epub | ebook | 未验证 | NOT_VERIFIED |
| eml | eml | email | 未验证 | NOT_VERIFIED |
| msg | msg | email | 未验证 | NOT_VERIFIED |
| xlsx | xlsx | spreadsheet | 未验证 | NOT_VERIFIED |
| xlsm | xlsm | spreadsheet | 未验证 | NOT_VERIFIED |
| xls | xls | spreadsheet | 未验证 | NOT_VERIFIED |
| xlsb | xlsb | spreadsheet | 未验证 | NOT_VERIFIED |
| ods | ods | spreadsheet | 未验证 | NOT_VERIFIED |
| pptx | pptx | presentation | 未验证 | NOT_VERIFIED |
| pptm | pptm | presentation | 未验证 | NOT_VERIFIED |
| ppsx | ppsx | presentation | 未验证 | NOT_VERIFIED |
| potx | potx | presentation | 未验证 | NOT_VERIFIED |
| ppt | ppt | presentation | 未验证 | NOT_VERIFIED |
| odp | odp | presentation | 未验证 | NOT_VERIFIED |
| pdf | pdf | pdf | 未验证 | NOT_VERIFIED |
| docx | docx | office-document | 未验证 | NOT_VERIFIED |
| odt | odt | office-document | 未验证 | NOT_VERIFIED |
| rtf | rtf | office-document | 未验证 | NOT_VERIFIED |
| doc | doc | office-document | 未验证 | NOT_VERIFIED |
| png | png | image | 未验证 | NOT_VERIFIED |
| jpeg | jpg, jpeg | image | 未验证 | NOT_VERIFIED |
| gif | gif | image | 未验证 | NOT_VERIFIED |
| webp | webp | image | 未验证 | NOT_VERIFIED |
| svg | svg | image | 未验证 | NOT_VERIFIED |
| avif | avif | image | 未验证 | NOT_VERIFIED |
| bmp | bmp | image | 未验证 | NOT_VERIFIED |
| ico | ico | image | 未验证 | NOT_VERIFIED |
| tiff | tif, tiff | image | L3 | passed-declared-scope |
| heic | heic | image | 未验证 | NOT_VERIFIED |
| heif | heif | image | 未验证 | NOT_VERIFIED |
| zip | zip | archive | 未验证 | NOT_VERIFIED |
| tar | tar | archive | 未验证 | NOT_VERIFIED |
| gz | gz | archive | 未验证 | NOT_VERIFIED |
| tgz | tgz | archive | 未验证 | NOT_VERIFIED |
| sevenzip | 7z | archive | 未验证 | NOT_VERIFIED |
| rar | rar | archive | 未验证 | NOT_VERIFIED |
| bz2 | bz2 | archive | 未验证 | NOT_VERIFIED |
| xz | xz | archive | 未验证 | NOT_VERIFIED |
| zst | zst | archive | 未验证 | NOT_VERIFIED |
| sqlite | sqlite, sqlite3, db | database | 未验证 | NOT_VERIFIED |
| srt | srt | subtitle | L2 | passed-declared-scope |
| vtt | vtt | subtitle | L2 | passed-declared-scope |
| ass | ass | subtitle | L2 | passed-declared-scope |
| ssa | ssa | subtitle | 未验证 | NOT_VERIFIED |
| sub | sub | subtitle | L2 | passed-declared-scope |
| npy | npy | scientific | L2 | passed-declared-scope |
| npz | npz | archive | 未验证 | NOT_VERIFIED |
| psd | psd | image | L3 | passed-declared-scope |
| psb | psb | hex | 未验证 | NOT_VERIFIED |
| exr | exr | hex | 未验证 | NOT_VERIFIED |
| eps | eps | hex | 未验证 | NOT_VERIFIED |
| ai | ai | hex | 未验证 | NOT_VERIFIED |
| fig | fig | hex | 未验证 | NOT_VERIFIED |
| sketch | sketch | hex | 未验证 | NOT_VERIFIED |
| lottie | lottie | hex | 未验证 | NOT_VERIFIED |
| bigtiff | btf, bigtiff | hex | 未验证 | NOT_VERIFIED |
| typescript-declaration | d.ts | core.text-fallback | 未验证 | NOT_VERIFIED |
| kotlin-script | gradle.kts, kts | core.text-fallback | 未验证 | NOT_VERIFIED |
| blade-template | blade.php | core.text-fallback | 未验证 | NOT_VERIFIED |
| dockerfile |  | core.text-fallback | 未验证 | NOT_VERIFIED |
| cmake |  | core.text-fallback | 未验证 | NOT_VERIFIED |
| go-module |  | core.text-fallback | 未验证 | NOT_VERIFIED |
| cargo-manifest |  | core.text-fallback | 未验证 | NOT_VERIFIED |
| gitignore |  | core.text-fallback | 未验证 | NOT_VERIFIED |
| environment | env.local | core.text-fallback | 未验证 | NOT_VERIFIED |
| matlab-source | m | core.text-fallback | 未验证 | NOT_VERIFIED |
| objective-c | m | core.text-fallback | 未验证 | NOT_VERIFIED |
| makefile |  | core.text-fallback | 未验证 | NOT_VERIFIED |
| package-manifest |  | json | 未验证 | NOT_VERIFIED |
| tsconfig |  | core.text-fallback | 未验证 | NOT_VERIFIED |
| pyproject |  | core.text-fallback | 未验证 | NOT_VERIFIED |
| editorconfig |  | core.text-fallback | 未验证 | NOT_VERIFIED |
| gradle | gradle | core.text-fallback | 未验证 | NOT_VERIFIED |
| jsonc | jsonc | core.text-fallback | 未验证 | NOT_VERIFIED |
| json5 | json5 | core.text-fallback | 未验证 | NOT_VERIFIED |
| ini | ini | core.text-fallback | 未验证 | NOT_VERIFIED |
| vue | vue | core.text-fallback | 未验证 | NOT_VERIFIED |
| svelte | svelte | core.text-fallback | 未验证 | NOT_VERIFIED |
| astro | astro | core.text-fallback | 未验证 | NOT_VERIFIED |
| perl-source | pl, perl | core.text-fallback | 未验证 | NOT_VERIFIED |
| prolog-source | pl | core.text-fallback | 未验证 | NOT_VERIFIED |
| nifti-gzip | nii.gz | core.binary-fallback | 未验证 | NOT_VERIFIED |
| tar-zstd | tar.zst | archive | 未验证 | NOT_VERIFIED |
| notebook-json | ipynb | json | 未验证 | NOT_VERIFIED |
| unknown |  | core.binary-fallback | 未验证 | NOT_VERIFIED |

完整签名/规则/限制/依赖/样本/断言依据见 [机器可读矩阵](format-capability-matrix.json)。
