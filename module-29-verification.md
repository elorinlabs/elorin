# Module 29 — 格式目录与解析器接入体系

## 实际完成

- 沿用唯一 `src/formats` catalogue/runtime，增加 category、parserId、viewerId 和实际接入状态；未建立第二套 Registry、FileSource 或 Viewer。
- Module 28 的 PSD/MAT Level 4/3DS 通过类型化 `loadContentAdapter/parseFormat` 按需加载，继续使用已有图片/科学数据/几何 Worker、内容模型和生命周期。
- 重复扩展名保留多候选，候选顺序不再取决于注册顺序；`.pl` 增加有界 Perl/Prolog 内容探测，未确定时保持 Ambiguous。既有签名优先和 `.m` 探测保留。
- 仅识别格式的默认打开返回明确未支持；主动 Text/Hex 路径保留。DOC、XLS、XLSB、PPT、MSG 后端只返回占位提示，已修正目录为未实现内容解析。
- 能力矩阵新增 `formatId/parserId/viewerId/detectionStatus/parsingStatus/renderingStatus/sampleStatus`，每项保留源码、样本哈希和原验证依据。
- `pnpm formats:check` 检查重复 ID、冲突策略、缺失解析器/Viewer、AST 导出与 Worker 接线、模型/projection、runtime 同步、虚假支持和失效样本证据。新增故障注入及真实输出测试。

关键源码：`src/formats/{types,index,content-adapter,content-adapters,catalogue,runtime}`，三个既有 Worker，`src/viewer/core/controller.ts`，`scripts/{generate-formats,generate-format-capabilities,check-format-registration}.cjs`。接入说明见 [REGISTRATION.md](docs/formats/REGISTRATION.md)。

## 数量与测试

- 目录 **155** 条；独立适配器 **3**；既有 Viewer 内部路径待逐格式验证 **120**；未实现解析 **31**；仅原始字节查看 **1**。不能据此宣称 155 种真实阅读支持。
- 能力矩阵 **15** 条格式附有内容验证，保留历史运行；PSD/MAT/3DS 新增本次原生运行证据。本次仅复测受影响功能及 Module 28 样本。
- TypeScript **PASS**；针对性测试 **199/199 PASS**；前端生产构建 **PASS**；目录一致性检查 **PASS**。包含 Office 等受影响路径及取消、迟到响应、超时和资源释放回归。
- Rust 源码未修改，单元回归 **不适用**；隔离 Tauri release 编译 **PASS**。
- 原生最终验证 **PASS（17 项检查）**：PSD raw/PackBits 实际像素、MAT 大/小端及 complex 变量/网格、3DS 模型与导航、TIFF 回归；损坏/超预算/外部纹理诊断；错误扩展名在主窗口/Focus 一致识别；ZIP 内 PSD 预览及独立标签；PSB 未支持→主动 Hex，EPS 未支持→主动源文本。
- 关闭后 Worker **20 created / 0 live**；MAT 最小化释放并恢复；正常退出码 **0**，观察到的应用/WebView 子进程残留 **0**。核对一张实际 3DS 运行截图，未重设计 UI。

证据：[测试](docs/qa/module-29/tests.json)、[检查器复测](docs/qa/module-29/registration-tests.json)、[目录检查](docs/qa/module-29/registration-check.json)、[构建](docs/qa/module-29/build.txt)、[原生编译](docs/qa/module-29/native-build.txt)、[原生运行](docs/qa/module-29/native-report.json)、[内容证据](docs/qa/module-29/content-evidence.json)、[运行截图](docs/qa/module-29/routing-native.png)。样本复用 `tests/fixtures/module28` 中按公开格式规范生成的合法二进制内容，没有新增格式家族或伪造样本。

## 遗留与 Git

- 120 条 Viewer 内部路径不等于逐格式解析验证；未验证 codec/内部版本继续明确保留未验证状态。31 条未实现格式未增加解析器。
- PSD/MAT/3DS 支持范围沿用 Module 28，未扩大到图层/ZIP、MAT v5/sparse、3DS 外部纹理/动画。CSV P95 遗留仍 OPEN；已有构建大 chunk 警告保留。
- 分支 `feature/module-29-format-registration`；实现提交 `bd2c206`。基于 Module 28 的 `1d9ef74`，历史成果保留，尚未合并 develop/main。
- 本轮使用独立 `app.elorin.module29.qa`，个人配置哈希保持不变，不生成或替换安装包。QA exe SHA-256：`e6cd51855bf16599c72b817ce6e85f73caf2097975f62f082578fe07600601fa`；冻结安装包仍为 `61ec10318d431ff241508e41446bf15ef20bb4256e5a9fd61efe1820a38e6588`。

完成后停在 Module 29，不启动 Module 30。
