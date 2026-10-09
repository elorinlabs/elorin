# Module 26 运行代码交付与验证

日期：2026-10-09。分支：`feature/module-26-floating-scroll`。

本批已修改实际生产组件，尚不能宣布所有验收指标通过：CSV 的 4 倍 CPU 降速 P95 ≤33ms 目标未达到。硬件多屏及系统 DPI 条件未验证。未展开 Module 27。

## 源码与保护边界

Module 25 的 `771864` 修复保留在基线 `764a2359073b0a6e15efeb9534058613a38e8d26` 中；该基线已合并并推送 develop。本批独立提交：

- `5ce30dd`：共享浮层、层级、事件驱动滚动条和现有入口。
- `16666ad`：PDF Enter / Shift+Enter 导航真实搜索结果。
- `72e8886`：Text、JSON 和工作区源码搜索复用浮层。
- `5354537`：修复 PDF 命令注册导致的持续渲染循环，增加针对性回归测试。

[运行代码完整 Diff](docs/qa/module-26/runtime.diff) 与 [修改文件清单](docs/qa/module-26/runtime-files.txt) 均以 Module 25 基线对比；真实改动位于 `src`，并非新增一套 Focus 或浮层实现。未修改正式 Tauri identifier、文件授权协议、格式注册和模块引擎。前端 QA 使用独立 `app.elorin.module26.qa` 配置，测试恢复数据保留在测试配置历史目录。

## 实际行为与验证范围

| 项目 | 改动与验证 |
|---|---|
| FloatingPanel | 动态锚点、边界避让、内容 ResizeObserver、窗口缩放后重新定位；拖动、指针捕获释放、键盘移动、Pin、Collapse、关闭与焦点返回 |
| 层级 | content / toolbar / scrollbar / panel / dropdown / tooltip / modal / notification / window；点击或聚焦面板提升；Esc 仅关闭当前顶层，Modal 优先 |
| 生命周期 | Viewer 失活/卸载关闭所属面板；主窗口与 Focus 分别维护窗口内浮层；缓存有数量上限；清理监听器、观察器、拖动状态和待执行帧 |
| 八类功能 | 搜索、缩放、PDF 缩略图、页码跳转、Inspector、媒体控制、浮动工具栏、快捷操作均调用现有能力；无伪造 Viewer 能力 |
| 搜索 | PDF、Text、JSON Enter/Shift+Enter；Markdown 使用已有工作区源码搜索；页码草稿仅 Enter 提交，错误范围提示和 Esc 取消 |
| 滚动条 | 同一引擎处理双轴、交角、键盘、轨道/滑块/滚轮、嵌套裁剪、浮层 Portal 和卸载；布局读写批处理、几何缓存和按变化更新，无持续空闲轮询 |
| 无障碍 | 轴向键盘隔离、ARIA 值与标签；运行时 forced-colors 移除覆盖层并恢复原生滚动条。CDP 媒体模拟已验证，物理 Windows 高对比度未验证 |
| 兼容性 | 七语言目录测试；原生法语长文本、主题切换、125% UI 缩放、新建文件真实创建/关闭；PDF、Text、JSON、Markdown、CSV、Archive、Image、Media、Geometry 和 Focus |

截图均为实际 Tauri WebView 内容，不以设计图代替；不等同于 OS 桌面合成截图。见 [QA 目录](docs/qa/module-26)：01 搜索、02 页码/缩放、03 缩略图、04/05 Inspector、06 边界、07 CSV 双轴、08 Focus、09 深色、10 最小窗口、11 法语、12 Modal，以及各 Viewer 与 1920 窗口截图。

## 测试与构建

- 前端 **884/884**：含新增 PDF 命令注册回归、浮层/滚动条边界与页码输入；[完整结果](docs/qa/module-26/frontend-tests.json)。
- Rust **47/47**：[日志](docs/qa/module-26/rust-tests.txt)。
- TypeScript 与生产前端构建通过：[日志](docs/qa/module-26/frontend-build.txt)。
- 隔离 Tauri 原生构建通过：[日志](docs/qa/module-26/native-build.txt)。构建仍有现有大 chunk 警告。
- CSV 测试等待异步重复列名提示，不再把首次表格显示当成索引完成。

## 性能与稳定空闲

数据表、真实进程与资源结果见随交付生成的 [测量汇总](docs/qa/module-26/measurements.md)、[原生结果](docs/qa/module-26/report.json)、[独立双面板回归](docs/qa/module-26/panel-idle.json)、[改前 CSV](docs/qa/module-26/before-csv-profile.json)、[改后 CSV](docs/qa/module-26/after-csv-profile.json)。CSV：10000 数据行 ×32 列，索引完成后，1366×768 相同 CDP 视口、4× CPU，三轮各180帧，同一滚动轨迹。DOM 数、P50/P95、>33ms 比例与布局读取均保留，不能把布局读取减少等同于总体性能达标。

双面板诊断曾发现 PDF 每次渲染重新注册命令，注册事件又触发 App 重绘：约60秒内事件监听器从41060增至1032701，CPU累计64.28秒、内存上涨。已修复并增加自动化测试；[修复前诊断](docs/qa/module-26/diagnostic-before-pdf-idle-fix.json) 仅作为故障证据，不能作为验收通过记录。最终原生测量使用修复后的可执行文件。

每组空闲数据先排除10秒切换期，再测≥60秒。累计 CPU 秒为应用及子进程总 CPU 时间，并非系统 CPU 百分比；内存为进程工作集汇总，包含 WebView 共享页，不能解释为独占内存。测试本身也有监测开销。

## 限制与候选包

- **未达标**：CSV P95 ≤33ms，归属 Module 26 的性能验收；保留真实对照，不冒充完成。
- **未验证硬件**：多显示器跨屏、系统 DPI 150%/200%、物理高对比度。125% 应用 UI 缩放和运行时媒体模拟不能替代这些条件。
- 本批只产生隔离 QA 可执行文件，未发布新安装包。DeepSeek 冻结包来源仍按既有登记处理，不伪造源码对应关系。
- 冻结包 SHA-256：`61ec10318d431ff241508e41446bf15ef20bb4256e5a9fd61efe1820a38e6588`，测试期间不覆盖该包。

交付时保留独立 feature 分支等待验收；不把未达标项视为已完成，不继续 Module 27。
