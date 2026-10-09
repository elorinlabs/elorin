# Elorin — Module 20：Scientific & Engineering Data Viewer

日期：2026-10-08 至 2026-10-09。范围仅 Module 20；未实施 Module 21。以下是实际实现与验证范围，不将识别、元数据展示、完整格式支持混为一谈。

## 1. 实施前审计

实际复用的架构：

| 既有能力 | 实际位置与本次用途 |
| --- | --- |
| ViewerRegistry / 生命周期 | `src/viewer/core/registry.ts`、controller 与 `ViewerHost`；保留唯一注册体系及清理回调 |
| Module 17 检测 | `src/formats`、`src/services/detection`、Rust detection；增加 IPC Stream Schema 签名校验，没有第二套检测框架 |
| Module 18 Binary | `src-tauri/src/binary.rs`；科学会话拥有独立 Binary UUID，复用已授权句柄、文件变更检查、VFS 与精确十进制偏移 |
| FileSource / VFS | `src/services/fileSource.ts`、`src/vfs`、Rust archive；借用父源，不关闭共享 Archive 会话 |
| CSV / TSV | Module 06 的分块解析、Unicode、引号换行、列宽、原文与采样统计；收紧存储预算并补后来类型不兼容诊断 |
| 表格 / 科学数据 | Module 14 的 DataModel、双向虚拟网格、Inspector、Parquet/Arrow/HDF5/NetCDF 真实解析器；扩展原实现 |
| Module 19 | 保留源代码、Text Viewer 与解析 Worker；不改变其注册优先级 |
| 活动状态 | 复用 Hex 的事件驱动可见性／最小化判断，没有新增轮询器 |

审计发现：已有成熟解析器，但读取主要绕过统一科学会话；页输出 8 MiB，多个查看器的页缓存没有全局预算；Worker 操作队列没有请求上限；数据查看器没有完整暂停／恢复路径；Arrow Stream 被拒绝；批次／行组没有单独导航节点；大表网格高度需要硬上限。上述缺口是本次修改的依据。前置模块没有凭说明假定通过，而是重新运行全套测试。

## 2. 实际完成功能

- 科学会话 UUID、只读授权范围读取、精确偏移字符串、源变化与 VFS 生命周期复用。
- Rust 逐维切片边界、stride、固定轴一致性、u64 乘积溢出及输出大小检查；轴数组 IPC 在反序列化时限制为 32 维。
- Worker 请求串行化、最多三个已提交／排队操作；DataModel 最多两个页请求，保留最新视口请求，丢弃旧代结果。
- 按行组和 Record Batch 展开与查看；HDF5 原有 Group／Dataset／Attribute 树继续按需展开，累计节点上限 10,000。
- 共享行列虚拟网格、粘性表头、可调整列宽、类型显示、单元格选择、复制原文与显示值、逻辑行跳转、Null 与不可用数据标识。
- 高维固定索引、标量、零长度数组；dtype／shape／压缩／属性、Int64／Decimal／时间戳原值、NaN／Infinity／负零继续保持。
- 默认关闭的已加载数字列折线预览，最多 4,096 点，明确标记行范围及省略值；不读取更多数据、不自动扫描、不将样本统计冒充全文件统计。
- 错误分类、原始失败信息与用户主动的 `View as Hex` 回退；CSV 超出预算明确显示 Partial dataset。
- 隐藏、切换至非活动查看器、最小化或取消：终止解析 Worker，关闭拥有的科学会话，清空页缓存；恢复重新打开。原始数据没有写入。

## 3. P0 / P1 / P2 真实矩阵

