# Elorin 当前 UI 运行映射

日期：2026-10-09。根目录 D:/Prism。仅源码审计和有限真实运行检查；历史 docs/UI_RUNTIME_MAP.md 已过时，本文件为本轮结论。Git status/branch/diff 均失败：目录没有 .git，不能说明工作树干净或 Module24 已验收。源码冻结证据见 docs/ui-audit/current/source-before.json 与 source-verification.json。

## 入口与生产组件

`index.html → src/main.tsx:3/12–17`：DEV 且 pathname 为 `/__qa/design-system` 才加载 Showcase；`?window=focus` 加载 FocusWindow；其余 App。正常首页和设置已实测，绝非仅修改展示页。此次原生测试用现有 debug exe，实际 URL 为 `http://127.0.0.1:1420/`，属于真实 Tauri 窗口加载当前开发前端，不能写成生产打包包体已验证。

`src/app/App.tsx:445–后段 → Sidebar → Home / FileLibrary / SettingsCenter / CompareView / DocumentSurface → ViewerHost`。`ViewerHost.tsx:82–86 → ViewerShell → plugin.render(props)`；Controller/registry resolve/adapt 后由 builtins.registerLazy 懒加载解析插件。保存沿用 DocumentSurface/session/save-service → document_save，不修改格式引擎。

|参考|当前生产组件|实际数据/业务|
|---|---|---|
|01|src/platform/SettingsCenter.tsx:13|26分类；ui-settings/integration；完整翻译和多项全局设置仍不可用|
|02|components/common/ui、controls、FloatingPanel、ScrollbarSystem；shell/ContextMenu、PrismTitleBar|受控控件、真实命令/焦点/窗口适配；通用组件存在不证明删除/分享等业务存在|
|03|viewer/plugins/geometry/GeometryViewer、geometry.plugin、render-engine|Three.js/模型解析/场景材质数据；CAD支持级别按具体适配器|
|04|csv/CsvViewer、CsvGrid、CsvInspector；spreadsheet/SpreadsheetViewer；shared/GridSurface|索引/虚拟网格/选择/显示列；只读工作簿不能当公式重算|
|05|text/TextViewer、markdown/MarkdownViewer、json/JsonViewer；document/DocumentSurface|FileSource/安全AST/解析与编辑会话；真实保存能力有格式和大小边界|
|06|archive/ArchiveViewer、archive-model、NativeArchiveBackend；src-tauri/src/archive|VFS按需预览与解压；解压不是归档重命名/改写|
|07|media/MediaViewer、PlaybackController、media-source；src-tauri/src/media.rs|真实HTML媒体状态/授权协议；关键帧/转录仍缺|
|08|services/focusWindow.ts:6 → focus.rs:16 → pages/focus/FocusWindow.tsx:18 → ViewerHost|独立 WebviewWindow；初始会话快照与独立模型|
|09|pdf/PdfViewer、pdf-engine、pdf.plugin|PDF.js范围读/渲染/搜索；搜索、页码、缩放浮层复用同一引擎|
|10|pages/home/Home.tsx → App回调|最近记录/收藏/真实文件打开，不是全磁盘索引|
|11|design-system/tokens、typography、Brand、system.css；workspace/reference.css|既有品牌资产与格式图标；Showcase只是开发规格展示|

## Viewer 注册和格式边界

src/viewer/builtins.ts 的懒注册包括 subtitle、hex、mesh、cad、scene、cad-drawing、archive、audio、video、ebook、email、spreadsheet、presentation、pdf、office-document、core.text-fallback、core.binary-fallback、markdown、json、csv、image，另按数据格式动态注册插件。注册 supportedTypes 不等于所有格式完整预览；具体以 formats/runtime.json、registry/adapters 和 plugin 能力为准。未在参考图展开的专业 Viewer 不删除。

## CSS 导入与覆盖

