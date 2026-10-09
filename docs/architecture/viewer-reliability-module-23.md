# Module 23 全局可靠性契约与审计

本模块扩展现有 ViewerController、ViewerHost、Registry、FormatIndex 和 FileSource。没有新增格式解析器，没有建立第二套状态机，没有改变 Logo、生产应用标识或生产权限。验收数据见 `docs/qa/module-23-verification.md`，机器结果以实际日志为准。

## 实际架构审计

| 范围 | 已确认实现、差异与处理 |
| --- | --- |
| Registry / Detection 17 | 单一 catalogue，FormatIndex 校验重复及规则冲突；builtins 懒加载；专业 Viewer 优先，Hex 为显式或兜底路由。逐条审计报告动态统计，不能将注册推断为内容支持。 |
| Controller / Host | 原有 AbortController、清理集合和迟到模型 dispose 可复用。本轮补充 Session ID、递增 Generation、120 秒打开等待边界、取消状态、关闭后拒绝 session 写入；同步抛错也能 dispose。 |
| Binary 18 | Rust 范围读取、decimal u64、分块缓存、取消搜索、每文件 session；沿用已有 native stats 与 Rust 安全测试。 |
| SourceCode 19 | 复用 text plugin 与源码 worker，不建立新路由；非活动普通 Viewer 现在由 Host 取消卸载、恢复重开，代价是重新解析。 |
| Scientific 20 | DataModel 自有 generation、任务取消、native 科学会话预算、worker 队列；保留其 activity 管理。旧错误字符串会丢失原始 code，本轮追加原始 code，公共诊断保留 SOURCE_CHANGED。 |
| Geometry 21 | 现有模型任务取消、decode budget、GPU dispose、按需渲染；保留 managed suspension，不依赖持续 RAF。内存是否长期增长需重复采样，不能由 canvas 消失判定。 |
| Media / Image 22 | 保留 activity 暂停、媒体移除 src、ImageDecoder 帧释放；专业模型错误加入公共中文诊断。平台 codec 可用性仍由系统决定。 |
| Archive / VFS / FileSource | root source 借用，子源 lease 独占、父会话通过现有引用计数共享。确认 related resource 在取消后返回可能丢失 lease，本轮 bindFileSource 对迟到子源执行释放，绝不关闭父源。 |
| Worker / WASM | 继续各解码器既有 worker 预算与 terminate；不可中断的第三方 Promise 停止等待并丢弃结果，不能声称强制结束 CPU。WASM 分配器缓存与物理内存回收不等价。 |
| Tabs / Preferences | 既有 source identity + plugin ID session store，弱引用、序列化 64 KiB 上限；无效保存 mode 现在校验后回退首个真实 mode，不跨 plugin 应用。 |
| Errors / Controls | 保留原始 code 和 message，公共 13 类诊断、中文恢复、技术详情。修复 More 菜单遗漏 disabled；不增添通用假 Zoom/Fit。各专业 Viewer 的局部预览范围继续由其既有说明呈现。 |
| Rust IPC / 权限 | 无扩大路径授权、协议或 CSP。复用已有本地授权、VFS/科学/Binary 会话和退出析构。 |

确认缺陷与测试脚本缺陷分开记录：新增头部 role=status 与 JSON 状态测试冲突已改为 aria-live；原生脚本曾错误要求隐藏 audio 可见、关闭一个标签后全局 Host 消失、快速切换后瞬时 Ready，这些是 QA 选择器/时序错误，修正后仍保留真实内容、关闭计数和最终 Ready 断言。它们不证明生产 Viewer 解析错误。

尚属未证实：30 分钟趋势、旧 i5 实机吞吐、系统 GPU 驱动分配缓存泄漏；不将怀疑写为已修复。现有 activity hook 每消费者创建事件订阅，非全局单例，但无常驻轮询；本轮没有无证据大改。

## 全局 Viewer Lifecycle Contract

逻辑 CREATED 对应 idle；OPENING 对应 resolving/loading；READY 对应插件模型已交给视图，**不等价所有页面、数据块、帧均已读取**。专业模型仍显示 loading、sample/partial 或 codec/structure 限制。

SUSPENDING/CLOSING 是同步取消及清理过程；SUSPENDED 对应 Host suspended 或 managed model inactive；RESUMING 是重新 start 或 model.setActive(true)；FAILED 对应 error；CLOSED 是 Host 卸载/Controller.stop 后的终止会话。Cancelled 是用户终止打开的独立可恢复结果。无需增加第二个枚举状态机。

1. 每次 start 先 stop 前会话，生成唯一 `viewer-{controllerId}-{generation}`；同会话 context、signal 与闭包关联。
2. 文件适配、registry resolve、plugin load 统一有界等待；默认 120 秒，可在 Controller 构造时配置测试时限。取消立刻中断等待并执行已注册清理。
3. 不可取消原始 load 可能继续执行。其结果仅允许进入自己的 dispose，永远不能 publish 到新会话。等待有界不表示第三方执行时间有界；真实昂贵解码仍靠现有 worker terminate/任务预算。
4. 清理函数只执行一次；stop 可重复。加载中 plugin.dispose 延迟到原始任务结束，避免对尚未创建的模型假释放；同步 throw 解除 loading 后正常 dispose。
5. 普通插件隐藏/最小化由 Host 停止并卸载，活动后重新打开。声明 `suspension:'managed'` 的媒体、图像、科学、几何、Hex 由已有 activity 模型释放昂贵资源，恢复同一模型。重复 active 不重建。
6. Inspector 异步结果、session 更新检查所属 signal；专业模型内部继续使用其原有 job generation，禁止迟到结果写入已关闭模型。
7. 用户重试开启新 generation；关闭父文档仅由 Workspace 的源所有者执行，Viewer 不关闭借用 root source。

