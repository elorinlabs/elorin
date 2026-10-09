# Elorin UI 分批实施计划（审计交付，未执行）

本轮只生成文档。Module24冻结，Module25未启动。Master Spec 10/15章要求以仓库正式计划为准；全量检索现有docs/README未发现Module25–35逐号职责文件。不能擅自为编号重新定义需求。

## 1. 编号安排与明确缺失

| 正式模块槽位 | 已知范围 | 本轮安排 |
| --- | --- | --- |
| 24 | Design System & Window Chrome；在制 | 保留现有改动/失败日志，等待用户另行恢复原验收范围；不并入新增scroll/status/Focus业务 |
| 25 | 正式职责未提供/待核对 | 从下列工作包映射，用户确认既定名称前不开发 |
| 26 | 同上 | 同上 |
| 27 | 同上 | 同上 |
| 28 | 同上 | 同上 |
| 29 | 同上 | 同上 |
| 30 | 同上 | 同上 |
| 31 | 同上 | 同上 |
| 32 | 同上 | 同上 |
| 33 | 同上 | 同上 |
| 34 | 同上 | 同上 |
| 35 | 同上 | 同上 |
| 36 | Master Spec明确最终安全/性能/视觉/兼容/安装/更新/语言/无障碍/隐私整体验收 | 汇总所有已授权模块，缺阻断项不可宣称发布完成 |

以下工作包编号W为审计拆分，**不是替代Module编号**；可按既定职责合并/拆分。每个模块开发前将对应W及矩阵行ID写入该模块正式范围，避免Module24冲突和越界。

## 2. 安全迁移依赖

`Module24冻结验收/版本基线 → W1真实AppShell与命令owner → W2资源/窗口隔离 → W3独立Focus`。

`W1 → W4共享浮层 → W5 Scrollbar / W6 ContextStatus → W7–W11各类页面`；`W12 Settings/schema + W13语言/无障碍`贯穿已具消费者的功能；`W14安装/更新/协议`在相关接口获准后进行；最后Module36。Settings不能先生成一堆不生效开关。Focus不能先创建窗再补资源隔离。

## 3. 工作包、修改点与完成标准

