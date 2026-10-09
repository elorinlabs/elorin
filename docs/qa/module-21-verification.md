# Module 21 验证记录

日期2026-10-09。详见[架构和支持矩阵](../architecture/cad-3d-engineering-viewer-module-21.md)。仅填写实际结果。

## 实际命令

- `npm test -- --maxWorkers=2 --reporter=dot`：最终774项/40文件通过，56.34秒；`module-21-typescript-tests.log`。
- `cargo test --manifest-path src-tauri/Cargo.toml --jobs 1`：82项（39单元+43集成）通过，无跳过；`module-21-rust-tests.log`。
- `npx vitest run tests/module-21.test.ts tests/module-13.test.ts --maxWorkers=2 --reporter=dot`：追加CPU清理断言前65项通过，新增断言最终由全套覆盖。
- `npm run build`：类型和生产构建通过，保留chunk/import提示；`module-21-build.log`。
- `node tests/module-21-browser-qa.cjs`：最终生产29项通过，包含parser/GPU统计与CPU清理/恢复；`module-21-browser-runtime.json`。
- `node tests/module-21-native-qa.cjs`：最终真实WebView2 8项通过，包含CPU清理路径；`module-21-native-runtime.json`。
- security QA：生产19项通过，恶意URI/路径、坏格式/Hex/VFS，无外网请求；`module-21-security-runtime.json`。
- `npm run tauri -- build --bundles nsis`：最终Release/NSIS构建通过，Rust Release3分52秒；安装包13,478,020字节（12.85MiB），比Module20的13,469,316字节增加8,704字节。`module-21-release-build.log`。
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/module-16-installer-qa.ps1`：本模块最终安装包隔离安装/卸载434项通过，UserChoice保留；结果另存`module-21-installer-runtime.json`。

## 环境和复现

Windows11 Pro、i7-10750H6C/12T、约16GiB、Edge/WebView2；未测试旧i5/8GB/IntelHD。`node tests/generate-module-21.cjs`生成10k/100k/1M批次STL与凹OBJ。已有标准格式/异常样本复用；不执行被查看文件脚本。

构建后`npx vite preview --host 127.0.0.1 --port 1421 --strictPort`；`PRISM_PLAYWRIGHT`指向既有工具Playwright；`PRISM_QA_URL=http://127.0.0.1:1421`。桌面隔离identifier `app.elorin.module21.qa`、配置`module-21-tauri.local.json`、用户数据`.qa-tools/module21-webview`、调试9228；不写入用户正式工作区。

## 性能结果

最终生产首屏：10k270ms、100k383ms、1M1924ms、百万点PLY2436ms；包括读取/解码/渲染/驱动等待，不是FPS。对应parser43.2/125.4/650.7/1912.5ms，GPU setup20.4/21.7/57.2/37ms；详细JSON含renderer资源和计费数组。

最终真实WebView2 100k：parser102.1ms，GPU场景setup30.7ms（CPU提交/建立，不是GPU fence）；geometry=1、triangles=100000、renderer textures=1（含内部资源）；模型geometryBytes7,200,000、textureEstimate0。

最终5秒稳定空闲累计CPU4.375→4.40625秒，增量0.03125，frame不增长。工作集baseline419,311,616、loaded471,994,368、idle471,117,824、minimized463,216,640、close短期476,581,888字节，合计应用及隔离WebView2进程。关闭后未立即回落，不宣称物理显存/总进程内存即时归还。当前脚本记录总工作集，未分别测主进程/WebView2高频峰值。

最终最小化初段约5秒CPU4.453125→5.390625，增量0.9375秒，包含窗口/引擎清理且较高；Canvas0/Worker0不等于总进程零CPU，长期稳定阶段仍可优化/补测。

## 安全和释放

OBJ/Ply/glTF/场景边界自动化；DXF OCS尺寸回归；坏STL/GLB/STEP/DXF及huge count拒绝；恶意外部buffer/遍历/JavaScript拒绝；VFS OBJ/MTL/texture成功；Hex回退。Context Lost/Restore基于实际事件、geometry与triangle恢复断言；隐藏/最小化/关闭释放Canvas/Worker，恢复重建。GPU物理回收未测。

## 失败记录和未执行

glTF count、DXF共享点/OCS、GPU frame重置、WebView idle初测失败及修复见架构报告；未跳过断言。为了包含最终代码主动中止旧构建。未完成旧硬件实机、FPS/物理显存高频峰值、复杂场景/大型DXF新专项及数小时闲置；专业格式限制见矩阵。未开始Module22。
