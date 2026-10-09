# Module 28 — Viewer Functional Completion & Universal Format Adaptation Foundation

日期：2026-10-09。状态：**实现及本模块轻量验证通过，等待验收**。

## 正式范围与依赖

依据本轮用户正式开发指令实施工作包 A–E；已更新 docs/UI_IMPLEMENTATION_PLAN.md 的 Module 28 槽位，不重排其他编号。复用 Module 23 生命周期、安全边界和 Module 24–27 生产应用。开始时工作树干净，Module 27 的提交 8d3bcf2 / 58f2b0a 已安全推送；其创建、保存和恢复已有原生通过证据，本轮不重复已通过流程。

## 实际完成

- 复用唯一 FormatIndex、ViewerRegistry、ViewerHost 和 FileSource。新增无 UI 依赖的 ContentAdapter 约定，三条纯内容解析路径在既有 Worker 中按需接入既有模型/Viewer；没有新增 App、状态管理器或后台服务，也没有新增依赖包。
- PSD：8-bit RGB / grayscale 合成图，raw / PackBits 解码，接入 Image Viewer；实际像素、缩放、适应窗口及 VFS 内部读取已验证。
- MAT Level 4：IEEE 大/小端实数和复数 full numeric matrices，复用科学数据模型、变量导航/结构搜索和分页网格；不全量载入矩阵负载。
- 3DS：复用 Three TDSLoader 和现有几何模型，显示静态三角网格、结构搜索和视图切换。解析前校验块长度、计数、深度和索引，拒绝外部纹理。
- 格式能力机器清单新增登记、识别证据、解析器绑定、实际 Viewer、主要内容和样本验证字段。目录仍为155条；15条具有列明样本证据，不能据此宣称155种或1100+种格式均已完整阅读。

## 修复的真实缺陷

1. 格式生成脚本覆盖显式检测规则，丢失 NPY/PSD 等签名；现保留声明。
2. 原生加载器只对 .m 做额外探测，适配器签名无法纠正错误扩展名；对未由 native magic 确认的文件最多读取64 KiB，并标记签名冲突，不新增授权。
3. MAT 已登记但 native legacy type 为 Unknown 时，科学 Viewer 找不到解析器；现按格式适配结果选用 MAT/NPY 路径。
4. 大端 TIFF 的 MM 标记被弱3DS规则抢先识别；浏览器及 Rust 检测器修复优先级，BigTIFF不再误进3DS。
5. Focus 的原生快照及刷新缺少前端格式证据；初始化、刷新均复用授权加载器，加载失败显示错误，关闭后的异步结果不更新窗口。

关键源码：src/formats/{content-adapter.ts,content-adapters.json,index.ts}、src/services/fileLoader.ts、src/services/detection/browserDetector.ts、src-tauri/src/detection/magic.rs、src/pages/focus/FocusWindow.tsx；三个解析器 image-psd.ts、mat4-reader.ts、three-ds-adapter.ts 及对应既有 Worker/模型接线。

## 样本与测试

样本在 [tests/fixtures/module28](tests/fixtures/module28/README.md)，按 Adobe PSD、MathWorks MAT 和 Three/lib3ds 结构规范生成有效二进制，生成器及样本采用CC0；包含真实像素、矩阵和网格，不是改扩展名的文本。

| 格式 | 内容与已执行变体 | 范围 |
|---|---|---|
| PSD | 64×64四色合成图；raw、PackBits；原生RGBA像素校验；损坏及超预算拒绝 | v1，8-bit RGB/灰度，无额外通道；≤64 MiB / 16 MP |
| MAT | signal数值矩阵及complex_signal；大/小端；变量切换及真实网格值；截断拒绝 | Level 4 full numeric；每页≤128行/16列，≤128矩阵 |
| 3DS | 四面体4顶点/4面；真实渲染及视图/结构导航；损坏和外部纹理拒绝 | 静态网格；≤32 MiB；沿用既有几何CPU/GPU预算及超时 |
| TIFF回归 | 8×8大端cyan RGB；实际像素 | 既有TIFF Viewer，不计为新增格式 |

- **TypeScript / 前端生产构建 PASS**；已有大chunk警告保留。
- **针对性测试165/165及Worker安全4/4 PASS（共169项）**，覆盖新解析、检测/路由、受影响图片/科学数据及既有生命周期、文件源和 Module 27/Focus 回归。Worker专项注入取消、迟到响应和30秒虚拟超时，确认终止、错误状态和拒绝后续读取；没有重复451项全量测试。
- **Rust检测回归2/2 PASS**，其余48项未重跑。
- **隔离原生构建及运行 PASS**：主窗口与Focus一致读取错误扩展名PSD；ZIP内PSD预览/独立标签；损坏、超预算和外部纹理诊断。
- **安全/释放 PASS**：3DS的../secret.png被拒绝，真实存在的未选择邻接文件保持PERMISSION_DENIED；MAT最小化释放Worker、恢复重新读取；主流程创建14个Worker，结束live=0；正常退出码0，观察到的应用及WebView子进程残留0。
- **现有Viewer轻量原生回归10/10 PASS**：PDF实际非空像素、DOCX正文、EPUB章节、Markdown、JSON、CSV、XLSX、WAV解码、STL渲染及损坏PSD的真实Hex诊断读取；不代表这些格式所有变体均已复测。

证据：[自动化测试](docs/qa/module-28/tests.json)、[Worker安全](docs/qa/module-28/worker-tests.json)、[原生核心](docs/qa/module-28/native-report.json)、[既有样本回归](docs/qa/module-28/smoke-report.json)、[资源授权](docs/qa/module-28/resource-report.json)、[机器内容证据](docs/qa/module-28/content-evidence.json)、[生成清单](docs/formats/format-capability-matrix.json)、[生产构建](docs/qa/module-28/build.txt)、[Rust](docs/qa/module-28/rust.txt)、[原生构建](docs/qa/module-28/native-build.txt)。保留首次MAT路由失败记录，最终回归通过。只保留3张实际应用截图。

QA identifier为app.elorin.module28.qa，应用数据/WebView/写入目录独立；各运行个人配置哈希未变化。最终QA exe SHA-256：1b73d5de4e1b29eb2c1623621128e5e366c7f8c96934fa10b12a3b7425fa298a。冻结安装包SHA-256仍为61ec10318d431ff241508e41446bf15ef20bb4256e5a9fd61efe1820a38e6588，没有覆盖正式/冻结安装包。

## 未完成事项与 Git

- PSD图层、额外alpha/spot通道、ICC变换、ZIP压缩和16/32-bit；MAT文本/sparse/v5；3DS纹理/关键帧动画均未实现，不能按完整支持计数。MAT v7.3仍走既有HDF5路径，未在本模块新增验证。
- 所有格式/codec/内部版本的全面兼容性、原生长任务超时注入及长时间内存压力为 **NOT VERIFIED**。自动化虚拟超时、取消/过期响应回归通过，没有将其替代为完整压力验证。
- [CSV P95遗留](docs/development/CSV-P95-follow-up.md)继续OPEN；没有重写虚拟网格或精修全套UI。
- 分支：feature/module-28-viewer-foundation，保留Module 27全部提交；实现提交：**c45cf6e**，Worker安全回归提交：**e5b48be**。本模块尚未合并develop/main；验收报告和证据以独立文档提交交付。
- 完成后停止在Module 28，未启动Module 29。