| 包 | 具体文件/共享组件 | 后端接线与依赖/风险 | 功能/视觉/性能验收与完成标准 |
| --- | --- | --- | --- |
| W0 来源与M24合并门禁 | main.tsx、tauri.conf.json、build脚本只在获准发布批次；冻结清单与M24日志 | 不修旧package假装新包；源码、dist、exe、NSIS身份链；无.git需建立可恢复版本基线 | M24在制范围独立通过TS/Rust/browser/native/installer，同构建hash截图；失败保留；否则不合并依赖迁移 |
| W1 AppShell/Home/标签/命令 | app/App.tsx、routes.ts、pages/home/Home.tsx、shell/Sidebar.tsx、ViewerShell.tsx、commands/registry.ts/viewer-bridge.ts、workspace.ts | 保留choose/inspect/closeTabs/128上限/recent；抽共享Shell/TabStrip/ViewerToolbar/PanelDock；Command加owner/disabledReason；不重写加载器 | 图10/11结构比例；Open/New/Recent/QuickOpen/CtrlTab/Close/reorder/恢复/取消；占位分类不伪成功；窄窗内容可达；异步100标签不串线 |
| W2 多窗资源边界 | src-tauri/src/lib.rs、file_io.rs或实际file_io模块、binary/、scientific/、archive/、media/、productivity/mod.rs；viewer/core/types/controller/session | 新owner租约表；把close_all/pause_all分为window-owned操作；权限新label最小授权；窗口destroy兜底；总资源预算 | 一窗reload/minimize/close不影响另窗；VFSparent引用不提前销毁；未授权path拒绝；异常close/crash/迟到cleanup幂等；计数归零 |
| W3 独立Focus | main.tsx角色入口、建议FocusWindow组件/窗口服务、windowAdapter.ts/window_chrome.rs、capabilities、各Viewer snapshot adapters | 依赖W2；Rust创建顶层窗，一tab一窗复用；白名单DTO≤64KiB；dirty初版拒绝/Save后进入；不共享model或任意路径 | 图08真实OS窗；PDF第7页125%继承；主/子关闭策略、Esc、fullscreen、顶栏locks、search/thumb/zoom；真实混合DPI；退出无孤儿进程 |
| W4 Floating Layer Manager与通用组件迁移 | common/ui.tsx/controls.tsx、shell/ContextMenu.tsx、commands/Palette.tsx、document/dialog.tsx、ViewerHost More、Image/PDF/Media局部浮层；新增共享OverlayHost/定位器 | 依赖W1，保留真实handler、documentChoice trap；统一owner/stack/collision/returnFocus/drag/pin/insets；使用M24tokens不重写 | 图02/11八浮窗按能力；Esc只关一层、modal inert、outside不误提交、边界/DPI、切tab自动关闭、无重复listener/idleRAF；屏幕阅读器待实测 |
| W5 Scrollbar System | 共享ScrollArea/metrics adapter；后续模块专用样式，避免改冻结M24；PDF/Text/JSON/Markdown/GridSurface/Hex/Archive/Geometry容器逐个接入 | 依赖W4；native fallback；Grid scale/HexBigInt唯一映射；不改解析读取或全局wheel；overlayprototype先通过再迁移 | 第13章全输入/双轴/嵌套/track/drag/锚点；3–4到7–9px视觉+大命中区；forcedcolors/always；2^31模拟与>4GiB sparse；DOM/缓存有界；真实touchpad/DPI |
| W6 Contextual Status Bar | viewer/core/types、ViewerShell/ViewerHost、各plugin status adapter、DocumentSurface/editor adapter、CompareView；新增StatusProvider/Host | 依赖W1/W4；读取现有page/selection/progress/model事件，不建第二状态源；window/tab/generation隔离；节流而非轮询 | 第14章各Viewer真实字段，错误/dirty优先，Settings无底栏，Media不重复，Focus浮动不抖动；切tab迟到结果丢弃；隐藏/退出解绑；长文案/200% |
| W7 PDF/Office/Image阅读页面 | plugins/pdf/PdfViewer/pdf-engine、office/OfficeViewer、image/ImageViewer/Inspector、publishing/EpubViewer；共用Toolbar/Inspector/Thumb适配 | 依赖W4–6；复用引擎、page/zoom/search；Office/PDF只读限制；Image安全SVG/related；不增加PDF编辑假按钮 | 图09/02布局、长页virtual render、页码/fit/rotation/search/密码/失败/权限；图像pan/rotate/zoom/复制与动画隐藏；切窗/退出缓存释放 |
| W8 Code/Text/Markdown/JSON | plugins/text/TextViewer/Inspector、markdown Reader/Source/Outline、json Viewer/Tree/Search、document/DocumentSurface/EditorSearch/save-service | 现有文本索引/worker、JSONvalidator、safe-document；实现能力显式；2MiBUTF8编辑限制保留；不可把多文件三栏静态布局硬编码 | 图05单文件多模式/多tab状态；Find/copy/wrap/line/relativeimage安全；Format只具实际formatter格式；dirty/save/conflict/恢复/IME；大文本不全载 |
| W9 CSV/Workbook/Scientific | csv/CsvViewer/Grid/Inspector/query、spreadsheet/SpreadsheetViewer/model、shared/GridSurface/virtual-grid、data/DataViewer | 保留rowSource/sparse engine；Columns/Filter/Sort/Stats走现有projection；XLSX只读缓存公式；CSVEditor安全保存分离 | 图04选区/公式或值/列开关/统计标注sampled/encoding/delimiter；大文件快速滚动/跳行/双轴，DOM有界；不修改源；footer迁移W6 |
| W10 Archive/VFS | ArchiveViewer/Model、NativeArchiveBackend、BrowserArchiveBackend、src/vfs、Rust archive | 依赖W2/W4–6；三栏preview新childowner复用ViewerHost；按需lease；只读内部写操作禁用；解压复用现有安全接口 | 图06树/面包屑/search/selection/preview/元信息/Extract；恶意路径/bomb/password/CRC/cancel/conflict；parentclose/切preview晚结果；释放childsession |
| W11 Media/3D专业页面 | MediaViewer/PlaybackController/media-source、GeometryViewer/render-engine/model/capabilities；共享Inspect tabs | 依赖W2–6；单播放owner跨窗协议；GLB/STEP能力派生；frame/transcript/crop缺服务不补假数据，新增专业能力另授权 | 图07/03布局真实metadata/material/scene/模型单位；play/seek/subtitle/codec错误/最小化；CADcamera/select/wire/质量/GPULost/退出；低配硬件复测 |
| W12 Settings中心 | platform/IntegrationSettings.tsx、integration.ts、App settingsroute；建议SettingsSchema/Store/各类Section | 复用productivity_read/write settings预算；逐key消费者/默认/validator/scope/restart；现有theme/sidebar迁移兼容；不替代系统defaultapp语义 | 图01所有26分类逐项矩阵；无能力hidden/disabled+理由；即时/重启标识、恢复默认、导入迁移损坏配置；旧key兼容；长设置滚动/中文 |
| W13 图标/语言/区域/无障碍 | design-system/Brand/locale/typography、formats/presentation、各文案/commands labels | 等待正式Logo/字体授权；统一locale schema系统识别/覆盖/CJK/RTL；扩大命中/对比/reducedmotion参数；不导入1230图标无谓内存 | 图11资产无重绘；英文/中文长文案/键盘/读屏/RTL/字体200%/高对比/真实DPI；所有操作有名称；主题不卸载Viewer |
| W14 安装/更新/隐私/法律 | src-tauri/installer/hooks.nsh、productivity/associations、IntegrationSettings、受批准更新服务/协议资源 | 复用NSIS per-user/portable/默认应用归属；更新签名/回滚设计获准后实现，当前无updater不造“最新”结果；诊断脱敏 | 安装/升级/卸载UserChoice不变、路径/关联/无agent残留；真实版本一致；许可/隐私文本有来源；网络权限/失败/取消可见 |

