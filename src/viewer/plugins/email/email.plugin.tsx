import type { ViewerPlugin } from "../../core/types";
import { loadEmail, type EmailModel } from "./email-model";
import { EmailViewer, EmailInspector } from "./EmailViewer";
import "../module11.css";
export const emailViewerPlugin: ViewerPlugin<EmailModel, EmailModel> = {
  id: "email",
  name: "Email",
  supportedTypes: ["eml", "msg"],
  capabilities: { search: true, inspect: true },
  load: loadEmail,
  render: (p) => <EmailViewer {...p} />,
  inspect: (m) => m,
  renderInspection: (m) => <EmailInspector model={m} />,
};
