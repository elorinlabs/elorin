/* Documentation-only audit inventory. Never imports or changes application code. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const statuses = { I:'已实现且已正确接入', U:'已实现但 UI 未接入', P:'部分实现', M:'尚未实现', N:'当前模块不适用', B:'存在缺陷，需要修复' };
const evidence = {
 app:['src/app/App.tsx','function App','src/services/fileLoader.ts','src/services/fileSource.ts','src-tauri/src/commands.rs'],
 home:['src/pages/home/Home.tsx','function Home','src/services/recentFiles.ts','src/app/routes.ts'],
 settings:['src/platform/IntegrationSettings.tsx','IntegrationSettings','src/platform/integration.ts','src/app/App.tsx'],
 theme:['src/hooks/useTheme.ts','useTheme','src/hooks/useSidebar.ts','src/design-system/tokens.ts'],
 chrome:['src/components/shell/PrismTitleBar.tsx','PrismTitleBar','src/services/windowAdapter.ts','src-tauri/src/window_chrome.rs','src-tauri/tauri.conf.json'],
 shell:['src/components/shell/Sidebar.tsx','Sidebar','src/app/routes.ts','src/components/shell/ContextMenu.tsx','src/commands/registry.ts','src/commands/viewer-bridge.ts'],
 host:['src/viewer/components/ViewerHost.tsx','ViewerHost','src/viewer/components/ViewerShell.tsx','src/viewer/core/types.ts','src/viewer/core/controller.ts','src/viewer/core/session.ts'],
 controls:['src/components/common/controls.tsx','export const Input','src/components/common/ui.tsx','src/design-system/Showcase.tsx'],
 dialog:['src/document/dialog.tsx','DocumentDialog','src/commands/Palette.tsx','src/components/shell/ContextMenu.tsx'],
 document:['src/document/DocumentSurface.tsx','DocumentSurface','src/document/session.ts','src/document/save-service.ts','src/document/validation.ts','src-tauri/src/document/mod.rs'],
 search:['src/search/SearchSurface.tsx','SearchSurface','src/search/providers.ts','src/document/EditorSearch.tsx'],
 compare:['src/compare/CompareView.tsx','CompareView','src/compare/diff.worker.ts'],
 pdf:['src/viewer/plugins/pdf/PdfViewer.tsx','PdfViewer','src/viewer/plugins/pdf/pdf-engine.ts','src/viewer/plugins/pdf/pdf.plugin.tsx'],
 text:['src/viewer/plugins/text/TextViewer.tsx','TextViewer','src/viewer/plugins/text/TextInspector.tsx','src/viewer/plugins/text/text-model.ts'],
 markdown:['src/viewer/plugins/markdown/MarkdownViewer.tsx','MarkdownViewer','src/viewer/plugins/markdown/markdown-model.ts','src/viewer/shared/safe-document.tsx'],
 json:['src/viewer/plugins/json/JsonViewer.tsx','JsonViewer','src/viewer/plugins/json/JsonInspector.tsx','src/viewer/plugins/json/json-model.ts'],
 csv:['src/viewer/plugins/csv/CsvViewer.tsx','CsvViewer','src/viewer/plugins/csv/CsvGrid.tsx','src/viewer/plugins/csv/CsvInspector.tsx','src/viewer/plugins/csv/csv-query.ts'],
 sheet:['src/viewer/plugins/spreadsheet/SpreadsheetViewer.tsx','SpreadsheetViewer','src/viewer/plugins/spreadsheet/spreadsheet-model.ts','src/viewer/shared/GridSurface.tsx'],
 archive:['src/viewer/plugins/archive/ArchiveViewer.tsx','ArchiveViewer','src/viewer/plugins/archive/archive-model.ts','src/viewer/plugins/archive/NativeArchiveBackend.ts','src/vfs/VirtualFileSource.ts','src-tauri/src/archive/mod.rs'],
 media:['src/viewer/plugins/media/MediaViewer.tsx','MediaViewer','src/viewer/plugins/media/PlaybackController.ts','src/viewer/plugins/media/media-model.ts','src/viewer/plugins/media/media-source.ts','src-tauri/src/media.rs'],
 geometry:['src/viewer/plugins/geometry/GeometryViewer.tsx','GeometryViewer','src/viewer/plugins/geometry/render-engine.ts','src/viewer/plugins/geometry/geometry-model.ts','src/viewer/plugins/geometry/geometry.plugin.tsx','src/viewer/plugins/geometry/adapter.ts'],
 image:['src/viewer/plugins/image/ImageViewer.tsx','ImageViewer','src/viewer/plugins/image/ImageInspector.tsx','src/viewer/plugins/image/image-model.ts'],
 integration:['src/platform/integration.ts','platformIntegration','src/platform/IntegrationSettings.tsx','src-tauri/src/productivity/mod.rs','src-tauri/src/productivity/associations.rs'],
 formats:['src/viewer/builtins.ts','register','src/formats/presentation.ts','src/formats/runtime.json','src/viewer/core/registry.ts'],
 visual:['src/design-system/tokens.ts','export','src/design-system/typography.ts','src/design-system/Brand.tsx','src/design-system/system.css','src/foundation.css','src/styles.css'],
 scroll:['src/foundation.css','scrollbar','src/viewer/shared/virtual-grid.ts','src/viewer/plugins/hex/HexViewer.tsx','src/viewer/components/ViewerShell.tsx','src/viewer/core/types.ts'],
 locale:['src/design-system/locale.ts','export','src/components/shell/PrismTitleBar.tsx','src/design-system/typography.ts'],
 binary:['src/viewer/plugins/hex/HexViewer.tsx','HexViewer','src/viewer/plugins/hex/binary-model.ts','src-tauri/src/binary.rs'],
 activity:['src/viewer/core/controller.ts','export','src/viewer/core/session.ts','src-tauri/src/lib.rs','src/viewer/plugins/media/PlaybackController.ts'],
};
const profiles = {
 app:['App.choose/inspect/newDocument/closeTabs（按下方说明）','fileSelection → load_file/read_file_range → FileAccess','documents/tabId/activeFile/request generation','W1'],
 home:['Home 回调 → App 打开/路由/最近服务','recentFiles → productivity_read/write；文件打开同 App','Home files/error；App route','W1'],
 settings:['App settings 分支仅挂 IntegrationSettings；本控件未发现消费者','productivity settings 存储接口存在，非设置消费者证明','无本项全局 key/schema/生效状态','W12'],
 theme:['useTheme/setTheme；useSidebar/toggle','无 IPC；主题 localStorage prism-theme；侧栏 sessionStorage prism.sidebar.collapsed','theme/system media query；sidebar manual/auto','W12'],
 chrome:['PrismTitleBar → windowAdapter','window_chrome_* → window_chrome.rs/main guard → Win32/Tauri','maximized/focused/error，事件订阅+revision','W0'],
 shell:['Sidebar/ContextMenu → App commands','commands registry/viewer bridge；实际文件服务按命令','App route/tabId；菜单 owner/焦点','W1'],
 host:['ViewerHost capability/action → controller/registry','FileSource → 对应 plugin/model；失败诊断/Hex','session/generation/AbortSignal/ResourceScope','W1'],
 controls:['共享控件 onChange/onClick；按页面接业务','通用控件自身无业务 IPC','受控 value/checked；局部 Portal/menu 状态','W4'],
 dialog:['documentChoice/Dialog；Palette/ContextMenu 各自事件','保存见 document；通用 Dialog 自身无文件写服务','request queue/focus trap；各自 menu state','W4'],
 document:['DocumentSurface/session → saveDocument/choice','document_save + fingerprint；browser Save As download','dirty/undo/revision/conflict/recovery；UTF-8≤2MiB','W8'],
 search:['SearchSurface/provider.search/navigateTo；EditorSearch','当前文件/已打开 tabs；非磁盘目录索引','query/AbortController/180ms debounce/hits','W8'],
 compare:['CompareView → worker/同步滚动','diff.worker（文本≤4MiB/文件）；有界图像 URL','sources/options/Abort/worker timeout','W8'],
 pdf:['PdfViewer go/zoom/fit/search/rotate + registeredActions','pdf-engine → PDF.js → FileSource ranges','pdfPage/Scroll/Zoom/Fit/Rotation/Query/Panel','W7'],
 text:['TextViewer → model/index/search/selection','text-model/worker → FileSource ranges','session text metadata、selection/encoding/EOL/index','W8'],
 markdown:['MarkdownViewer mode/outline/reader/source','markdown-model + safe-document + authorized related resource','mode/read/source scroll；safe AST','W8'],
 json:['JsonViewer mode/search/tree/copy','json-model 有界解析；剪贴板','tree/source/split + expansion/selection/search','W8'],
 csv:['CsvViewer select/projectRows/searchRows/patch','csv-model rowSource + csv-query；只读 projection','csvSelection/csvSort/csvFilter/csvWidths；loaded prefix','W9'],
 sheet:['SpreadsheetViewer → sheet/select/search/GridSurface','spreadsheet-model/worker；已保存公式与值','sheet/selection/search；只读','W9'],
 archive:['ArchiveViewer navigate/open/extract/search','archive-model → backend → archive IPC/VFS resource lease','history/selection/search/ExtractStatus/Abort','W10'],
 media:['MediaViewer → PlaybackController → HTMLMediaElement','media-source → register_media_source/prism-media 或 VFS','snapshot/time/volume/rate/tracks；局部 controls timer','W11'],
 geometry:['GeometryViewer action → render-engine/model','parser.worker + Three.js；FileSource/resource resolver','camera/selection/hidden/measure/quality；active/dispose','W11'],
 image:['ImageViewer fit/commit/copy/drag/key','image-model/FileSource/安全解码；clipboard capability','zoom/pan/rotation/fit/animation；局部浮动控件','W7'],
 integration:['IntegrationSettings → platformIntegration','platform_capabilities/default_apps/association_health/productivity_*','capabilities/health/busy/error；Windows UserChoice边界','W14'],
 formats:['builtins → registry.resolve/adapt','既有 detection/format catalogue + plugin capabilities','descriptor/diagnostics/format support level','W1'],
 visual:['main.tsx 导入样式 → applyTokens；Brand/Icon 实际使用','无业务 IPC；现有品牌/图标资产','dataset theme/CSS variables/responsive/forced-colors','W0'],
 scroll:['既有 overflow/native scrollbar + 各虚拟 viewport','已有模型范围读取；未发现共享 overlay ScrollbarManager','真实 scrollTop/Left；Grid scale/Hex BigInt 分段','W5'],
 locale:['useUiLanguage/chromeLabels；其余文案未全量接入','无全局语言/区域 IPC','elorin-ui-language；仅 Chrome/Showcase 范围','W13'],
 binary:['HexViewer/BinaryModel read/search/selection','binary_* → BinarySessions → local/VFS','BigInt offset/decimal IPC/bounded cache/Abort','W9'],
 activity:['controller active/dispose + lib window events','binary/scientific pause_all/close_all；media suspend','owner generation；当前单 main 全局生命周期','W2'],
};
const existingTests={app:['tests/app.test.tsx','tests/module-16.test.tsx'],home:['tests/app.test.tsx'],settings:['tests/module-16.test.tsx'],theme:['tests/module-24.test.tsx'],chrome:['tests/module-24.test.tsx','tests/module-24-native-chrome.cjs','tests/module-24-native-close.cjs'],shell:['tests/module-16.test.tsx','tests/module-24.test.tsx'],host:['tests/viewer-host.test.tsx','tests/viewer-lifecycle.test.ts','tests/viewer-registry.test.ts'],controls:['tests/module-24.test.tsx'],dialog:['tests/module-15-dialog.test.tsx'],document:['tests/module-15.test.ts','tests/module-15-dialog.test.tsx'],search:['tests/module-16.test.tsx'],compare:['tests/module-14.test.ts'],pdf:['tests/pdf-engine.test.ts'],text:['tests/text-engine.test.ts','tests/text-viewer.test.tsx','tests/module-19-source.test.tsx'],markdown:['tests/markdown-viewer.test.tsx','tests/markdown-resources.test.ts'],json:['tests/json-viewer.test.tsx','tests/json-parser.test.ts'],csv:['tests/csv-viewer.test.tsx','tests/csv-parser.test.ts'],sheet:['tests/module-10.test.ts'],archive:['tests/module-12.test.ts','tests/module-13.test.ts'],media:['tests/module-22.test.ts','tests/module-23.test.tsx'],geometry:['tests/module-21.test.ts'],image:['tests/image-core.test.ts','tests/image-model.test.ts'],integration:['tests/module-16.test.tsx'],formats:['tests/module-17.test.tsx','tests/module-22-matrix.test.ts'],visual:['tests/module-24.test.tsx'],scroll:['tests/module-24.test.tsx','tests/module-18-performance.test.ts'],locale:['tests/module-24.test.tsx'],binary:['tests/module-18.test.tsx'],activity:['tests/viewer-lifecycle.test.ts','tests/module-20-session.test.ts']};
const rows=[];
function add(ref,region,control,status='M',key='settings',detail='',event,backend,state,test,owner){
 const p=profiles[key];
 rows.push({ref_image:ref,page:({ '01':'Settings Center','02':'UI Components','03':'3D CAD Viewer','04':'Spreadsheet CSV Viewer','05':'Code & Text Viewer','06':'Archive Viewer','07':'Media Viewer','08':'Focus View','09':'PDF Document Viewer','10':'Home Screen','11':'Design System' })[ref],region,control,user_intent:control,interaction:event||p[0],existing_runtime_component_path:evidence[key][0],backend_service_path:backend||p[1],state_management:state||p[2],status:statuses[status],verification:'源码静态追踪；该参考控件的本轮实机交互：待验证',risk:status==='B'?'已定位接线/验收缺陷':status==='M'?'缺真实消费者/能力，不能做可点击装饰':status==='P'?'已有局部能力不能当完整目标验收':status==='N'?'视觉/平台或范围差异，须按说明处理':'需迁移后回归，不能以组件同名代替验证',proposed_change:detail||'复用现有链，按目标交互/布局接入；保持能力与错误边界',tests:test||`参考${ref}：${control}；真实文件→触发→断言状态/错误→切tab/关闭；视觉/键盘/低配待执行`,existing_tests:existingTests[key],module_owner:owner||p[3],evidence:key});
}
function list(ref,region,text,status='M',key='settings',detail=''){for(const c of text.split('；').filter(Boolean))add(ref,region,c,status,key,detail);}
function setting(region,missing,partial='',wired=''){
 list('01',region,missing,'M','settings','新增真实 schema/消费者后才允许交互；参考值不是现有默认');
 list('01',region,partial,'P','settings','相关 Viewer 或服务有局部能力；没有此全局设置入口/key/跨窗口生效协议');
 list('01',region,wired,'U','theme','已有控制在主 App，未接设置中心此页；需迁移兼容旧存储');
}

// 01: all 26 navigation entries and every legible setting in the visible boards.
const categories=['General','Appearance','Viewer Behavior','Focus View','Tabs & Workspace','File Opening','Default Layout & Panels','Editing Preferences','Search & Find','Compare','Archive Viewer','Media Viewer','Code / Text Viewer','Spreadsheet Viewer','3D / CAD Viewer','Performance','Hardware Acceleration','Cache & Temporary Files','File Associations','Keyboard Shortcuts','Accessibility','Language & Region','Privacy & Local Data','Updates','Backup / Reset / Diagnostics','About Elorin'];
for(const c of categories)add('01','分类导航',c,c==='File Associations'?'P':'M','settings',c==='File Associations'?'现页仅桌面集成/系统关联，不是完整设置中心':'App settings 只挂 IntegrationSettings，未注册此分类页面');
setting('General','Start Elorin（启动页）；Default view mode；Check for updates 频率；Show welcome tips；Show system notifications','Remember last opened files and tabs');
setting('Appearance','Accent Color 颜色选择；Interface Density（Comfortable/Compact/Touch Friendly）；Show labels and icons','','Theme（Light/Dark/System）；Always show sidebar；Collapse sidebar by default');
setting('Viewer Behavior','Smooth zooming 全局开关；Always center content when zooming','Default zoom level；Image fit mode；Show zoom controls overlay；Remember zoom level per file；Enable mouse wheel zoom；Page navigation；Single click to select；Double click to open in full screen；Show file information on hover；Enable right-click context menu');
setting('Focus View','Enable Focus View by default；Hide navigation UI；Auto-hide toolbar；Show file name briefly；Background style（Solid/Gradient/Blur）；Background color；Exit Focus View on file close');
setting('Tabs & Workspace','Open files in 选项；Show tab previews；Close tab with middle click；Warn before closing multiple tabs；Tab layout；Maximum open tabs 可配置','Remember workspace on exit；Restore workspace on launch');
setting('File Opening','Open supported files in；Open folders in；Handle unsupported files 选项；Ask before opening large files；Remember last folder；Open all files in same tab','Show file type warning for unknown formats');
setting('Default Layout & Panels','Default layout（Side by Side/Single/Bottom）；Show Thumbnail/Preview by default；Show Compare by default；Show Properties by default；Panel position；Remember panel state per file type','Show Inspector by default');
setting('Editing Preferences','Enable in-app text editing 总开关；Default text encoding；Auto-detect encoding 编辑策略；Tab size 全局值；Insert spaces instead of tabs；Highlight current line 全局开关；Auto save changes','Show line numbers；Word wrap；Confirm before discarding changes');
setting('Search & Find','Default search location（folder）；Search in subfolders；Remember last search query；Maximum search results 配置；File types to include','Include file content；Case sensitive；Use regular expressions；Show search highlights');
setting('Compare','Default compare mode；Ignore whitespace differences；Ignore line ending differences；Highlight word-level changes；Show difference overlay；Highlight differences color','Sync zoom and pan');
setting('Archive Viewer','Open archives in；Show file preview 默认；Allow extracting files 总开关；Ask before extracting large archives；Default extract location；Show compression ratio 开关','Preserve folder structure on extract');
add('01','Archive Viewer','Supported formats ZIP/RAR/7Z/TAR/GZ/BZ2 chips','P','formats','仅展示实际后端层级与可用依赖；不能把图中六项当全部已支持');
setting('Media Viewer / Image','Default zoom 设置；Image interpolation 设置；Show image metadata 默认；Enable slideshow；Slideshow interval');
setting('Media Viewer / Video','Default quality；Hardware acceleration for video 全局策略','Remember playback position；Show playback controls');
setting('Media Viewer / Audio','','Remember playback position；Show visualizer');
setting('Code / Text Viewer（图中标题误标 Cache）','Text theme；Font family；Font size 全局；Line height；Show minimap；Default language','Syntax highlighting；Show line numbers；Word wrap；Render markdown files；Auto-detect language');
setting('Accessibility','Increase UI scale；High contrast mode 应用开关；Reduce motion 应用开关；Show focus indicators 应用开关；Larger click targets；Default zoom；Date format 选项；Preview charts and pivot tables');
add('01','Cache & Temporary Files','图中重复标题及错置的可访问性控件','P','settings','画稿局部文案与分类不一致；保持原图，不擅自补猜缓存配置；正式分类意图待确认');
add('01','Cache & Temporary Files','真实缓存预算/临时文件管理入口','M','settings','Master Spec 要求真实配置；已有各后端固定预算不能当可配置设置，禁止将缓存控制混同无障碍开关');
add('01','File Associations','Set Elorin as default for supported files','P','integration','现有 default_apps 打开 Windows 设置；不能静默改 UserChoice');
for(const c of ['Documents','Images','Videos','Audio','Spreadsheets','Archives','3D Models'])add('01','File Associations',`${c} Ask/default 选择器`,'P','integration','现页关联组/健康信息存在；画稿按类 Ask 下拉与完整策略未接');
add('01','File Associations','Check File Defaults','I','integration','health 查询接线；repair 为显式操作；浏览器/portable 明确能力限制');
setting('Keyboard Shortcuts','Search shortcuts；Reset All；快捷键重新映射/冲突校验');
for(const c of ['Open File Ctrl+O','Open Folder Ctrl+Shift+O','New File / New Tab（图示 Ctrl+T）','Close Tab Ctrl+W'])add('01','Keyboard Shortcuts / 双重示例面板',c,'P','shell','App有固定快捷键，非可配置列表。新建实际 Ctrl+N，与画稿 Ctrl+T 不同，需正式语义统一；Open Folder快捷键不能仅凭标签推定');
setting('Language & Region','Date format；Time format；Number format；First day of week','Language（English 等）');
setting('Privacy & Local Data','Keep file history 开关；Keep recent files list 开关；Remember position 总开关；Allow usage analytics（anonymous）','Clear local data');
setting('Updates','Check for updates 频率；Download updates in background；Notify when updates available；Version / up-to-date 状态；Check for Updates 按钮');
setting('Backup / Reset / Diagnostics','Export Settings；Import Settings；Reset All Settings；Generate Report');
setting('About Elorin','About 页面与版本来源；Website；Documentation；Send Feedback；Credits / Copyright');
for(const c of ['Spreadsheet Viewer','3D / CAD Viewer','Performance','Hardware Acceleration'])add('01',c,'参考只露分类入口，未展开子页控件','M','settings','不凭缩略图创造未出现的配置项；消费者/schema 后续按正式功能定义');
list('01','设置窗口外观','Windows 关闭；独立设置窗或主窗路由选择','P','chrome','现设置在主 App 路由；仅 main 窗控已接，独立设置窗无创建链');

// Shared shell is expanded per page to retain per-reference traceability.
for(const ref of ['03','04','05','06','07','09','10']){
 list(ref,'共享导航','Elorin 品牌；All Files；Recent；New File；Open File；Settings','P','shell','Open/New/Recent/Settings 有命令；All Files/library多数 Coming later。品牌使用现有资产，布局待迁移');
 add(ref,'共享导航','Favorites','M','shell','没有收藏数据模型/持久化/页面；不能用最近记录冒充');
 list(ref,'共享导航','Documents；Images；Text & Code；Spreadsheets；Presentations；Media；Archives','P','shell','当前类别 routes 仅 documents/code/data/media/archives；未打开文件时 library 内容是占位。按能力导航，不当文件扫描器');
 if(ref==='03')add(ref,'共享导航','3D / CAD 分类入口','M','shell','专用 plugin 已有，但 Sidebar 无独立分类 route');
 list(ref,'共享顶部','文件标签切换；标签关闭；新增标签 +；标签重排','I','app','稳定 tabId / closeTabs / New menu / drag MIME 已接；参考视觉与中键等另行验收');
 add(ref,'共享顶部','全局搜索输入 / Ctrl+K','P','search','当前命令/Quick Open/已开文件查找；不支持画稿暗示的全磁盘 files/content/folders 搜索');
 list(ref,'共享 Windows Chrome','关闭；最小化；最大化/还原；拖动/双击标题栏','I','chrome','已接 main；历史原生部分验收通过，最新整套未通过；图中 macOS 三色点不照搬');
}

// 02 shared components and all visible dialog actions.
list('02','Delete Confirmation','关闭 X；Cancel','P','dialog','有通用确认/焦点机制；没有该删除业务对话框');
list('02','Delete Confirmation','删除说明/回收站语义；Delete 文件','M','app','无 recycle/delete_file 服务；不得以永久删除假装回收站');
list('02','Rename Dialog','名称输入；关闭 X；Cancel；Rename 提交','M','app','没有通用 rename_file / 冲突与占用处理；通用 Input/Dialog 不等于业务完成');
list('02','Unsaved Changes Dialog','Save；Discard / Don’t Save；Cancel；Esc/焦点返回','I','document','真实关闭协调器已接；保存失败必须留窗');
list('02','Open File Dialog','Recent / Documents / Images / Media / Archives 侧栏；文件行选择；自定义对话框关闭 X','P','app','原生 selectionService 已接，自定义画稿壳与分类未实现');
list('02','Open File Dialog','Open；Cancel','I','app','由系统原生文件选择提供，不改为装饰性截图');
list('02','Export Dialog','Format；Pages；Quality；Open file after export；Export','M','app','文本 Save As 下载已有，但无此通用 PDF导出/页段/质量服务');
list('02','Export Dialog','Cancel；关闭 X','P','dialog','通用 Dialog 可复用，目标 Export Dialog 尚未挂载');
list('02','Compare Setup','第一文件；第二文件；移除单项；添加另一个文件；Start Compare','P','compare','当前 App 选择两文件→CompareView，不是此多项 Setup；限文本/图像');
add('02','Compare Setup','Comparison Type（Side by side）','P','compare','有并排文本/图像；不能暗示所有格式或像素overlay');
list('02','Compare Setup','Cancel；关闭 X','P','dialog','目标 Setup 未实现；复用现有关闭焦点机制');
list('02','Floating Toolbar','选择工具；手型平移；旋转；放大；缩小；Fit；更多','P','host','PDF/Image/Geometry局部动作存在，须能力适配；没有共享浮动拖拽/固定/碰撞管理');
add('02','Floating Toolbar','标记/注释样式工具','M','host','无统一标记写回能力，不因图标存在显示可用');
list('02','Floating Inspector','缩略图；Kind；Size；Dimensions；Created；Color Space','P','host','plugin.inspect + FileInspector有真实部分字段；没有统一可拖动浮窗/字段可用性协议');
add('02','Floating Inspector','关闭 X / 拖动固定','M','host','现右侧检查器≠浮动窗口管理');
list('02','Floating Search / Find','查询输入；清除 X；上一结果；下一结果；Match case；Whole words；In current document；结果位置计数','P','search','PDF/Text/Editor有对应局部控件；跨格式选项需按 provider 能力隐藏，不是统一浮动面板');
list('02','Floating Search / Find','折叠/展开；拖动/固定','M','controls','需共享 LayerManager 生命周期');
list('02','Floating Zoom Controls','Zoom out；缩放百分比/选择；Zoom in；Fit to Window；Fit to Page；Actual Size；Fullscreen','P','host','各viewer仅支持自身zoom/fit；同名语义不统一');
list('02','Floating Thumbnail Strip','缩略图选择；当前页标识；添加 +；独立拖动/关闭','P','pdf','PDF有虚拟缩略栏；没有通用浮动strip，添加页不适用于只读PDF，需按能力移除');
list('02','Floating Media Controls','Play/Pause；Seek；时间；Volume；More','P','media','真实播放控件已接；局部覆盖层不是通用浮动管理');
list('02','Floating Page Navigator','上一页；下一页；当前/总页数；页码下拉','P','pdf','已有文档页导航；非统一可浮动page panel');
for(const c of ['Open','Export','Copy','More'])add('02','Floating Quick Actions',c,'P','host','有部分真实命令；Quick Actions浮动面板缺owner/能力与定位接线');
list('02','Floating Quick Actions','Share；Delete','M','app','通用分享/文件删除服务未发现');
list('02','Contextual Overlays','Tooltip hover/focus/Esc；Toast 可关闭通知；Loading；Empty state Open File；Error/Unsupported 状态','P','controls','控件与App/Host反馈存在；未统一Toast队列/层级/任务进度生命周期');
list('02','Context Menu','Open；Copy；More；Escape/方向键/点击外部','I','shell','已有真实 registry/menu 键盘链；业务可用命令因上下文而异');
list('02','Context Menu','Open in New Window；Share；Rename；Move to Folder；Delete','M','shell','无对应通用文件/多窗服务；不能从通用菜单组件推定接线');
add('02','Drag and Drop Overlay','拖放区域/文件进入反馈与打开','P','app','App native/browser drop 已接授权；目标统一遮罩/浮层优先级未接');
list('02','Status / Chips','Ready；Loading；Processing；Not Supported；Error','P','host','Host/各model有真实状态，尚无统一StatusProvider');
add('02','Status / Chips','PDF / Image / Video / Spreadsheet / Archive 类型标签','I','formats','实际 descriptor→presentation映射；画稿错误拼写不保留');
list('02','Action Controls','Primary / Secondary / Tertiary Button；Icon Button；Input / Search Field；Select；Switch；Checkbox；Radio；Segmented Control / Tabs','P','controls','共享组件已实现并有部分生产使用；专业Viewer仍混用原生button/select，不能称全局一致');
list('02','Action Controls','Tag / pill；Breadcrumb；文件类型筛选；All Files / Recent / Favorites / Shared tabs','P','controls','有视觉基础/局部面包屑；Favorites/Shared/全局筛选业务未实现');
list('02','Hover Cards','Document 缩略/元信息；Image 缩略/元信息；Video 缩略/元信息；Metadata hover card；Open/Share/More 悬停操作','M','home','Home文件行仅name/time/buttons；无真实统一异步hovercard与取消/能力过滤');

// 03 CAD.
list('03','文件头','文件名/类型/面包屑；Open；More','P','geometry','部分信息来自descriptor/model，Open/More共享命令；不硬编码demo数据');
add('03','文件头','Saved 2 min ago','N','geometry','此Viewer只读，无保存事务；不得固定显示虚假Saved时间');
add('03','文件头','Share','M','app');
list('03','画布工具栏','Select；Orbit / Rotate；Pan；Zoom；Fit / Frame；Projection；View presets；Shaded / Edges / Wireframe；Fullscreen','I','geometry','已接engine/camera，需按实际模型能力及控制方式迁移视觉');
list('03','画布','模型加载/失败/取消；拾取对象；测量；隐藏/隔离/Show All；网格；低配画质；结构树','I','geometry','模型预算/近似测量/未知单位需显式标识；无BRep精确测量保证');
list('03','画布','XYZ 朝向立方体；绘制比例尺 50mm','M','geometry','未发现画稿widget；单位未知时不能显示mm比例尺');
list('03','右侧 tabs','Model；Scene；Materials','P','geometry','通用Inspector/结构树有模型数据，未有这三页统一检查器');
list('03','File Information','File name/type；File size；Created；Modified；Location；Format','P','geometry','descriptor与Inspector字段部分可取；逐字段缺省，不造时间/路径');
list('03','Dimensions / Statistics','Units；Width X；Height Y；Depth Z；Total Objects；Triangles；Vertices；Copy Dimensions','P','geometry','adapter有bounds/units/统计，Inspector展示部分；复制尺寸未发现，场景计数口径需定义');
list('03','Materials','材质球预览；Material name/type/roughness；Add +；Material More','P','geometry','解析材质存在；目标材质球UI/增改命令未接。只读格式不得冒充材质编辑器');

// 04 CSV/workbook.
list('04','文件工具栏','文件名/关闭；缩放百分比；Zoom in；Zoom out；Fit；More','P','csv','App关闭已接；Grid没有统一画稿缩放toolbar；不能用CSS zoom当网格语义实现');
list('04','文件工具栏','Filter；Sort ascending/descending','I','csv','只对有界已加载projection，超过限制禁用/解释；不写源');
add('04','文件工具栏','Columns 可见列面板','M','csv','列宽/选列已有，未发现可见列集合/chooser UI');
add('04','文件工具栏','Edit','P','document','CSV可进入轻编辑，XLSX只读；不能给所有表格展示可用编辑');
add('04','文件工具栏','Delete file','M','app','不是CsvEditor删除行；无通用文件删除');
list('04','公式/值栏','地址 D4；fx 标识；当前格完整值','P','csv','selection有raw/typed和cell preview；缺目标地址栏。XLSX公式与缓存值需区别');
list('04','网格','列字母/表头；行序号；单元格选择；行/列选择；选区高亮；横纵虚拟滚动；列宽调整；复制值/行','I','csv','CsvGrid真实数据；Workbook走GridSurface，跨格式行为仍需验收');
list('04','网格','选区填充柄/拖动编辑；多格公式计算','N','sheet','图中视觉不可暗示Excel计算引擎；当前Workbook只读已保存结果');
list('04','检查器 tabs','File Info；Columns','P','csv','有CsvInspector字段与column selection，非目标两个tab');
list('04','File Info','File name/type；Location；Size；Modified；Rows；Columns；Delimiter；Encoding','I','csv','模型/descriptor真实字段，可缺省；索引中rows带+，不能报最终总量');
list('04','Preview','表格缩略图；Preview 点击导航','M','csv','cell preview不等于小表格全局缩略预览');
list('04','Visible Columns','Manage；Date 显示开关；Product 显示开关；Region 显示开关；Revenue 显示开关；Cost 显示开关；Profit 显示开关；Units Sold 显示开关；Growth % 显示开关；列拖动手柄','M','csv','参考列名仅示例，必须动态列schema与visibility/order投影');
list('04','Quick Stats','Total Rows；Total Columns；Numeric Columns；Text Columns','P','csv','CsvInspector有统计/类型，loaded/sample与exact要标识；不能从prefix推断整文件精确统计');
list('04','Workbook 扩展边界','工作表选择；隐藏工作表显示；公式/缓存值只读；sheet rows×columns 状态','I','sheet','复用现有Workbook行为，图04 CSV不能替代XLSX验收');

// 05 text/code.
list('05','编辑工具栏','Save；Save dropdown / Save As；Find；Wrap','I','document','真实轻编辑会话，Viewer只读/编辑模式必须显式区分；UTF8≤2MiB');
add('05','编辑工具栏','Format Document','M','document','未发现通用formatter；JSON查看Formatted不等于编辑格式化/保存');
add('05','编辑工具栏','Validate','P','document','JSON真实validator存在；没有通用Markdown/代码验证器');
list('05','Markdown 面板','Source；Preview；源码/预览 Split；Outline；相对图片加载；预览安全','I','markdown','真实AST/资源授权，不能运行文档脚本；三文档示例不是单文件强制三栏');
list('05','JSON 面板','Tree；Raw / Source；Formatted 展示；展开/折叠节点；对象数组键值类型；搜索；复制选中/完整 JSON','I','json','树/source/split+copy类型已有；不同按钮标签/视觉需迁移，受解析预算限制');
list('05','Text Source','行号；语法高亮；选择/复制；自动换行；Goto line；查找上一/下一；大小写/整词/正则；虚拟滚动','I','text','language/profile决定高亮能力，非法regex显示错误，不保证完整IDE语法');
add('05','各面板','独立 Expand 按钮','P','host','部分Viewer fullscreen/能力动作；没有通用panel maximize布局协议');
list('05','File Information','文件名；Location；Type；Size；Created；Modified','P','host','FileInspector/descriptor部分字段，缺省不可伪造');
list('05','Text Settings','Encoding 下拉；Line Endings 下拉；Syntax Highlighting 语言下拉','P','text','检测/展示与本地profile能力已有，不能当支持任意编码转码/编辑EOL写回设置');
list('05','File Statistics','Lines；Words；Characters；Non-empty lines','P','text','真实model有lines/characters/index状态；Words/Non-empty完整统计须明确实有算法与范围');
list('05','Actions','Save；Save As','I','document');
list('05','Actions','Format Document；Validate Markdown；Delete File','M','document','不要混同JSONvalidator/CSV删行与对应目标服务');
list('05','Actions','Copy Path；Reveal in Folder','I','integration','仅真实本地source可用；VFS虚拟路径copy与物理reveal需分开');

// 06 archive.
list('06','导航工具栏','Back；Forward；Up / Breadcrumb segment；当前内部路径','I','archive','已有history/navigation，路径来自VFS而非本地任意路径');
list('06','导航工具栏','Zoom；Refresh；Focus View；Image / List / Grid mode；More','P','archive','局部目录list和命令有，缺共享preview zoom/多种布局/独立Focus');
add('06','目录搜索','Search archive 输入/取消','I','archive','真实VFS名称/路径搜索，最多显示200结果；非内容全文搜索');
list('06','目录树','展开/折叠文件夹；选中文件；文件夹项目数；文件大小/类型图标；双击打开','P','archive','当前主区域是虚拟目录list+breadcrumb；文件打开新childtab，不是三栏树内preview');
list('06','中央 Preview','内嵌真实 ViewerHost；上一项；下一项；缩略条；当前/总项目计数','M','archive','可复用child source/lease/ViewerHost；必须新preview owner，不能复制整包');
add('06','右栏','Open in Archive','I','archive','open→model.resource→App openResource(childtab) 链已接；文字/位置待迁移');
list('06','右栏','Extract selected；Extract All','I','archive','native后端解压，密码/目标/冲突/取消有链，browser明确限制');
add('06','右栏','Copy Path','P','archive','需要复制虚拟路径语义，不能把archive path当可写物理文件');
list('06','右栏','Rename；Move；Delete','M','archive','没有安全archive写回服务，内部项只读；后续按能力禁用/隐藏');
list('06','Information','Name；Type；Compressed Size；Dimensions；Modified；Path in archive；Compression','P','archive','selectednode metadata有部分；内部图像dimensions需preview plugin贡献，缺字段不能默认');
list('06','Tags','既有 tag chips；删除单tag；添加 +','M','app','无统一tag持久化服务');
list('06','Description','显示描述；Edit pencil','M','app','无内部文件描述存储/写回服务');
list('06','Other Metadata','折叠/展开；Color Space；Bit Depth；DPI；File Created；File Modified；CRC32','P','archive','metadata可用性依后端/内部格式；图像信息由preview贡献，不把示例值硬编码');
list('06','解压异常/任务','密码输入；冲突Skip/Replace/Keep Both；Apply all；取消；进度/错误','I','archive','现有ExtractStatus按操作轮询250ms；退出清理，不能常驻扫描');

// 07 media.
list('07','Recent Media 列表','折叠侧栏；All；Videos；Images；Audio；添加 +；缩略/时长/日期；选中播放；单项 More','M','media','当前打开文件播放器有，未实现按类型recentmedia list/异步thumb服务');
list('07','文件头','文件名；面包屑；Open；More','P','media','共享descriptor/命令部分，按真实source');
list('07','文件头','Favorite star；Share；Export/download；Crop；Cut；Duplicate；Delete','M','media','无视频编辑/关键帧导出/通用文件写服务；不因浏览器download API存在称已接');
list('07','播放器','Play/Pause；Seek slider；Current/Total time；Mute；Volume；Playback speed；Loop；Fullscreen','I','media','PlaybackController驱动真实media状态；seek在duration/seekable可用时启用');
add('07','播放器','CC / Subtitle tracks','P','media','浏览器textTracks或授权同目录字幕已有，取决codec/track能力，非自动转录');
add('07','播放器','Picture in Picture','M','media','未发现PIP命令接线');
add('07','播放器','Settings 齿轮/统一设置浮层','P','media','speed/track局部控制存在，不是统一floating settings');
list('07','Frames & Highlights','Key Frames 选择；更多；关键帧缩略/时间；点击跳时间','M','media','未发现抽帧服务/有界缓存；不能用示例山景截图冒充');
list('07','右栏 tabs','Details；Transcript；Chapters','P','media','真实元信息Inspector存在，转录/章节解析与目标三tab未实现');
list('07','Information','Kind；Size；Duration；Resolution；Video Codec；Audio Codec；Frame Rate；Bitrate；Created；Modified；Location','P','media','部分由metadata/HTMLMediaElement返回，无法获取字段缺省；编辑pencil未接');
add('07','Information','Location Copy / Reveal','I','integration','原生source能复制/打开所在目录；virtual capability需限制');
list('07','Information','Edit metadata pencil','M','media','只读metadata，不支持容器写标签');
list('07','Tags / Description','显示tags；编辑tags；Add tag；描述显示；描述编辑','M','app','缺统一annotation持久化与数据来源');
list('07','生命周期','切文件停止旧播放；隐藏/最小化暂停；退出释放element/source/worker','I','media','同realm globalPlaybackControllerSet，未来跨窗独占需要broker；实机资源验证未在本轮执行');

// 08 must never inherit an I merely because main/fullscreen has the same control.
list('08','真正独立窗口','创建顶层 Viewer 窗；重复打开复用；主/Focus关系；继承文件；继承第N页/缩放/时间；独立关闭/最小化/最大化/拖动/调整大小','M','chrome','配置仅 main，无Focus创建入口；window_chrome.rs只接受 main。目标详见交互规格W2/W3',);
list('08','独立顶部','文件类型/名称；Previous page；Next page；当前/总页数；Zoom out；Zoom percent；Zoom in；Fit；True Fullscreen；Search document；Exit Focus View','M','pdf','主PDF有部分命令；无独立Focus路由/context/state DTO/跨窗租约，不可标完成');
list('08','独立内容/浮层','虚拟页缩略；点击缩略导航；文档真实渲染；Toolbar 自动显隐；Page/Search/Zoom 浮窗；Focus 默认隐藏状态栏','M','host','需独立owner且复用已有引擎；禁止CSS overlay冒充');
list('08','输入/异常/释放','Esc 分层；Alt+F4；混合DPI/跨屏位置恢复；源被删/解析失败；主窗先关；Focus先关；应用退出无孤儿资源','M','activity','当前全局pause_all/close_all及WeakMap状态不适合跨窗，先改资源owner再实现窗');

// 09 PDF.
list('09','顶部阅读工具栏','上一页；下一页；页码输入；总页数；Zoom out；Zoom percent；Zoom in；Fit width/page；Rotate；Search；Fullscreen','I','pdf','真实PDF engine，page/zoom clamp与权限；视觉排列需迁移');
add('09','顶部阅读工具栏','Focus View 独立窗','M','pdf','当前focus()/requestFullscreen与App CSS focus不是目标Focus');
add('09','顶部阅读工具栏','More overflow','P','host','generic capabilities菜单有，目标统一命令/LayerManager未接');
list('09','左 Pages','虚拟缩略图；页码；当前页选中；点击跳页；页侧栏滚动；目录Outline','I','pdf','已有engine destination/go + 按需缩略/页渲染');
list('09','中央内容','真实PDF保真；可见页虚拟化；阅读滚动位置；外部变更/密码/失败反馈','I','pdf','保存session与controller生命周期；待真实低配复验');
list('09','右文件头','文件名/类型/Size/pages；Open；More','P','pdf','descriptor/engine信息存在，右栏目标布局待接');
list('09','右文件操作','Edit PDF；Duplicate；Export PDF；Rename；Move；Delete','M','app','无对应安全业务服务；文本编辑能力不得套用PDF');
list('09','右 tabs','Information；Comments','P','pdf','metadata inspector已有，Comments模型/面板缺失');
list('09','Information','File Name；Type；Size；Pages；Created；Modified；Location；Copy Location','P','pdf','可取字段真实显示，不虚构创建时间；copy/reveal复用本地服务');
list('09','Tags','Tag chips；Add tag；删除/下拉tag','M','app','无持久化tag服务');
list('09','Description','描述内容；Edit pencil','M','app','PDF metadata Subject不等于可编辑文件描述');
list('09','Additional Metadata','展开/折叠；Author；Title；Subject；Keywords；Application；PDF Version；Created With','P','pdf','PDF.js metadata有部分；字段缺省、XMP来源与真实application口径需统一');

// 10 Home.
list('10','Welcome','欢迎标题/副标题；文件类型插画','P','home','当前旧hero+categorycards；保留文件区优先，插画是视觉资产非文件渲染');
add('10','Drop Zone','拖文件进入→授权→打开','I','app','浏览器/native drop已接，原生必须先grant；目标dropzone视觉未迁移');
add('10','Drop Zone','独立大拖放目标/hover反馈','P','home','全局drop≠画稿专门Drop Zone/共享遮罩生命周期');
list('10','Drop Zone','Open File；New File','I','app','新建只Text/Markdown/JSON/CSV，不能列无创建器格式');
list('10','Recent Files','真实文件列表；类型图标；相对时间；点击打开；Clear recent','I','home','recentFiles→storage→authorizeReference/load；失效记录反馈');
add('10','Recent Files','View All','P','home','有Recent导航，但非完整文件列表页');
add('10','Recent Files','单项 More（当前真实UI额外）','B','home','onNotice 提示未来模块，没有菜单功能；不能当可操作More已完成');
list('10','Quick Shortcuts','Open File；New File；Recent Files','P','home','已有App命令，目标三张快捷入口未接');
add('10','Quick Shortcuts','Favorites','M','home','收藏业务/持久化缺失');
list('10','Supported File Types','Documents；Images；Text & Code；Spreadsheets；Presentations；Media；Archives','P','formats','现分类卡可复用；必须来自能力矩阵且区分full/partial/structure/recognition，不能把静态示例扩展名当全部可用');

// 11 visual-system roles are requirements, not fictitious clickable business functions.
list('11','Brand / App Icon','现有Logo；Wordmark；Tagline；App Icon 1024；256；128；64；32','P','visual','当前82px方形图与program512资产存在，目标折叠飘带正式矢量/透明资产未提供；禁止重绘/抠图伪原始品牌');
list('11','Color Palette','Primary；Primary Hover；Primary Light；Accent；Accent Light；Success；Warning；Error；Text Primary；Text Secondary；Border；Surface；Background','P','visual','M24 tokens基础已接；概念图值需原规范/测量校准；深色/forcedcolors逐状态验收');
list('11','Typography','Inter 候选；Display1；Display2；H3；H4；H5；Body；Caption；字重/行高；CJK fallback','P','visual','现typography系统与fallback已有；Inter二进制/授权与全局文案布局未验收');
list('11','Spacing / Iconography','2/4/8/12/16/24/32/48/64 间距；统一线图标；文件格式sprite；细描边/阴影/圆角','P','visual','复用tokens与lucide/现sprite，不能无必要引入整套1230图标');
list('11','Button / Toolbar Pills','Primary default/hover/disabled；Secondary；Tertiary；Icon buttons；Zoom pill；Search；Fit；Focus；More','P','controls','基础控件存在但Viewer局部button迁移未全；loading/error/disabledReason需接真实命令');
list('11','Navigation / Search','Sidebar selected/hover；Top tab active/close；Global search focus/shortcut；Breadcrumb','P','shell','现实际App Shell非参考布局；缺Favorites/全局磁盘search如上');
list('11','Segmented / Tags','Browse；Standard；Focus；Tag chips；Add tag','P','controls','受控segmented组件存在；Browse/Standard业务模式和tag持久化未接，Focus独立窗缺失');
list('11','Floating Action Buttons','New +；另一操作图标','P','app','New命令已有，第二图标业务意图未明；不得猜测接无关handler');
list('11','Dialog / Overlay','Delete confirm；Rename；Tooltip；Context Menu；Loading；Empty；Ready/Loading/Processing/Unsupported/Error indicators','P','dialog','通用壳与部分真实反馈可复用；Delete/Rename后端缺失；统一浮层缺失');
list('11','Viewer Header / Inspector','Back/Next；文件标识；Zoom；Fit；Focus；More；浮动工具栏；浮动Inspector；右Inspector分组折叠','P','host','各plugin数据/能力有，统一布局/float manager/可折叠panel协议未齐');
list('11','Compare Panel Concept','Current；Comparison；图像差异overlay；Diff color；混合比例slider','P','compare','当前side-by-side sync，不支持目标overlay/像素diff，不能把示意图作为已完成功能');
list('11','八类页面缩略示意','Home；PDF；Image；Video；Code；Spreadsheet；Archive；3D/CAD','N','visual','缩略图引用03–10/现Image实现；是视觉索引不是新业务控件或可点击伪Viewer');
list('11','Image Viewer（缩略图范围）','真实图像渲染；Pan；Zoom；Fit；Rotate；Actual size；复制；动画暂停；Fullscreen','I','image','FileSource/解码/资源生命周期已接；目标独立Focus另计缺失');

// Mandatory additions chapters 13/14: individually enumerate integration points.
for(const [ref,c,key] of [['01','Settings 长页','settings'],['10','主导航/文件列表','home'],['09','PDF阅读区/缩略栏','pdf'],['05','Text Source','text'],['05','Markdown reader/source','markdown'],['05','JSON tree/source','json'],['04','CSV网格双轴','csv'],['04','Workbook网格双轴','sheet'],['06','Archive list/results','archive'],['07','媒体列表','media'],['03','场景树','geometry'],['02','Inspector/浮层','host'],['08','独立Focus','host']]){
 add(ref,'第13章 Scrollbar',`${c}：真实滚动/极简thumb/大命中区/hover-drag/track/键盘/触控板/高对比`,ref==='08'?'M':'P','scroll',`复用 ${key} 真实scroll容器；现有CSS scrollbar不等于统一艺术overlay。唯一metrics adapter、防双滚动、缓存和监听按owner销毁`,undefined,undefined,undefined,'滚轮/触控板/轨道/拖动/Page/HomeEnd；DPI100/150/200%；双轴/内容改变/嵌套/虚拟映射；实机待验证');
}
for(const [ref,c,key,detail] of [['09','PDF page/total/zoom','pdf','engine/session真实字段'],['05','Text line/column/encoding/EOL/dirty','text','编辑器与只读selection语义不同'],['04','CSV selection/rows/cols/stats','csv','sampled/indexing/exact区别'],['04','Workbook sheet/cell/rows/cols','sheet','保存结果，不重算公式'],['06','Archive items/selection/extract task','archive','当前目录计数≠archive总条目'],['03','3D load/selection/camera/quality','geometry','单位/几何近似必须标识'],['07','Media task/error only','media','不重复播放时间/控制栏'],['10','Home selected/filter/task','home','无文件不伪造size/page'],['01','Settings default hidden','settings','隐藏不吞错误/长任务'],['08','Focus auto/hidden/interaction reveal','host','独立窗未实现']])add(ref,'第14章 Contextual Status Bar',c,ref==='08'?'M':'P','host',`${detail}；ViewerSlots.statusBar仅预留，无已注册StatusProvider；需事件订阅/owner隔离/低频批处理`,undefined,undefined,undefined,'切tab/窗/文件→真实字段；迟到结果拒绝；200%长文案；隐藏不刷timer；错误可发现', 'W6');

add('06','跨标签生命周期 / 现有缺陷','Close→Reopen closed virtual tab','B','app','closeTabs保存旧tab；App移除effect dispose旧source；reopenTab虚拟分支直接复用。VirtualFileSource.ensure将拒绝读取。源码缺陷已定位，运行复现待执行','closeTabs → documents effect source.dispose → reopenTab 直接旧对象','src/vfs/VirtualFileSource.ts ensure/dispose；archive-model.resource lease','closedTabs旧引用/released=true', '归档内部文件打开→关闭→CtrlShiftT→断言新source可读、父租约无泄漏','W2');
add('03','跨专业Viewer / 现有缺陷','Presentation search Close / superseded search cancellation','B','activity','PresentationViewer.find仅循环结束检查token；Close只setSearch(false)，不能停当前扫描。后续迁移共享搜索时增加owned Abort/每slide检查；本轮不修','PresentationViewer.find → loadSlide循环；Close→setSearch(false)','src/viewer/plugins/presentation/PresentationViewer.tsx + presentation-model.ts','op.current结果丢弃，非循环取消', 'many-slides搜索→Close/切tab/再次导航；断言不继续load所有旧slides、无迟到错误/状态','W7');
add('01','Workspace 恢复 / 现有缺陷','持久化 sidebarCollapsed 的恢复接线','B','app','workspaceManifest保存sidebarCollapsed，App restore只恢复tabs/active；useSidebar只读取sessionStorage。跨应用重启不恢复manifest侧栏偏好；运行复现待验证','workspaceManifest → productivity_write；restore未消费sidebarCollapsed','src/workspace/workspace.ts + src/hooks/useSidebar.ts','manifest.sidebarCollapsed 与 sessionStorage manual 两套状态', '切侧栏→退出→新WebView会话→断言恢复用户选择/auto规则不覆盖手动','W1');
const anchors={};
for(const [id,files] of Object.entries(evidence)){
 const [file,token,...related]=files;
 for(const f of [file,...related])if(!fs.existsSync(path.join(root,f)))throw new Error(`Missing evidence ${id}: ${f}`);
 const lines=fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/);
 const index=lines.findIndex(l=>l.includes(token));
 if(index<0)throw new Error(`Missing anchor ${id}: ${token}`);
 anchors[id]={file,line:index+1,token,related};
 for(const f of existingTests[id]||[])if(!fs.existsSync(path.join(root,f)))throw new Error(`Missing test reference: ${f}`);
}
const clean=v=>String(v??'').replaceAll('|','\\|').replaceAll('\n',' ');
let md='# Elorin UI 可追溯功能审计矩阵\n\n审计日期：2026-10-09；路径相对 D:/elorin。已完整读取 Master Spec 0–15、README 和全部11张标注图。本轮仅静态调用追踪与历史证据检查，未运行新测试。**“已实现且已正确接入”指调用链可追踪，不代表本轮实机验收通过**；运行验证单独列为待验证。视觉规范是目标，不是现状。\n\n';
md+='## 阅读方法与覆盖边界\n\n每行是一个可见交互、数据字段或控件组；下拉/同一开关的选项、重复示例状态合为一个控件（不是遗漏操作）。共享Shell逐图展开；示例文件名/列名/材料名不作为实际固定数据。01共有26分类，未展开子页不猜控件；画稿误标/不清晰文案明确备注。11静态样式样本不是业务按钮，02的底层控件存在不证明对应文件操作已经实现。08独立窗口所有项单列，不借用主窗fullscreen来标完成。额外覆盖强制第13–14章滚动条/状态栏；其他Viewer按已有链保留，不新增解析器。\n\n';
md+='状态：'+Object.values(statuses).join(' / ')+'。实施owner W0–W14是工作包，映射见 UI_IMPLEMENTATION_PLAN.md；**正式Module25–35职责表未找到，编号待确认**。\n\n';
md+='## 源码证据索引\n\n索引给出已核查入口行和相关链路径；矩阵的事件/状态栏记录实际局部能力或明确缺失，不以函数名称推定完成。缺失结论限于当前仓库，并以真实路由/服务边界和调用检索为依据；未来文件不作为现有证据。\n\n| 证据ID | 入口及定位 | 相关已核查路径 |\n| --- | --- | --- |\n';
for(const [id,a] of Object.entries(anchors))md+=`| ${id} | [${a.file}:${a.line}](${('../'+a.file).replaceAll(' ','%20') }#L${a.line}) — \`${a.token}\` | ${a.related.map(f=>'`'+f+'`').join('、')}；相关测试（存在，不等于覆盖此控件/本轮通过）：${(existingTests[id]||[]).map(f=>'`'+f+'`').join('、')} |\n`;
md+='\n## 逐图矩阵\n\n';
let count=0;
for(const ref of Array.from({length:11},(_,i)=>String(i+1).padStart(2,'0'))){
 const subset=rows.filter(r=>r.ref_image===ref);
 md+=`### ${ref} — ${subset[0].page}（${subset.length}项）\n\n| ID / 区域 | 控件/意图 | 源码 / 事件处理 | 后端/服务 | 状态管理 | 实现状态 / 本轮验证 | 风险 / 后续接线 | 验收方式 / owner |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n`;
 for(const r of subset){r.id=`UI-${ref}-${String(++count).padStart(4,'0')}`;const a=anchors[r.evidence];md+=`| ${r.id} / ${clean(r.region)} | ${clean(r.control)} | \`${r.existing_runtime_component_path}:${a.line}\` [${r.evidence}]；${clean(r.interaction)} | ${clean(r.backend_service_path)} | ${clean(r.state_management)} | **${r.status}**；${r.verification} | ${clean(r.risk)}；${clean(r.proposed_change)} | ${clean(r.tests)}；${r.module_owner} |\n`;}
 md+='\n';
}
md+='## 追踪与验证说明\n\n- 现有路径按证据索引自动检查存在、入口token有真实行号；这只是文档完整性检查，不是生产测试。事件名为已追踪职责的概括时，不能作为尚未实现控件的handler名称。\n- settings缺失项共同证据：App settings分支只挂IntegrationSettings；integration只提供存储/系统服务，不存在完整26分类schema与消费者。局部Viewer设置标部分实现，不能称全局可配。\n- 多窗缺失证据：tauri.conf.json仅main；真实Rust/TS窗口创建检索没有Focus创建链；main guard与全局清理点见UI_AUDIT/UI_INTERACTION_SPEC。\n- 通用文件Delete/Rename/Move/Share等缺失：App菜单、FileSource/FileLoader、Rust注册命令均未找到对应完整业务链。图中CSV删行、metadata展示、Save As、archive extract不可替代它们。\n- 格式支持以docs/format-capability-matrix.json及现plugin运行能力为准；专业完整/部分/结构/识别不可用扩展名集合概括。Office/Presentation/Epub/Email/Hex/Scientific不因参考没展开而删除；接线图见UI_RUNTIME_MAP。\n- 已有测试/历史截图路径与真实失败见UI_AUDIT；本轮全部交互/视觉/DPI/低配指标仍待后续获准批次验证。机器可读CSV/JSON与本表同源，包含独立字段 user_intent / interaction / path / service / state / status / risk / proposed_change / tests / module_owner / evidence。\n';
fs.writeFileSync(path.join(root,'docs/UI_FEATURE_MATRIX.md'),md);
fs.writeFileSync(path.join(__dirname,'UI_FEATURE_MATRIX.json'),JSON.stringify({audit_date:'2026-10-09',scope:'read-only; no runtime tests executed',statuses,anchors,rows},null,2));
const headers=['id',...Object.keys(rows[0]).filter(k=>k!=='id')];
const q=s=>'"'+String(s??'').replaceAll('"','""')+'"';
fs.writeFileSync(path.join(__dirname,'UI_FEATURE_MATRIX.csv'),'\uFEFF'+headers.map(q).join(',')+'\r\n'+rows.map(r=>headers.map(h=>q(r[h])).join(',')).join('\r\n')+'\r\n');
console.log(JSON.stringify({rows:rows.length,by_ref:Object.fromEntries(Array.from({length:11},(_,i)=>{const r=String(i+1).padStart(2,'0');return[r,rows.filter(x=>x.ref_image===r).length]})),status_counts:Object.fromEntries(Object.values(statuses).map(s=>[s,rows.filter(r=>r.status===s).length]))},null,2));
