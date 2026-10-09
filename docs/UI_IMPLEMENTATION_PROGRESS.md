# Elorin UI/UX 实施与验证记录

日期：2026-10-09。依据：用户提供的完整 Master Spec、标注 ZIP 的 README 和 11 张设计图。用户最新指令已授权实际实现；此前只读审计记录保留为历史证据。本文件记录实际实施状态，**不表示已完成全部页面的一比一验收**。

## 已落地的实际界面

- 真实入口为 `src/main.tsx` → `src/app/App.tsx`；参考样式 `src/workspace/reference.css` 最后加载，修复旧全局样式覆盖新界面的问题。正式打包仍需重新构建，旧安装版本不会自动更新。
- 主窗口采用真实文件标签、分类导航、全局搜索；首页采用参考图的欢迎区、拖放区及三张功能卡。最近文件与收藏来自实际记录，不显示虚构文件。
- 设置中心具有 26 个子页面；主题、强调色、密度、缩放、文本偏好、搜索偏好、面板、Focus 行为、无障碍及设置导入导出等接入实际状态。不具备后端能力的项目显示不可用。
- PDF 使用原解析与渲染引擎，接入浮动搜索、缩放、页面导航和缩略图；Markdown 源码与预览并排；CSV 使用虚拟表格、真实选中值及列显示控制。
- Archive 单击选择后按现有 VFS 读取并预览；预览默认不重复占用 Inspector，内部文件操作使用自身服务，双击与“Open in tab”沿用真实打开流程。
- CAD Inspector 的 Model、Scene、Materials 及视角按钮使用实际解析数据；媒体悬浮控制使用真实播放控制。最近媒体列表来自实际打开记录。
- 统一浮层支持拖动、边界约束、固定、折叠、关闭、Esc、恢复焦点和方向键移动。布局状态保存在有界内存中，尚未跨应用重启持久化。
- 统一滚动条覆盖既有滚动容器，支持拖动、轨道点击、方向键、Home/End/PageUp/PageDown；监听器、观察器和动画帧卸载清理。减少虚拟行更新引发的全局扫描与无关滚动区域的重复测量。
- 上下文状态栏接入实际 PDF、文本、CSV、Archive、CAD、Hex 状态；媒体与 Focus 默认避免重复显示状态栏。

## 独立 Focus 与资源生命周期

`src/services/focusWindow.ts` → Rust `src-tauri/src/focus.rs` → 独立顶层 WebviewWindow → `src/pages/focus/FocusWindow.tsx`。复用当前本地文件、Viewer 会话及主题，不以主窗口覆盖层模拟。重复同一标签的打开请求复用窗口，支持独立关闭和主窗口最小化。浏览器文件、VFS 与未保存编辑当前不能进入独立 Focus，并明确告知限制。

`src-tauri/src/window_resources.rs` 按窗口登记 Binary、Scientific、Archive、Media、SQLite 会话；窗口销毁或页面重新加载时清理所属资源，最小化暂停适用任务。主窗口销毁会销毁其 Focus 子窗口。原全局 FileAccess 授权句柄仍按既有有界策略管理，并未实现每个文件标签关闭即撤销授权；不得据此声称所有文件句柄逐标签完全释放。

## 实际执行的验证

| 验证 | 命令 / 证据 | 已获得结果 |
| --- | --- | --- |
| TypeScript 类型 | `pnpm exec tsc -b` | 通过，包括本轮预览与浮层修复 |
| TypeScript 全量 | `pnpm exec vitest run --maxWorkers=2 --reporter=dot` | 上轮 45 文件、826 测试通过；本轮重跑结果以 `.qa-tools/uiux-all-tests.log` 为准 |
| UI 核心新增测试 | `pnpm exec vitest run tests/uiux.test.tsx --maxWorkers=2` | 8/8 通过 |
| Rust | `cargo test -j1`（src-tauri） | 86 个测试通过，0 失败；日志 `.qa-tools/uiux-rust-tests.log` |
| 浏览器交互 | `node tests/uiux-browser-qa.cjs` | 首页、设置、主题、UI 缩放、表格选中与列控制通过 |
| Viewer 与滚动 | `node tests/uiux-viewers-qa.cjs` | 26 设置路由、滚动条拖动/键盘、虚拟表格、PDF 浮层、Markdown、JSON、图片、VFS 预览、CAD、媒体控制通过；最新报告 `docs/qa/uiux/viewers-report.json` |
| Windows 独立窗口 | `node tests/uiux-native-qa.cjs` | 隔离配置的打包 debug 程序：6 项检查通过、无页面错误；报告 `docs/qa/uiux/native-report.json` |
| 打包 debug | `pnpm tauri build --debug --no-bundle --config .qa-tools/uiux-tauri.json` | 通过；此版本为 QA 隔离标识 |

截图位于 `docs/qa/uiux/`，来自实际界面，不用于替代产品 UI。旧只读审计冻结检查不再适用于已授权修改后的源码。

## 性能实际结果与未验收范围

当前主机 Windows 11、Intel i7-10750H、16GB；不是 2015–2016 i5 实机。Edge 无头、1448×1086、4 倍 CPU 降速，10,000 行 CSV、90 帧连续滚动：最新中位 71.9ms、P95 107.9ms、88 帧超过 33ms，仅渲染 93 个单元格。**虚拟化有效，但流畅度目标未达标，须继续优化并在正式产物上复测。** 该脚本功能通过不代表性能达标。

首页 10 秒有限空闲样本：TaskDuration 增量约 0.0401 秒、ScriptDuration 约 0.000316 秒、布局次数 0。不能代表长时间原生空闲、缓存峰值、老电脑或最小化资源占用验收。多显示器、硬件 DPI、触控板、系统退出后的完整进程及资源计数仍待专项验证。

## 未完成事项

1. 全部 11 图的逐控件、逐尺寸视觉验收尚未完成，不能宣称一比一还原。独立 Focus 顶部结构、设置控件细节及各 Viewer 布局仍有差异。
2. 保留仓库现有 Logo；缺少参考图所用独立原始 Logo 资产，当前图形存在差异。
3. 通用重命名、移动、回收站删除、分享、PDF 编辑、字幕/转录、视频裁剪等缺少正式业务服务，未伪造成功或增加装饰性按钮。
4. 最近文件分类库基于打开记录，不等于系统全磁盘文件索引；媒体关键帧与真实缩略图生成尚未接入。
5. 完整翻译字典、跨重启浮层位置、Focus 的 VFS 支持与逐文件授权释放尚未完成。
6. 构建仍有部分大 chunk 警告，保留警告，未放宽阈值隐藏。

下一阶段以功能审计矩阵逐项收敛视觉差异、后端能力缺口和性能问题，保持已有格式解析、Logo 与模块边界；未经实际执行的验证不标记通过。
