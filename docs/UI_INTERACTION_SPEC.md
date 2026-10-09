# Elorin UI 交互与生命周期设计

本文件区分**现状证据**与**后续目标协议**。后者尚未实现，须在相应正式模块授权后执行。依据 Master Spec 0–15 与11图；Module24冻结。路径相对 D:/Prism。

## 1. 主窗口与命令路由

现状：App本地状态管理路由和标签；ViewerHost复用Registry/Controller，ViewerShell组合区域，commands/registry与viewer-bridge接真实动作。后续在这些边界增量改造，不再新建App入口或解析器。

目标布局：Windows Chrome → file tabs/global search → 当前Viewer工具栏 → 左抽屉/内容/右Inspector → 可选单行状态。Home与Settings不挂空Viewer工具栏；主内容先获得剩余宽高。建议初始约束：导航展开208–240、图标64、左抽屉160–280、右Inspector240–360、中央最小320 CSS px；这些是拟定布局参数，须以参考图和真实内容验收，非现状保证。窄窗先收自动面板，再将次要命令放overflow；手动pin/展开优先，不偷偷覆盖用户保存布局。分隔线鼠标拖动与键盘增减均支持，超过min/max钳制，提供Reset Layout。窗口不可因长文件名/翻译横向扩张。

命令目标统一为 `{windowId, tabId, fileId, viewerId, generation}`；命令执行前检查owner仍活动、能力可用、权限有效。用现有ViewerAction/Command扩展owner和禁用原因；禁止组件直接读取后台活动tab的闭包或跨窗口共享函数。handler→service→进度/错误→owner状态；异步结果owner或generation不匹配即废弃并释放资源。

| 触发 | 行为/状态 | 异常 |
| --- | --- | --- |
| Open/Ctrl+O/拖放 | idle→authorizing→detecting→loading→ready；成功建/激活真实tab | 取消返回原tab；权限/路径/格式/解析/codec错误分别呈现；可安全Hex/系统打开才展示 |
| 单击标签/Ctrl+Tab | 保存旧视图快照→暂停旧非必要任务→激活新owner→恢复状态 | 不等待旧大文件完成；旧回调不得写新tab |
| 标签重排 | 仅改变顺序，active按稳定tabId保持 | 不以索引作持久身份；拖文件与拖tab用不同MIME |
| Close/Ctrl+W | clean立即close；dirty进入确认→Save/Don't Save/Cancel | Save失败保留tab；Cancel不释放当前渲染/编辑；禁止隐藏错误继续退出 |
| 主窗Alt+F4/系统菜单Close | 同一关闭协调器，包含所有真实dirty owner | 必要任务可取消/等待，不重复弹窗；flush失败显示重试 |
| 新建 | 仅已有Text/Markdown/JSON/CSV能力 | 不展示尚无创建器格式 |
| Rename/Move/Delete | 后续有安全系统服务才启用；Delete默认回收站并明确名称 | VFS只读禁用；永久删除单独明确确认；失败不从列表伪移除 |
| 切换主题/语言 | 根tokens/locale更新，保留同一Viewer/model与位置 | 不靠卸载重建PDF/CAD实现换色；缺语言项有回退 |

键盘优先级：IME/编辑输入 → top modal → top temporary overlay → 当前Viewer命令 → 当前window workspace → Global。Esc每次仅消费一层；Ctrl+F针对当前Viewer能力，源搜索是明确降级；Ctrl+S仅真实可保存文档；Ctrl+W不能被隐藏标签监听重复消费。Tab在非模态正常遍历，modal trap后恢复触发点；tooltip不抢焦点；右键与键盘Menu/Shift+F10产生同一上下文动作。不得以阻止全部wheel或keydown解决冲突。

## 2. 状态分层与持久化

| 层 | 所有者/数据 | 保存与销毁 |
| --- | --- | --- |
| 全局配置 | Settings schema版本、theme、language、accessibility、layout defaults | 复用productivity settings存储；校验/迁移/默认值；变更有消费者才算生效 |
| 文件 | 稳定fileId、授权描述、revision、元信息、外部变更 | Rust broker受控引用，不共享任意路径访问 |
| workspace | tab顺序/最近/布局；排除不可恢复虚拟源或保存可重授权描述 | 复用workspaceManifest；扩展version迁移，保留128/预算 |
| window | label、geometry、focus/fullscreen、各view state | 独立owner；屏幕外位置恢复钳制；窗关闭清理 |
| viewer | page/time/zoom/fit/scroll/selection/query等格式DTO | 现有session.metadata为来源；跨窗通过白名单快照，不复制整个model |
| overlay | owner、type、anchor、position、pin、focusReturn | 临时层关闭即释放；只持久化用户明确pin/layout，不存查询敏感内容默认 |
| task/status | id、owner、generation、progress/cancel/error | 完成/取消解绑；错误不随status隐藏设置消失 |

