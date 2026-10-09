import { t as tr } from "../../../i18n";
import type { ViewerPlugin } from "../../core/types";
import { ViewerError, checkAbort } from "../../core/errors";
import { parseMarkdown, MARKDOWN_BYTE_LIMIT } from "./markdown-parser";
import type {
  MarkdownDocumentModel,
  MarkdownStatistics,
} from "./markdown-model";
import { MarkdownResourceResolver } from "./markdown-resources";
import { MarkdownViewer } from "./MarkdownViewer";
import { MarkdownInspector } from "./MarkdownInspector";
import { MarkdownOutline } from "./MarkdownOutline";
import "./markdown.css";
export interface MarkdownModel extends MarkdownDocumentModel {
  resources: MarkdownResourceResolver;
}
export const markdownViewerPlugin: ViewerPlugin<
  MarkdownModel,
  MarkdownStatistics
> = {
  id: "markdown",
  name: "Markdown",
  supportedTypes: ["markdown"],
  priority: 100,
  canHandle: (file) => file.detectedType === "markdown" && file.isText,
  capabilities: { canEdit: true, canSaveAs: true, source: true, inspect: true, outline: true },
  modes: [
    { id: "read", get label() { return tr("Read"); } },
    { id: "split", get label() { return tr("Split"); } },
    { id: "source", get label() { return tr("Source"); } },
  ],
  async load(context) {
    checkAbort(context.signal);
    const revision = await context.source.getRevision?.();
    const size = await context.source.getSize();
    if (size > MARKDOWN_BYTE_LIMIT)
      throw new ViewerError(
        "UNSUPPORTED_CONTENT",
        "Reading View supports Markdown up to 2 MiB. Open this file as Text for a bounded preview.",
      );
    const source = await context.source.readText({
      encoding: context.file.encoding ?? "utf-8",
      fatal: true,
    });
    checkAbort(context.signal);
    if (
      revision !== undefined &&
      revision !== (await context.source.getRevision?.())
    )
      throw new ViewerError(
        "UNSUPPORTED_CONTENT",
        "This file changed while reading. Select it again to load the current document.",
      );
    // Yield before synchronous parsing so pending switches can cancel it.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    checkAbort(context.signal);
    const parsed = parseMarkdown(source);
    checkAbort(context.signal);
    return { ...parsed, resources: new MarkdownResourceResolver(context) };
  },
  render: (props) => <MarkdownViewer {...props} />,
  inspect: (model) => model.statistics,
  renderInspection: (statistics) => (
    <MarkdownInspector statistics={statistics} />
  ),
  slots: (props) => ({
    leftPanel:
      props.activeCapability === "outline" ? (
        <MarkdownOutline headings={props.model.headings} mode={props.mode} />
      ) : undefined,
  }),
};
