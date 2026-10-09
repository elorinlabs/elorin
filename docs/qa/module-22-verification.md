# Elorin Module 22 中文验收报告

日期：2026-10-09。本报告记录实际完成与保留项；不将所有专业格式写成完整支持。

## 1. 实现功能

- 新增独立字幕查看：SRT/VTT/ASS/SSA/MicroDVD 时间、排序、Unicode、多行、搜索、跳转、虚拟列表、原始 source/styles 与异常提示。
- 用户显式指定已授权 sibling 字幕后，视频创建真实 TextTrack/VTTCue；没有磁盘搜索。
- NPY 数值数组、精确 Int64、Float16/复数、scalar、空数组、C/Fortran、大小端与多维切片；NPZ 内部 NPY 经现有安全 Archive/VFS 查看。
- PCM WAV 有界抽样波形；Loop 控制；媒体隐藏/最小化时卸载源、停止播放，恢复保持暂停。
- 动画隐藏/暂停停止解码，关闭释放当前帧与 decoder；初始 frame 不再长期持有。
- 12 类共用错误诊断保留原 message/code/detail。
- 155 格式的衍生机器矩阵，真实样本与断言证据分离于声明；19 格式有本轮执行依据。
- 修复标签页 flex 约束造成的虚拟表格全部渲染问题，以及超过 CSS 滚动高度的大数组尾部导航。

## 2. 架构与接口

见 [Module 22 架构报告](../architecture/advanced-media-professional-formats-module-22.md)。唯一 Registry、Module 17 检测/适配、FileSource、Binary/Rust scientific sessions、Archive/VFS 及既有 Worker 均复用。未创建并行框架。

## 3. 全格式评级与能力标志

见 [人类可读覆盖清单](../formats/FORMAT-COVERAGE.md) 和 [机器矩阵](../formats/format-capability-matrix.json)。null = 没有本轮执行证据，不等同于 L0，也不等同于原有功能不存在。媒体 L4 只对应列出的实际 codec/fixture/运行环境，不能推广为该容器所有编码均支持。

生成方式：先执行 `tests/module-22-matrix.test.ts` 及媒体/动画真实 QA，再运行 `npm run formats:audit`。程序读取实际 catalogue/Viewer AST、验证 fixture hash；测试使用真实 registry.resolve、detector、adapter 和解析值，不只检查字符串。没有专用解码证据的专业格式保留未验证等级。

## 4. 实际完成与未完成

NPY/NPZ、字幕和媒体/动画生命周期为本轮主要完成范围。保留项：Lottie 渲染、PSD/PSB 合成图及图层、EXR/HDR 原始精度、BigTIFF Tile/Strip、多页 TIFF 导航、HEIC 可移植 Codec、设计文件专业渲染、3MF/3DS 渲染、FITS/旧 MAT、非 WAV 波形、动画随机帧导航、完整跨 Viewer 的内联错误统一。原因与后续安全接入方案见架构报告。

## 5. 新增/修改文件

新增核心：`src/viewer/plugins/data/npy-reader.ts`；`src/viewer/plugins/media/subtitles.ts`、`subtitle.plugin.tsx`、`waveform.ts`。

修改：`src/viewer/builtins.ts`；data 的 `data.worker.ts`、`scientific-provider.ts`、`sqlite-provider.ts`；media 的 `PlaybackController.ts`、`MediaViewer.tsx`、`media-model.ts`、`media-source.ts`、`media-probe.ts`；image 的 `ImageViewer.tsx`、`image-model.ts`；`src/services/fileSource.ts`；共用 `errors.ts`、`ViewerErrorBoundary.tsx`、`GridSurface.tsx`；`src/workspace/productivity.css`、office `module10.css`。

格式/工程：`scripts/generate-formats.cjs`、`src/formats/catalogue.json`、`runtime.json`、`scripts/generate-format-capabilities.cjs`、`package.json`；`module-22-tauri.local.json` 仅隔离 QA。

测试：`tests/module-22.test.ts`、`module-22-matrix.test.ts`、`generate-module-22.py`、`module-22-browser-qa.cjs`、`module-22-animation-qa.cjs`、`module-22-media-qa.cjs`、`module-22-native-qa.cjs`、`module-22-sparse-qa.cjs`；`test-fixtures/advanced22` 标准工具生成的数组与字幕样本。文档/证据在 `docs/architecture`、`docs/formats`、`docs/qa/module-22-*`。

## 6. 测试命令和实际结果

