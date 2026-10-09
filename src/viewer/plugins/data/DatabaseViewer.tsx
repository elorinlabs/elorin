import { useUiLanguage as useLocale } from "../../../i18n";
import type { ViewerRenderProps } from "../../core/types";
import type { DataModel } from "./data-model";
import { DataViewer } from "./DataViewer";
/** SQLite family entry point; schema/rows come from its read-only provider. */
export function DatabaseViewer(props: ViewerRenderProps<DataModel>) {
  useLocale();
  return <DataViewer {...props} />;
}
