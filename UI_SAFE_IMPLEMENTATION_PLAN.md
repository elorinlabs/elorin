# 安全实施计划（等待下一批批准）

2026-10-09。本轮只写审计文档、证据与审计工具；不修改Module24、业务源码或品牌兼容标识。无.git，因此无法确认在制冲突、分支、提交状态。下一批修改前恢复/提供真实Git上下文并核对项目正式Module25–35职责表；本计划工作包不是擅自给模块编号。

## 分批顺序

|优先级/批次|现有最小改动路径|范围与验收|
|---|---|---|
|P0 A 运行基线|main/App/CSS只检查；构建与QA脚本|记录source→dist→exe hash/URL/profile，主窗Home/Settings/PDF/Focus普通/最大化/窄窗；旧安装exe证据对齐后再判断缓存|
|P1 B Focus现有体验|pages/focus/FocusWindow.tsx、workspace/reference.css、ContextualStatus.tsx/ViewerHost|保留focus_open；消除隐藏65px空白、提供底边/快捷键/操作reveal、加入region/input/drag交互锁。截图对08，同一PDF同页同zoom；隐藏前后正文无布局抖动|
|P1 C 状态策略|ContextualStatus、ViewerShell、ui-settings、各真实metadata消费者|auto/show/hide有明确差异；真实字段未知省略；必要error/task保留；切文件无旧状态；图片/工作簿/3D/媒体逐类实测|
|P1 D 浮层与滚动|FloatingPanel、ScrollbarSystem、reference.css；现有各Viewer调用|补动态内容clamp、anchor flip、Portal owner发现、祖先裁剪/双轴角落/zoom坐标与统一层级；八类分别验收，不重建FloatingPanel|
|P1 E 性能|ScrollbarSystem事件测量、GridSurface/virtual-grid及现有CSV渲染|先profile定位瓶颈，禁止直接重写解析器；同10kCSV/同viewport/同降速90帧，P95达约33ms或明确硬件预算，虚拟DOM仍有界；老i5实机待测|
|P2 F 各页面布局|Home/Settings/各Viewer既有组件及共享tokens|依11/02/目标图对结构、栏宽、文字、颜色；正常/最大化/窄窗/主题/125–200%，引用实际数据；每图逐控件pending清零后才验收|
|P2 G 设置/跨窗协议|ui-settings/integration、FocusWindow、服务事件层|先持久化后发布，失败不假成功；窗间origin/revision；按明确状态所有权同步设置和文件通知，导航独立/可选同步；避免跨窗覆盖写|
|P2 H 新能力/国际化/品牌|正式后续模块确定后才实施|完整字典、系统语言/RTL、字幕转录、归档安全写回、通用回收站操作均独立范围；兼容scheme/identifier迁移有数据恢复计划|
|最终整体验收|正式Module36计划|资源/退出进程、低配、多显示器DPI、访问性、安装升级与隐私；没有证据不能称完成|

## 本轮证实的5个差异与最小办法

1. 图08：顶栏opacity0仍占65px，native-report.hiddenComputed与native-focus-hidden.png证实。保持原生窗，改既有顶栏为边缘浮动层并用交互锁维持可达，避免display切换引起正文跳动。
2. 图08/第14章：Focus状态组件0项、footer display:none。复用statusItems提供短暂底边宿主；不要简单常显厚栏。
3. 图01/第14章：PDF auto/show实测内容、高度、display完全相同，status-probe.json；ContextualStatus只有hide分支。加auto的事件/必要信息策略并保持hide独立重要反馈。
4. 图08：Focus仍显示通用格式折叠行、文件名/路径/Host状态及开发Inspector，native-focus.png与ViewerHost/main DEV分支可复核。对Focus传现有宿主variant，精简重复header；生产不能依据开发Inspector画面断言release泄漏调试。
5. 图04/性能目标：10kCSV90帧P50 63/P95 71.7ms（4×降速），84帧>33ms。先减少重复测量及渲染工作，用相同场景profile/复测；无需更换CSV解析引擎。

## 验收门禁与停止点

每批输出真实diff、构建/测试、主窗及Focus截图、computed styles、性能/生命周期证据和限制。先结构后像素。背景任务取消/异步旧结果污染、多窗并发、关闭资源、损坏文件均为阻断项。当前981项矩阵里待验证项仍很多，不能用本轮测试结果替代逐控件/逐尺寸验收。

本轮审计报告完成后停止修改；下一批建议批准B+C的最小Focus/状态修复，前提是先确认Module24冲突边界。当前用户授权遵照附件中的只读阶段，未等同批准这些代码改动。