静态模块依赖 App 首先引入 workspace/productivity.css；main 依次导入 styles.css、foundation.css、design-system/system.css、workspace/reference.css。不能仅按 main 文本顺序忽略其 App 依赖。运行时实际 Vite style 顺序已保存在 status-probe.json 的 cssOrder；懒加载插件样式可能随后加入，需再按具体 selector 的 specificity、!important、媒体条件和 source order 决定优先级。

所有当前 CSS：workspace/{productivity,reference}.css，styles.css，foundation.css，design-system/{system,showcase}.css，viewer/plugins/module11.css，pdf/pdf.css，office/{module10,office}.css，image/image.css，geometry/geometry.css，text/text.css，csv/csv.css，data/data.css，hex/hex.css，json/json.css，archive/archive.css，markdown/markdown.css。对应 plugin 或组件 import 已检索；showcase.css 仅开发预览。插件 CSS 经动态 import 到达真实 Viewer。

|选择器|主要重叠来源|本轮真实生效证据|
|---|---|---|
|.app-shell|styles多处、foundation:42、system:16、reference:1/36|原生主窗 display:flex，1440×1000，overflow:hidden|
|.sidebar|styles多处、foundation:102/457、system:17及响应式、reference|主窗宽194，高942；background color(srgb …)，overflow hidden auto|
|.workspace|foundation:107、system:22、reference|主窗宽1208，display:flex，overflow:hidden|
|.viewer-content|foundation :is规则、各plugin、reference:43|Focus flex；y212.5，高566，overflow:auto|
|.viewer-status|各slot、reference:43|Focus display:none，矩形0；组件还返回null|
|.focus-window|reference:31/36/43|1200×850 flex背景rgb(238,246,255)|
|.focus-top-controls|reference:31|relative，高65；隐藏仅opacity0/pointer-events none，保留布局|
|.art-scrollbar / .floating-panel|reference:29/33|固定层21/50；各坐标详见 native-report.json|

这是 getComputedStyle 的真实结果，字体字符串是候选字体栈，不证明机器实际安装/命中 Inter。未导出每条 matched rule 的浏览器 CSSOM 来源；可追溯导入顺序加源码选择器，不宣称完整级联调试器验收。

## 旧 UI 没变化的结论边界

已证实：Showcase入口与App隔离；旧 docs 审计把 Settings/Focus/Scrollbar/Status 判为缺失，已与当前源码冲突；本轮 debug exe 连接开发地址而非 tauri.localhost 包体；多CSS层确有相同选择器；新App主窗真实可达。因此只改Showcase不会更新App，运行旧安装exe也不会因写规格或更新dist自动更新内嵌资源。当前原生截图已经呈现新App，不能断言“目前仍旧版”。历史缓存/旧安装包/用户当时进程的唯一根因缺少当时exe hash和入口证据，尚不能定案。

## 窗口、资产与品牌

tauri.conf.json productName=Elorin、identifier=app.prism.desktop，main 1440×1000、min900×650、decorations=false、GPU compatibility args含disable-gpu/disable-gpu-compositing。Focus创建1200×850、min640×480、非强制全屏；window_chrome.rs校验main或有效focus UUID；capabilities/focus.json独立授权。主窗销毁清理自身owner并销毁Focus子窗（lib.rs:104–107）。

public/assets/logo.png、格式图标、src-tauri/icons/icon.{png,ico,icns} 和 vendor WASM/资源实际存在；Brand.tsx:3明确参考折叠标志独立原始资产未提供。11张参考PNG来自指定ZIP，见reference-verification.json。Inter仅候选回退栈，未验证独立字体包。prism-theme、prism.sidebar.collapsed、prism-media/prism-vfs/prism-science及app.prism.desktop为兼容标识，迁移须逐一处理设置目录、单实例、关联、协议CSP/ACL及旧记录，审计不重命名。

最低Windows支持版本未找到明确产品承诺，不能由Tauri版本推断最终支持；多屏/DPI、系统高对比度、读屏器、2015 i5硬件均未验收。
