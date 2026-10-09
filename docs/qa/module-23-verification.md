# Module 23 中文验收报告

交付日期：2026-10-09（Asia/Shanghai）。范围仅 Module 23，不启动 Module 24。此报告按已验证范围交付，**不是全部长期与硬件项目完整验收**。

## 功能与核心数据流

Workspace 持有 FileSource → 现有 Detector/FormatIndex 适配 → Registry 专业优先/显式 Hex → Controller 新 session/generation → 有界打开 → Host/专业 model 渲染 → visibility/native minimize → 取消或 managed suspend → 恢复/关闭清理。

新增：打开超时、用户取消、迟到结果丢弃与迟到模型释放、同步 throw 释放、迟到 sibling lease 释放、普通 Viewer 隐藏时停止、专业 Viewer 保留现有 suspension、13 类中文诊断与 Hex 恢复、过期 session 拒写、保存 mode 校验、More 禁用状态修复、动态目录审计、真实格式证据及分层回归入口。没有新增解析器或扩大生产权限。

完整生命周期、资源所有权、错误恢复、15 个审计范围及确认/疑似问题见 [架构报告](../architecture/viewer-reliability-module-23.md)。

## 实际测试与机器记录

所有“通过”以以下实际日志/JSON 为准。套件最初 Rust 因仍运行 debug 原生程序导致 Windows 无法替换 prism.exe；这是可复现的构建锁冲突，关闭隔离实例后重跑。初次失败日志不得用于证明通过。

| 项目 | 本轮证据 |
| --- | --- |
| TypeScript 全量 | `module-23-suite-typescript.log`；最终套件记录见 `module-23-suite-standard.json` |
| Rust 全量与 IPC 安全 | `module-23-suite-rust.log`；首轮独立通过日志也保留 `module-23-rust-tests.log` |
| 前端 build | `module-23-suite-build.log`、`module-23-frontend-build.log` |
| FAST | `module-23-suite-fast.json`、`module-23-suite-fast.log` |
| STANDARD | `module-23-suite-standard.json`：Registry、完整 TS、Rust、build、真实 Browser 五项独立计数 |
| 格式全目录静态审计 | `module-23-format-static-audit.json`：实际 155 条；这不是 155 条解析通过 |
| 真实 Browser | `module-23-format-evidence.json`：31 样本，原始 SHA256、检测结果、真实 Viewer、断言、环境、耗时和限制 |
| 动画 | `module-23-animation-runtime.json`：GIF/APNG/WebP 真实帧解码、暂停、隐藏、恢复、关闭释放 |
| 音视频 | `module-23-media-runtime.json`：实际系统播放/seek；AVI 系统拒绝时必须正确显示 CODEC_UNSUPPORTED，不能算可播放 |
| 原生压力与性能 | `module-23-native-runtime.json`：40 次开关、100 次切换、快速关闭、特殊路径、CAD/媒体分阶段最小化、短期 idle、正常退出 |
| VFS 与重复恢复 | `module-23-native-extra.json`：同父 Archive 的 SQLite/HDF5/Parquet 子源、子源关闭不破坏父源、重复最小化 3 次、最终会话归零 |
| 大文件 | `module-23-sparse-runtime.json`：8 GiB 稀疏 NPY 原生随机范围读取末尾 123.5；关闭会话/任务归零，临时文件删除 |
| 生产依赖安全 | `module-23-dependency-audit.json`；diff 8.0.3，锁文件同步；`module-23-dependency-licenses.json` |
| Cargo advisory 扫描 | `module-23-cargo-audit.log`：cargo-audit 未安装，ENVIRONMENT_BLOCKED；不能声称 Cargo 无漏洞 |
| 最终 NSIS | `module-23-installer-final-build.log`；最终哈希/安装卸载结果见本报告末尾实测汇总 |

执行命令（仓库实际使用 pnpm）：

```
pnpm exec vitest run --maxWorkers=2 --reporter=dot
cargo test -j1                    # cwd: src-tauri
pnpm build
pnpm regression:fast
pnpm regression:standard
node tests/module-23-browser-qa.cjs
node tests/module-23-animation-qa.cjs
node tests/module-23-media-qa.cjs
node tests/module-23-native-qa.cjs
node tests/module-23-native-extra.cjs
node tests/module-23-sparse-qa.cjs
pnpm audit --prod --json
pnpm licenses list --json
pnpm tauri build --bundles nsis
powershell -File tests/module-16-installer-qa.ps1
```

