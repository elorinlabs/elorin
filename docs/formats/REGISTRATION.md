# 格式接入与状态

唯一目录仍是 `src/formats/catalogue.json`；`runtime.json` 是生成的紧凑副本。ViewerRegistry 仍负责 Viewer 的按需加载和生命周期，FileSource 仍负责授权和读取。

Module 28 独立适配器的调用链：文件检测 → FormatIndex 的主 projection → 现有 Viewer → 现有 Worker 的 `parseFormat` → 按需加载 ContentAdapter → 原有内容模型 → Viewer。`content-adapters.json` 记录这三个实际绑定；声明不等于解析成功。读取/解析错误直接进入既有诊断，Worker 终止和页读取预算仍由原路径负责。

- `adapter-implemented`：存在独立 ContentAdapter 和真实 Worker 接线，不代表所有版本已支持。
- `viewer-owned-unverified`：沿用 Viewer 内部的既有解析路径；`viewer/<id>` 指向该注册的 Viewer，不是新增解析器。逐格式支持须看样本证据，不能按注册数量统计真实支持。
- `unimplemented`：仅检测，主视图返回明确未支持状态。
- `raw-only`：仅提供原始字节检查，不算内容阅读。用户仍可主动选择 Hex；可读文本仍可主动选择源文本。

重复扩展名保留所有候选，必须声明共同 ambiguityGroup。签名/内容探测优先，无法确定则保持 Ambiguous；候选排序不依赖注册顺序。`.m`、`.pl` 使用有界内容线索，用户仍可选择解释方式。

`format-capability-matrix.json` 派生每格式的 `formatId/parserId/viewerId/detectionStatus/parsingStatus/renderingStatus/sampleStatus`。无样本为 NOT_VERIFIED；历史证据保留原运行，不表示本次全部复测。Hex、外部打开及检测成功均不能登记为主要内容验证。

重复执行：

```sh
pnpm formats:generate
pnpm formats:audit
pnpm formats:check
pnpm exec vitest run tests/module-29.test.ts
```

新增独立适配器时在原目录、绑定文件、类型化 lazy loader 和现有 Worker 中接入，提供合法样本、哈希、断言和运行记录。检查器验证 ID/冲突策略、Viewer 存在、解析器导出合同、lazy import、Worker dispatch、模型/projection、runtime 同步及样本证据；TypeScript 和内容测试继续负责真实函数合同及输出。
