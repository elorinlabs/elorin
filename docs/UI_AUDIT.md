# Elorin UI/UX 只读源码审计

审计日期：2026-10-09。依据：用户正式启动指令、Master Spec v2.0 全部 0–15 章、ZIP README 与全部 11 张标注图。规范是目标，不是现有功能证明。本轮只新增审计材料，不继续修改 Module 24，不进入 Module 25。

## 1. 证据与保护边界

- 工作目录 `D:/Prism`；`git status --short`、`git branch --show-current` 均返回 `fatal: not a git repository`。未发现 `.git` 或 AGENTS.md；**分支、提交基线、未提交 diff 无法验证**，不能称“工作区干净”。`.app-backup` 不能替代版本控制基线。
- 已在 `ui-audit/source-freeze-before.json` 记录源码、Rust、测试、脚本、非图片资产与入口/依赖文件 SHA256；审计结束另行比较。冻结包含 Module 24 在制内容，不通过回滚或重新生成“清理”它。
- 参考 ZIP 解压到 `ui-audit/reference/`，仅用于审计；没有放入 public、dist 或运行组件。11 图均实际打开查看。01 为设置合集，02 为组件合集，11 为设计系统；03–10 为页面，08 明确是独立窗口。
- 本轮不构建、不运行测试、不重新打包、不修改配置存储、不执行文件写入/删除/关联修复。下文引用已有日志时明确为**冻结前历史结果**。新采集的文件时间、哈希、调用链是本轮证据。
- 路径下文相对 `D:/Prism`；功能细项见 [UI_FEATURE_MATRIX.md](UI_FEATURE_MATRIX.md)，调用图见 [UI_RUNTIME_MAP.md](UI_RUNTIME_MAP.md)。

## 2. 真正运行的入口和“旧 UI”根因

| 层 | 已核实路径与调用 | 结论 |
| --- | --- | --- |
| HTML | `index.html` 的 module script `/src/main.tsx` | 不是其他网站/目录 |
| 前端 | `src/main.tsx` → `createRoot` → `App` | 正常地址始终挂载真实 App |
| 样式 | main 顺序：`styles.css` → `foundation.css` → `design-system/system.css`；App 又导入 `workspace/productivity.css`；专业插件延迟导入各自 CSS | 新基础样式已接入；后加载和更高优先级局部规则仍需逐页迁移，不能只改 Token 就预期布局改变 |
| DEV 展示 | `import.meta.env.DEV && pathname === '/__qa/design-system'` → lazy `Showcase` | 组件展示不替换生产 Home。生产消除此分支是刻意边界，不是“新版组件已上线” |
| 开发 | `package.json` dev → Vite，`vite.config.ts` 固定 1420；Tauri devUrl 指向该端口 | 只有 dev 模式依赖该地址 |
| 打包 | build → TypeScript/Vite → `dist`；`tauri.conf.json` frontendDist=`../dist` → Rust 嵌入 → exe → NSIS | `tauri build --debug --no-bundle` 仍是打包前端，不因有 devUrl 就连接 Vite/HMR |
| 桌面 | `src-tauri/src/main.rs` → `prism_lib::run()` → `src-tauri/src/lib.rs` → `tauri::Builder` | 当前静态窗口只有 main |

**已证实的三个直接原因：**

1. Home 结构仍由 `src/pages/home/Home.tsx` 输出纸张 hero、分类卡片、最近文件，文案仍为 “Open anything. Read beautifully.”；App 仍是旧全局搜索行 + 多行文件操作 + 标签 + Host 的结构。Module 24 只迁移基础外观，没有把参考 10 的布局接进生产入口。因此“新颜色但旧布局”符合当前代码实际，而非单纯缓存问题。
2. `Showcase.tsx` 是独立 DEV 验证页；在这里看到新控件，不代表所有专业 Viewer 已使用它。现有 App/插件仍有大量原生 button/select/input 与独立工具条。
3. 二进制与源码不是同一更新通道。冻结时 debug exe 时间 **03:28:32**，release exe/NSIS **03:17:47**，dist/index.html **03:27:23**；新 Rust Chrome 状态命令在后续 debug 构建中，旧 release/NSIS 没有同一最终验收快照。历史 `native-start-runtime.json` 的实际 URL 为 `http://tauri.localhost/`，module script 为 `assets/index-CcUW1xou.js`，证明运行的是嵌入包。修改 Vite 页面无法热更新这份 exe。

