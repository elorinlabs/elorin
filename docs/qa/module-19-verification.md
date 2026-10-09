# Module 19 验证记录

本页仅记录实际执行结果；未执行的目标不能填“通过”。

- `npm test -- --maxWorkers=2 --reporter=dot`：最终完整回归 728 项通过 / 37 文件（55.62 秒）；首次完整回归 726 项通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：75 项通过，无跳过；包括现有授权读取、编码、VFS、Hex 生命周期测试。
- 修改 tsconfig 路由后 `npm test -- --maxWorkers=2 tests/module-19-source.test.tsx tests/text-viewer.test.tsx tests/text-engine.test.ts tests/module-17.test.tsx --reporter=dot`：114 项通过。
- 新增复制原文、巨大视口回归后 `npm test -- --maxWorkers=2 tests/module-19-source.test.tsx --reporter=dot`：30 项通过。
- `npm run build`：生产构建通过。保留既有大 chunk 提示，没有提高阈值掩盖提示。
- `node tests/module-19-native-qa.cjs`：修复后的真实 Windows WebView2 8 项检查通过，创建 10 个 Worker，最终活动 0。最小化时 Worker 0、高亮 token 清空；恢复重新显示正确注释；关闭文件后 Worker 0，应用退出无相关原生进程。
- `node tests/module-19-browser-qa.cjs`：生产 Edge 15 项通过，含跨视口多行注释、AST 跳转、字体/Tab、原文复制、JSONC 重复键、框架原文安全、四倍 CPU 降速下连续滚动与有界 DOM、空闲测量。修复前的真实失败保留在 `module-19-throttle-diagnostic.json`。
- 最后补测 JSON5 语义边界及跨块 Unicode 全词边界：`npm test -- --maxWorkers=2 tests/module-19-source.test.tsx tests/module-19-performance.test.ts tests/text-engine.test.ts --reporter=dot`，63 项通过。
- `npm run tauri -- build --bundles nsis`：Release 应用及 NSIS 安装包构建通过。
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/module-16-installer-qa.ps1`：434 项安装/卸载回归通过，保留系统 UserChoice。

## 可重复方法

前端：`npm test -- --maxWorkers=2 tests/module-19-source.test.tsx tests/module-19-performance.test.ts`。性能测试提供模拟范围源，1 GiB 不写入实体大文件。检测原始字节 offset、实际行数、长行长度、尾部行、单次读取上限、检查点占用、取消和索引预算停止，非仅“不崩溃”。

界面：`npm run build` 后 `npx vite preview --host 127.0.0.1 --port 1421 --strictPort`；设置 `PRISM_PLAYWRIGHT` 指向既有工具运行时，运行 `node tests/module-19-browser-qa.cjs`。默认 CPU 4 倍降速，可用 `PRISM_CPU_RATE=1` 建立基线。滚动测量为外部驱动开销，不冒充 FPS；完整结果在 JSON。

桌面：隔离测试 identifier `app.elorin.module19.qa`，临时配置 devUrl 1421、禁用 beforeDevCommand；设置 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9226`、独立 `WEBVIEW2_USER_DATA_FOLDER`，运行 Tauri dev，再运行 native QA。禁止把测试工作区恢复状态写入用户正常 identifier。

## 性能与不足

`module-19-index-performance.json` 记录 1/20/100 MiB / 1 GiB、100 万行与检查点预算的实际测量。峰值范围 262,144 字节；1 GiB 的行数 262,145、检查点 1,025。100 万行的检查点 3,907。密集短行在 32,768 个检查点上限停止，明确不是完整索引。

最近索引耗时：1 MiB 38.23 ms、20 MiB 381.10 ms、100 MiB 1,635.27 ms、1 GiB 16,919.38 ms。Node 模拟源扫描期间同机有工程构建活动，这些数值不能作为低配实机成绩。

最终生产界面复验：源码首屏 257 ms、约 1 MiB 源码首屏 299 ms；四倍 CPU 降速下 120 次外部驱动滚动耗时 7,810 ms（含工具开销，非 FPS）。10 秒闲置 Renderer TaskDuration 增加 0.000813 秒，主页面堆 13,047,260 字节。没有将局部堆数据当作整个应用峰值。

旧 i5/8 GB 设备未实测。主页面 heap、Renderer TaskDuration、控制器 Worker 数均属于局部指标，不等于整个应用峰值进程内存。完整进程内存归因与长期压力尚未完成。
