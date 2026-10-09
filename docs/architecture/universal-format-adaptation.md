# Elorin Module 17 — Universal Format Adaptation & Detection Enhancement

实施与验收记录，2026-10-08。范围止于 Module 17；未开始 Module 18、Hex Viewer 或专科 Viewer。

## A — 实施前接口审计

Module 02 的 FileDescriptor、FileSource 和原有 Rust/browser detector 是文件身份与探测入口。Module 03 的 ViewerRegistry、ViewerController 是唯一 Viewer 注册、装载、取消和释放入口。Module 04–14 的文本、结构、表格、文档、图片、几何、容器、媒体及科学数据模型继续由原 Viewer 所有。Module 12 的 VirtualFileSource/SourceLease 与授权 sibling resolution 提供虚拟来源和资源访问边界。Module 15 的 DocumentSession 保有 dirty、保存、恢复语义；Module 16 的 AppTabSession、ViewerSessionStore、显式关联白名单继续使用。

审计缺口为统一格式能力元数据、复合名称、检测证据与歧义说明、多视图路由，以及跨格式资源生命周期。审计结果已在实现之前输出。未引入第二个解析器注册表或文件打开会话。

## B — 文件与职责

新增核心文件：

- `D:\Prism\src\formats\types.ts`：Adapter、能力、检测证据和投影契约。
- `D:\Prism\src\formats\index.ts`：元数据索引、检测增强、现有 Viewer 的路由适配器。
- `D:\Prism\src\formats\FormatInformation.tsx`：置信度、证据、解释选择与视图选择。
- `D:\Prism\src\formats\resources.ts`：有界、可取消的伴随资源租约作用域。
- `D:\Prism\src\formats\presentation.ts`：复用现有图标的映射。
- `D:\Prism\src\formats\catalogue.json`：125 个格式定义的完整可导出清单。
- `D:\Prism\src\formats\runtime.json`：启动所用的去重紧凑元数据。
- `D:\Prism\src\formats\association-policy.json`：独立的 137 个既有扩展名关联许可。
- `D:\Prism\src\services\resourcePath.ts`：从几何资源服务提取的共同路径校验，语义不放宽。
- `D:\Prism\scripts\generate-formats.cjs`：生成完整清单和启动元数据。
- `D:\Prism\tests\generate-module-17.cjs`、`module-17.test.tsx`、`module-17-performance.test.ts`、`module-17-runtime-qa.cjs`、`module-17-native-qa.cjs`：样本、契约、性能、浏览器和桌面回归。