**未证实项：**用户正在启动哪一份安装目录/exe、快捷方式目标、用户常用 WebView2 缓存、旧安装版本与磁盘安装包是否对应，本轮未操作用户软件，标记待验证。不得把所有旧 UI 归因缓存，也未发现第二套被启动的 React 根入口。后续发布批次须记录 exe 绝对路径、SHA256、构建 ID、frontend bundle ID、窗口 label、数据目录，再比对截图。

## 3. 主窗口、路由和真实业务

`App.tsx` 是当前组合根，拥有 route/documents/activeFile/palette/search/compare/focusMode/notice。`routes.ts` 只有 Home、Recents、Library、Documents、Code、Data、Media、Archives、Settings。没有参考图中的独立 Favorites、Images、Spreadsheet、Presentations、3D 分类路由。

- `Sidebar.navigate` 设置 route 并清空活动索引；无活动文件时 Home → Home、Settings → IntegrationSettings、**其他分类 → “Coming later.”**。这是可见占位，不是已接入文件管理器；Recents 数据虽被 quick-open 使用，Recents 页面本身仍缺。
- 打开：Home/命令/按钮 → App.choose → fileSelectionService.select → Rust select_path；App.inspect → fileLoader.loadPath/loadBrowserFile → descriptor/detection → TauriFileSource/BrowserFileSource → TabSession → DocumentSurface → ViewerHost。
- Open Folder 仅选择文件夹并显示提示，**不枚举目录、不生成文件列表**。主窗口拖放能打开文件；内部标签拖放为重排。
- 物理路径通过 physicalIdentity 去重；128 标签上限，closedTabs 最多 20，workspace 持久化最多 128 条且排除虚拟文件。Viewer 状态 serialize 限 64 KiB，空间存储总预算 2 MiB。
- 真正可编辑：DocumentSurface 安全检查后建立 DocumentSession，当前限 2 MiB、UTF-8、Text/Markdown/JSON/CSV 与允许的源码文本；CSV 有独立单元格编辑，JSON 有实际校验。保存 → saveDocument → document_save，指纹冲突保护、恢复快照、未保存退出确认已存在。
- **未发现通用文件重命名、移动、复制文件实体、系统回收站删除、分享服务、PDF 编辑或全格式导出 API**。复制路径、系统打开、Show in Folder 已存在；不能将这些当作 Rename/Move/Delete/Export 的替代实现。
- Home 最近列表是真实 recentFilesService；其 More 图标仅 onNotice “file actions are coming in a later module”，没有真实菜单。收藏持久化未发现。
- 对比 CompareView：4 MiB/文件，文本 diff Worker 有 5 秒超时；图像并排及同步滚动，SVG 拒绝；没有像素叠加差异、PDF 语义对比或多于两文件比较。

## 4. Viewer 与格式支持层级

`builtins.ts` lazy 注册 → registry.resolve/adapt（复用 formats）→ controller.start → plugin.load/render/inspect/dispose。Controller generation、AbortSignal、120 秒加载边界、FormatResourceScope 和迟到结果销毁是应保留的基础。

