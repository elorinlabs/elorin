# 启动后桌面黑屏事件

2026-10-09，用户反馈：软件启动后只剩软件窗口，桌面其余区域黑屏，鼠标不可见。按严重兼容性故障处理，暂停继续启动原生程序自动验证。

## 已查证

- 主窗口配置没有全屏或置顶启动逻辑；保存的 `.window-state.json` 为 1440×1000，`maximized:false`、`fullscreen:false`。
- 未发现启动时隐藏系统鼠标、改显示器模式或覆盖整个桌面的调用。Focus 全屏只由显式按钮触发。
- 检查时 `prism.exe` 已不在运行，Explorer 和 DWM 均响应；近两小时相关系统日志及近三小时应用日志没有可确认此次原因的记录。
- 当前主机为 Intel UHD Graphics + NVIDIA RTX 2060 双显卡；读取到的驱动日期均为 2022 年。此事实不证明驱动就是故障原因。
- 之前的浏览器及隔离原生 QA 未检测到此故障；此前测试通过不能代表用户启动环境没有黑屏问题。

## 兼容性缓解改动

主窗口 `src-tauri/tauri.conf.json` 与 Focus 创建 `src-tauri/src/focus.rs` 统一设置 `--disable-gpu --disable-gpu-compositing`，保留 Wry 原有默认浏览器功能限制。显式设置 `fullscreen:false`、`alwaysOnTop:false`。新增 Rust 测试，校验两种窗口的 WebView 浏览器参数一致，且默认不全屏、不置顶。

原生产可执行文件保存在 `.app-backup/prism-before-black-screen-fix.exe`，不建议再次启动此文件。修复版原地重新构建，不覆盖已安装版本，不删除用户窗口或工作区数据，不改系统驱动与显示设置。

这是一项针对 GPU 合成路径的兼容性缓解，**根因未确认，不能宣称黑屏已彻底解决**。软件渲染可能增加 CPU 占用；3D/WebGL 和部分媒体加速能力可能降低或不可用，仍需验证。没有偷偷启用不安全的 SwiftShader 或忽略渲染失败。

## 验证记录

- Rust 定向测试：`cargo test --manifest-path src-tauri/Cargo.toml -j 1 window_chrome`，实际结果见 `.qa-tools/black-screen-tests.log`。
- 正式构建：`pnpm tauri build --no-bundle`，实际结果见 `.qa-tools/black-screen-build.log`。
- 本次没有自动启动原生程序，避免再次影响用户桌面。用户环境中的启动复测仍待验证；关闭软件后桌面是否恢复、故障发生在启动还是打开文件后，尚待用户反馈。
