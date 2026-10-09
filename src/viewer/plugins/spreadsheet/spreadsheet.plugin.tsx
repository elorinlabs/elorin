import type { ViewerPlugin } from "../../core/types";
import { loadWorkbook, type Workbook } from "./spreadsheet-model";
import { SpreadsheetViewer, SpreadsheetInspector } from "./SpreadsheetViewer";
import "../office/module10.css";
export const spreadsheetViewerPlugin: ViewerPlugin<Workbook, Workbook> = {
  id: "spreadsheet",
  name: "Spreadsheet",
  supportedTypes: ["xlsx", "xlsm", "xls", "ods", "xlsb"],
  priority: 100,
  capabilities: { search: true, inspect: true, fullscreen: true },
  load: loadWorkbook,
  render: (p) => <SpreadsheetViewer {...p} />,
  inspect: (m) => m,
  renderInspection: (m) => <SpreadsheetInspector model={m} />,
};
