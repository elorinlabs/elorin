# Focus / Floating / Scroll / Status 专项审计

2026-10-09；仅审计，未修改业务源码。证据根目录 docs/ui-audit/current。

## 独立 Focus 状态机和生命周期

`请求 → 校验 → 同owner/tab查询复用 → 锁内预留 → 创建真实Webview → focus_take → FileSource/会话restore → ViewerHost加载 → 活动/最小化 → close/destroy → owner资源回收`。

|环节|当前实现与证据|缺口/验收|
|---|---|---|
|创建/复用|focus.rs:16–38；main唯一创建者；锁防重复；最多8个|重复同tab实测复用；8/9窗口并发与创建失败回滚未实测|
|源边界|focusWindow.ts:7–10拒浏览器、虚拟、dirty；Rust校验tab长度/主题/64KiB状态并FileAccess.load|未保存/VFS/无授权路径需专项；保持现有边界|
|打开态|session.serialize→snapshot→restore；原生第3页确实一致|重复复用不更新已开窗口快照；页/缩放/播放时间迁移逐格式待测|
|跨窗文件变更|Focus listen elorin://file-closed；按focusExitOnFileClose处理|未发现Focus完整rename/delete/reload/持续会话同步协议；主App watcher不能证明Focus订阅|
|状态所有权|每Webview JS内存独立；Tauri源新建；初始主题快照|ui-settings只本窗notify，无跨窗设置广播；持久化文件写队列跨窗冲突待验证|
|导航/zoom/play|复用ViewerHost及格式插件命令|顶栏不是图08紧凑一行；仍有Host格式/文件头和Viewer局部工具栏|
|隐藏|FocusWindow.tsx:22 2500ms；顶边80px/焦点/visibility触发；排除dialog/更多菜单|浮动region/input/拖动未统一交互锁；实测隐藏后65px空白，正文y不变|
|Esc|浮层capture先关闭；Focus bubble再退出真正fullscreen或reveal|不支持设定Esc关闭Focus；alertdialog/menu完整优先级组合待测|
|浮层|PDF搜索/页码/缩放、Focus缩略条；Inspector默认浮动|主window缩略抽屉≠横向虚拟带；每格式能力需筛选|
|底部|ContextualStatus.tsx:20返回null；reference.css:43 footer display:none|按需reveal根本未实现；实测0项且footer矩形0|
|关闭|独立退出保持main；main销毁其Focus；lib owner清理|关闭后完整句柄/子进程/显存/长期内存计数未验证|
|任务栏/多屏|真实顶层窗普通尺寸，窗控复用windowAdapter|硬件125/150/200%、跨显示器坐标和Win吸附待验证|
|异常|创建失败registry.remove；Focus error alert|解析失败/文件被移除/热重载StrictMode重复take/授权回收专项待测|

原生6项检查通过，但使用现有debug exe+当前开发前端；不能证明刚构建release包体一致。初始恢复文档弹窗以及隐藏顶栏导致测试阻挡的失败记录保留 native-first-failure.json；测试通过前需要正确处理恢复提示并将鼠标移至顶边唤出，不强制点击隐藏按钮。

最小后续方案：继续使用现有focus_open。先加本窗Status可见状态和顶栏交互锁；再定义versioned window/tab/file DTO，文件通知共享，导航默认各窗独立，同步显式选择，含origin/revision避免回环。不得共享不可序列化模型或直接把dirty文档转移。

## Floating Layer

FloatingPanel.tsx:3–25：document.body Portal；模块layers栈；owner WeakMap/有界string Map布局缓存；position/pin/collapse；clamp；鼠标capture+方向键16px移动；top Escape；非pin点外关闭；卸载删监听并恢复仍连接的触发焦点。Pin表示防点外关闭，不是Dock或OS置顶；布局只存内存，不跨重启。Inspector Float/Dock属于ViewerHost布局切换。

|八类|真实调用|结论|
|---|---|---|
|Search|PdfViewer Search Panel；Text/JSON另有局部搜索|部分：PDF可用，不是全格式同一搜索层|
|Zoom|PdfViewer Zoom Controls|部分：真实比例/fit/旋转；其他格式不能由PDF推定|
|Thumbnail|PDF Focus Thumbnail Strip|部分：竖向列表；横向虚拟缩略/媒体关键帧未完成|
|Page Navigator|PdfViewer Page Navigator → go|已接线且浏览器实测；Focus局部交互专项待测|
|Inspector|ViewerHost PluginSurface:79–85|已接inspect真实数据与Float/Dock；选区高频刷新完整性待测|
|Media|MediaViewer MediaControlLayer → PlaybackController|实测浮动播放控制接线；字幕/转录/关键帧需真实能力|
|Toolbar|ViewerHost:266 action registry|动态现有actions；图片局部浮动控件不等于通用层全能力|
|Quick Actions|ViewerHost:266 FileDetailsCard|仅已有真实命令，分享/移动/回收站删除等缺完整业务|

