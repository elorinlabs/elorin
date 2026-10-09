# Module 27 — Workspace & File Experience

日期：2026-10-09。状态：**本轮要求的核心原生流程已通过轻量验收**。

## 实际修改

沿用已提交的工作区、标签、新建文件、保存、恢复及最近/收藏服务，不重新开发已通过功能。本轮仅修复两个原生缺陷：

- select_paths 已注册但未纳入 Tauri command manifest/main capability，导致原生多选被 ACL 拒绝；补齐声明及生成权限文件。Focus 不授予多选能力，选择仍逐文件授权。
- Focus 缺少既有 file_watch 权限，监听失败触发反复重载；允许监听已授权文件，并将 Unavailable 转为错误状态，阻止重试循环。后端文件授权和窗口资源释放边界保持。

关键源码：src-tauri/build.rs、src-tauri/capabilities/{main,focus}.json、生成 ACL 文件、src/pages/focus/FocusWindow.tsx；增加 tests/module-27.test.tsx 回归。

## 验证结果

| 检查 | 真实结果 |
|---|---|
| TypeScript / 前端生产构建 | PASS；pnpm build 包含类型检查，已有大 chunk 警告保留 |
| 本轮受影响测试 | PASS 13/13：Module 27、Focus status/commands |
| 必要 Rust 回归 | PASS 1/1：跨窗口监听释放，48项未重复执行 |
| 隔离原生构建 | PASS；无安装包构建，identifier app.elorin.module27.qa |
| Windows 原生多选 | PASS；实际选择两文件并打开；各自可读，未选择的同目录文件拒绝访问 |
| 标签 / 未保存保护 | PASS；切换、非活动标签右键关闭、12长文件名溢出切换、Ctrl+Tab、关闭右侧、重新打开；取消关闭保留脏内容 |
| Focus | PASS；独立窗口打开、主窗口保存后同步、主窗口切换不改 Focus 文件、关闭 Focus 保留主窗口标签 |
| 工作区 / 安全恢复 | PASS；正常恢复标签及活动文件；损坏条目安全返回首页；恢复快照进入独立未保存文档且原文件不变 |
| 外部移动 / 删除 | PASS；源变化显示不可用，恢复后失效文件仍不可用，可只移除对应会话 |
| 最近 / 收藏 | PASS；真实记录、添加收藏、列表及首页重开、移除收藏、清空最近及持久化空状态 |
| 新建 / 保存 / 另存为 | 沿用首轮已通过原生证据：首页新建→编辑→原生首次保存→原位保存→另存为，标签路径同步且原文件保留 |
| 正常退出 / 资源 | PASS；实际点击原生应用标题栏关闭，退出码0，观察到的应用及子进程残留0；Focus关联 Rust释放回归通过 |

恢复快照由隔离测试写入后端，再实际恢复；**强制终止进程的崩溃注入、Windows ACL权限撤销专项为 NOT VERIFIED**，本轮没有将它们记为通过。

## 关键证据与隔离

- 汇总：[report.json](docs/qa/module-27/report.json)；保留首次中断记录：[interrupted-report.json](docs/qa/module-27/interrupted-report.json)。原生多选在补齐ACL后的构建实测，随后只修改Focus；最终构建继续验证其余流程，不重复已通过保存/多选。
- [核心运行](docs/qa/module-27/closeout-report.json)、[补充流程](docs/qa/module-27/supplement-report.json)、[正常退出](docs/qa/module-27/exit-report.json)、[针对性测试](docs/qa/module-27/closeout-tests.json)。
- [生产构建](docs/qa/module-27/closeout-build.txt)、[Rust回归](docs/qa/module-27/closeout-rust.txt)、[隔离原生构建](docs/qa/module-27/closeout-native-build.txt)。实际应用截图仅保留首页及暗色长文件名证据。
- 最终 QA exe SHA-256：1b362aae3080bac36d7d9e7a15b06d0a3df8c908bc5eb48391ef0fde6c00dc96。
- 使用独立应用数据及 WebView 目录、合成文件；各成功运行结束个人配置哈希未变化，进程残留0。没有修改正式安装包。
- 冻结候选包 SHA-256 保持 61ec10318d431ff241508e41446bf15ef20bb4256e5a9fd61efe1820a38e6588。

## 遗留与 Git

- CSV P95 仍为独立 [OPEN事项](docs/development/CSV-P95-follow-up.md)。无安全后端的重命名/系统删除保持禁用。
- 当前仓库 D:\elorin，分支 feature/module-27-workspace；原开发提交 6794501，本轮关联修复提交 **8d3bcf2**。
- Module 26 已以 a59052f 合并 develop；Module 27 尚未合并 develop。本轮报告/证据以独立文档提交交付。
- Module 28 未开始：仓库没有正式职责映射，见 [职责记录](module-28-verification.md)。未启动 Module 29。
