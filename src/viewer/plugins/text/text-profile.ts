import type { FileDescriptor } from "../../../types/files";
import { formatIndex } from '../../../formats';
export type TextProfile = "Plain" | "Code" | "Log" | "Config";
const extensions: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescript",
  py: "python",
  pyw: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  swift: "swift",
  html: "xml",
  htm: "xml",
  css: "css",
  scss: "scss",
  less: "less",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "shell",
  ps1: "powershell",
  bat: "dos",
  cmd: "dos",
  vue: "xml",
  svelte: "xml",
  astro: "xml",
  jsonc: "jsonc",
  json5: "javascript",
  ini: "ini",
  gradle: "groovy",
  lua: "lua",
  r: "r",
  dart: "dart",
  scala: "scala",
  pl: "perl",
  perl: "perl",
  json: "json",
  jsonl: "json",
  ndjson: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  xml: "xml",
  env: "ini",
  conf: "ini",
  cfg: "ini",
  properties: "properties",
};
const filenames: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  gnumakefile: "makefile",
  "cmakelists.txt": "cmake",
  gemfile: "ruby",
  rakefile: "ruby",
  procfile: "shell",
  ".env": "ini",
  ".editorconfig": "ini",
  ".npmrc": "ini",
  ".gitignore": "plaintext",
  ".gitattributes": "plaintext",
  ".nginx.conf": "nginx",
};
export function recognizeLog(text: string) {
  const timestamp =
    /^(?:\[)?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/.exec(
      text,
    )?.[1];
  const match = /\b(TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|CRITICAL)\b/.exec(
    text.slice(0, 256),
  );
  return { timestamp, level: match?.[1], levelOffset: match?.index };
}
export function detectTextProfile(
  file: FileDescriptor,
  sample: string,
): { profile: TextProfile; language?: string } {
  const name = file.name.toLowerCase(),
    ext =
      file.extension?.toLowerCase() ?? name.slice(name.lastIndexOf(".") + 1),
    hint = file.languageHint?.toLowerCase();
  let language: string | undefined =
    (file.format && formatIndex.get(file.format.formatId)?.capabilities.sourceLanguage) ||
    (hint &&
      (extensions[hint] ??
        (Object.values(extensions).includes(hint) ? hint : filenames[hint]))) ||
    filenames[name] ||
    extensions[ext];
  if (
    !language &&
    [
      "javascript",
      "typescript",
      "python",
      "rust",
      "go",
      "java",
      "c",
      "cpp",
      "css",
      "html",
      "jsx",
      "tsx",
    ].includes(file.detectedType)
  )
    language = extensions[file.detectedType] ?? file.detectedType;
  if (!language) {
    const shebang = /^#![^\r\n]*/.exec(sample)?.[0] ?? "";
    language = /\bpython\d?\b/.test(shebang)
      ? "python"
      : /\b(?:ba|z|fi)?sh\b/.test(shebang)
        ? "bash"
        : /\bnode\b/.test(shebang)
          ? "javascript"
          : /\bperl\b/.test(shebang)
            ? "perl"
            : /\bruby\b/.test(shebang)
              ? "ruby"
              : undefined;
  }
  if (["log", "out", "trace"].includes(ext)) return { profile: "Log" };
  if (
    ["env", "conf", "cfg", "properties", "yaml", "yml", "toml", "xml"].includes(
      ext,
    ) ||
    name.startsWith(".env") ||
    [".editorconfig", ".gitignore", ".gitattributes", ".npmrc"].includes(name)
  )
    return { profile: "Config", language: language ?? "ini" };
  if (language) return { profile: "Code", language };
  const lines = sample.match(/[^\r\n]+/g)?.slice(0, 30) ?? [];
  const logs = lines.filter((line) => {
    const log = recognizeLog(line);
    return log.timestamp && log.level;
  }).length;
  if (logs >= 2 && logs / lines.length >= 0.6) return { profile: "Log" };
  return { profile: "Plain" };
}