接入既有文件：`D:\Prism\src\types\files.ts`、`src\services\detection\browserDetector.ts`、`src\services\fileLoader.ts`、`src\services\fileSource.ts`、`src\viewer\core\registry.ts`、`controller.ts`、`types.ts`、`src\viewer\builtins.ts`、`src\viewer\components\ViewerHost.tsx`、`src\viewer\plugins\geometry\resource-resolver.ts`、`src\document\DocumentSurface.tsx`、`src\components\files\FileInspector.tsx`、`src\pages\home\Home.tsx`、`src\workspace\productivity.css`、`src-tauri\src\detection\extension.rs`、`scripts\generate-associations.cjs`、`src\platform\associations.json`、`src-tauri\installer\hooks.nsh`、`package.json`（本句中相对项均以 `D:\Prism\` 为根）。没有新增应用依赖。

## C — FormatAdapter 与唯一注册入口

FormatAdapter 提供 stable formatId、能力清单、同步 bounded-sample detect 和异步 open。open 返回借用的 FileSource、现有 Viewer 对应投影以及幂等 release，不复制整份二进制。registerAdapter/unregisterAdapter 从既有 ViewerRegistry 进入；FormatIndex 只索引元数据，不装载解析器。既有 Viewer 的 lazy import 和模型所有权保持原有入口。

注册校验拒绝重复 ID、未解释的名称冲突和超过边界的规则；`.m` 的两个定义声明共同 ambiguityGroup。支持注销和缺少后端的可见失败。索引最多 16,384 定义，单定义名称/扩展最多 256，Magic 最多 64 个偏移且落在 64 KiB 以内，规则字符串和签名字节均有上限。

## D — 检测与证据

沿用原探测器的 64 KiB 首部及有界 ZIP 目录探测，不建立另一套原始文件扫描。真实 Magic 和强结构内容优先于伪造名称；原有 PDF、Office、EPUB 容器路由保留。名称索引先精确 basename，再最长复合后缀。新增 index.d.ts、build.gradle.kts、app.blade.php、Dockerfile、CMakeLists.txt、go.mod、Cargo.toml、.gitignore、.env.local、file.nii.gz、archive.tar.zst。

Confirmed/Probable/Ambiguous/Unknown 与 filename、extension、magic、mime、content、container、user 证据一起保存在可选 descriptor.format。`.m` 用最多 8 KiB 内容区分 MATLAB/Objective-C；无法区分时保留两个候选，由用户选择解释。桌面 `.m` 为此额外读取最多 8 KiB 授权范围。选择解释不修改源字节、不执行源文件。NIfTI/TAR 压缩名称仅为 Probable，不声称验证解压后的内层格式。

## E — 投影与多视图

| 投影 | 复用的入口 |
| --- | --- |
| TextDocument | 既有 text/code Viewer 与 Module 15 文本会话 |
| StructuredDocument | 既有 JSON/结构 Viewer |
| TabularDataProvider | 既有 CSV、表格及数据 Viewer |
| DocumentPages / ImageDocument | 既有 PDF、文档与图片 Viewer |
| GeometryDocument | 既有几何 Viewer，未实现格式保留诊断 |
| ContainerDocument / ScientificDataset | 既有压缩包、数据库、科学数据 Viewer |
| TimelineDocument / BinaryDocument | 既有媒体和 fallback 的路由名称；没有新时间轴或 Hex 实现 |

Notebook 仅有既有 JSON 结构与 text 源码两种视图，无 Notebook 执行、Notebook 编辑器或 cell Viewer。格式能力明确禁用其编辑/保存。新源文件类型使用既有文本编辑限制；已有内容的 strong detection 不被名称选择降级。

## F — 清单、图标与系统关联

完整清单供未来网站、测试和导出使用；启动仅解码约 29.6 KiB 的去重 runtime 元数据。图标使用现有 CSS sprite。关联生成器消费同一清单，但另受显式既有白名单限制，仍为 137 个扩展名。新增格式不会自动获得系统关联；exe、dll、sys、bat、cmd、ps1 等危险扩展不自动注册。NSIS 的所有权、卸载和 UserChoice 保护沿用 Module 16。

## G — 资源与 VFS

FormatResourceScope 只调用授权 FileSource.resolveRelated；默认最多 32 引用、32 MiB、4 层。拒绝 URL、绝对路径、编码绕过、空段、dot/dot-dot、反斜线、冒号和控制字符。调用方传递祖先链时拒绝循环。缺失资源产生可恢复错误；超预算、取消、作用域关闭及迟到结果均释放租约。没有增加网络请求或 native grant。既有几何解析器继续复用同一安全路径函数与原解析行为。

## H — 生命周期与性能边界

Controller 的取消信号绑定 Adapter、来源和资源作用域。后端结束后即使取消已发生，仍登记并释放返回的租约；迟到模型不发布。适配器更换来源时先关闭旧作用域。重用同一来源不新建二进制缓存。模型和 Worker 由既有 Viewer 清理；动态导入的 JavaScript 模块代码会留在模块缓存，不宣称可以卸载代码。

supportsRandomAccess 描述 FileSource 可按范围读取的契约，不保证所有旧解析器内部均按需解析；Office、图像或压缩成员等仍受各 Module 的原有完整缓冲上限。隔离进程后端仅为预留能力，当前 Adapter 属受信任应用代码，没有第三方插件沙箱。

## I — 当前机器实测

`D:\Prism\docs\qa\module-17-performance.json`：2,000 条规则初始化 13.3433 ms，100,000 次名称查找 200.0 ms；32 GiB **逻辑模拟来源**只读一次 65,536 字节，检测 7.286 ms；100 个小来源共 14.4425 ms。这不是实际创建 32 GiB 磁盘文件，也不是旧 i5/HDD 测试。

`D:\Prism\docs\qa\module-17-browser-runtime.json`：空壳 621 ms，未提前请求专门解析器；1,500 ms 空闲区间 renderer TaskDuration 为 0.005915 秒。重复开关后创建的 74 个 Worker 全部终止，active=0。该指标不代表整个应用的 CPU 使用率或完整 RSS。

最终生产主包 440.02 kB、gzip 133.39 kB，Module 16 约 397 kB、gzip 125 kB；完整导出清单未进入启动包。既有大几何 chunk 的构建提示仍存在。没有进行旧 i5、4 GB 内存、机械硬盘或跨系统验收，不声称满足这些环境的响应时限。

## J — 安全验证

源码样本含若执行即失败的 Python 内容；浏览器只显示，桌面可编辑保存。浏览器 QA 拦截所有非 localhost/blob/data 请求，实际没有越界请求。路径绕过、循环、字节预算和迟到租约有回归。检测样本、Magic 偏移与规则长度均有限。Native 文件读取沿用原授权边界。

## K — 回归结果

- 完整前端：33 文件、660 tests passed；其中 Module 17 契约 40 项、性能 1 项。
- 完整 Rust：61 tests passed，包含新增名称/伪造后缀及既有加载、范围、压缩、科学数据测试。
- 浏览器：13 检查通过、errors=[]，覆盖歧义、多视图、只识别格式、无执行、网络与 Worker 关闭。
- 桌面 Module 17：9 检查通过，涵盖复合名称、原生 `.m` 内容、JSON/源码视图及 Module 15 原生编辑保存。
- 桌面 Module 16：19 检查通过，保留多文件、会话恢复和已有操作流程。
- 关闭后进程：本次 QA 应用与专属 WebView profile 均为 0；见 `D:\Prism\docs\qa\module-17-exit-runtime.json`。
- 最终 Module 17 安装包：安装/卸载关联回归 434 检查通过，包含 137 个扩展名和 UserChoice 保留；errors=[]。

样本根为 `D:\Prism\test-fixtures\formats\`，包括上述复合名称、ambiguous.m、objective.m、sample.ipynb、script.py、伪装 PDF 和压缩头样本；可由生成脚本重复创建。截图见 `D:\Prism\docs\qa\module-17-runtime.png`、`module-17-native.png`。

## L — 实际限制

识别级支持不会冒充完整预览。FBX、DWG、部分 CAD/DCC、医学压缩等能力保持 detection-only 或已有 partial 状态；没有新专科解析器。`.m` 为有界语法线索，不是编译器判断。压缩名称不验证完整内层数据。多视图与解释选择局限于当前 Viewer 会话，未新增跨重启持久化。原有编辑限制、VFS Save As 与模型预算仍生效。性能结论仅限上述测试环境。

## M — 重现与交付

执行 `npm run formats:generate` 重建清单与关联；`node tests/generate-module-17.cjs` 重建样本；`npm test -- --reporter=dot`、`cargo test --manifest-path src-tauri/Cargo.toml` 验证完整回归。`npm run tauri -- build --bundles nsis` 完成 TypeScript、Vite、Rust release 和 NSIS。

正式产物：`D:\Prism\src-tauri\target\release\prism.exe` 与 `D:\Prism\src-tauri\target\release\bundle\nsis\Elorin_0.1.0_x64-setup.exe`。安装/卸载回归沿用 `D:\Prism\tests\module-16-installer-qa.ps1`，对当前安装包检查 137 项关联及 UserChoice 保留；具体结果见 `D:\Prism\docs\qa\module-16-installer-runtime.json`。