| 格式组 | 真实路径/能力 | 不得误报 |
| --- | --- | --- |
| PDF | pdf.plugin → pdf-engine/PdfViewer；页导航、旋转、fit、搜索、缩略图/目录、权限、按需页渲染 | 没有 PDF 编辑、注释保存、通用 PDF 导出 |
| Office/Presentation | office/presentation 插件、package Worker，结构化阅读/幻灯预览 | 注册扩展名不等于完整排版、宏执行或 Office 编辑 |
| Image | image-model/Worker/Canvas/SVG sanitization，缩放平移旋转、复制、动画按能力 | 系统 codec 支持取决环境；无全局相册/关键帧服务 |
| Code/Text/Markdown/JSON | text 分块索引/结构分析；Markdown reader/source/split；JSON tree/source/split/格式化复制；DocumentSurface 编辑 | JSON 格式化复制不是全语言 Format 服务；没有任意 AST 重构、完整 LSP |
| CSV/Spreadsheet | CsvGrid/GridSurface 与 workbook sparse grid，选区、搜索、CSV projection sort/filter、sheet/公式缓存值 | CSV 排序/筛选只改视图；XLSX 当前只读“Saved results only”，不执行公式重算，不把 CSV 编辑能力套到 XLSX |
| Archive/VFS | ArchiveModel → VirtualFileSystem → Browser/Native backend；按需 child source、名称路径搜索、解压进度/冲突/取消 | 当前内部文件打开到子标签，不是图 06 中央内嵌预览；没有 archive 安全写回 Rename/Move/Delete |
| Media | HTMLMediaElement + PlaybackController + media lease/probe，seek/volume/rate/subtitle，PCM WAV 采样 waveform | 无自动转录/视频关键帧生成/视频裁剪；metadata 可有 codec，不保证实际可播放 |
| 3D/CAD | GeometryModel/parser Worker/Three GeometryRenderEngine；mesh、STEP/IGES tessellation、2D/scene 按实际 adapter，结构/测量/视角/材质数据 | `engineeringCapabilities.brep=false`；专有格式部分识别/结构/不支持，不因列入注册数组声称完整 CAD |
| Scientific/Hex | data/scientific 与 hex 64 位 range、受控 session/cache | 需保留资源预算，不能 UI 重构时将大文件 readAll |

精确逐格式状态以 `docs/formats/format-capability-matrix.json`、`FORMAT-COVERAGE.md` 及具体 adapter 为准。本轮没有对全部格式重新做内容验证。

### 4.1 其他已注册 Viewer 的逐链保留审计

参考图没有逐页展开以下格式，并不意味着可以在重构时删除。下表是源码追踪，全部本轮实机行为待验证。

| Viewer / 真实入口 | 事件、状态和调用链 | 迁移边界 / 现有测试入口 |
| --- | --- | --- |
| Office `src/viewer/plugins/office/OfficeViewer.tsx` | Contents/Find/Focus → panel/query/limit/result；go 增加可见 block 上限后定位；IntersectionObserver 分批增加100；搜索最多10000 hits；CSS Highlight 清理 | 是分批追加DOM，不是所有节点回收型虚拟列表；DOM fullscreen非独立窗。`tests/office-document.test.ts`、`tests/pdf-engine.test.ts` 不能替代新布局原生测试 |
| Presentation `src/viewer/plugins/presentation/PresentationViewer.tsx` | go→loadSlide→token检查→slide/session；缩略轨道按railTop渲染最多10项，预取3；Notes/Inspect/Search/Copy/Fullscreen注册真实命令；speaker notes/静态comments取自文件 | 宏/动画/内嵌媒体不执行；search Close只隐藏面板，见缺陷节。`tests/module-10.test.ts` |
| EPUB `src/viewer/plugins/publishing/EpubViewer.tsx` | chapter/toc/chapterScrolls/progress→readChapter→SafeDocument；导航内部anchor；find逐chapter、每轮检查operation/context.signal、最多500章结果并让出事件循环；Cancel增加operation | DRM/fixed-layout仅metadata/外部打开，不强行reflow；全书查找不是统一SearchSurface provider。滚动每次updateSession后续需低频状态适配。`tests/module-11.test.tsx` |
| Email `src/viewer/plugins/email/EmailViewer.tsx` | rich/plain/header切换→SafeDocument或pre；find TreeWalker最多1000matches→Range选中/scroll；copy-address/subject/message-id；附件m.open→受控child资源 | MSG limited不当完整Outlook；远程资源默认阻断；SPF/DKIM只显示头，不声称验证。`tests/module-11.test.tsx` |
| Subtitle `src/viewer/plugins/media/subtitle.plugin.tsx` | ≤4MiB readText→parseSubtitles；Search过滤、Raw/List、Go seconds；visibleRange虚拟cue列表；footer显示实际format/cues | 无字幕脚本/ASS效果执行；局部状态没有会话恢复/共享搜索协议。`tests/module-22.test.ts` |
| Database / Columnar / Scientific | `src/viewer/plugins/data/DatabaseViewer.tsx`、`ColumnarViewer.tsx`、`ScientificViewer.tsx` 都复用 `DataViewer.tsx`；DataModel subscribe→provider/schema/page；选dataset、hyperslab维度、逻辑行jump、raw/display copy、sample stats；过滤/Count按provider能力 | 数据库过滤与其他格式loaded sample过滤不能混同；整数统计有意省略以保精度；cache/Rows unknown状态真实。`tests/module-20.test.ts`、`tests/module-20-session.test.ts` |
| Hex / Text fallback | `src/viewer/plugins/hex/HexViewer.tsx`、`textFallback.tsx` 经既有Registry回退；Hex BinaryModel/Rust会话按范围读取、BigInt导航/搜索/Inspector；Text沿已有engine | 保持64位十进制IPC、有界cache、取消、隐藏暂停与只读；不要以统一ScrollArea变成一次性readAll。`tests/module-18.test.tsx`、`tests/text-engine.test.ts` |