| 优先级／格式 | 实际能力 | 明确限制 |
| --- | --- | --- |
| P0 CSV / TSV | 既有分块解析、Unicode、引号换行、不等宽行、重复列名、原值、虚拟显示；后来类型异常提示 | 只索引预算允许的部分；50 万单元格、8 Mi 字符；不提供完整大文件随机行索引 |
| P0 Parquet | Footer／Schema／行组／压缩信息，按选定列及涉及行组读取，Null、嵌套列表／结构／Map、Binary、精确 Decimal／Int64／时间戳 | 选定列块解码预算 32 MiB；外部／未知 codec 不自动安装；嵌套 Decimal 仅明确不可用预览与 Schema |
| P0 Arrow IPC File / Feather v2 | Schema、Field Metadata、Null、Dictionary、Nested、精确数值；按 Record Batch 范围读取 | 压缩 Record Batch 明确 MissingCodec；Dictionary 总量加最大批次须在 32 MiB 内；Feather v1 不支持 |
| P0 Arrow IPC Stream | 区别于 File；标准 pyarrow 生成的多批次、Dictionary／Schema 由既有 Arrow 库解码；通过有界缓存显示 | 输入上限 8 MiB；明确 `randomAccess=false`，没有假定 Stream 源可任意定位；压缩 Stream 不支持 |
| P0 HDF5 | Group／Dataset／Attribute、标量／高维固定轴、数值 hyperslab、Chunk／Filter 信息；内置 deflate／shuffle／checksum | decoded Chunk 上限 32 MiB，页切片 1 MiB；VLen、外部／Virtual Dataset、未知 Filter 明确受限；不下载插件；只展示前 4,096 个逻辑列 |
| P1 NetCDF Classic / 64-bit Offset | 既有 CDF1／CDF2 读取、维度／变量／Fill／Scale／Offset、按切片读取 | CDF5／特殊扩展不支持；精确地址超过现有解析器安全整数范围时拒绝 |
| P1 NetCDF-4 | HDF5 容器层查看可用 | 不宣称完整 NetCDF-4 高级语义适配 |
| P1 NPY | 未实现本模块专用解析 | 保留既有识别／只读兜底，不宣称数组查看 |
| P1 NPZ | 可使用已有安全 ZIP／Archive 能力 | 未实现 NPZ 内数组查看，不宣称科学数据支持 |
| P2 MAT v7.3 | 有 HDF5 Signature 时可查看容器 Dataset／Attribute | 非完整 MATLAB 对象／引用语义 |
| P2 MAT v4/v5、FITS、LAS/LAZ | 本模块未实现 | 仅既有识别／兜底能力；没有 Python、MATLAB、LAZ 解码器或格式执行环境 |

没有新增 Hex 编辑器、模板语言、脚本执行、在线解析、整体 UI 重设计或 Logo 改动。

## 4. 新增与修改文件

新增应用核心：

- `src-tauri/src/scientific.rs`
- `src/viewer/plugins/data/scientific-session.ts`
- `src/viewer/plugins/data/slice.ts`
- `src/viewer/plugins/data/cache-budget.ts`
- `src/viewer/plugins/data/errors.ts`
- `src/viewer/plugins/data/sample.ts`
- `src/viewer/plugins/data/ScientificPreview.tsx`

修改：

- `src-tauri/src/lib.rs`、`src-tauri/src/detection/magic.rs`、`src-tauri/build.rs`
- `src-tauri/capabilities/main.json`、`src-tauri/tauri.conf.json`
- `src/services/detection/browserDetector.ts`
- `src/viewer/plugins/data/{worker-client.ts,scientific-provider.ts,columnar-provider.ts,sqlite-provider.ts,data.worker.ts,data-model.ts,config.ts,types.ts,DataGrid.tsx,DataViewer.tsx,data.css}`
- `src/viewer/shared/GridSurface.tsx`
- `src/viewer/plugins/csv/{csv-config.ts,csv-model.ts}`

新增测试／夹具：`tests/module-20.test.ts`、`tests/module-20-session.test.ts`、三份 `module-20-*-qa.cjs`、`tests/generate-module-20.py`、`src-tauri/tests/module20_scientific.rs`、`test-fixtures/data/module20/{stream.arrow,ten-gib.h5}`。新增本页与 `docs/qa/module-20-verification.md`、对应 JSON／日志／截图。隔离运行配置 `module-20-tauri.local.json` 仅用于 QA，未改变正式 identifier。

## 5. 依赖及体积

没有新增 npm／Cargo 应用依赖，没有引入 Python/MATLAB 科学运行环境或本机 HDF5 DLL。夹具工具仅复用仓库 `.tools/module14-fixtures` 与测试用 Python 3.12，应用运行不使用它们。生产数据 Worker 约 420 KiB；最终安装包 13,469,316 字节（12.85 MiB），比 Module 19 增加 41,121 字节。不能由 JS 缓存预算推断安装包体积。

## 6. 解析库及理由

继续使用 Module 14 的 hyparquet 1.31.3 + hyparquet-compressors 1.1.2、apache-arrow 21.2.0、h5wasm 0.10.3，以及现有有界 CDF 读取器。CSV 复用现有解析体系。这些是仓库已打包、已经有标准工具夹具验证的解析器，没有引入平行解析框架。

重要边界：Rust 负责授权句柄、范围读取、科学会话、切片校验与任务预留；格式解码仍在隔离 Worker／打包的 WASM 内完成，未将已有成熟解码器重写为 Rust。HDF5 WASM 每 Worker 独立实例，Worker 终止销毁其文件系统、WASM 内存与句柄，没有新本机 ABI、FFI 跨线程共享或外部 Filter 动态加载。第三方解析库自身仍可能有异常／内部临时内存，超时终止、输出限额及实测内存共同构成防线，不宣称绝对进程配额。