## 3. 独立 Focus View：可执行工程设计

### 3.1 现状与前置条件

不存在独立创建链；App.focusMode与DOMrequestFullscreen不是此功能。复用ViewerHost/Controller/Registry、FileSource协议、serialize框架，但必须先改变**后续模块**的资源owner：lib.rs main reload close_all、minimize pause_all、主窗专用capabilities/Chrome、LaunchQueue固定main不能直接用于多窗。

### 3.2 建议窗口策略与接口（未实现）

默认“一源tab最多一个Focus窗口”，重复点击复用并激活；不同源tab可各有窗口。后续Rust窗口服务生成不可预测label，限制并发数/总CPU/GPU预算，Tauri WebviewWindowBuilder创建真正顶层窗口；建议单独Focus入口组件由真实main.tsx根据**受验证label/启动角色**选择，不用用户可控query直接授权。只打开内置本地前端。

拟议 `focus_open({sourceTabId, requestId, snapshotVersion})` → `{windowId, leaseId}`；窗口通过受调用窗口身份约束的 `focus_take_bootstrap()` 获取一次性DTO：fileId、授权source token、viewerId、revision、page/time/zoom/fit/scroll、theme/locale、panel偏好。读取授权由Rust查tab→file映射派生，不能信任前端传任意路径。u64使用十进制字符串。VFS引用持有archive parent lease，不能复制全文件到JS或未经授权落盘。

来源UI先生成格式白名单快照：PDF `pdfPage/pdfZoom/pdfFit/pdfRotation/pdfScroll/pdfQuery`；Image viewport变换；Media time/volume/rate但**不自动播放**；3D camera/projection/selection IDs；Text逻辑行锚点；其他缺snapshot适配的格式显示明确降级，从开始位置打开而非假继承。传递前校验revision和size budget，64KiB上限可复用；不传canvas/Worker/Three对象/函数/WeakMap。

默认各窗口阅读位置/缩放独立，文件元信息/revision/主题语言共享。开启“同步阅读”是显式后续能力：event `{originWindowId, seq, revision, patch}`，接收方不回发，丢弃重复/旧seq；媒体单一真实播放owner，其他窗口只观察/请求控制，不能双播放器各自发声。第一版Focus可限制只读，dirty来源需明确只显示已保存版本还是显式内存快照；**不得默默丢弃未保存内容**。建议dirty来源初版拒绝进入并提供Save/Cancel，安全编辑多窗另行授权。

### 3.3 状态机与生命周期

```text
closed → requesting → authorizing/lease → creating → bootstrapping → loading → active
任意创建阶段失败 → cancel/close partial window → release own lease → source提示 → closed
active ↔ hidden/minimized（暂停自己renderer/reads）
active → stale-source（改名/删除/变化）→ explicit reload 或保留只读快照/关闭
active → closing → cancel owned tasks → dispose models/worker/GPU/media → release lease → destroyed
```

Focus关闭不关闭主窗，不将独立zoom强行写回来源。来源tab关闭，已授权Focus可继续只读存活（依赖独立lease）；父archive有child引用不得销毁后端。主窗关闭按应用退出意图协调：存在dirty文档先确认；确认后向所有Focus发prepare-close，限定等待超时后Rust按owner取消并destroy；不得main.reload清理活着的Focus。若未来允许主窗关闭Focus继续，须单独用户策略，不暗中留下背景agent。

窗口Destroyed是最终兜底，不能只依赖JSunmount：Rust释放window lease/session/filewatch；JSgeneration废弃迟到任务，terminate Workers、PDF destroy、Three dispose纹理/geometries/render targets、Media pause+clear src+release lease、overlay/status解除。异常崩溃/创建取消重复cleanup幂等。

### 3.4 顶栏、Esc、窗口与DPI

普通独立可resize窗为默认，可最大化/还原/真正全屏；不是强制全屏。Windows控制独立工作。顶栏按格式capability显示，PDF页/fit/search/thumb，Media时间/播放，CADfit/view；任何不可用控件隐藏或禁用并说明。

