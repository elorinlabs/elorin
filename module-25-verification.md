# Module 25 实施与验证 — 2026-10-09

状态：运行时代码、自动化检查和本机原生验证已完成，等待视觉验收。多显示器、Windows 贴靠和真实触控设备尚未实测，不能视为所有完成条件均已验收。

## 分支与源码

- 分支：`feature/module-25-ui-foundation`。
- 基线：`8502dceddf98a400398580cf4a5c4aa6ce1b052f`。
- UI 实现：`562f3c7c20f0f1fcbf8aecec73b50bb94b9d314e`。
- 原生验证发现的标签溢出修复：`771864d730d605ed190397929fdbd3e598c39036`。
- 后续提交只加入本报告与原生证据；实际 Diff 可查看 `git diff 8502dce..771864d`。

真实源码修改涉及 `src/app/App.tsx`、`src/pages/home/Home.tsx`、`src/pages/focus/FocusWindow.tsx`、`src/viewer/components/{ViewerHost,ViewerShell,ContextualStatus}.tsx`、`src/components/common/ScrollbarSystem.tsx`、`src/workspace/reference.css`、`src/services/recentFiles.ts`、七种语言目录以及 `vite.config.ts`。未创建第二套运行组件。

## 实际行为

- 主窗口收紧外层间距、侧栏和工具区，减少重复文件标题；首页压缩标题、说明和留白，保留原有打开、最近文件、新建和导航入口。
- 多个文件标签保持单行并水平溢出；真实原生回归曾发现旧 CSS 使标签换行并裁切入口，现已修复。最终标签高度 36px，内容宽度 657px，可视宽度 534px，首页按钮可点击。
- 窄窗口 Inspector 自动浮动；用户手动选择布局后不随尺寸变化覆盖选择。Focus Inspector 不允许停靠挤占阅读区。
- Focus 沿用原生 WebviewWindow、文件权限、命令和会话。工具栏离开顶部后重新计时，输入、菜单、拖动期间维持显示；隐藏栏使用 inert，F6 可唤出，Esc 先处理浮层再退出真实全屏。关闭 Focus 保留主窗口。
- Focus 顶栏显示及隐藏时正文均为 y=34px、高度 816px，浮动栏为 fixed。无额外 65px 占位、无正文跳动。基线 Focus 已具有浮动结构，本轮改善交互和焦点，未把已有行为伪称为新实现。
- 状态使用真实 PDF、文本、CSV、Archive 和几何模型数据。未知单位省略，Archive 索引任务与模型错误保留。Show 在主 Viewer 持续显示；Auto 按交互出现且不占布局；Hide 移除普通状态；错误和任务保留可访问反馈。Focus 保持按需显示。插件状态插槽纳入同一策略，媒体避免重复普通状态。
- 共享滚动条可观察 body 中实际浮层，并随语言切换更新可访问名称；依然事件驱动，无持续动画循环。新名称完整翻译为中、英、日、韩、意、法、葡。
- 最近记录清除通过实际注入服务执行，避免跨服务误清除。

## 检查结果

- `pnpm test --maxWorkers=2 --reporter=json --outputFile=.qa-tools/module25/tests.json`：50 个文件、876 项通过，0 失败。包含 Module 24、多语言、新建文档、Viewer 与新增状态回归。
- `pnpm build`：TypeScript 与生产前端构建通过；仍有既有大包与动态导入提示，未重构专业 Viewer。
- `cargo test --locked --lib`：47 项通过。
- `pnpm tauri build --debug --no-bundle --config docs/qa/module-25/tauri-qa.json`：真实原生 QA 程序构建通过。
- `node docs/qa/module-25/native-qa.cjs`：通过。Home、展开/收起侧栏、900×650 窗口、最大化/还原、PDF/Text/Image/CSV 加载、Focus 会话和生命周期、导航/缩放/搜索、底部状态、三种策略、主题、日文即时切换与新建真实文档均检查。
- 测试配置仅增加 QA 窗口尺寸调整权限，正式 identifier、协议、文件权限与能力声明不变。
- 全量测试与原生构建同时运行的首轮有超时；限制为两工作进程后完整测试通过。最终报告使用成功复核结果。

## 真实原生截图

图片来自打包运行的 Windows Tauri WebView 内容，不是浏览器模拟或设计背景图。标题栏与窗口操作均为真实运行组件。

| 状态 | 文件 |
| --- | --- |
| 改造前首页 / PDF / Focus | [首页](docs/qa/module-25/before-home.png)、[PDF](docs/qa/module-25/before-pdf.png)、[Focus](docs/qa/module-25/before-focus.png) |
| 首页 | [01-home.png](docs/qa/module-25/01-home.png) |
| 普通 PDF | [02-pdf.png](docs/qa/module-25/02-pdf.png) |
| 侧栏展开 / 收起 | [展开](docs/qa/module-25/03-sidebar-expanded.png)、[收起](docs/qa/module-25/04-sidebar-collapsed.png) |
| Focus 默认 / 顶栏显示 / 隐藏 | [默认](docs/qa/module-25/05-focus-default.png)、[显示](docs/qa/module-25/06-focus-tools.png)、[隐藏](docs/qa/module-25/07-focus-hidden.png) |
| Focus 底部状态 | [08-focus-bottom.png](docs/qa/module-25/08-focus-bottom.png) |
| 窄窗口 / 暗色 / 日文 | [窄窗口](docs/qa/module-25/09-narrow.png)、[暗色](docs/qa/module-25/10-dark.png)、[日文](docs/qa/module-25/11-japanese.png) |
| 新建实际文档 | [12-created-file.png](docs/qa/module-25/12-created-file.png) |
| Show / Auto / Hide | [Show](docs/qa/module-25/status-show.png)、[Auto](docs/qa/module-25/status-auto.png)、[Hide](docs/qa/module-25/status-hide.png) |

详细几何、策略、进程与配置校验：[report.json](docs/qa/module-25/report.json)。基线：[before-report.json](docs/qa/module-25/before-report.json)。自动化：[automated-results.json](docs/qa/module-25/automated-results.json)。

## 性能、安全与限制

- 测试数据隔离在 `app.elorin.module25.qa`，对照在 `app.elorin.module25.before.qa`；WebView 数据在忽略的 `.qa-tools/module25`。真实用户配置测试前后校验一致。
- 4 秒空闲样本：测试进程树累计 CPU 0.03125 秒，约为一个逻辑核心的 0.78%。最小化样本累计 0.34375 秒，约为单核心的 8.59%；短样本包含窗口状态变化，尚不能证明长期后台接近零。未作虚假性能达标声明。
- 退出后跟踪的 8 个测试进程均已结束。
- DeepSeek 冻结安装包 SHA-256 始终为 `61ec10318d431ff241508e41446bf15ef20bb4256e5a9fd61efe1820a38e6588`，未更改，也未生成伪造源码对应标签。
- 设计参考用于实际结构与比例；保留 Windows 控制、原有 Home 文案和 Viewer 能力，不照搬 macOS 按钮。未全面重构专业 Viewer。
- Windows 贴靠、多显示器、屏幕阅读器与真实触控需外部验收；触控目标尺寸和键盘路径已实现，不能把它们等同于设备实测。
- 保留 Module 24、七语言和新建文件实现。本轮停止于此范围，不展开后续 Viewer 模块。
