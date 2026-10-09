import { useUiLanguage as useLocale } from "../../../i18n";
import type { SyntaxToken } from "./syntax-highlighter";
import { recognizeLog, type TextProfile } from "./text-profile";
import type { TextMatch } from "./text-engine";
const renderTokens = (tokens: SyntaxToken[]): React.ReactNode =>
  tokens.map((token, i) =>
    token.text !== undefined && !token.className ? (
      token.text
    ) : (
      <span key={i} className={token.className}>
        {token.text ?? renderTokens(token.children ?? [])}
      </span>
    ),
  );
export function TextLine({
  text,
  profile,
  match,
  tokens,
}: {
  text: string;
  profile: TextProfile;
  language?: string;
  highlighting: boolean;
  match?: TextMatch;
  tokens?: SyntaxToken[];
}) {
  useLocale();
  if (match && match.column < text.length)
    return (
      <>
        {text.slice(0, match.column)}
        <mark>
          {text.slice(match.column, match.column + Math.max(1, match.length))}
        </mark>
        {text.slice(match.column + Math.max(1, match.length))}
      </>
    );
  if (profile === "Log") {
    const log = recognizeLog(text),
      timestampEnd = log.timestamp
        ? text.indexOf(log.timestamp) + log.timestamp.length
        : 0;
    if (log.level && log.levelOffset !== undefined)
      return (
        <>
          <span className="text-timestamp">{text.slice(0, timestampEnd)}</span>
          {text.slice(timestampEnd, log.levelOffset)}
          <span className={`text-level level-${log.level.toLowerCase()}`}>
            {log.level}
          </span>
          {text.slice(log.levelOffset + log.level.length)}
        </>
      );
    if (timestampEnd)
      return (
        <>
          <span className="text-timestamp">{text.slice(0, timestampEnd)}</span>
          {text.slice(timestampEnd)}
        </>
      );
  }
  // Control characters remain literal text; ANSI escape sequences are never interpreted.
  return <>{tokens ? renderTokens(tokens) : text}</>;
}