自动隐藏以一个有限idle timer驱动，top-edge/pointer/键盘操作显示；menu/input/focus-within/drag/thumbdrag/屏幕阅读可达/长任务时持有visibility lock，禁止隐藏。退出lock后重新计时；隐藏/最小化清timer，低配/reducedmotion无复杂动画。工具栏不覆盖可点页码与scrollbar，安全边距由OverlayHost提供。

Esc依次关最上临时层→退出真实fullscreen→若设置允许关闭Focus；普通Focus默认Esc不直接误关窗。Exit Focus明确关闭该独立窗；Alt+F4走它自己的关闭流程。主窗来源保持存在且可重新聚焦。

位置恢复使用Tauri/window-state已有能力，后续补monitor work-area校验；配置存逻辑坐标/尺寸与monitor identity，DPI跨屏不混用screen物理坐标与CSS。丢失monitor时把窗和拖动柄回收当前工作区；最小尺寸和窗控命中需真实100/125/150/200%、双屏不同DPI测试。

### 3.5 阻断验收

PDF第7页125%→Focus启动页7与fit正确→打开搜索next/previous→关panel焦点回正文→收缩略图→普通/最大化/fullscreen→Esc单层→关闭Focus主窗仍在。另测重复点击、同时不同文件、来源tab关闭/VFSparent关闭、源改名删除、创建失败、取消、主窗退出、隐藏/最小化恢复、跨屏、dirty拒绝/Save后进入、资源计数归零。不能用DOM全屏测试替代。

## 4. Floating Layer Manager 独立设计

现有Portal/Dialog/Palette/ContextMenu/Viewer局部float可复用内容与handler；公共管理尚缺。建议以每个真实window一个OverlayHost，依托既有design-system z tokens。状态 `{id,type,owner,anchor,rect,pinned,modal,closePolicy,returnFocus,visibilityLocks}`；owner包含generation，切tab或卸载关闭其临时层。跨window不共享DOMHost。

定位用CSS viewport坐标；anchor ResizeObserver与scroll/resize事件**仅层打开时**订阅，碰撞先flip再clamp，设备scale交给浏览器，不混screen coordinates。可拖动层pointer capture，独立柄stopPropagation；只拖panel不拖canvas/窗口；结束保存限定layout位置，尺寸变化重新钳制。隐藏窗断开不必要observer/帧更新。

层栈：modal阻断背景/inert并trap焦点；context menu替换其他temporary menu；popover可与pinned inspector并存；tooltip不拦截鼠标、不抢焦点。Esc只处理最高可关闭层，恢复仍存活触发点，否则活动Viewer；background点击按策略close，不自动提交面板编辑。所有临时listener/timer/observer随close释放；不是每Viewer各起全局listener或常驻RAF。

### 八类浮窗逐项定义（以下均为目标）

| 类型 | 触发/适用 | 定位/拖动/固定/折叠 | 隐藏/边界/输入协同 | 焦点/关闭状态/资源 |
| --- | --- | --- | --- | --- |
| Floating Toolbar | Viewer工具命令/Focus顶部唤醒；Image/PDF/CAD按capability | 顶部安全区；拖柄可浮动，可pin；窄宽overflow | auto-hide lock覆盖hover/focus/menu/drag；不得盖scrollbar；wheel留给内容 | toolbar roving键盘；关闭回Viewer；只记pin/位置；无轮询 |
| Floating Inspector | Inspect/选区详情；具真实inspect的Viewer | 默认右侧，可脱离为客户区panel、折叠、重新dock | owner变化刷新/缺值不造数；resize钳制；modal时不可操作 | 标题关闭/pin可达，关闭解除model订阅；记layout不记model对象 |
| Search Panel | Ctrl+F/Find；PDF/Text/JSON/CSV/Archive/Hex各搜索adapter | 顶部anchor或用户拖动panel，可pin | debounce与Abort复用后端；next/prev/计数/无结果；切tab取消；输入禁止toolbar隐藏 | Esc先关panel恢复正文；query只按设置保存；释放search任务与highlight |
| Zoom Controls | 点击比例/Ctrl缩放；有zoom语义的Viewer | 靠比例按钮popover，Focus可浮动；不强制可拖 | clamp真实min/max，fit按格式；不截普通列表Ctrlwheel | 关闭回比例触发点；实时同一zoom adapter；无读数轮询 |
| Thumbnail Strip | Thumbnails命令；PDF/图像集合/媒体仅有帧能力时 | 左抽屉或底部浮带，可dock/pin，拖柄与thumb分开 | 有界虚拟化/预取，当前项可见；不盖Media进度/scrollbar | Arrow/Enter导航，关闭取消thumbnail队列/revoke；记显隐和位置 |
| Media Controls | 播放/hover/focus；真实media owner | 画布底安全区；普通模式不另造巨大底栏，可pin | playing idle后隐藏，seek/volume/字幕交互锁定；只驱动同一controller | 控件可访问、Space不误触全局；关闭解绑事件，Viewer退出dispose播放租约 |
| Page Navigator | 页码点击/Ctrl+G；PDF/Presentation/可分页文档 | 顶栏anchor/浮动小panel；可pin | 页码1..N、未加载/错误范围禁用；键盘与工具按钮同一go接口 | Enter提交/Esc取消；关闭恢复触发点；不拥有第二份页码state |
| Quick Actions | 文件More/选区menu；按file/source权限 | 对应anchor客户区popover；默认临时不可拖，后续pin需明确 | Copy Path/Open/Export/Share/Delete只按真实能力；危险操作交Dialog；VFS写操作禁用 | Arrow/Enter/Esc，关闭不改变文件；无残留任务；长任务进度独立于panel寿命 |