原生脚本要求隔离实例已运行、CDP 9230、准确 PID 文件；不得连接用户生产实例。Rust 测试/构建前关闭 debug QA 实例，避免 Windows exe 锁。浏览器脚本要求本地 1420 服务。机器路径不写死到产品，环境变量仅用于 QA。

## 格式与能力矩阵

唯一 catalogue / builtins 不变；`scripts/generate-format-capabilities.cjs` 继续生成原矩阵，新增本轮证据输入，保留 `module22-historical` 和本轮 run_id。真实样本包括 PDF、Office/ODF 六类、PNG、CSV/TSV、JSON/Markdown、TypeScript、ZIP、SQLite、Parquet/Arrow、HDF5/NetCDF/NPY、STL/OBJ/PLY/GLB/glTF/STEP/IGES/DXF、SRT、WAV/MP4。

本轮 Browser 证据统一只宣称 L2 有界内容预览；已有 L4 历史记录保留原范围，**没有把本轮容器识别升级成完整编码支持**。代码样本附带显式 Hex 首字节与源 bytes 比对。注册目录其余格式仍 NOT_VERIFIED，不新增假样本 header 证明。

样本来源为仓库已有 fixture 与生成器，不下载未知公开素材。本轮没有重新生成所有 fixture，历史生成工具完整版本不可由当前安装版本反推；来源和版本记录不足的条目标为限制，SHA256 保证本轮实际使用文件可追溯。生成方法见各 fixture README、`tests/generate-module-09.py`、`generate-module-10.py`、`generate-module-14.py`、`generate-module-21.py`、`generate-module-22.py`。

## 内存与 CPU 稳定性实测

机器：Windows 11 Pro，Intel i7-10750H（6 核 / 12 线程），约 16 GiB RAM，Edge/WebView2。不是 2015–2016 i5 / 8 GiB 实机。部分验证与构建同时运行，存在主机竞争，不能把该耗时当发行性能基准。

原生采样只统计指定 Rust PID 和 command line 含 module23-webview 的 WebView2 进程组；不统计用户其他 Edge/应用。采样包含 Working Set、Private Bytes、OS handles、CPU 累计、CDP JS heap/TaskDuration、Worker、Rust controlled sessions/jobs/cache、canvas render stats。平均 CPU = 同 PID 组累计 CPU 差 / 实际墙钟时间 / 逻辑核心数 ×100%；若 PID churn，JSON 标记不具可比性。PowerShell/CIM 采样开销纳入实际窗口。

| 阶段 | Rust Working Set MiB | WebView2 组 MiB | 组 Private MiB | JS Heap MiB | Worker |
| --- | ---: | ---: | ---: | ---: | ---: |
| 冷空页面 | 33.57 | 653.04 | 519.42 | 26.05 | 0 |
| 同文件第 20 次关闭 | 33.60 | 713.47 | 578.79 | 26.73 | 0 |
| 混合第 20 次关闭 | 33.70 | 728.55 | 684.28 | 45.25 | 0 |
| 最终关闭与短期 idle 后 | 34.47 | 644.76 | 514.17 | 29.42 | 0 |

| 阶段 | 实际窗口秒 | CPU 累计差秒 | 进程组平均 CPU % |
| --- | ---: | ---: | ---: |
| CAD 最小化前稳定 | 4.893 | .0156 | .0266 |
| CAD 清理 | 2.341 | .0625 | .2225 |
| CAD 最小化后稳定 | 6.798 | .0156 | .0192 |
| CAD 恢复重建 | 2.559 | 2.7500 | 8.9553 |
| CAD 恢复后稳定 | 5.008 | .2656 | .4420 |
| 媒体最小化前稳定 | 4.771 | .1562 | .2729 |
| 媒体清理 | 2.332 | .0625 | .2233 |
| 媒体最小化后稳定 | 6.825 | .0156 | .0191 |
| 媒体恢复重建 | 2.644 | .2656 | .8372 |
| 媒体恢复后稳定 | 4.787 | .0469 | .0816 |
| 关闭后短期空闲 | 61.773 | .2656 | .0358 |