### 4.2 已定位的接线缺陷（只记录，不修复）

1. **虚拟标签重新打开复用已关闭源。** `App.tsx:338–344` 的 closeTabs 将完整tab对象放入closedTabs；`App.tsx:91–99` 的documents effect在移除后dispose；reopenTab的虚拟分支直接放回旧tab。`src/vfs/VirtualFileSource.ts` dispose设置released=true并release租约，ensure明确抛出“Virtual file source is closed”。物理分支重新inspect正常，不能把物理重开测试当VFS覆盖。复现：归档内部文件→关闭→Ctrl+Shift+T→读取/预览；断言重新获取源与父lease，而非旧实例。运行复现待验证。
2. **幻灯搜索没有面板级取消。** `PresentationViewer.tsx:264–295` find逐slide调用loadSlide，但token只在循环完成时检查；`407` Close仅setSearch(false)。切换搜索/导航至多丢弃最终结果，不能立即停旧扫描；catch也不按token防迟到error。未来在获准模块增加owned Abort/逐slide检查并保持既有预算。复现many-slides，搜索后Close/导航，观察旧loadSlide次数与错误串线；待执行。
3. **侧栏工作区恢复未接消费端。** `src/workspace/workspace.ts` 持久化sidebarCollapsed；`App.tsx` workspace restore只恢复tabs/active；`src/hooks/useSidebar.ts`读取sessionStorage手动值/1100px自动策略，未消费manifest字段。持久化与恢复分裂，跨新WebView会话待复现；统一全局/工作区scope后再迁移，不直接覆盖M24。

## 5. Focus View 独立审计

结论：**缺失真正独立顶层 Focus Viewer**，不是“已实现但样式不同”。

证据：tauri.conf.json 仅 main；全量检索未发现 `WebviewWindowBuilder`/前端 `new WebviewWindow` 创建链路。App focus 命令只切 `focusMode` → productivity.css `.focus-mode` 隐藏 sidebar/global-bar/inspector；PDF/Office/Image/Media/Geometry/Presentation Focus/Fullscreen 使用 DOM requestFullscreen。Text “Focus source” 仅隐藏结构区。上述能力继续按自身语义保留，不能包装成图 08 独立窗口。

现有不可直接多窗复用的边界：

- `window_chrome.rs` 明确只允许 label=main；`capabilities/main.json` 仅 main。独立窗需要最小专用 capability，不能粗暴放开所有命令。
- lib.rs 的 main page load 会 `close_all` binary/scientific；任意窗口最小化调用 `pause_all`。在多窗场景会干扰另一窗口任务，必须先按 owner/window 隔离。
- `viewerSessionStore`/viewerCommands/DocumentSession 为 JS realm 内 WeakMap，跨 WebView 不共享对象。serialize/transfer 不能把 FileSource、Worker、canvas、函数跨 IPC 传递。
- LaunchQueue 路由固定 main；workspace/关闭确认也固定 App 拥有的 documents；必须明确主窗关闭如何协调 Focus 与未保存编辑。
- PlaybackController 的 subscribers 集合仅当前 JS realm，不能保证两个窗口音频互斥。多窗媒体同步不能靠现有模块级 Set。

独立方案、文件授权/引用计数、生命周期、Esc、窗口位置/DPI、失败恢复见 UI_INTERACTION_SPEC 第 3 节。该方案是后续设计，**本轮没有创建窗口或改权限**。

## 6. 浮层、滚动、状态栏与重复实现