补充：Tooltip应延时显示、键盘focus可见；Toast使用有限队列和live-region，错误可展详情；DragDrop只对外来文件显示、drag-leave/cancel清层；Modal沿用documentChoice安全默认，导出/比较/删除没有业务服务时不能启用示例按钮。可拖浮窗与独立OS窗口不同，Focus始终OS窗口。

## 5. Scrollbar System 独立设计

现状M24为原生CSS样式，不改。后续统一ScrollArea只做视觉/输入边界；已有PDF/Text/Grid/Hex virtual engine保持唯一逻辑定位来源，不能把所有容器包多一层导致双scroll。

建议共享协议：`ScrollMetrics{viewportPx,contentPx,physicalOffset,logicalAnchor,axis,revision}` + `scrollToPhysical/scrollToLogical` adapter。普通DOM由scrollHeight/clientHeight与事件提供；Grid压缩高度通过scaleForHeight转换；Hex分段BigIntoffset，明确滑块代表当前segment，并保留全范围Go。**不以Number表达超过安全范围精确offset，不假造全文件thumb映射。**

实现决策：默认可用轻量overlay，但需先做单容器原型验证；若平台/forced-colors/assistive技术不满足则native回退。视觉3–4px、hover/drag7–9px是起点，命中区至少12–16px并可触控放大；track透明，thumb radius由tokens。状态 idle→near/hover→dragging→settling→idle；focus/scroll期间保留位置信号，Reading不可永久隐形。保留原生scroll容器；thumb拖动capture，把track距离映射clamp offset；pointerup/cancel/blur/lostcapture均释放drag状态。track点击行为明确page-step或jump，所有Viewer一致并保留键盘原生语义。

observer仅容器可见时连接，scroll/resize/content revision事件驱动，必要视觉更新合并一个下一帧，静止无循环RAF/轮询。内容长度改变以logicalAnchor重算offset，避免thumb大小变化把正文跳到别处。横纵独立不互抢wheel；overscroll chaining按容器定义，禁止全局preventDefault。Ctrlwheel仅当前zoom adapter声明支持且事件位于内容区才消费；设置/目录列表照常滚动。DOM Home/End与Grid Home/End语义区分：Grid当前Home移动列，不虚称能回全表首行；专门CtrlHome须后续适配并测。

容器迁移顺序：普通sidebar/settings/menu/Inspector → PDF缩略/阅读/Markdown/Text → archive/scene树 → CSV/XLSX/scientific compressed grid → Hex segment → Focus与floating panel。每个记录实际scroll owner/axis/virtual mapping、tabIndex/aria-name、nested chain；隐藏/卸载释放observer/drag/global listener。设置“auto/always”不影响错误任务反馈；forced-colors始终可见native；reducedmotion禁过渡；触控命中/读屏待实测。

验收：wheel/真实touchpad/key/thumb/track，双轴/嵌套、长设置、PDF长页、2^31行函数模拟、>4GiB sparse、连续跳转/滚动、窗口resize/语言/字体缩放保持锚点、Focus工具隐藏不遮scroll；100/150/200%真实DPI与高对比；DOM数量/缓存不随逻辑长度线性增加。不能以DPR+CSSzoom替代物理DPI。