判断：逻辑资源归零、同文件循环 Worker 不积累；混合解码后的峰值与空闲后的回落说明不能凭关闭瞬时 RSS 判泄漏。最终 Rust 较冷基线约 +0.89 MiB、JS heap 约 +3.37 MiB；当前样本未显示持续单调增长，但没有足够长期数据证明无泄漏。CAD 恢复阶段仍有明确重建 CPU 峰值，不能宣称恢复零成本或系统 CPU 为零。

30 分钟 idle 与 30 分钟 cycle：**NOT_RUN**。可复现脚本见架构报告，需分别 1800 秒，不能以本轮 61.77 秒替代。旧低配硬件、GPU 驱动显存、音频底层解码 CPU 分项：**NOT_VERIFIED**。渲染按需机制和 canvas/worker 释放有证据；驱动内部资源没有直接计数 API，不作“GPU 显存无泄漏”断言。

## 安全回归与资源释放

完整 TS/Rust 回归继续覆盖已有伪装格式、错误 magic、ZIP 压缩比/深度/CRC/path traversal、XML DTD/实体、SVG/HTML 注入、字幕纯文本、NPY object/pickle 拒绝、3D 外部引用授权、u64 offset/overflow、无效范围、权限/源变化/关闭 session、搜索取消等。新增测试覆盖迟到模型、同步抛错、超时、generation、更换标签、重复 close、迟到 child lease、权限 code、SOURCE_CHANGED 经过科学诊断仍可区分。每项以已有测试断言为范围，不代表已做全格式模糊测试。

退出原生短测后 owned Rust/WebView2 进程数 0；最终 science sessions/tasks/reservedBytes 0；binary sessions/handles/searches/cache_bytes 0；Worker 与 GPU canvas 列表空。VFS 真实父子复用测试通过。8 GiB 仅 sparse allocation，未写入同等磁盘数据，临时源在 finally 删除。未写用户源、未扩大持久副本或网络访问。

## 已解决、限制与建议

已解决：Host 打开缺少有界等待、取消缺少可见状态、相关资源迟到 lease、同步 throw disposal、非 managed Viewer 后台加载、保存 mode 未校验、More disabled 遗漏、主要错误入口分类/中文恢复差异。

保留限制：第三方不可中断 Promise 可能继续运行，Host 只能停止等待、隔离并废弃结果；专业模型局部状态未全部纳入 Host 唯一 header 状态；既有旧错误 category 兼容入口没有全部移除；并非所有 Viewer 内部错误文案均已迁移；样本生成版本证据不完全；专业 format 不完整能力保持原限制；Cargo advisory 扫描受工具缺失阻塞；最终是否通过安装卸载以最终附录实际结果为准。

下一阶段建议仅记录，不开始实施：在指定低配 Windows 设备独立运行两项 30 分钟长测，补全更多标准工具版本固定的真实样本，完善驱动显存与 native codec 分项测量，再评估是否需要集中 activity 订阅。不要以格式数量替代真实内容证明。

## 新增与修改文件

- 核心：`src/viewer/core/controller.ts`、`types.ts`、`errors.ts`；`src/viewer/components/ViewerHost.tsx`、`ViewerErrorBoundary.tsx`、新增 `ViewerDiagnostic.tsx`；`src/services/fileSource.ts`。
- 专业生命周期/诊断：image 的 `image.plugin.tsx`、`ImageViewer.tsx`；media 的 `media.plugin.tsx`、`MediaViewer.tsx`；data 的 `data.plugins.tsx`、`DataViewer.tsx`、`errors.ts`；geometry 的 `geometry.plugin.tsx`、`GeometryViewer.tsx`；`hex/hex.plugin.tsx`。
- 自动化：新增 `tests/module-23.test.tsx`、`module-23-browser-qa.cjs`、`module-23-native-qa.cjs`、`module-23-native-extra.cjs`、`module-23-sparse-qa.cjs`、`module-23-animation-qa.cjs`、`module-23-media-qa.cjs`、`scripts/module-23-regression.cjs`；修改 `tests/viewer-lifecycle.test.ts` 的就绪等待，保持原断言。
- 依赖/矩阵：`package.json`、`pnpm-lock.yaml`、`scripts/generate-format-capabilities.cjs`、`docs/formats/format-capability-matrix.json`、`FORMAT-COVERAGE.md`。
- 文档：本报告、`docs/architecture/viewer-reliability-module-23.md`，所有 `docs/qa/module-23-*` 原始日志/JSON。QA 独立标识配置与浏览器 profile 仅在 `.qa-tools`，不进入生产配置。