## Resource Ownership Matrix

TERMINATED 是资源已释放后的不可访问阶段，不是第二个所有者。下表的拥有者负责幂等释放。

| 资源 | 所有权 | 拥有者与释放边界 |
| --- | --- | --- |
| 本地源 / 文件授权 | BORROWED | Workspace 拥有 source；Viewer 只借用。Rust 安全范围读取另有独占 native handle。 |
| Binary Session / range cache / search | OWNED | Hex model，abort/close 清 session、缓存、搜索；Rust stats 验证。 |
| Scientific Session / task / decode budget | OWNED | provider / DataModel，inactive、close、worker terminate 与 Rust 会话关闭。 |
| Archive parent / VFS parent | SHARED | 既有 lease manager 引用计数；子文件持有父 lease，关闭一个子源不能提前释放父容器。 |
| related child source | OWNED | FormatResourceScope 或现有 resolver；取消后迟到返回由 bound source 释放一次。 |
| Worker | OWNED | text、PDF、scientific、geometry 等模型/decoder，context cleanup、generation abort、terminate。 |
| WASM memory | OWNED / SHARED | decoder instance 或已有模块 runtime；释放逻辑对象，库缓存不承诺立即返还系统 RSS。 |
| ArrayBuffer / 临时索引 / 解码缓存 | OWNED | 范围/页/解码预算缓存，清理集合与 model.close 清引用；JS GC 时间不可强制。 |
| ImageBitmap / VideoFrame | OWNED | image decoder 当前帧，换帧、隐藏、close 调用 close。 |
| AudioContext / HTMLMediaElement | OWNED | media engine，暂停、移除 src/load、关闭音频分析上下文与对象引用。 |
| ObjectURL | OWNED / SHARED | creator/release lease；解绑元素后 revoke；native media URL 关闭其 resource lease。 |
| Event Listener / Timer / ResizeObserver | OWNED | 注册组件 effect cleanup 或 context.onCleanup；无常驻扫描新服务。 |
| Canvas / WebGL Context | OWNED | viewport engine，隐藏、卸载 dispose；恢复按需重建。 |
| GPU Geometry / Texture / Material | OWNED | geometry engine，替换和 dispose 释放；不以 DOM 数量代替驱动内存证明。 |

## 错误分类与恢复

| 分类 | 用户恢复 |
| --- | --- |
| FORMAT_UNKNOWN | 查看格式信息、显式 Text（文本源）或 Hex |
| FORMAT_UNSUPPORTED / CODEC_UNSUPPORTED | 保留已读取元信息；说明当前能力；Hex 或系统外部程序 |
| SOURCE_UNAVAILABLE / PERMISSION_DENIED / SOURCE_CHANGED | 检查授权、重新打开源；重试不自动授予新路径 |
| FILE_CORRUPTED / INVALID_STRUCTURE | 技术详情、原始 Hex；不将无效结构自动降级为 unknown |
| RESOURCE_LIMIT_EXCEEDED | 说明读取/等待预算，重试或有界原始查看 |
| DECODE_FAILED / RENDERER_UNAVAILABLE / INTERNAL_ERROR | 保留原始 code/message，重试新会话或其他实际可用 Viewer |
| OPERATION_CANCELLED | 独立取消状态，可手动重试；不显示普通失败 |

公共 Host/ErrorBoundary 和主要 image/data/media/geometry 模型诊断采用同一词汇；专业插件既有错误/局部说明没有全部重写。旧 `category` 兼容接口仍保留，不作为新公共诊断事实来源。

## 回归运行

`pnpm regression:fast`：Registry/Detector/Host/生命周期/错误/目录审计。

`pnpm regression:standard`：FAST、完整 TypeScript、Rust、构建、31 个真实样本浏览器回归。浏览器服务需先 `pnpm dev`，Playwright 路径通过 `PRISM_PLAYWRIGHT` 提供。

`pnpm regression:extended` 默认显式记录原生、长测和安装 NOT_RUN；加 `--run-native` 在隔离 CDP 9230 实例执行短测。长测每项使用新隔离实例独立运行 `node tests/module-23-native-qa.cjs --mode=idle --duration=1800 --close` 或 `--mode=cycles --duration=1800 --close`。短测结束会关闭应用，因此不能对已退出实例直接连续执行长测。

原生配置参考 `.qa-tools/module23-tauri.json`，identifier `app.elorin.module23.qa`，WebView2 user data `.qa-tools/module23-webview`，远程调试 9230。先构建/启动隔离 dev 实例并将准确 Rust PID 写入 `.qa-tools/module23-native.pid`。生产配置不改。结果六种状态分别计数，not_run/skipped 不计 passed。
