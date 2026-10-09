# Elorin Module 16 — Productivity & OS Integration

2026-10-08，Windows x64。本报告区分代码实现、自动化实测、尚未验证项；未开始 Module 17。Module 15 的既有编辑、保存、恢复系统继续复用。

## A. 新增文件

以下路径均位于 `D:\Prism`：

- `D:\Prism\src\workspace\workspace.ts`
- `D:\Prism\src\workspace\productivity.css`
- `D:\Prism\src\commands\registry.ts`
- `D:\Prism\src\commands\Palette.tsx`
- `D:\Prism\src\commands\viewer-bridge.ts`
- `D:\Prism\src\search\providers.ts`
- `D:\Prism\src\search\SearchSurface.tsx`
- `D:\Prism\src\compare\diff.worker.ts`
- `D:\Prism\src\compare\CompareView.tsx`
- `D:\Prism\src\platform\integration.ts`
- `D:\Prism\src\platform\file-watch.ts`
- `D:\Prism\src\platform\IntegrationSettings.tsx`
- `D:\Prism\src\platform\associations.json`
- `D:\Prism\src-tauri\src\productivity\mod.rs`
- `D:\Prism\src-tauri\src\productivity\associations.rs`
- `D:\Prism\src-tauri\installer\hooks.nsh`
- `D:\Prism\src-tauri\tauri.windows.conf.json`
- `D:\Prism\scripts\generate-associations.cjs`
- `D:\Prism\tests\generate-module-16.cjs`
- `D:\Prism\tests\module-16.test.tsx`
- `D:\Prism\tests\module-16-runtime-qa.cjs`
- `D:\Prism\tests\module-16-native-qa.cjs`
- `D:\Prism\tests\module-16-lifecycle-qa.cjs`
- `D:\Prism\tests\module-16-installer-qa.ps1`
- `D:\Prism\tests\module-16-path-qa.cjs`
- `D:\Prism\tests\module-16-ownership-qa.ps1`
- `D:\Prism\tests\module-16-running-guard-qa.ps1`
- `D:\Prism\module-16-tauri.local.json`
- `D:\Prism\.qa-tools\module-16-tauri.ps1`
- `D:\Prism\docs\architecture\productivity-os-integration.md`

