import { initializeLocalization } from './i18n';
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { applyTokens } from "./design-system/tokens";
import "./styles.css";
import "./foundation.css";
import "./design-system/system.css";
import "./workspace/reference.css";
applyTokens();
const root=createRoot(document.getElementById("root")!);
// The showcase and all fixture UI are removed from production by Vite's DEV branch.
void initializeLocalization().finally(() => {
if(import.meta.env.DEV&&location.pathname==='/__qa/design-system'){
 void import('./design-system/Showcase').then(({Showcase})=>root.render(<React.StrictMode><Showcase/></React.StrictMode>));
}else if(new URLSearchParams(location.search).get('window')==='focus'){
 void import('./pages/focus/FocusWindow').then(({FocusWindow})=>root.render(<React.StrictMode><FocusWindow/></React.StrictMode>));
}else root.render(<React.StrictMode><App/></React.StrictMode>);
});
