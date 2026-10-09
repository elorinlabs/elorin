# 编辑能力分类

唯一机器清单仍是 [format-capability-matrix.json](format-capability-matrix.json)，从 catalogue、实际注册 Viewer、DocumentSurface 门禁、DocumentSession 数据模型、save-service 和 Rust 原子写入路径派生。Module 30 对全部 155 条生产路由执行了注册/加载与编辑门禁核查；这不是 155 种真实内容样本验证，缺少阅读证据的记录仍为 NOT_VERIFIED。

当前实现：完整编辑 0，受限编辑 22，只读 133。受限意味着有真实源码/单元格编辑和写入接线，不承诺所有编码或格式变体；22 条中 7 条记录（9 个样本/扩展名）有本次原生编辑往返，其余 15 条记录的本次原生往返仍为 NOT_VERIFIED，见每行 editEvidence。

| 复用组 | 当前记录 | 解析/编辑模型 | 共同写入器及限制 |
| --- | --- | --- | --- |
| utf8-source | 16 | 既有 UTF-8 解码与源码 textarea；不是结构/schema 编辑 | document.atomic-utf8；≤2 MiB，BOM/单一换行保留，混合换行需确认 |
| markdown-source | 1 | Markdown 原解析器和源码编辑/预览 | 同上；保留原始 Markdown |
| validated-json-source | 3 | json、package-manifest、notebook-json；严格 JSON 源码模型，JSONL/NDJSON 按记录解析 | 同上；不经过 JSON.stringify、数字转换或 Notebook kernel |
| tabular-text | 2 | CSV/TSV 原始字符串单元格及既有 CsvEditor | 同上；保留空行、前导零、多行字段和不规则行；允许规范化引号 |
| requires-writer | 133 | 无已接入可靠编辑/写入器 | 禁用原格式写入；Hex/外部打开不算编辑 |

XML/YAML/TOML 保留此前源码编辑能力，但没有在本模块补充结构解析器或语义编辑能力。语法高亮不作为结构解析证据。其他源码别名仍按目录当前门禁保持只读，后续可复用源码编辑器，但需各自接入与验证。

后续工程分组可沿用现有 Viewer：Office/电子书需包内容和未知节点保留的专门写入器；CAD/3D 需格式专属几何/工程写入器；音视频/图片需可靠编码器及元数据保留；Archive/VFS 需安全容器重建；数据库/科学数据需事务或数据集写入。此处仅登记依赖，不开启后续模块。

保存安全由现有系统文件选择授权、源身份/指纹冲突检查、原子替换及无覆盖创建负责。浏览器只导出副本，虚拟源只另存。只读 Session 禁止原路径写入；失败及冲突保留本地修改。
