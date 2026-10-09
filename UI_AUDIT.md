# Elorin 本轮源码与运行审计

日期2026-10-09。执行用户附件启动指令中的只读审计阶段；Module24及业务源码未改。核心交付：[运行映射](/D:/Prism/UI_RUNTIME_MAP.md)、[逐图矩阵](/D:/Prism/UI_FEATURE_MATRIX.md)、[Focus/浮层/滚动/状态专项](/D:/Prism/UI_FOCUS_FLOAT_SCROLL_STATUS_AUDIT.md)、[安全实施计划](/D:/Prism/UI_SAFE_IMPLEMENTATION_PLAN.md)。

## 证据与真实范围

- Git status、branch、diff：当前D:/Prism不是Git仓库；分支/未提交差异/Module24正式验收不能核实。
- 1007项源文件/资源/配置SHA256前后核对目前零变化，source-verification.json。仅新建根目录报告与docs/ui-audit/current审计证据/工具/独立构建输出；旧docs报告保留。
- ZIP内README与11PNG和工作区参考图逐项hash相符，reference-verification.json；本轮已查看全部11图。
- 历史docs/UI_RUNTIME_MAP和958项矩阵存在过时“Focus/设置/共享滚动/状态不存在”的结论，不作为当前完成证明。新矩阵981项保留目标控件清单并另列23配置字段，大量待验证项未完成具体事件追踪，不能称全控件验收完成。
- 当前主App、独立Focus、Settings、PDF及各Viewer调用链已核查。未新增Home/Focus/FloatingPanel/ScrollbarSystem/Status组件。

## 本轮验证

|检查|结果/证据|限制|
|---|---|---|
|TypeScript noEmit|通过，types.log（空输出、退出0）|不修改tsbuildinfo|
|Vite生产前端构建|通过，build.log；输出current/build|未替换dist/安装exe；保留>500kB chunk警告|
|前端全量测试|45文件、827测试通过，tests.log|不等于981控件逐项验收|
|浏览器Viewer/设置|10检查通过、0pageerror，viewers-report.json|26设置路由、CSV拖动/键盘/虚拟化、PDF浮层、Markdown、Archive VFS、CAD、Media；非硬件DPI|
|原生Tauri窗口|6交互通过，native-report.json|现有debug exe加载当前DEV URL，不是新release内嵌包体验收|
|PDF状态策略|auto/show内容和26px高度/display相同，status-probe.json|浏览器当前PDF场景，非所有插件|
|Rust全量|见current/rust-tests.log和validation-summary.json最终记录|仅以本轮完整结束结果为准，历史86通过不计本轮|

原生初次连接失败、恢复弹窗阻挡和隐藏顶栏不可点击失败如实保留，native-first-failure.json记录后者。成功运行通过移至顶边唤出后操作，不强制点击隐藏控件。脚本最初报告中的“packaged/isolated”描述不准确：actualURL是127.0.0.1:1420，真实backend写入app.prism.desktop数据。应以本报告和实际URL/目录为准。

## 已证实的差异

1. Focus顶栏隐藏后opacity0但仍占65px；正文区域y212.5/height566不变。
2. Focus底部状态0项，footer display:none；缺按需唤出。
3. PDF状态auto与show本场景完全相同，缺差异策略。
4. Focus仍有通用格式说明、文件头/路径和开发Viewer Inspector；图08要求的紧凑阅读结构尚未完成。开发调试元素不作为release泄漏证据。
5. 表格10k行4倍CPU降速90帧，P50 63ms/P95 71.7ms、84帧>33ms，93个渲染cell；虚拟化有效但流畅目标未达。

根因边界：只改DEV Showcase不能改变主App已证实；多个CSS重叠和原生debug开发入口已证实；当前App已展示新界面。用户历史看到旧UI的唯一原因缺当时进程/包体hash，不能武断归为缓存。最小后续办法见安全计划。

## 视觉、性能与稳定性限制

本轮截图来自实际组件：native-home.png、native-pdf.png、native-focus.png、native-focus-hidden.png、native-settings.png及26设置/各Viewer截图，均在docs/ui-audit/current。native-home包含实际恢复提示，是启动状态证据，不算无遮挡首页验收截图。

图01多项故意禁用；图02八类浮层存在程度不同，菜单/模态未统一Manager；图03CAD数据是真实解析但材质编辑服务未完成；图04CSV选择/列可用但全局公式重算缺；图05源码/预览/JSON分别可达而非固定三文件样例；图06有按需VFS预览、归档写回缺；图07真实播放但关键帧/转录缺；图08见上述差异；图09渲染与浮层可用而PDF编辑缺；图10真实最近/收藏而非全盘管理；图11保留既有Logo，参考原始Logo独立资产缺。逐尺寸像素级对比均未完整验收。

10秒浏览器Home空闲TaskDuration约0.0269s、ScriptDuration0.000215s、Layout0，仅有限样本。未验证老i5实机、长期内存/句柄/显存、最小化持续渲染、全进程退出、触控板、读屏器、多显示器硬件DPI。CSS computed值已保存，实际Inter字形命中未验证。

## 审计操作对本机数据的影响

业务源码只读，但原生测试对现有app.prism.desktop数据写入了空工作区、测试PDF最近记录和statusBar show/auto，并发生窗口位置写入；WEBVIEW2_USER_DATA_FOLDER仅隔离WebView缓存，未隔离Rust app_local_data_dir。没有事前保存原设置/工作区快照，无法可靠恢复未知旧值。恢复文档提示选择Cancel，未选择Discard。此处是本轮验证方式的限制，后续应先备份应用数据或使用确认过隔离identifier的新QA构建。用户文件内容未被这些脚本编辑。

## 停止与后续

遵守附件审计结束等待批准的门禁，本轮不启动代码修复。建议下一批对既有Focus顶栏和状态策略做最小修复（工作包B+C），先核对Module24边界；正式25–35职责表待确认。矩阵中待验证项继续作为独立审计工作清单，不伪称所有11图完全审计/还原。