| 命令/检查 | 已执行结果 | 证据 |
| --- | --- | --- |
| `npm test -- --maxWorkers=2 --reporter=dot` | 42 文件、793 tests passed；70.47 秒 | module-22-typescript-tests.log |
| `cargo test -j 1` | 82 passed；0 failed/ignored | module-22-rust-tests.log |
| `npm run build` | TypeScript/Vite 构建通过；存在原有大 chunk warning | module-22-build.log |
| `node tests/module-22-browser-qa.cjs` | 20 checks passed | module-22-browser-runtime.json |
| `node tests/module-22-animation-qa.cjs` | 16 checks passed | module-22-animation-runtime.json |
| `node tests/module-22-media-qa.cjs` | 27 checks passed，包含 AVI 明确解码错误 | module-22-media-runtime.json |
| `node tests/module-22-native-qa.cjs` | 9 checks passed | module-22-native-runtime.json |
| `node tests/module-22-sparse-qa.cjs` | 2 checks passed，实际 8 GiB 稀疏文件 | module-22-sparse-runtime.json |
| `node tests/module-10-runtime-qa.cjs` | 92 checks passed，表格/演示专业 Viewer 回归 | module-22-office-runtime.json |
| `npm run formats:audit` | 155 actual records；19 有执行证据 | format-capability-matrix.json |

真实浏览器测试使用既有 Playwright 与 Edge，`PRISM_PLAYWRIGHT` 指向测试运行时。WebView2 使用隔离 identifier `app.elorin.module22.qa`、独立 user data directory、debug CDP 9229，不修改用户 workspace。没有把浏览器 File input 测试冒充原生文件协议测试。

## 7. 性能方法与结果

实际环境：Windows 11 Pro，Intel i7-10750H，6 cores/12 logical processors，约 16 GiB RAM。没有 2015–2016 中端 i5 实机；没有把 CPU 降速模拟称为实机。

浏览器最终回归小字幕首屏约 260–565 ms，NPY 小数组约 259–378 ms，NPZ 列表约 250 ms，WAV 首屏约 363 ms；是开发服务环境的容器/内容出现时间，不是通用冷启动保证。JSON 保存逐样本原始值。

实际稀疏 NPY 长度 8,589,934,669 bytes，payload 8 GiB；Windows sparse allocation 两段为 0x10000 + 0x4d，约 64 KiB。界面跳到第 2,147,483,648 行读到预写的 123.5，关闭后 sessions/tasks/reservedBytes = 0。临时文件已删除。另有模拟 8 GiB source 与 4 GiB 长 WAV 的自动化边界测试，二者明确标为模拟，未冒充物理文件。

原生进程/Rust/WebView2 工作集、CPU 累计值和 OS handles 在 `module-22-native-runtime.json`；只代表短时样本，不把 OS HandleCount 当作文件句柄数。没有 GPU 精确采样。内存不会因为卸载立刻恢复冷启动基线，V8、模块与系统 decoder 缓存仍可能保留；科学 session/worker 的资源释放另有直接断言。

最终原生样本：Rust 工作集 baseline 33,972,224 bytes、playing 35,196,928、closed 35,110,912；WebView2 baseline 441,860,096、playing 558,432,256、closed 554,446,848。最小化后约 5 秒等待区间，总 CPU 累计增加 0.109375 秒，OS handles 从 3903 降到 3886。采样程序本身有开销，未据此宣称长期接近 0 CPU；Rust 单独由 QA 所有 PID 识别，避免路径转义导致漏计。

未执行：30 分钟连续闲置、长期多轮 RSS 稳定性、旧 i5 实机、超大多页 TIFF、数小时压缩音频 PCM 波形、GPU 硬件计数、所有容器/Codec 组合。可复现扩展：相同隔离 WebView2 中，分别在 loaded/minimized/closed 状态每分钟记录进程 CPU/工作集/handles 与 scientific_stats，持续 30 分钟，重复打开关闭不少于 20 次；应记录 elapsed wall time，不能仅根据累计 CPU 推断占用率。

## 8. 生命周期与资源释放

原生 NPY 关闭后 scientific sessions/tasks/reservedBytes = 0，Worker 数量 = 0。WAV 最小化 paused=true、src 移除；恢复 src、保持 paused=true。外部字幕为实际 showing TextTrack，关闭清理 cue/track。音频不再移到隐藏 body 后继续播放。URL/lease、事件监听、元信息/封面引用在 close 时释放；metadata late result 检查 disposed/abort，取消中的结果不回写。

动画 pause/hidden 期间 decoder call count 稳定，当前 VideoFrame 在隐藏时关闭，viewer close 后 decoder/frames = 0。隐藏时仍保留 decoder 输入和初始有界 canvas，不声称全部内存立即归零。