Popover/Menu/Tooltip/Modal分别存在，未发现统一覆盖所有类别的LayerManager。Anchor只提供初始rect left/bottom，clamp不是flip或跟随anchor；内容变高只初次/resize clamp，无面板ResizeObserver；Dock/边缘吸附/跨重启未完成。键盘焦点返回代码存在，但旧单测名称包含return focus而断言主要pin/collapse/Escape，不能假称完整焦点测试。Viewer卸载会清理局部面板，持久缓存WeakMap对象生命周期；层级与固定scroll overlay需hit-testing专项。

验收：依次开每八类→改真实数据→两层Esc顺序→Pin点外→Collapse→拖到四角→变窄/200%→关面板焦点→切文件/卸载观察监听和旧数据；Modal必须trap focus，非modal浮层不能冒充对话框。无服务按钮保持禁用/隐藏并说明。

## Scrollbar

ScrollbarSystem.tsx:4–31 selector覆盖 sidebar/settings-nav/settings-page/viewer-scroll/viewer-panel/pdf-viewport/pdf-thumbnails/pdf-outline/text-viewport/markdown-reader/markdown-source/json-tree/json-source/csv-grid/m10-grid/archive-list/archive-results/geometry-tree/data-tree/data-grid/m11-reading/floating-panel-content/top-file-tabs；匹配且computed overflow auto/scroll才attach。不是所有实际滚动容器自动覆盖：document-thumbnails、recent-media-panel、markdown-reader-pane/source-pane、hex等须逐项检查具体内部owner。

`发现owner → 创建x/y body固定overlay → Resize/scroll更新metrics → pointer/track/key更新原owner → DOM移除/组件卸载release`。thumb最小24px，轨道14px命中；默认可见3px、hover/drag8px；auto opacity .7/always 1。scrollbar隐藏原生，forced-colors初次matches则不挂；动态forced-colors变化CSS退回原生，但JS不重新绑定该媒体变化。

单轴CSV真实拖动、Home/PageDown、10k行虚拟化通过。90帧4倍CPU降速：P50 63ms、P95 71.7ms、84帧>33ms，只93cells；流畅性未达目标。不能仅因DOM少而宣称低配性能通过。

风险：fixed body坐标来自getBoundingClientRect，root CSS zoom需检查缩放转换；rect未裁剪祖先scroll viewport；双轴角落重叠无交叉保留；只观察firstElementChild尺寸，深层内容变化未必触发metrics；MutationObserver只观察root，对body Portal中新owner可能漏发现；x条也接受上下箭头；缺aria-controls和数值单位；overlay层21低于浮层50可能完全被浮层挡住（Focus实测几何范围重叠，命中实测未做，不能标已证实失效）。滚轮/触控板靠既有容器行为；轨道自身没有wheel转发，鼠标在track上的wheel待测。

验收：默认/hover/drag/track及Page/方向/Home/End；横竖同时，嵌套滚动与祖先裁剪；root scale80/125/150%；硬件DPI100/150/200%；系统强制颜色动态切换、减少动画；开浮层后滑块不能丢失；长内容变长保持锚点；卸载后body overlay/observer归零。

## Contextual Status

ViewerHost:84合并slots.statusBar + ContextualStatus，ViewerShell:33附近footer。statusItems.ts实际位于ContextualStatus.tsx:6–18；priority error5/loading4/edit2/其它0，model需同时subscribe+snapshot才订阅。session更新由Host重新render贡献，dirty是否及时更新取决现有订阅；并非完整结构化StatusProvider。

|格式|数据源|限制|
|---|---|---|
|PDF|metadata.pdfPage/pdfZoom + model.document.numPages|初始缺字段则不显示；无搜索计数/fit文本|
|Text/Markdown/JSON|model.encoding/EOL + metadata.textSelected/textColumn|encoding缺时默认UTF-8可能不代表真实检测；三类选择字段并不统一|
|CSV|csvSelection/csvHeader/filter + rowSource.count/columns/status|未完全索引加“+”；地址与表头可见行语义需逐项核对；无统计范围|
|Spreadsheet|无专用分支|仅通用模式/已有slot，不能当CSV状态已覆盖|
|Archive|model.entries.size + metadata.selection|是否完整条目/当前目录，selection实际写入键需核对|
|3D|document.units/nodes.length + selected|模型是真实来源；undefined省略；live subscription需snapshot契约验证|
|Media|明确返回null|主要播放器状态保留；必要错误/长任务是否独立可发现待测|
|Focus|明确返回null + CSS隐藏footer|没有按需显示；默认隐藏不等于reveal能力|

auto/show源码同分支且本轮PDF实测文本/高度/display相同；hide通过App.status-hide CSS与组件共同作用。隐藏不能吞重要任务反馈，现有外部错误提示需测试。状态项为span，无点击zoom/encoding动作；未实现结构化visibility/action/freshness、多窗口广播或独立reveal计时。最小修复复用statusItems，添加策略宿主与事件更新，限制不可证字段，并保持文件/owner清理；不新增第二套状态数据。