W2提到file_io的确切文件落点以实际模块为准，当前已核查为 `src-tauri/src/file_io.rs`；后续开发必须以冻结后文件树再次确认。建议新增组件名称是逻辑职责，允许沿现有目录组织，不能为满足命名复制平行服务。

补充已定位缺陷的最小修复落点：W1在 `src/app/App.tsx` / `src/hooks/useSidebar.ts` / `src/workspace/workspace.ts` 统一sidebarCollapsed恢复；W2在 `App.tsx` reopenTab / `src/services/virtualResource.ts` / `src/vfs/VirtualFileSource.ts` 使用重新获取的租约，不能解除released保护；W7在 `src/viewer/plugins/presentation/PresentationViewer.tsx` / `presentation-model.ts` 接搜索取消与迟到错误owner检查。需要先保留失败用例，禁止放宽源关闭/搜索断言绕过问题。

未展开的Viewer共享迁移必须包含 `src/viewer/plugins/publishing/EpubViewer.tsx`（chapter/progress/toc/search）、`src/viewer/plugins/email/EmailViewer.tsx`（rich/plain/header/attachment child）、`src/viewer/plugins/media/subtitle.plugin.tsx`（cue/raw/jump）、`src/viewer/plugins/data/DataViewer.tsx` 及 `DatabaseViewer.tsx` / `ColumnarViewer.tsx` / `ScientificViewer.tsx`（provider/page/sample/count）。W7承接Office/EPUB/Email阅读，W9承接数据，W11承接字幕；只迁移壳与owner/状态/滚动接线，不扩大格式解析能力。

## 4. Settings逐key落地规则

矩阵列出全部可见设置控件；开发每项填写正式key、类型、默认、合法范围、scope（global/window/viewer）、保存时机、消费者函数、迁移策略、重启需求、reset。已存在theme=`prism-theme`、sidebar=`prism.sidebar`需核实兼容，workspace/recent为productivity key；不要直接把设计示例“50tabs/4space/1000results”当现有默认。目录搜索/更新/转录/视频质量等缺真实能力的选项应注明能力前置，不能仅写localStorage称完成。

## 5. 每批验收方法

1. 冻结前后diff/哈希，正式Module范围和矩阵row IDs；Module24相关文件只读等待合并点。新批不自动修邻域功能。
2. UI→command→service→backend→状态/错误每条链有测试；控件各状态、取消、IME、焦点、权限/不可用、标签/窗口串线必须覆盖。
3. **真实生产入口**构建身份链；实际桌面normal/maximized/narrow、light/dark/system、中英文、真实DPI/多屏截图。参考对应图11→02→目标页面；先布局/内容面积再字体/色彩，差异逐条列预期/缺陷/限制。
4. `pnpm exec vitest run --maxWorkers=2`、`cargo test -j1`（src-tauri）、`pnpm build`，现有 `node scripts/module-23-regression.cjs STANDARD`；窗口套件以新owner/profile隔离，不能与用户常用app混用。命令是后续方法，**本轮未执行**。
5. 实机性能：约2015–2016四核i5/8GiB/集显/SATA条件；启动、theme switch、90/300帧滚动、快速跳转、100tab、minimize/resume、30minidle+30mincycle；记录CPU归一口径、owned进程/WS/private/heap/Worker/GPU可计数资源，不能仅瞬时RSS判断泄漏。旧机器不可用时可提供可复现方法，但结论仍待验证，不以4x throttle冒充。
6. 大文件用sparse/函数source（100MiB/1GiB/>4GiB），无同大小实际写盘；sharedcache明确上限，退出ownedtasks/sessions/进程归零；驱动显存无法计数如实标未验证。
7. `pnpm tauri build --bundles nsis` 后测试同一SHA256安装包；复用module16-installer-qa的隔离目录/注册前置，安装卸载不改UserChoice；未执行不得通过。

## 6. Module36发布门禁

所有页面矩阵条目达到：已接线且验证，或明确产品批准不适用/能力限制；broken项不可被“视觉接近”掩盖。Focus第7页链、浮层焦点/互斥/卸载、Scrollbar全输入、真实ContextStatus、多窗资源隔离、低配30min/物理DPI/多屏、格式安全回归、安装升级/更新签名/法律隐私均有实证。缺项列表保留，而非把参考稿装饰按钮全部做成可点假功能。

本轮结束等待审计确认和既定Module25–35职责表；不会自行选模块实施。若正式表已在其他位置，下一步先补编号映射，无需重做本次已完成调用审计。
