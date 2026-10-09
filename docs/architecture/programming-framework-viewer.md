# Module 19 — Programming & Framework Format Viewer

实现日期：2026-10-08。只实施 Module 19，不启动 Module 20。

## 1. 审计及复用

继续使用唯一的 ViewerRegistry、Module 17 FormatIndex / RoutedFormatAdapter、FileSource / VFS、ViewerController 的取消和清理、Module 07 TextDocumentModel / text.worker 稀疏行索引与搜索，以及既有 Markdown、JSON、XML/HTML 原文能力。源代码是 `core.text-fallback` 的扩展，没有平行注册表或新 IPC 读取接口。Rust 仍控制授权与范围读取。Module 18 实际测试通过，可复用其事件驱动活动检测；其旧电脑实机性能未验证、4 倍降速约 34 FPS 的既有缺口仍保留，不能视作低配性能验收完成。

## 2. 功能

虚拟行、行号、原文、换行及编码显示、指定行跳转、行选中、Shift 点击连续行选择、受限复制、UTF-16 / Unicode code point / Tab 视觉列 / 物理字节地址、搜索高亮、Tab 宽度、字体大小、换行、水平滚动、当前行、默认折叠结构区、专注源码模式。专注模式收起本模块结构区，外围 Inspector 继续由已有 Host 控制。

原始文件无写入。字节位置从原有行索引计算并包含 BOM；未知编码或已发现非法编码时不猜测字节位置。UTF-16 列为 1 基，搜索内部列为 0 基。视觉列按 code point 与 Tab 停靠点计算，不是字体像素或东亚宽字符终端格数。浏览器/Windows 剪贴板可能将 LF 转成 CRLF；复制服务传入的是原始范围解码结果，源文件不受影响。极长行仍用既有有界预览页。

## 3. 能力矩阵

| 格式 | 识别 / 原文 | 高亮 | 符号 | 配置结构 |
| --- | --- | --- | --- | --- |
| JS / TS / JSX / TSX / .d.ts | 是 | 有界文档 | TypeScript 语法解析器 | 不适用 |
| JSON / package.json | 是，原有 JSON Viewer 优先且原文可选 | 原文视图有界 | 无 | 原有 JSON Viewer；手动 JSON 源码分析也支持 |
| JSONC / tsconfig.json | 是 | JSON 语法近似着色，注释语义由 JSONC 解析器处理 | 无 | jsonc-parser，保留重复键与顺序 |
| JSON5 | 是 | JavaScript 着色 | 无（不是 JS 符号解析模式） | 无，原文降级 |
| YAML | 是 | 有界 | 无 | 无，不展开 aliases / tags |
| TOML / Cargo.toml / pyproject.toml / INI / .env / .editorconfig | 是 | INI 近似着色 | 无 | 无，原文降级 |
| Vue / Svelte / Astro | 是 | XML 及实际可识别的 script/style 区域，框架专有语法可能近似 | 无 | 无 |
| Python / Rust / Go / C / C++ / Java / Kotlin / Ruby / PHP / Swift 等 | 是 | 已安装 Highlight.js 语法，有界 | 无 | 无 |
| Dockerfile / Makefile / CMakeLists.txt / build.gradle / go.mod | 是 | 对应语法；go.mod 为 Go 近似着色 | 无 | 无 |
| .m / .pl / .h | .m/.pl 保留候选，.h 当前默认 C；用户可手动改语言 | 对应选项有界 | 无 | 无 |
| .gitignore / 未知文本 | 是 | Plain Text | 无 | 无 |

所有高亮及 AST 能力受预算约束；不是上述语言的完整 IDE 支持。支持列表由现有格式生成器生成：新增文件名/复合扩展名定义与 `sourceLanguage`，不新增关联权限。专用 PDF、图片、Office、Markdown、JSON、CSV 等 Viewer 优先级不改变。

## 4. 技术选型

保留现有 Highlight.js，改为核心加按需加载的明确语法模块，不做自动语法穷举。Shiki/TextMate 会增加语法/主题和运行时；Tree-sitter 会增加 WASM、语法构建与状态管理。现有依赖足以实现有界整段语法分析，因此本次不新增这些依赖。

旧逐行高亮会丢失跨视口注释/字符串状态，已撤除该执行路径。小文档在隔离 Worker 中从文件起点分析，结果是纯文本/受限 class 的 token 数据；React 只渲染可见行，不插入高亮 HTML。无法保证状态的较大文件直接显示纯源码。

