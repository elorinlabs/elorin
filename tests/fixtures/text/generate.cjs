const fs = require("node:fs");
const path = require("node:path");
const root = __dirname;
const fixtures = {
  "basic.txt":
    "Prism text engine\n\nA small document with readable lines.\nSelect and copy this text.\n",
  "unicode.txt": "中文 · 日本語 · 한국어\n🌈 🪩 café e\u0301\nمرحبا بالعالم\n",
  "utf8-bom.txt": "\ufeffUTF-8 BOM\n中文\n",
  "mixed-line-endings.txt": "CRLF\r\nLF\nCR\rLast line",
  "empty.txt": "",
  "regex-adversarial.txt": "a".repeat(30000) + "!\n",
  "unsafe.txt":
    "<script>alert(1)</script>\njavascript:alert(1)\n<img src=x onerror=alert(1)>\n",
  "ansi.log":
    "2026-10-08 04:21:31 \u001b[31mERROR\u001b[0m " +
    "Inert ANSI log content. ".repeat(30) +
    "\n",
  "unknown.custom": "Custom text format\nSafe fallback preview\n",
  "long-line.txt": "x".repeat(5 * 1024 * 1024) + "\nAfter the very long line\n",
  "example.ts":
    '// Prism example\ninterface Document { name: string; size: number }\nconst prism: Document = { name: "Prism", size: 7 };\nconsole.log(prism);\n',
  "example.py":
    '#!/usr/bin/env python3\n# Prism example\ndef greet(name):\n    return f"Hello {name}"\nprint(greet("世界"))\n',
  "example.rs": 'fn main() {\n    println!("Prism");\n}\n',
  "example.go":
    'package main\nimport "fmt"\nfunc main() { fmt.Println("Prism") }\n',
  "example.cpp": '#include <iostream>\nint main() { std::cout << "Prism"; }\n',
  Dockerfile:
    'FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD ["npm", "start"]\n',
  Makefile: "build:\n\tpnpm build\n\ntest:\n\tpnpm test\n",
  "no-extension-script": '#!/usr/bin/env python3\nprint("Prism")\n',
  ".env": '# Prism configuration\nPORT=8080\nNAME="Prism"\n',
  "basic.log":
    "2026-10-08 04:21:31 INFO Server starting\n2026-10-08 04:21:32 INFO Listening on port 8080\n2026-10-08 04:21:38 WARN Slow response detected\n2026-10-08 04:21:42 ERROR Database connection failed\n",
  "mixed-levels.log":
    ["TRACE", "DEBUG", "INFO", "WARN", "WARNING", "ERROR", "FATAL", "CRITICAL"]
      .map((level, i) => `2026-10-08T04:21:0${i}Z ${level} Record ${i}`)
      .join("\n") + "\n",
  "timestamp.log":
    "2026-10-08T04:21:31.001Z INFO Start\n2026-10-08 04:21:32 WARN Retry\n",
};
fs.mkdirSync(root, { recursive: true });
for (const [name, text] of Object.entries(fixtures))
  fs.writeFileSync(path.join(root, name), text);
for (const mb of process.argv.slice(2).map(Number)) {
  if (!Number.isFinite(mb) || mb <= 0 || mb > 2048)
    throw Error("Specify sizes in MiB (1–2048)");
  const target = Math.floor(mb * 1024 * 1024),
    file = fs.openSync(path.join(root, `generated-${mb}.log`), "w");
  const batch = Buffer.from(
    Array.from(
      { length: 8192 },
      (_, i) =>
        `2026-10-08T04:21:31Z ${i % 100 === 0 ? "ERROR" : "INFO"} Record ${i} Prism background indexing and streamed search\n`,
    ).join(""),
  );
  let written = 0;
  while (written < target) {
    const length = Math.min(batch.length, target - written);
    fs.writeSync(file, batch, 0, length);
    written += length;
  }
  fs.closeSync(file);
  console.log(`Generated ${mb} MiB log`);
}
console.log("Text/code/log fixtures ready.");
const codeFile = fs.openSync(path.join(root, "generated-10.ts"), "w"),
  codeTarget = 10 * 1024 * 1024;
const codeBatch = Buffer.from(
  'const prism: string = "Prism text engine"; // safe read-only source\n'.repeat(
    4096,
  ),
);
for (let written = 0; written < codeTarget;) {
  const length = Math.min(codeBatch.length, codeTarget - written);
  fs.writeSync(codeFile, codeBatch, 0, length);
  written += length;
}
fs.closeSync(codeFile);
