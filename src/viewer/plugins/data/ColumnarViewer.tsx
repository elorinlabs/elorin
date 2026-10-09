import { useUiLanguage as useLocale } from "../../../i18n";
import type { ViewerRenderProps } from "../../core/types";
import type { DataModel } from "./data-model";
import { DataViewer } from "./DataViewer";
/** Columnar family keeps record batches and row-group metadata in its provider. */
export function ColumnarViewer(props: ViewerRenderProps<DataModel>) {
  useLocale();
  return <DataViewer {...props} />;
}