JS/TS 结构使用现有 TypeScript 包的 `createSourceFile` 语法树，不启动语言服务、不处理项目引用、不执行源代码。统一 SourceSymbol 记录名称、类型、起止行列。解析异常不显示猜测符号。JSONC 使用现有 jsonc-parser，注释、尾随逗号与严格 JSON 策略区分；树保持源顺序与重复属性。配置节点按展开状态挂载子节点。

## 5. 数据流与预算

`授权 FileSource → 16 KiB 检测样本 → TextDocumentModel → 256 KiB 范围请求 / 稀疏行索引 → 最多 96 个可见/缓冲行 → React 文本/span`。

`有界 source.worker → 按需语法模块 → Highlight.js / TS AST / JSONC → token / SourceSymbol / ConfigNode → 同一原文视口及折叠导航`。

完整分析上限：512 KiB 源字节、20,000 行、单行 16,384 UTF-16 单位、50,000 token / AST 访问、1,000 符号或配置节点、64 层结构、4 秒 Worker 超时。512 KiB 是保守默认，超过即纯源码；没有将 1 GiB 文本 split。索引最多 32,768 个检查点，数值载荷最多 256 KiB，另保留原有最多 2,048 个长行范围。总行数不完整时标记 `+` / 已索引部分。复制上限 1 MiB、搜索只保留前 2,000 个位置，正则沿用既有每行 64 KiB 和 Worker 强制超时。

TS 解析器惰性 chunk 约 3.57 MB，运行期间的解析器堆不是 token 预算本身；进程峰值内存尚未做完整归因。每个文档分析结束即销毁 Worker，不常驻语法/LSP 服务，不无限缓存语法。

## 6. 新增与修改文件

新增：`src/viewer/plugins/text/source-analysis.ts`、`source.worker.ts`、`source-position.ts`；`tests/module-19-source.test.tsx`、`module-19-performance.test.ts`、`module-19-browser-qa.cjs`、`module-19-native-qa.cjs`；本报告及 `docs/qa/module-19-*` 实际结果。

修改：`TextViewer.tsx`、`TextLine.tsx`、`text-model.ts`、`text-engine.ts`、`text-config.ts`、`text-profile.ts`、`syntax-highlighter.ts`、`text.css`；`src/formats/types.ts`、`catalogue.json`、`runtime.json`、`scripts/generate-formats.cjs`；`vite.config.ts`（Worker 使用 ES 模块以支持语法拆分）；`README.md`。没有新 Rust 命令、权限、第三方依赖、源文件写入或主程序导航重设计。

## 7. 安全与生命周期

源码、HTML、框架文件只作为数据；不执行 scripts/npm install/Makefile，不加载用户指定插件或远程 schema。只加载应用自带语法模块。XML 不进行实体解析/外部请求，YAML 不构造对象或展开引用。不用正则伪造语法树。配置解析或过深/过量结构失败保留原文及明确诊断。

隐藏标签页、document.hidden、原生最小化会暂停索引、搜索、分析，终止 Worker、释放 token/结构结果；恢复后有界分析从起点重建。关闭及卸载终止全部任务、清空预览/检查点/长行范围。没有空闲定时轮询。既有 FileSource/VFS 所有权由原控制器管理，本模块不释放父 VFS 或增加永久副本。

## 8. 验证与性能证据

实际执行记录见 [Module 19 验证](../qa/module-19-verification.md)。保留失败诊断，包括曾发现的 tsconfig 路由、Windows 剪贴板换行转换，以及视口随内容增高导致高频滚动卡住；修复虚拟化边界后必须复验。

当前测试环境：Windows 11，i7-10750H 6 核/12 线程，约 16 GB；不是验收目标旧 i5。模拟范围数据不分配 GB 级磁盘文件。1/20/100 MiB、1 GiB 的完整行索引及尾部偏移检查、100 万行、密集短行内存上限和取消均有断言。数值检查点载荷不等于 JS 对象真实堆。浏览器主线程 heap 也不等于整个应用或 Worker 的峰值。

## 9. 已知限制与后续事项

超过 512 KiB 文档没有高亮/AST；更多配置解析器与更大文件增量语法属于后续改进，不宣称支持。Vue/Svelte/Astro 框架专有分区语法及源码折叠没有完整 parser-backed 实现，只有原文、高亮和通用折叠结构区。TS 是语法解析，不是语义验证。隐藏后未完成索引恢复从起点重建，保守但可能重复扫描；达到索引预算后不再扩展行跳转范围，完整字节搜索仍可用。字体视觉宽度/字形边界并非本次列计算目标。

旧 i5/8 GB/机械盘实机、全过程峰值进程内存、跨文件高频切换长期压力及低配稳定 60 FPS 尚不能作为已通过事项。仅停止于 Module 19。