| 项目 | 现状证据 | 判断 |
| --- | --- | --- |
| Tooltip/Dropdown | common/ui.tsx、controls.tsx 独立 Portal、边界/焦点/Esc/清理 | 基础可复用；无统一队列/浮层栈 |
| ContextMenu/Palette/Dialog | shell/ContextMenu.tsx、commands/Palette.tsx、document/dialog.tsx 各自 Portal、键盘、outside | 多套机制；文档确认已有 trap/恢复，须迁移不能丢 |
| Viewer More | ViewerHost details；Image 更多独立 details | 没有公共碰撞/互斥/卸载 owner 模型 |
| 图片浮动工具 | ImageViewer 局部 hide timer，Canvas 上方 controls | 有限悬浮显示，不可拖动/固定；非通用 Floating Toolbar |
| PDF 浮动控制 | PdfViewer/pdf.css 的 pdf-floating-controls | 局部 page/zoom，非统一 PageNavigator |
| 媒体浮控 | MediaViewer 2500 ms hide、onFocus/reveal，真实 controller | 局部实现；不等于跨格式 Media Panel |
| Inspector | ViewerShell rightPanel/Host inspect；另有 App FileInspector details | 重复文件属性层，未统一浮动/停靠/记忆宽度 |
| Scrollbar | M24 system.css 原生 CSS 6/8/10 px、hover/focus 改色、原生 thumb 拖动；Grid/Hex 自己映射 | 可用基础，不满足新增 13 章完整艺术 overlay/hit-area/拖动增强/偏好协议；本轮冻结不改 |
| 状态 | ViewerShell statusBar?: ReactNode；实际 plugin slots 未发现 statusBar 提供者；各插件 footer/内联文本、Host 中文状态标签 | 插槽可复用，缺结构化 StatusProvider、活动 window/tab owner、统一窄屏/Focus 策略 |

滚动容器：sidebar、main、viewer-scroll、pdf-viewport/pdf-thumbnails、text-viewport、Markdown reader/source、Json tree/source、csv-grid、m10-grid、archive-list/archive-results、geometry-tree、data grids、m11-reading、Dialog/Menu/Inspector。不是所有滚动都应交给最外层 main。GridSurface 16,000,000 px 高度压缩，Hex BigInt 分段；滑块 CSS 长度并不直接等于完整逻辑文件长度。需以 virtual engine 为唯一 logical offset 来源。

## 7. Windows、性能、无障碍与语言

- 当前无边框配置早已存在；M24 在制 Chrome 增补 Rust 本窗 Win32 状态/原生系统菜单，Tauri 拖动/八向 resize/窗控，Windows 窗控位于右边，不复制 macOS 三色按钮。
- window-state 插件只恢复 SIZE/POSITION/MAXIMIZED；多显示器断连/混合 DPI/旧屏坐标回收缺少新 Focus 证据。Win11 最大化按钮 hover Snap Layout flyout 未实现；Win+方向/边缘吸附本轮未验证。
- 最低 Windows 版本没有发现正式产品声明/测试矩阵；不能从 Tauri 默认值反推已支持 Win10/旧版本。DPI 由 Tauri/系统管理，未发现完整应用层 UI scale/RTL 配置。
- 中文目前基础 chrome/DEV Showcase 和部分错误文案；App/Viewer 多数英文，locale.ts 非全应用翻译框架。字体系统/CJK 回退存在，Inter 未打包授权字库。既有方形浅蓝 Logo 与参考折叠 Logo 不同，缺独立正式图形/字标资产；保留原资产。
- `useBinaryActivity` 为可见性/最小化事件驱动；Host 默认停载，managed 模型自行 suspend。Geometry dispose GPU/resize listener，Playback dispose src/listener，Controller onCleanup。编辑恢复仍存在 5 秒 interval（仅 dirty 写快照）；不是可宣称“全应用零定时器”。
- 历史 Module23：Win11 i7-10750H/约16 GiB，短期 idle 61.773 s、进程组归一平均 CPU .0358%，最终 owned 进程 0；非旧四核 i5 实机、非30分钟稳定性结论。
- M24 历史日志：TS 818/44 文件、Rust最新日志 83（40+43）；STANDARD JSON 比新 Chrome Rust 变更更早，不能当最终一致快照。browser-runtime 32 项 passed；native-chrome 11 项成功后 Theme select 超时，**整套 failed**；native-close 最新连接超时 failed；安装历史434项早于最新 release 包，不证明当前包验收通过。失败不修、不删，等待恢复该模块授权。
- 本次审计没有运行这些测试。后续须再次冻结版本后做 coherent build/TS/Rust/browser/native/install 测试；目标低配、30分钟、真实触控板、物理125/150/200%DPI、多屏、屏幕阅读器仍待验证。