## 9. 安全验证

已执行：object/pickle 在 payload 读取前拒绝；伪造 header/shape/截断 payload/非法切片拒绝；Float16 NaN/Infinity 和精确 64 位整数正确；字幕 BOM/Unicode/重叠/非法时间/无 FPS MicroDVD/VobSub/超长输入边界；超长 tokenizer 参数在分配前拒绝；4 GiB 模拟 WAV 总源读取 <18 MiB。继承的路径穿越、VFS/Archive、SVG、源改变与 Rust 安全回归在全套 tests 中执行。

没有新增 eval、pickle loader、文件脚本、PostScript、网络 Codec、FFmpeg、Ghostscript、宏、媒体编辑、源文件写入或持久副本。生成/删除的测试 fixture 与临时稀疏文件属于工程 QA，不属于对用户文件的写入。

## 10. 依赖审计

零新增 npm/Rust 依赖；原依赖许可证与分发方式不变。`npm audit` 因没有 npm lockfile 返回 ENOLOCK，未宣称通过；随后针对实际 `pnpm-lock.yaml` 的 `pnpm audit --prod --json` 完成，结果 1 low、0 moderate/high/critical：既有 diff 8.0.2，GHSA-73rr-hh4g-fpgx。受影响 parsePatch/applyPatch 当前未被项目调用，实际 diffLines 有超时/复杂度限制。告警未自动清除或跨模块升级，保留待修复项。

## 11. 媒体和图片技术选型

系统 HTMLMediaElement 实测 MP3/WAV/FLAC/OGG/OPUS/M4A/AAC、MP4/WebM/MOV/MKV 样本播放与 seek；AVI 样本 error=4，明确 Codec 提示。多轨 MP4 样本可播放，当前 Edge 无 audioTracks API，因此没有伪造切轨控件。系统版本/编码变化需要重新验证。

WebCodecs 动画复用原实现；普通 image/AVIF/HEIC、TIFF、SVG 不引入额外 decoder。未承诺 HDR、所有 profile 或通用 HEIC 可移植性。图像预算及首帧限制见架构报告。

## 12. Module 17/20/21 集成

NPY 通过 formatId 适配到 existing scientific viewer，不修改 DetectedFileType/第二套注册；NPZ 进入 existing archive，再复用 contained NPY adapter。字幕是 lazy viewer，专用 PDF/image/Office/audio/video 路由保留。无法解析时可显式选择现有 Text/Hex；权限/源失效不归为“未知格式”。几何模块没有换引擎、增加网络纹理权限或升级 Three/OCCT。

## 13. 构建与安装包

`npm run tauri -- build --bundles nsis` 最终成功：TypeScript/Vite build 44.72 秒，Rust release 构建 1 分 44 秒，NSIS 成功。记录见 `module-22-installer-build.log`。最终安装包 `src-tauri/target/release/bundle/nsis/Elorin_0.1.0_x64-setup.exe` 为 13,483,512 bytes（约 12.86 MiB），较 Module 21 的 13,478,020 bytes 增加 5,492 bytes。

SHA-256：`3C0D269B8DEDDA8CE6C858F4C2996AB46AB68A12928988C9C059F2D17F229B7C`。

对这一最新包执行 `tests/module-16-installer-qa.ps1`：434 checks passed。隔离 per-user 安装、Open With/quoted command 注册、UserChoice 保持、卸载和自身注册移除检查成功；证据为 `module-22-installer-runtime.json`、`module-22-installer-qa.log`。没有用旧包结果替代最终构建。

## 14. 失败记录与修复

保留测试失败的事实：初轮 Module 17 旧断言依赖引号写法；浏览器音频测试错误地等待不可见 audio 可见；旧 QA 服务端口/Find selector 不适配；动画测试发现长期持有的初始 frame 及 tab 布局遮挡；8 GiB 测试发现滚动映射、边缘取整和浮动通知遮挡。已分别修正代码/测试定位，并复跑上表中的相关验证。没有降低断言或跳过全套测试。未适配的旧 Module 09 通用文档脚本因 Find selector 停止，其失败保留在日志；本模块图像生命周期由专用真实动画 QA 验证，未将旧脚本写成通过。

## 15. 验收结论与保留项

上述已实现范围通过列出的实际验证；不声称所有 Module 22 专业格式与长期性能项目完整验收。专业解码/随机帧/长期实机等缺口明确保留，所有未执行格式等级为未验证。到此仅处理 Module 22，未开始 Module 23。
