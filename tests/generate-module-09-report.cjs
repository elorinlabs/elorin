const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  zlib = require("node:zlib");
const root = process.cwd(),
  absolute = (name) => path.resolve(name).replaceAll("\\", "/");
const browser = JSON.parse(
    fs.readFileSync("docs/qa/module-09-browser-results.json", "utf8"),
  ),
  tauri = JSON.parse(
    fs.readFileSync("docs/qa/module-09-tauri-results.json", "utf8"),
  );
for (const result of [browser, tauri])
  if (
    result.failure ||
    result.errors.length ||
    result.externalRequests.length ||
    result.fixtures.length !== 25
  )
    throw Error("The final UI results must pass before reporting.");
function walk(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(directory, entry.name))
        : [path.join(directory, entry.name)],
    );
}
const modified = [
  ".gitignore",
  "package.json",
  "pnpm-lock.yaml",
  "vite.config.ts",
  "src/types/files.ts",
  "src/services/detection/rules.ts",
  "src/services/detection/browserDetector.ts",
  "src/services/fileSource.ts",
  "src/viewer/builtins.ts",
  "src-tauri/src/detection/descriptor.rs",
  "src-tauri/src/detection/extension.rs",
  "src-tauri/src/detection/magic.rs",
  "src-tauri/src/detection/mod.rs",
  "src-tauri/src/detection/ooxml.rs",
  "src-tauri/src/file_io/mod.rs",
  "src-tauri/tauri.conf.json",
];
const added = [
  ...walk("src/viewer/plugins/pdf"),
  ...walk("src/viewer/plugins/office"),
  "tests/pdf-engine.test.ts",
  "tests/office-document.test.ts",
  "tests/module-09-browser-qa.cjs",
  "tests/generate-module-09.py",
  "tests/generate-module-09-report.cjs",
  "src-tauri/tests/document_ranges.rs",
  "tests/fixtures/documents/README.md",
  "docs/architecture/document-viewer.md",
  "docs/architecture/module-09-assets.json",
  "docs/qa/module-09-checklist.md",
  ...walk("docs/qa").filter(
    (name) =>
      /module-09-.*(?:\.png|results\.json)$/.test(name) &&
      !name.includes("failure"),
  ),
];
const assets = walk("public/pdf-assets").map((name) => {
  const bytes = fs.readFileSync(name);
  return {
    path: absolute(name),
    relative: path.relative(root, name).replaceAll("\\", "/"),
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
});
const fixtures = walk("tests/fixtures/documents")
  .filter((name) => !name.endsWith("README.md"))
  .map((name) => ({
    path: absolute(name),
    bytes: fs.statSync(name).size,
    generatedLocalOnly: path.basename(name).startsWith("generated-"),
  }));
const chunks = fs
  .readdirSync("dist/assets")
  .filter((name) =>
    /^(pdf-core-|pdf\.plugin-|office\.plugin-|pdf\.worker|package\.worker)/.test(
      name,
    ),
  )
  .map((name) => {
    const buffer = fs.readFileSync("dist/assets/" + name);
    return { name, bytes: buffer.length, gzip: zlib.gzipSync(buffer).length };
  });
fs.writeFileSync(
  "docs/architecture/module-09-assets.json",
  JSON.stringify(
    {
      modified: modified.map(absolute),
      added: added.map(absolute),
      assets,
      fixtures,
      bundle: chunks,
    },
    null,
    2,
  ),
);
const link = (name) => `[${path.basename(name)}](${absolute(name)})`,
  fileList = (items) => items.map((name) => `- ${link(name)}`).join("\n");
const summaryNames = [
  "basic.pdf",
  "long.pdf",
  "generated-1001.pdf",
  "generated-500mb.pdf",
  "generated-content-500mb.pdf",
  "basic.docx",
  "generated-long.docx",
  "generated-many.docx",
];
const performance = summaryNames
  .map((name) => {
    const b = browser.fixtures.find((row) => row.name === name),
      t = tauri.fixtures.find((row) => row.name === name);
    return `| ${name} | ${b.firstContentMs} | ${t.firstContentMs} | ${b.rangeBytes.toLocaleString("en-US")} | ${b.pages} |`;
  })
  .join("\n");
const rows = browser.fixtures
  .map((b) => {
    const t = tauri.fixtures.find((row) => row.name === b.name);
    return `| ${b.name} | 通过 · ${b.firstContentMs} ms | 通过 · ${t.firstContentMs} ms |`;
  })
  .join("\n");
fs.writeFileSync(
  "docs/qa/module-09-checklist.md",
  `# Prism Module 09 — 交付与验收记录

## A. New / Modified Files

新增查看器、测试与记录：

${fileList(added)}

修改文件：

${fileList(modified)}

此外新增 199 个本地 PDF 资源和 26 个测试素材。逐项绝对路径、字节数与 PDF 资源 SHA-256 见 ${link("docs/architecture/module-09-assets.json")}。\`generated-*\` 大文件仅保留在本地，已加入忽略规则，可由 ${link("tests/generate-module-09.py")} 重建。未创建 Git 提交或 PR；当前工作目录不是 Git 仓库。

## B. Dependencies

| 依赖 | 版本 | 许可 | 用途 |
| --- | --- | --- | --- |
| pdfjs-dist | 6.4.299 | Apache-2.0 | PDF 解析、绘制、文字、目录、密码、权限和元数据 |
| fflate | 0.8.3 | MIT | 流式解压；测试包生成 |

本地 CMaps、标准字体和 WASM 共 ${assets.reduce((sum, item) => sum + item.bytes, 0).toLocaleString("en-US")} 字节，包含许可。没有依赖浏览器 PDF iframe、远程转换、远程字体或 OCR 服务。Office 图片复用 Module 08 的头部检测／SVG 清理，链接复用已有分类器和文件服务。

构建时按需加载，主页不会直接导入 PDF 核心或 Office 插件。最终构建的相关文件：

| 文件 | 原始字节 | gzip 字节 |
| --- | --- | --- |
${chunks.map((item) => `| ${item.name} | ${item.bytes.toLocaleString("en-US")} | ${item.gzip.toLocaleString("en-US")} |`).join("\n")}

## C. Browser / Tauri Compatibility

浏览器与 WebView2 都经过真实界面自动化检查，各 25 个文件。Browser FileSource 采用切片读取；PDF 不调用整文件读取。Tauri 模式的原生授权、类型检测和分段读取由 Rust 测试验证。

边界：WebView2 自动化通过浏览器 File 输入选择测试文件，**没有把原生系统选文件对话框或实际 Open With／系统浏览器启动报告为已通过**。系统动作沿用已有授权接口，仍需人工确认完整 OS 流程。

## D. PDF Architecture

\`FileSource → Range Transport → PdfEngine → PDF.js worker → 可见页／Canvas／TextLayer／只读批注 → 目录／渐进搜索／Inspect\`。

支持连续／单页、页码跳转、缩放／适配、视图旋转、文字选择、目录、内部链接、只读批注／表单外观、密码和复制权限限制。缩略图独立虚拟化，缓存最多 8 个位图。文字流读取有字符／条目预算，缓存最多 24 页。搜索可取消、渐进更新，支持大小写／整词，当前命中只高亮对应文字；中文／日文相邻文字保持连续。

## E. Office Architecture

\`FileSource → 有预算的 ZIP worker → 安全 XML → Blocks／Runs／Tables／Images 模型 → 只读流式阅读 → 目录／逐命中搜索／Inspect\`。

DOCX／ODT 基础内容保持可选中、可复制。Office 不把原始 HTML 注入页面。标题依照真正的标题／层级定义生成。DOCX 插入修订显示、删除修订略去并提示；脚注／尾注追加、批注计数。RTF 提供基础格式和简单表格；旧 DOC 明确降级。

## F. Performance

以下为本机这一次真实 UI 运行；不是稳定基准或所有文件的性能承诺。最后一轮与前端测试并行，包含冷加载、开发模式与机器负载影响。PDF 的 firstContentMs 等待可见页完成绘制；部分 Office 时长也包含该文件的搜索／图片检查，不能当成纯解析耗时。

| 文件 | Browser 首次内容 ms | WebView2 首次内容 ms | Browser 累计切片读取字节 | 验证后挂载正文页 |
| --- | --- | --- | --- | --- |
${performance}

\`generated-500mb.pdf\` 是 1001 页的有效大范围测试文件，含未引用的大流，用来检测是否误读整个文件。\`generated-content-500mb.pdf\` 则为 **238 页、525,929,126 字节**，每页都有实际被引用的 JPEG 流；已验证首屏与末页。两种测试分别报告，避免把填充文件当作重图片负载。

长 DOCX 含 3000 个段落和 100 个章节；搜索能到最后一段。另一文件含 40 张不同图片和 40 个表格。PDF 正文只挂载附近页；缩略图和文字 LRU 有上限。PDF.js 内部仍会保留请求过的编码范围，不能承诺阅读所有大型图片页后总堆内存恒定。Office 先显示 100 个区块并在阅读边界追加，搜索可展开后续区块；XML 当前在主线程进行预算内解析。

## G. Security

| 项目 | 处理 |
| --- | --- |
| PDF JavaScript | 不实例化脚本／沙箱执行服务，没有文档脚本执行入口 |
| PDF Launch | 没有执行器；仅显式安全 URL 或内部目的地可操作 |
| PDF XFA / forms | XFA 关闭；表单仅静态外观 |
| PDF attachments | 仅列出元数据，不提取／执行内容 |
| DOCX external relationships | 不自动请求；图片／字体不连接外部资源 |
| XXE | DTD／ENTITY 拒绝，XML 有大小、深度与节点预算 |
| ZIP bomb | 入口大小／数目／比率／总量检查，实际输出预算与 CRC 校验 |
| Unsafe HTML / styles | React 只读模型；字体／样式值限制；SVG 复用清理器 |
| Remote resources | 测试期间没有外部文档请求；HTTP(S) 导航必须用户点击 |
| Permissions | 加密复制限制关闭文字提取与查找；不提供打印绕过功能 |

Tauri CSP 允许本地字体、worker 和 WASM，未开放任意 JavaScript eval 或外部文档网络读取。

## H. Resource Lifecycle

PDF 关闭／加载失败销毁 loading task 和 worker；页面或缩放变化取消绘制与文字层、清空 canvas、清理页资源。LRU 淘汰／关闭调用 ImageBitmap.close。搜索使用 generation 取消，流文字预算超限会取消 reader，旧搜索不会提交。

Office worker 完成／失败后终止。图片 URL 立即登记清理，按包内资源复用，关闭时撤销；后续 XML 失败也立即释放已经分配的 URL。释放包装是幂等的。文件读取继续沿用 FileAccess 授权句柄边界，不新建绕过授权的文件命令。

## I. Tests

- 前端：**384 项、22 个测试文件全部通过**。新增 PDF 引擎 7 项、Office 30 项，覆盖文字流预算、密码、取消、缓存、类型检测、ZIP／XML、RTF、修订、图片和失败后释放。
- Rust：**31 项全部通过**。新增原生文档类型／授权范围、大 PDF 范围与截断包警告检查。
- TypeScript／Vite：最终构建通过；PDF 核心、插件和 worker 独立，未出现超大单一 UI chunk 的构建提示。
- Browser 与 WebView2：各 **25 文件全部通过**；真实结果见 ${link("docs/qa/module-09-browser-results.json")}、${link("docs/qa/module-09-tauri-results.json")}。
- 本轮零未处理页面错误、零意外弹窗、零外部文档请求。退出文档后 Browser 仪表检测的 worker、位图、图片 URL 全部归零。

## J. UI / Manual Verification

这是自动化真实界面验证与截图检查，**不冒充人工 OS 流程验收**。

| 文件 | Browser | WebView2 |
| --- | --- | --- |
${rows}

验证了搜索／目录跳转、单页模式、缩放后阅读页、真实文字选择、虚拟缩略图、扫描页提示、错误／正确密码、复制限制、1001 页会话恢复、DOCX 搜索到末段和大量图表资源。已查看基础 PDF、中文／日文 PDF、DOCX 的截图，并修正深色工具栏对比。截图保存在同目录。

仍须人工确认：原生系统选文件对话框、实际系统浏览器／Open With、不同机器 DPI 与辅助技术、安装后的文件关联。打印、OCR、编辑、宏、附件提取未实现。复杂 Office 分页／浮动排版／垂直合并／ODT 重复与合并表格、高级 RTF 字段和图片不保证与 Office 原稿一致，使用基础阅读或明确预览提示。20,000 页极端缩放未测试；浏览器物理滚动高度有上限。

详细预算、模块边界和实现说明见 ${link("docs/architecture/document-viewer.md")}。\`password.pdf\` 是合成测试素材，测试密码为 \`prism-secret\`。
`,
);
console.log("Wrote Module 09 delivery report and complete resource inventory.");
