# Module 30 — 已有格式编辑能力审计与补全

## 155 条记录的分类

逐项核查唯一 catalogue 的生产 Viewer 路由、解析/源码模型、编辑入口及实际保存服务；自动化逐条加载已接入的 Viewer 并检查编辑门禁。没有把识别、Hex 或外部打开记作编辑能力，也没有把路由检查记作真实内容样本通过。

| 分类 | 数量 | 含义 |
| --- | ---: | --- |
| 完整编辑 | 0 | 不承诺不限编码、大小或格式变体 |
| 受限编辑 | 22 | 真实 UTF-8 源码/CSV 单元格编辑与原子写入，≤2 MiB |
| 只读 | 133 | 没有接入可靠的编辑器或写入器 |
| 待验证分类 | 0 | 接线分类明确；样本验证独立登记 |

22 条受限记录中，**7 条目录记录、9 个样本/扩展名**完成本次原生往返；其余 **15 条记录的本次原生往返为 NOT_VERIFIED**。阅读能力继续沿用 Module 29 的逐格式证据，缺样本的记录没有宣称全部可读。

机器清单仍是 [format-capability-matrix.json](docs/formats/format-capability-matrix.json)，新增 editCapability、parserReuse、viewerReuse、saveCapability、writerId、editorGroup、editLimitations 和 editEvidence，含每种原生往返及其运行来源；没有第二套注册系统。分组说明见 [EDITING-CAPABILITIES.md](docs/formats/EDITING-CAPABILITIES.md)。

## 实际补全

- **JSONL / NDJSON**：原来只提示未支持、编辑时按单个 JSON 校验；现在复用严格 JSON parser，逐记录解析至既有 JSON Viewer 模型及 Worker，保留原始偏移、精度和重复键；编辑按行验证，并接入既有关闭保护、保存、另存和恢复。
- **package.json / Notebook JSON（ipynb）**：开启已经存在的 JSON 源码编辑路径；写回原文，不重新序列化对象，保留自定义字段、Notebook metadata/cells。没有增加专用 Notebook 编辑器或 kernel。
- TXT、MD、JSON、CSV、TSV 原有编辑流程完成针对性往返回归。XML/YAML/TOML 仅保留此前源码编辑；语法高亮不算结构解析，不增加语义编辑支持。
- 统一现有目录编辑门禁，读取前/后检查 2 MiB 边界；只读 Session 禁止原路径保存。专业格式继续只读。

关键源码：`src/document/{editing,DocumentSurface,session,validation,save-service,create-options}`、`src/app/App.tsx` 的恢复分支、`src/viewer/plugins/json/{json-lines,json-load,json.worker}`、原目录 types/catalogue/runtime 及生成/检查脚本。

## 实际验证

| 样本/扩展名 | 保存及重新打开 | 系统另存 | 保留内容 |
| --- | --- | --- | --- |
| TXT、MD | PASS | 本次 NOT_VERIFIED | Unicode、未修改文字、原换行 |
| JSON | PASS | 本次 NOT_VERIFIED | BOM/CRLF、超长整数、重复键、未知字段 |
| CSV、TSV | PASS | 本次 NOT_VERIFIED | 前导零、空行、不规则行、多行字段、公式文本；允许引号规范化 |
| JSONL、NDJSON | PASS | PASS | 多记录、未知字段、整数原文、逐行校验、BOM/换行 |
| package.json、ipynb | PASS | PASS | 自定义字段、metadata/cells 原文 |

以上 9 个样本均验证未保存关闭→Cancel 保留编辑及原文件。较大 JSONL 验证既有 Worker 路径及关闭释放；原生外部修改冲突、只读失败、未选择路径写入拒绝均 PASS。最终安全运行 **7 Worker created / 0 live**，正常退出码 0，观察到的应用/WebView 子进程残留 0。

- TypeScript **PASS**；针对性自动化 **257/257 PASS**（含 155 条接线核查）；目录一致性 **PASS**；前端生产构建及隔离 Tauri release 编译 **PASS**。
- Rust 保存/创建安全回归 **12/12 PASS**：冲突、锁定、只读、磁盘满、临时写入失败、禁止覆盖等。Rust 源码和权限模型未修改。
- 原生累计 **36 项检查、9 次往返 PASS**。首次脚本未处理 CSV 混合换行确认，后续脚本未展开 Notebook/大 JSONL 的嵌套节点而中断；这些中断保留，已针对性完成剩余检查，各样本记录真实 validationRun。不是将中断整轮伪记为通过。

证据：[自动化](docs/qa/module-30/tests.json)、[原生最终汇总](docs/qa/module-30/native-report.json)、[往返完成及资源检查中断记录](docs/qa/module-30/native-roundtrip-report.json)、[初次中断](docs/qa/module-30/native-initial-report.json)、[Notebook 前的运行](docs/qa/module-30/native-second-report.json)、[目录检查](docs/qa/module-30/registration-check.json)、[Rust](docs/qa/module-30/rust.txt)、[构建](docs/qa/module-30/build.txt)。系统另存使用 computer-use 技能读取原生无障碍控件、设置隔离目标及 Save 快捷键；未绕过授权。

## 后续依赖、遗留与 Git

- 可共用：UTF-8 源码 16 条、Markdown 1 条、JSON 源码 3 条、CSV/TSV 2 条；均复用同一 `document.atomic-utf8` 写入路径。
- 133 条只读记录保留无写入状态。Office/电子书需保留包结构及未知节点的写入器；CAD/3D、媒体/图片需可靠专业编码器；Archive/VFS 需容器重建；数据库/科学数据需事务或数据集写入。源码别名后续也须先接线和往返验证，不能只开状态字段。
- UTF-16/其他编码、超过 2 MiB 编辑、大型专业编辑器、完整格式变体仍未实现/未验证。CSV P95 遗留继续 OPEN，已有大 chunk 构建警告保留。
- QA 使用 `app.elorin.module30.qa`；个人配置哈希不变，冻结安装包未修改，SHA-256 仍为 `61ec10318d431ff241508e41446bf15ef20bb4256e5a9fd61efe1820a38e6588`。没有生成安装包。QA exe SHA-256：`5f195353d9a5d17b107679b67566372f9d4cabd5d984ae3ae2b9dfa700eb14a0`。
- 分支 `feature/module-30-format-editing`；实现提交 **dd1273a**，保留 Module 29 历史，未合并 develop/main。证据另行提交并随分支推送。

停在 Module 30，等待验收，不启动 Module 31。
