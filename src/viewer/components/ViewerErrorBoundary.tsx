import { t as tr, useUiLanguage as useLocale } from "../../i18n";
import { Component, type ReactNode } from "react";
import { ViewerError } from "../core/errors";
export function ViewerErrorView({
  error,
  retry,
  fallback,
  hex,
}: {
  error: ViewerError;
  retry(): void;
  fallback?: () => void;
  hex?: () => void;
}) {
  useLocale();
  return (
    <div className="viewer-error" role="alert">
      <h2>{error.diagnosticCode==='OPERATION_CANCELLED'?tr("操作已取消"):tr("无法显示文件预览")}</h2>
      <p>{error.userMessage}</p>
      <div className="fallback-actions">
        <button aria-label={tr("Retry")} onClick={retry}>{tr("重试")}</button>
        {fallback && <button aria-label={tr("Open as Text")} onClick={fallback}>{tr("以纯文本查看")}</button>}
        {hex&&<button aria-label={tr("Open as Hex")} onClick={hex}>{tr("以 Hex 查看")}</button>}
      </div>
      <details>
        <summary><span>{tr("技术细节")}</span> · <span>{tr("Show details")}</span></summary>
        <p>{error.diagnosticCode} · {error.code}</p>
        <p>{tr("This file viewer encountered an error.")}</p>
        <pre>{error.message}</pre>
        {import.meta.env.DEV && (
          <pre>
            {error.stack}
            {error.detail instanceof Error ? tr("\n{v0}", { v0: error.detail.stack }) : ""}
          </pre>
        )}
      </details>
    </div>
  );
}
export class ViewerErrorBoundary extends Component<
  {
    children: ReactNode;
    retry(): void;
    fallback?: () => void;
    hex?: () => void;
    onError?(error: ViewerError): void;
  },
  { error?: ViewerError }
> {
  state: { error?: ViewerError } = {};
  static getDerivedStateFromError(error: unknown) {
    return { error: ViewerError.from(error) };
  }
  componentDidCatch() {
    this.props.onError?.(this.state.error!);
  }
  render() {
    return this.state.error ? (
      <ViewerErrorView
        error={this.state.error}
        retry={this.props.retry}
        fallback={this.props.fallback}
        hex={this.props.hex}
      />
    ) : (
      this.props.children
    );
  }
}