生成的 100 个 Tab、特殊路径、比较、监听测试文件在 `D:\Prism\test-fixtures\productivity\`。测试 JSON、截图和开发日志在 `D:\Prism\docs\qa\module-16-*`；失败截图仅作诊断，不作为通过证据。

## B. 修改文件及原因

| 完整路径 | 原因 |
|---|---|
| `D:\Prism\src\app\App.tsx` | 在原文档集合上实现 Tab、恢复、命令、搜索、比较、启动路由、有限轻量查看器缓存和退出保存 |
| `D:\Prism\src\viewer\core\session.ts` | opaque state 序列化，保留 Set/Map，通知持久化 |
| `D:\Prism\src\viewer\components\ViewerHost.tsx` | 将现有查看器操作接入命令，排除能力声明元数据 |
| `D:\Prism\src\components\shell\ContextMenu.tsx` | 复用现有菜单提供 Tab 操作 |
| `D:\Prism\src\components\shell\DesktopPolicy.tsx` | 允许 Quick Open 的快捷键 |
| `D:\Prism\src\document\DocumentSurface.tsx` | 共用监听、编辑命令、外部版本比较、后台编辑快捷键隔离 |
| `D:\Prism\src\document\CsvEditor.tsx` | 搜索结果跳到单元格 |
| `D:\Prism\src\viewer\plugins\text\TextViewer.tsx` | 搜索跳转和匹配高亮，隐藏查看器不截获快捷键 |
| `D:\Prism\src\viewer\plugins\json\JsonViewer.tsx` | 复用 JSON 搜索和节点导航 |
| `D:\Prism\src\viewer\plugins\markdown\MarkdownViewer.tsx` | 源码搜索导航 |
| `D:\Prism\src\viewer\plugins\csv\CsvViewer.tsx` | 复用流式 CSV 搜索与表格导航 |
| `D:\Prism\src\services\recentFiles.ts` | 真实最近文件元数据和清除 |
| `D:\Prism\src\pages\home\Home.tsx` | 最近文件打开与清除入口 |
| `D:\Prism\src-tauri\src\lib.rs` | 单实例、窗口状态、监听服务与原生命令注册 |
| `D:\Prism\src-tauri\build.rs` | 命令权限定义 |
| `D:\Prism\src-tauri\capabilities\main.json` | 最小原生命令与窗口销毁授权 |
| `D:\Prism\src-tauri\tauri.conf.json` | NSIS 当前用户安装与 hooks |
| `D:\Prism\src-tauri\Cargo.toml`、`D:\Prism\src-tauri\Cargo.lock` | 原生依赖及锁定 |
| `D:\Prism\package.json`、`D:\Prism\pnpm-lock.yaml` | Myers diff 依赖及类型 |
| `D:\Prism\tests\viewer-host.test.tsx` | 隐藏的保留查看器存在时，只断言活动查看器 |

## C. 新依赖

| 层 | name / version / license | 用途与平台影响 |
|---|---|---|
| Frontend | diff 8.0.2 / BSD-3-Clause | 成熟 Myers 行比较；浏览器与桌面；独立 worker 实测压缩前 3.82 kB |
| Frontend dev | @types/diff 7.0.2 / MIT | 类型，无运行时二进制 |
| Rust | notify 8.2.0 / CC0-1.0 | 系统文件通知；Windows 原生后端，非递归父目录监听 |
| Rust | tauri-plugin-single-instance 2.5.2 / Apache-2.0 OR MIT | 本地单实例路由 |
| Rust | tauri-plugin-window-state 2.5.0 / Apache-2.0 OR MIT | 窗口大小、位置、最大化 |
| Rust Windows | winreg 0.55.0 / MIT | HKCU 注册和只读健康检查 |
| Agent | 无 | deferred |

许可证从实际安装的 package.json / Cargo.toml 核对。没有构建无这些依赖的对照版本，因此不虚报每项 Rust 依赖的二进制增量。安装包总大小见 QA；既有 CAD chunk 大于 500 kB 的构建提醒仍存在。

发布 exe 实测约 23.6 MB；最终 NSIS 约 11.88 MiB，交付文件大小以实际 Length 为准。最终主 JS 397.24 kB / gzip 124.75 kB；比较 worker 独立 3.82 kB。

## D. Tabs Architecture

`TabSession` 仅持有稳定 id、描述符、现有 FileSource、父来源、恢复状态和最近聚焦时间。`DocumentSession` 仍是修改、dirty、撤销、编码和保存冲突的唯一来源。ViewerSessionStore 按 source/plugin 管理 opaque state，App 不解释 PDF 页、JSON 展开树或 3D 相机结构。

物理路径用 native canonical path 去重，Windows identity 统一大小写和 verbatim 前缀。支持关闭、关闭其他/右侧、重开最近 20 项、拖动重排、溢出选择与搜索。轻量文本/Markdown/JSON/CSV 最多保留 4 个已访问查看器；重型查看器非活动时卸载，保留状态。新打开物理/资源 Tab 预算 128，达到时提示，不能自动逐出 dirty Tab。

## E. Workspace Architecture

AppData local 的 workspace.json 为 version 1，只保存物理引用、顺序、activeTabId、侧栏和 opaque state。每来源状态预算 64 KiB，清单预算 2 MiB/128 引用。临时文件 flush 后原子替换；无正文、无整文件缓存。活动 Tab 优先授权并加载，其他为延迟恢复占位；缺失文件提供重新定位/移除。

损坏 JSON/非法清单保留为 workspace.corrupt-UUID.json 后从空工作区启动。未保存编辑沿用独立 recovery snapshot，崩溃后提示恢复成安全的新文档。正常退出先处理 dirty，再保存清单和恢复队列，最后销毁窗口；失败保留窗口。最后一次保存重新读取 opaque state。

窗口插件只恢复位置、大小、最大化；不恢复隐藏、最小化、全屏。其实现检查是否与现有显示器相交，但跨 DPI/屏幕边缘标题栏完整可见性尚未实测；插件自身窗口状态文件也不是本项目原子清单的一部分。

## F. Command Architecture

Registry 按 Global/Workspace/Tab/Viewer/Edit 声明可见、可执行状态和 handler；Palette 模糊检索，键盘箭头/Enter/Esc/焦点恢复。Viewer 命令来自既有 ViewerActions；编辑保存调用既有保存流程。Ctrl+Shift+P 命令、Ctrl+P Quick Open、Ctrl+Shift+A Tab Switcher、Ctrl+Tab 切换；文本输入法组合时不执行全局快捷键。

## G. Search Architecture

SearchProvider 返回有界命中及 viewer-owned navigateTo。文本复用 TextDocumentModel 流式读取；已编辑内容复用 DocumentSession 搜索；JSON 和 CSV 复用现有语义搜索。聚合并发 3、查询延迟 180 ms、每文件最多 500、总计 1000；取消令牌屏蔽过时结果。未加载 CSV 不降级为不准确的 raw-line 单元格跳转，而明确说明不可用。

当前/Open Tabs 搜索成立；PDF 等既有查看器搜索通过 Viewer 操作使用，尚未成为跨 Tab 聚合 provider。Markdown 跳到源码位置，未增加源码匹配着色。未挂载编辑器的跨 Tab 精确选区仍需进一步专门验证。

## H. Compare Architecture

只读文本/代码/Markdown source/JSON source/CSV source 比较，不解析后重新格式化 JSON，因此大整数、重复 key 和 CSV 前导零保持原样。diffLines Myers 在独立 worker，3 秒算法预算、5 秒 worker 终止、20,000 edit-length 和 40,000 输出行护栏；每边 4 MiB。

左右对齐、增删颜色、同步滚动；基本光栅图片左右显示、共享 25–200% 缩放和滚动。SVG 比较明确拒绝，仍使用原 SVG viewer。没有 merge、PDF 比较或高级像素差异。外部冲突比较将当前未保存字符串与重读磁盘字符串作为只读快照，绝不调用保存覆盖。

## I. File Watcher Report

notify RecommendedWatcher 使用共享父目录非递归 watch，文件与父目录引用计数；前端按 canonical identity 共用一条订阅，多消费者回调，200 ms debounce。改名无法可靠关联新名时保留旧路径并提示不可用。自身保存通过现有 DocumentSession fingerprint 检查抑制误报。最后消费者释放时取消文件引用、父目录最后引用 unwatch，退出释放服务。

修复 Windows 授权规范路径前缀导致 add/remove key 不同的问题；删除后 remove 不依赖重新 canonicalize。系统监听不可用有明确状态，既有 focus 检查继续兜底。修改、改名、自身保存已实测；连续 burst 的通知次数、句柄释放前后精确数值尚未测量。

## J. Single Instance Report

官方插件在 Builder 首先注册。次实例传 argv/cwd，原生过滤 flag、NUL、非文件，最多 128 项，经既有 FileAccess.grant/canonicalize 后入队。前端监听准备好再 take 队列，统一 inspect 打开流程，并显示/聚焦主窗口。没有 renderer 自建 TCP IPC、shell 拼接或外部远程控制入口。

## K. Association Report

Windows 当前用户 HKCU `Software\Classes\Elorin.File.<Category>` ProgID，quoted `"exe" "%1"` open command，扩展名 OpenWithProgids，Applications\prism.exe\SupportedTypes，RegisteredApplications 和 Capabilities。分类目录由 native 检测表生成，共 137 项。只有 txt/md/markdown/json/csv/tsv 推荐；PDF、Office、媒体、代码、科学/3D 等仅提供 Open With。exe/dll/sys/bat/cmd/ps1/com/msi/scr/lnk/url/pyw 明确排除。

从不写 UserChoice、默认扩展名值、Hash 或系统默认应用。主动按钮只打开 Windows 默认应用设置，由用户选择。Health 查看 Missing/Outdated/Registered 和默认归属；repair 仅 installed 显式操作。正式 Windows 默认打包目标限定 NSIS，避免 MSI 绕过安全 hooks。

## L. Clean Uninstall Report

删除 Elorin 的 OpenWithProgids 值；ProgID/Application 仅在命令仍属于本安装路径时删除。删除自己注册的 RegisteredApplications/Capabilities；不恢复旧默认，不改 UserChoice，不删除其他 OpenWith 值。没有 startup/Agent 项。默认卸载保留用户数据和恢复目录；卸载器显式删除数据选择不属于默认流程。

OpenWith 值也在对应 ProgID 命令仍归本安装所有时才删除；Capabilities 用 ElorinOwnerCommand 判断安装路径归属，避免卸载旧目录时清理另一个安装的注册。

安装/卸载前 Restart Manager 检查应用占用，发现运行则中止并要求用户先处理未保存文档；不调用强杀来完成更新。

真实 NSIS 运行中保护验证：在私人测试目录使用可丢弃的控制台进程占用 prism.exe image path，安装和卸载都以 exit code 2 中止，进程保持运行、文件 Hash 保持不变。测试进程随后由 QA 清理。此测试验证占用检测机制；不是假称已对用户的 dirty Elorin 会话执行升级。

## M. Portable Mode Report

仅安装器创建相邻 elorin-installed 标记。便携运行无标记，不注册关联、启动项或 Agent，repair 返回 portable 错误；同样支持查看、编辑、Tab 和工作区。QA native 使用独立 app.elorin.module16.qa 标识，不修改真实工作区或恢复数据。

## N. Agent Report

**Deferred**。没有 Agent binary、tray、startup、后台 IPC、后台扫描。所有核心功能由主程序完成。大小/空闲内存/CPU 等 Agent 指标不适用。

## O. Performance Report

单次开发构建观测，Windows x64，本机并行编译存在竞争，不是发布版基准，也不是平均值/P95：

| 场景 | 实测 |
|---|---|
| 浏览器 shell 导航 | 684 ms |
| 100 浏览器 Tab 元数据及活动查看器 | 530 ms |
| 100 native Tab 暖路由 | 892 ms |
| 104 Tab renderer reload 延迟恢复 | 535 ms；只有一个可见查看器 |
| 次实例生命周期 | 93 / 59 / 82 / 56 ms |
| 新进程到 shell DOM 上界 | 3593 ms；独立 WebView profile，包含调试连接 |
| 新进程到关联文本可交互 | 3810 ms |
| 强制终止后重启到恢复编辑 | 9088 ms；包含恢复提示交互与调试连接 |
| WebView CPU | 1.5 秒采样增加 0.630014 CPU seconds；不包含 native process，不能当作整机空闲 CPU |

搜索/比较/监听功能已通过 UI 断言，但没有独立性能分布；不虚报延迟或内存。真实数据分别在 browser/native/lifecycle-runtime.json。单次 CPU 数值未达到可宣称低空闲占用的证据标准，需要无并行负载复测。

## P. Security Report

新原生文件访问沿用 FileAccess 授权。会话/最近记录只用于重新授权本地路径引用，绝不执行其中命令；key 白名单、清单大小、路径长度限制。native launch 只接受本地实际文件。系统打开和 Reveal 走现有原生 API，不拼 shell；默认设置 URL 是常量。SVG 不进入 image compare，diff worker 取消和限额防止 UI 阻塞。没有 Agent 或新的远程 IPC。

## Q. Tests

- `npm test -- --reporter=dot`：31 files、619 tests passed（新增生成安装脚本回归检查）。
- `cargo test --lib --manifest-path src-tauri/Cargo.toml`：19 passed，包含源文件冲突、锁定、只读、磁盘满等既有保存保护。
- `npx tsc -b`：通过；完整 `npm run build` 通过。
- `node tests/module-16-runtime-qa.cjs`：18 checks、errors=[]，包括 100 Tab 搜索取消、文本和图片比较、dirty close、128 Tab 上限不逐出已编辑文档、新建受限提示。
- `node tests/module-16-native-qa.cjs`：19 checks、errors=[]，真实 OS watch、次实例、Unicode/special path、104 Tab 恢复、缺失文件、portable。
- `node tests/module-16-lifecycle-qa.cjs`：11 checks、errors=[]，真实进程崩溃恢复、正常退出、损坏清单、改名、自身保存。
- `npm run tauri -- build --bundles nsis`：Windows x64 NSIS 构建通过；产物 `D:\Prism\src-tauri\target\release\bundle\nsis\Elorin_0.1.0_x64-setup.exe`。
- `powershell -NoProfile -File tests/module-16-installer-qa.ps1`：真实当前用户安装/卸载，434 checks、errors=[]；逐项核对 137 个 Open With 值、quoted open command、Capabilities 注册/清理；两次比较 UserChoice 的 ProgId/Hash 快照相同。测试安装位置 `D:\Prism\.qa-tools\installed-elorin`，已卸载。
- 最终安装脚本回归和查看器测试：23 passed（2 files）；Rust 最终修改后 19 passed。
- `node tests/module-16-path-qa.cjs`：真实 native argv 打开 285 字符中文 Windows 路径并读取正文，2 checks、errors=[]。
- `powershell -NoProfile -File tests/module-16-ownership-qa.ps1`：33 checks、errors=[]；模拟其他安装路径接管 Code ProgID、OpenWith、Capabilities，旧安装卸载保留接管项。仅本测试模拟的注册经归属检查后清理。
- `powershell -NoProfile -File tests/module-16-running-guard-qa.ps1`：8 checks、errors=[]；真实 installer/uninstaller 遇运行中 image path 均中止，没有杀进程/替换映像。

运行 UI QA 时 PRISM_PLAYWRIGHT 指向本机已安装 Playwright；开发服务器 `127.0.0.1:1420`。native QA 使用仅本地的 WebView 调试端口，正式程序不启用调试参数。最终修改后重跑结果见 QA JSON/日志及交付消息。

## R. Manual / UI Verification 与剩余验收

实际自动操作本应用 UI：多 Tab、100 Tab、Quick Open、Palette、当前/Open Tabs 搜索、查询取消、Text Compare、Image Compare、退出比较、dirty Cancel、真实外部修改、单实例多文件、104 项延迟恢复、缺失文件、损坏清单、portable、中文/日文/emoji/空格/& 路径。

Windows 文件名禁止双引号，未伪造双引号文件成功。285 字符中文长路径已实测；更高长度上限、跨 DPI/拔屏、系统 Open With 菜单、用户主动更换默认应用后的完整卸载、真实多安装目录/旧版本升级和 dirty Elorin 的安装升级交互还需要专门验收。已通过模拟注册接管的归属保护及真实运行映像的拒绝强杀测试。VFS/浏览器临时文件不进入永久 workspace manifest；已关闭容器资源的重开需重新获得原容器来源。PDF 的双击启动路由与 viewer 复用成立，但系统 PDF 默认选择不由自动测试修改。

核心参考：[single-instance](https://v2.tauri.app/plugin/single-instance/)、[notify 8.2](https://docs.rs/notify/8.2.0/notify/)、[window-state](https://v2.tauri.app/plugin/window-state/)、[Windows installer](https://v2.tauri.app/distribute/windows-installer/)。

本模块已有可运行实现及真实测试证据；上述未验收项目不能标为全部通过。Agent 明确延期，未实现 Module 17。
