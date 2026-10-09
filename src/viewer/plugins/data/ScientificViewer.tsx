import { useUiLanguage as useLocale } from "../../../i18n";
import type { ViewerRenderProps } from "../../core/types";
import type { DataModel } from "./data-model";
import { DataViewer } from "./DataViewer";
/** Scientific family routes dataset selection to bounded hyperslab reads. */
export function ScientificViewer(props: ViewerRenderProps<DataModel>) {
  useLocale();
  return <DataViewer {...props} />;
}
