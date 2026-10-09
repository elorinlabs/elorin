# Elorin Module 22 — 高级媒体与专业格式覆盖

日期：2026-10-09。范围止于 Module 22，没有实施 Module 23。

## 1. 实际仓库审计

复用 Module 17 的 catalogue／FormatIndex／RoutedFormatAdapter 和唯一 ViewerRegistry，Module 18 的 BinaryModel 与 Rust 分块读取，Module 12 的 Archive/VFS，Module 20 的科学数据 Worker、切片验证与缓存，以及原有 HTML 媒体、WebCodecs、UTIF、SVG 和几何查看器。新增能力通过现有 lazy registration 接入，没有增加第二套检测器、媒体服务或科学运行环境。

HTMLMediaElement 是实际音视频解码后端；music-metadata 只负责有界元信息读取。系统 Codec 提示与实际播放证据分别记录。Three.js 的 3DS/3MF loader 存在，但安全地引入仍需完整的 chunk/ZIP/XML/外部纹理/对象与变换预算验证，不能直接调用 loader 后宣布支持。本模块没有新增这些渲染适配器。

## 2. 数据流与接口

```text
FileSource → 既有检测/格式适配 → 同一个 Registry → lazy Viewer
NPY → scientificProvider → DataWorkerClient → NpyReader
    → Rust scientific session 的读取/切片边界 → 既有虚拟网格
NPZ → Archive/VFS → contained .npy → 同一 scientific Viewer
字幕 → 4 MiB 有界 readText → parseSubtitles → 时间排序/虚拟列表/Inspector
显式关联字幕 → safeResourcePath → 已授权 resolveRelated → VTTCue
PCM WAV → BinaryModel → 有界随机窗口抽样 → 至多 256 个峰值
音视频 → 已授权 native-range / Browser Blob → PlaybackController
动画 → 有界 ImageDecoder → 单个活动帧 → canvas
```

`NpyReader.open()` 解析 literal header；`page(DataRequest)` 复用原有二维网格与 fixed 多维切片协议。只在载荷读取时按需取得字节，没有完整数组复制。FileSource 的数字偏移必须在安全整数范围内；原有 Rust 二进制 IPC 仍使用十进制字符串/u64。本模块没有扩张科学网格对超出 JS 安全整数地址的能力。

`parseSubtitles(source, format, explicitFPS?)` 返回 cues、warnings、原始 styles。没有 eval、表达式、HTML 注入或字幕脚本执行。SRT/VTT/ASS/SSA 和有明确 FPS 的 MicroDVD 支持；VobSub 明确不支持。字幕关联需用户点击并指定已授权的相对路径，不扫描磁盘。

`PlaybackController.suspend()/resume()` 暂停、卸载 src、保存时间；恢复加载并定位，保持暂停。close/dispose 解除事件监听、注销播放协调器、释放 URL/lease。非活动页面、隐藏、最小化使用原有活动状态机制。元信息读取有 16 MiB 总预算、8 MiB 单 token 上限和 20,000 次调用上限。

## 3. 科研能力与安全边界

NPY v1/v2/v3，numeric/bool、Float16/32/64、复数、精确有符号/无符号 64 位整数，大小端、C/Fortran 顺序、scalar、空数组、多维切片。header ≤64 KiB，rank ≤32，shape/product/载荷长度校验；object/pickle、structured/string/void dtype 拒绝。沿用每页 ≤128 行、≤16 列及现有 Worker/缓存预算。

NPZ 沿用现有 ZIP 路径、解压大小、压缩比、嵌套与 VFS 生命周期规则。8 GiB 稀疏 NPY 原生尾部值已实测，未把文件完整加载到 JS。大逻辑行数导航修正了共享网格的滚动高度压缩：包含视口高度、边缘取整和 overflow 限制，确保最后一行可达。

## 4. 媒体与动画

保留原有封面/标签/codec/轨道元信息、实际播放、暂停、seek、音量、静音和按真实 API 提供的轨道控制。新增 Loop 与 PCM WAV 抽样波形。最多 256 窗口、每窗最多 64 frames，采样请求 ≤1 MiB；BinaryModel 的 chunk 对齐会放大实际源读取，自动化验证长 WAV 总读取 <18 MiB。峰值图明确标为抽样，不代表所有时间点的完整峰值。其他 codec 没有新增 PCM 波形解码。

普通 Browser File/Memory Blob 可零拷贝；其他虚拟数据源 materialization ≤64 MiB，避免把大 VFS 媒体整份复制到前端。没有 AudioContext、后台音频 Worker、FFmpeg 子进程或 Codec 下载。

GIF/APNG/Animated WebP 复用 WebCodecs：输入 ≤64 MiB、动画 ≤4 MP/1,000 frames、一个活动帧。初始预览保存为有界 canvas 并立即关闭初始 VideoFrame；隐藏后停止调度、关闭当前帧，close 后关闭 decoder。隐藏时 decoder 本身及静态预览仍可保留，未声称隐藏即释放全部内存。Lottie 未实现渲染，不执行表达式或加载外部资源。未新增随机逐帧跳转。

## 5. 专业格式分级与明确缺口

现有 TIFF 仅首图像页与基础元信息；UTIF 整份有界输入 ≤64 MiB、解码 ≤16 MP，没有无限大 Tile/Strip、BigTIFF、完整多页导航。HEIC/HEIF/AVIF 取决于当前系统 API，不能保证未安装 Codec 的系统；没有原始 HDR 精度展示。SVG 沿用原有安全过滤。

PSD/PSB/EXR/EPS/AI/FIG/SKETCH/BigTIFF/Lottie 新增的是目录中的检测/回退声明，主要为 Hex；没有实现合成图、图层、HDR、PostScript、设计文件完整渲染。未验证记录等级为 null，不标 L0。PDF 兼容内容继续服从已有 PDF 强签名优先级。没有执行 PostScript/Ghostscript。

FITS、旧 MAT、3MF、3DS 保留明确缺口。3MF 后续应复用安全 ZIP/XML 并验证 build item/component 变换、mesh 与 XML 节点预算；3DS 必须在现有 loader 前验证 chunk 长度/索引/顶点预算并阻断外部纹理。不为赶工绕过这些边界。IFC/FBX/DAE 没有新增完整渲染器。

## 6. 统一错误与能力清单

共用错误层提供 12 类诊断 category，同时保留原 IPC code、原始 message/detail。SyntaxError 不再被通用文案覆盖；权限/source changed 等代码优先保留。既有 viewer 自有内联错误没有全量重构，属于统一错误展示的剩余范围。

`scripts/generate-format-capabilities.cjs` 从实际 catalogue 和 builtins AST 生成 155 条矩阵。声明与执行证据分离；fixture SHA-256、实际注册解析、字节检测、解析值/播放/seek/解码资源断言可追溯。19 个格式有当前执行依据，其他是未验证，不由扩展名推断支持。矩阵是衍生文档，不参与运行时路由。

## 7. 依赖与体积

没有新增 npm/Rust 依赖，没有额外科学环境或 native Codec。测试样本由既有测试 Python/NumPy 生成，未加入应用安装包。沿用 music-metadata、Three、UTIF、fflate 等仓库依赖；许可证和打包方式保持原有记录。当前 pnpm production audit 为 1 项 low：既有 diff 8.0.2 的 parsePatch/applyPatch DoS；本仓库实际使用 diffLines，未调用受影响接口。未以此声明依赖没有风险，未自动跨模块升级。

最终测试、安装包体积和资源数据见 [验收报告](../qa/module-22-verification.md)。