## 6. Contextual Status Bar 独立设计

现状有ViewerSlots.statusBar/ViewerShell footer但无结构化提供者；Archive/Spreadsheet/Geometry/Hex/Data等footer与Host label分散。复用slot作为渲染入口，**新增协议在后续模块完成**。

建议 `ViewerStatusSnapshot{owner,generation,revision,items}`，item `{id,label,value,priority,visibility,actionId?,sourceEvent}`；StatusProvider订阅当前model/session/selection/task，StatusBarHost按当前window/tab选择，未知值缺省。status action绑定Command而非持久化函数；任何旧owner推送丢弃。读数来自本地model，不为展示另起读取/搜索任务。

| Viewer | 真实可复用数据/事件 | 缺失字段处理 |
| --- | --- | --- |
| PDF | PdfEngine文档页数；PdfViewer current/effective/fit/hits/progress、metadata pdf* | 不伪造OCR/注释数；页数未加载显示loading |
| Text/Markdown/JSON | TextModel encoding/lineEndings/stats与选中行/column；DocumentSession dirty/saveState；JSON selected/tree/search | 编辑器实时caret尚需adapter暴露select事件；UTF16字符数明确单位 |
| CSV/XLSX | CsvSelection/rawValue/projection/filter；Workbook sheet rows/columns/selection | 样本统计注明sampled；XLSX缓存公式值不称重算结果 |
| Archive | model.info.entries/complete、selected.size、ExtractionStatus bytes/files/state | 未完成索引显示下界，密码不进status；不展示假压缩进度 |
| Media | PlaybackController subscribe snapshot playing/time/duration/loading/error | 不重复大控制条，缺codec字段不显示；只随timeupdate节流 |
| CAD/3D | model.progress/document.capabilities/units/selected/metadata counts/renderer错误 | 单位unknown明确；FPS默认关闭无定时采样 |
| Compare | CompareView parts与任务state | 当前差异索引尚无导航adapter，不显示假值 |
| Home/列表 | 真实列表/selection/filter/task | 没文件不显示size/page；Settings不挂文件status |

标准高度初始22–28 CSSpx按字体/DPI适配，单行ellipsis/priority collapse，窄屏更多详情可键盘打开；布局保留空间而非覆盖正文。优先级error/safety/task > readonly/dirty > position > metadata。只读可文本，编码/zoom等有命令才为button，图标颜色不能唯一传递状态。

Focus默认不常驻；bottom-edge/快捷键/操作后有限时间浮现，菜单焦点/拖动/长任务lock可见；与Media底部控件、toast和thumb有统一insets，不抖动布局。隐藏status偏好不隐藏错误/取消/危险确认。长任务完成过渡短toast，失败保留详情。

订阅生成即绑定owner，切tab/window/generation先unsubscribe旧provider，清pending throttle/timer再attach新；visibility/minimized暂停高频位置更新，必要task仍可恢复读取最新快照；退出释放所有observer/listener。不能复用一条全局无owner字符串导致串文件。

验收每类两文件切换、迟到任务、所有窗各自状态、长中文/英文200%缩放、错误/取消/完成、隐藏设置、媒体不重复、Focus底部不挡正文；短期与30分钟CPU/heap/进程/受控session采样，低配实机另测。

## 7. 每类Viewer接线与异常原则

- PDF沿用engine.go/render/search，不改PDF内部字形；thumbnail虚拟任务受内存限制；损坏/密码/复制限制分别处理。
- Code/Markdown/JSON复用现有安全parser、related authorization与editor；不执行HTML/脚本；编码改变是显式重解码，未支持保存编码则禁用。
- CSV sort/filter只投影视图；编辑仅DocumentSurface支持范围；XLSX只读状态独立；公式栏区分raw/formula/cached value。
- Archive child租约、嵌套预算、safe path/zip slip/bomb限制保持；三栏内嵌预览可挂同一ViewerHost但必须独立childowner，不沿用App子tab回调绕过cleanup。
- Media关键帧/转录/裁剪缺服务则隐藏，不能从设计图造数据；Focus播放单owner；关闭清src与decoder租约。
- CAD按engineeringCapabilities显示mesh/scene/materials，未知单位不标mm；画布拖动不拖窗口；GPU丢失明确重试/降级，dispose按既有engine。

以上为可执行设计与验收标准，不表示本轮实现这些行为。正式模块编号映射、执行范围与前置冻结门禁见 UI_IMPLEMENTATION_PLAN.md。