## 7. 数据流、接口及缓存

`ViewerRegistry → existing DataModel / Provider → DataWorkerClient → ScientificSession → Rust ScientificSessions → existing BinarySessions → authorized local handle / prepared VFS`。

解码前切片：`gridSlice → frontend BigInt validation → scientific_validate_slice → Rust u64 checked validation → HDF5 / NetCDF decoder → bounded DataPage → virtual grid / Inspector`。

IPC：`scientific_open/read/close/pause/begin/finish/validate_slice/stats`。范围 offset、decodedBytes、shape/start/count/stride 均传可验证十进制字符串。Rust read 单次最多 1 MiB。HDF5 使用独立只读 `prism-science` 协议，Origin、Range、Session 与源修订都受边界检查；不再借用无科学会话的媒体 URL。

初始配置：128 行 × 最多 16 列，JSON 页输出 1 MiB；单查看器 8 页且估计对象占用 16 MiB；跨查看器页对象估计上限 32 MiB；解码块 32 MiB；Rust 全局活动任务预留 64 MiB；每会话最多 2 个任务，最多 8 个会话；前端最多 2 个数据解析 Worker。元数据回复上限 8 MiB，HDF5 属性累计读取预算 8 MiB。Arrow 先验证 Footer／Dictionary／Batch 地址与预算，再让库读取 Dictionary，缓存新批次前清空旧批次。

缓存核算包含字符串、Details 与对象估计，不是整个进程的硬 RSS 配额。底层 Binary 缓存另有每会话 256 KiB 上限；Worker／WASM／引擎与临时读取缓冲须另外计算。配置集中于 `config.ts`、`CacheBudget`、Rust 常量及 CSV 配置。

## 8. 生命周期

generation、node ID 和 closed 检查拒绝旧结果；重复页合并，快速跳转保留最新请求而不堆积无限任务。取消通过现有 More 操作中的 Cancel reading，恢复通过 Resume reading；隐藏／最小化也走相同资源销毁路径。Worker Range 循环每个 1 MiB 片段检查关闭状态。迟到的 open 会立即关闭其 UUID，迟到 read 不提交。应用 Reload／Exit 显式关闭科学和 Binary 会话。

退出科学查看器只关闭其拥有的 Binary UUID，不释放共享父 VFS；父 VFS 提前关闭后底层拒绝继续读。测试退出应用后不留下此次 QA 的 Elorin 进程。

## 9. 性能与低配方法

详见验证记录和 JSON。真实环境为 Windows 11 Pro、i7-10750H、6 核 12 线程、约 16 GiB 内存；浏览器使用 4 倍 CPU 降速。未在 2015–2016 i5／8GB／Intel HD 实机上测试，未模拟 SATA／机械盘延迟，未证明 60 FPS。

用稀疏文件验证 1 MiB／100 MiB／1 GiB／10 GiB 的范围读取，Windows 设置 sparse flag，只有末尾 4 字节实际写入。用 h5py 创建 10 GiB 逻辑数组而实际文件 7,128 字节；用标准 pyarrow 生成 Arrow Stream。性能测试不伪造整个文件的完整解码速度。

## 10. 安全覆盖

非法／负／非整数／超过安全范围地址、u64 溢出、无效维度、零 stride、固定轴冲突、零数组、标量、异常长轴参数、页／块／Footer 限额、授权路径、源变更、关闭、取消、伪造 Arrow Footer、损坏 Parquet/HDF5、未知压缩器／Filter、外部链接、延迟 open/read 与 VFS 已有边界均有实际测试。深树按需展开；不自动拉取外部路径或网络内容；保持错误原文，不用“未知格式”吞掉所有失败。

## 11. 实际测试与结果

最终命令、结果与早期失败记录集中于 `docs/qa/module-20-verification.md`。自动化包含真实标准工具样本和既有异常夹具，不只测人工拼凑 Header。

## 12. 未实现与限制

矩阵中列出的 P1/P2、压缩 Arrow、VLen、外部 Dataset、超预算列块、超过 4,096 的逻辑列、完整大 CSV 随机行索引均未宣称支持。预览只有已加载数字列折线，没有二维灰度／分布图。64 位切片校验支持精确整数，现有解码器／网格仍拒绝不能安全表示的 Number 维度，不能把这写成任意 u64 大数组可渲染。

RSS 关闭文件后低于已打开状态，但没有完全回到冷启动值；这是实际观察，不用 cache Map 清零冒充物理内存立即归还。未做长达数小时压力测试和低配实机测试，未声称第三方解析器对所有恶意文件均已形式化安全验证。

## 13. 停止范围

Module 20 验证与文档完成后停止。未开始 Module 21。
