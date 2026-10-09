# Module 20 验证记录

日期：2026-10-08 至 2026-10-09。只记录实际运行；详细审计、支持矩阵、文件及接口见 [架构与验收报告](../architecture/scientific-engineering-data-viewer.md)。

## 已执行检查

- `npm test -- --maxWorkers=2 --reporter=dot`：最终 757 项 / 39 文件通过，59.44 秒；原始日志 `module-20-typescript-tests.log`。包含 23 项科学边界与 6 项科学会话生命周期新增测试。
- `cargo test --manifest-path src-tauri/Cargo.toml --jobs 1`：82 项通过（39 单元测试 + 43 集成测试），无忽略；原始日志 `module-20-rust-tests.log`。
- `npm run build`：类型检查和生产构建通过；保留既有 chunk 提示与动态／静态 import 提示，没有放宽阈值。
- `node tests/module-20-browser-qa.cjs`：生产 Edge 33 项通过；原始结果 `module-20-browser-runtime.json`。
- `node tests/module-20-native-qa.cjs`：真实 Windows WebView2 11 项通过；原始结果 `module-20-native-runtime.json`。
- `node tests/module-20-security-qa.cjs`：生产 Edge 16 项通过；原始结果 `module-20-security-runtime.json`。
- `npm run tauri -- build --bundles nsis`：最终代码 Release 与 NSIS 构建通过；Rust Release 3 分 40 秒，安装包 13,469,316 字节（12.85 MiB），比 Module 19 的 13,428,195 字节增加 41,121 字节。完整日志 `module-20-build.log`。
- 收尾补测 `npx vitest run tests/module-20-session.test.ts tests/module-20.test.ts tests/module-14.test.ts --maxWorkers=2 --reporter=dot`：51 项通过，增加源大小读取失败时终止 Worker 的断言。
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/module-16-installer-qa.ps1`：最终 Module 20 安装包隔离安装／卸载 434 项通过；保留系统 UserChoice；结果保存为 `module-20-installer-runtime.json`。

## 可复现环境与方法

Windows 11 Pro；Intel Core i7-10750H，6C/12T；系统可见内存 16,605,116 KiB。没有旧 i5 实机测量。浏览器 CPU 使用 CDP 4 倍降速，不能等价于硬盘／核数／GPU／内存均为参考机器。

夹具：使用工具运行时的 Python 3.12 执行 `tests/generate-module-20.py`；pyarrow、h5py、numpy 来自已有 `.tools/module14-fixtures`。默认系统 Python 3.13 不适配这些 cp312 工具，不是应用依赖。

前端运行：构建后 `npx vite preview --host 127.0.0.1 --port 1421 --strictPort`。设置 `PRISM_PLAYWRIGHT` 为已有 Playwright 工具包位置，`PRISM_QA_URL=http://127.0.0.1:1421`，运行 browser／security 脚本。

桌面运行：隔离 identifier `app.elorin.module20.qa`，配置 `module-20-tauri.local.json`，devUrl 1421；`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9227`，`WEBVIEW2_USER_DATA_FOLDER=D:\Prism\.qa-tools\module20-webview`；`CARGO_BUILD_JOBS=1`；运行 Tauri dev，再运行 native 脚本。不修改用户正式工作区数据。

## 性能实际结果

生产浏览器首显 109–401 毫秒；50 次逻辑行跳转、4 倍 CPU 降速、包含外部驱动耗时，共 8,396 毫秒；DOM 行始终少于 100。此结果不是 FPS。5 秒空闲主线程任务耗时 0.001678 秒，主 JS Heap 21,580,608 字节；不包含解析 Worker 与 WASM。

桌面总工作集将应用及隔离 WebView2 相关进程合计，包含 WASM 和引擎，属于采样值而非高频峰值：

| 状态 | 工作集字节 | 约 MiB |
| --- | ---: | ---: |
| 初始 | 421,470,208 | 402 |
| 10 GiB 逻辑数组已加载 | 480,571,392 | 458 |
| 最小化后 | 451,252,224 | 430 |
| 恢复且稳定空闲 | 486,801,408 | 464 |
| 关闭文件并等 3 秒 | 451,944,448 | 431 |

稳定空闲约 11,748 毫秒（含采样调用开销），所有目标进程累计 CPU 从 5.53125 秒到 5.5625 秒，增加 0.03125 秒；科学任务 0、预留 0。关闭／最小化后科学会话、任务、活动解析 Worker 均为 0。工作集未完全回到初始值，不能宣称整个进程内存硬限制为 32 MiB，也不能宣称全部引擎内存即时归还 OS。

读取层稀疏测试：1 MiB／100 MiB／1 GiB／10 GiB 每个 101 次范围读取，实测详见 `module-20-rust-performance.json`（约 13–16 毫秒）；底层配置缓存上限 262,144 字节，未写入对应大小的实际磁盘内容。这不是 Parquet／HDF5 完整解码速度。

大型真实 HDF5 数组 shape=(10240,512,512)、float32，逻辑 10 GiB，物理仅 7,128 字节；验证尾端固定轴、Fill、标量 Int64 与空数组。既有 Rust SQLite 百万行测试通过；浏览器行组表 100,000 行完成高速跳转。未声称完成百万行科学表的端到端 UI 实机基准。

## 安全与资源结果

损坏 Parquet/HDF5、巨型 Footer、未知 codec/filter、伪造 Arrow Footer 均展示明确错误，可主动切到 Hex；外部 HDF5 链接标记 blocked；树初始展开保持有界；Archive 内 HDF5 可查看；没有自动外网请求。未授权路径在真实 IPC 下被拒绝。迟到 open/read、取消、暂停、u64 超范围、维度乘积溢出、固定轴冲突、零 stride、轴输入超限、跨 owner 缓存淘汰均有自动化断言。

暂停销毁 Worker／自有原生会话，恢复建立新会话；关闭释放自有源，应用 Exit 执行清理，不关闭共享父 VFS。没有启动驻留扫描任务。

## 运行期间发现并处理的问题

- 旧 Module 14 extra QA 的按钮定位不适配现有 UI，首次脚本失败，未算通过；新增脚本使用当前活动 tab 定位。
- 初次 Arrow Stream 通过旧格式路由进入时，legacy detectedType 为 unknown，Worker 报 Unsupported data format；修复为复用 Module 17 的 format ID，并增加真正 Schema Message 签名检测。
- 大表暴露网格高度上限不足；增加 DOM／视口硬边界并重跑真实 UI 测试。
- 预览类型测试最初没有填写真实数值类型；保留原断言，改为具有明确 float64/int64 的真实 DataCell 测试输入，不允许 Unknown 字符串被当数值列绘图。
- Rust 并行编译一次因 Windows 页面文件不足失败（1455）；改为 `--jobs 1` 后全套通过，没有跳过测试或改断言。
- 首次桌面空闲采样包含恢复后的短期初始化；最终测量先等 5 秒稳定，再测 10 秒，记录采样总时长与真实 CPU 差值。

## 已知限制

没有 2015–2016 目标硬件实机、60 FPS、机械盘延迟、数小时空闲或恶意格式全覆盖证明。格式能力限制见矩阵。没有实施 Module 21。