## 8. 具体视觉差异（非“基本还原”）

| 参考 | 当前差异 | 分类 |
| --- | --- | --- |
| 11 | 方形波纹 Logo，不是折叠蓝标；系统字体，未导入 Inter/完整图标资产 | 资产待提供/预期保留 |
| 02 | 多套弹层、未统一拖动/停靠；无 QuickActions/FloatInspector 等宿主 | 待实施 |
| 01 | 只有桌面关联设置，没有26类设置中心 | 待实施 |
| 03 | CAD 工具在 Host More/结构侧栏，缺 Model/Scene/Materials 三页排版与XYZ方位控件 | 待实施；数据按能力 |
| 04 | 已有网格/选区，右栏统计布局、公式栏/columns 管理与参考不同；XLSX不可编辑 | 待实施/能力限制 |
| 05 | 同文件 split 可用；参考同时三文件并排并非当前工作区；Format不通用于所有源码 | 待实施/能力限制 |
| 06 | 内部文件打开子标签，不是三栏内嵌预览；无虚拟归档写回动作 | 待实施/能力限制 |
| 07 | 没有Recent Media左列表/关键帧/转录/元数据编辑 | 待实施/缺服务 |
| 08 | CSS/DOM全屏，不是独立Focus窗口 | 阻断缺口 |
| 09 | PDF阅读存在，通用文件操作/Comments/Tags/描述缺对应业务 | 待实施/缺服务 |
| 10 | hero、布局、类别、欢迎文案仍旧；没有参考大拖放卡/QuickShortcuts/Favorites | 待实施 |
| 全部 | Windows右上窗控而非红黄绿点 | Windows预期不同 |

## 9. 审计结论与下一步门禁

可以保留格式检测、FileSource/VFS、Registry/Controller/资源作用域、现有渲染器、文档安全保存和命令注册基础；改造应围绕真实 App/ViewerShell 接线。优先解决发布来源可追溯、Module24冻结验收状态、命令 owner、多窗口资源归属，再迁移共享浮层/状态栏/滚动与页面。

仓库与两份新资料没有提供 Module25–35 的正式逐号职责表，只有“以既定计划为准”。因此实施计划明确列出逐模块槽位和待映射工作包，**不把猜测编号写成正式决定**。确认既定编号及 Module24 的恢复验收安排后，才执行下一批；本轮仅交付文档。

## 10. 历史证据与本轮验证口径

| 证据 | 实际用途 / 限制 |
| --- | --- |
| `docs/qa/module-24-suite-typescript.log` / `module-24-suite-rust.log` | 冻结前TS/Rust输出；不代表本轮执行或最终一致构建 |
| `docs/qa/module-24-suite-standard.json` | 时间早于最新Chrome变更；不能单独签收M24 |
| `docs/qa/module-24/browser-runtime.json` | DEV基础控件/Showcase历史32项；CSS zoom/DPR模拟不能替代物理DPI |
| `docs/qa/module-24/native-chrome-runtime.json` / `native-close-runtime.json` | 当前保留的是失败结果；原生窗控前11项成功不等于整套passed |
| `docs/qa/module-24/native-light-normal.png` / `native-light-maximized.png` | 冻结前真实主窗截图，显示旧Home布局；不是本轮新截图 |
| `docs/qa/module-24/showcase-light.png` / `showcase-dark.png` | DEV展示页的历史图，不能证明生产页面已换布局 |
| `docs/qa/module-23-verification.md` | 历史进程/CPU/资源数值与局限；不能替代低配机器或30分钟结论 |
| `docs/ui-audit/audit-validation.json` | 本轮仅文档/路径/哈希完整性结果；不是应用测试通过凭据 |

四份主文档外附Runtime Map、Gaps/Priority、955项以上同源CSV/JSON、参考图索引和冻结校验。可重复运行 `node docs/ui-audit/build-matrix.cjs` 与 `node docs/ui-audit/validate-audit.cjs` **仅更新审计文档**；它们不导入应用、不执行测试、不构建、不修改Module24。源码路径和测试文件存在性校验不能证明控件语义测试覆盖。
