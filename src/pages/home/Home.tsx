import { t as tr, uiLanguage, useUiLanguage as useLocale } from "../../i18n";
import { useEffect, useState } from 'react';
import { Folder, ArrowRight, PlusSquare, Clock3, Star, FileText, Image, Play, Table2, Code2 } from 'lucide-react';
import { libraryRoutes, type RouteId } from '../../app/routes';
import { Button } from '../../components/common/ui';
import { formatIconClass } from '../../formats/presentation';
import { recentFilesService, type RecentFile, type RecentFilesService } from '../../services/recentFiles';
import { favoritesService } from '../../services/favorites';
import { useUiSettings } from '../../platform/ui-settings';
export function Home({ openFile, openFolder, newFile, navigate, recentService = recentFilesService, onNotice, openRecent }: {
  openFile: () => void; openFolder: () => void; newFile?: () => void; navigate: (id: RouteId) => void;
  recentService?: RecentFilesService; onNotice: (message: string) => void; openRecent?: (path: string) => void;
}) {
  useLocale();
  const settings=useUiSettings();
  const [favorites, setFavorites] = useState<RecentFile[]>([]);
  const [files, setFiles] = useState<RecentFile[]>([]), [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => void Promise.all([recentService.list(), favoritesService.list()]).then(([v, saved]) => { if(live) {setFiles(v);setFavorites(saved);setError('');} }, () => { if(live) setError(tr("Recent files could not be loaded.")); });
    load(); window.addEventListener('elorin-recent-change', load); window.addEventListener('elorin-favorites-change', load);
    return () => { live = false; window.removeEventListener('elorin-recent-change', load); window.removeEventListener('elorin-favorites-change', load); };
  }, [recentService]);
  return <div className="home reference-home">
    <header className="home-welcome">
      <div><p className="eyebrow">{tr("WELCOME TO ELORIN")}</p><h1>{tr("A unified file viewer")}<br/>{tr("for a simpler, more focused workflow.")}</h1><p>{tr("Open, view, and explore all your files in one place —")} {tr("fast, beautiful, and distraction free.")}</p></div>
      <div className="home-file-art" aria-hidden="true"><div className="art-page"><FileText size={96}/></div><span className="art-format pdf"><FileText/></span><span className="art-format image"><Image/></span><span className="art-format video"><Play/></span><span className="art-format sheet"><Table2/></span><span className="art-format code"><Code2/></span></div>
    </header>
    <section className="home-drop-zone" aria-label={tr("Drag and drop files here")}>
      <Folder size={66} strokeWidth={1.5}/><h2>{tr("Drag and drop files here")}</h2><p>{tr("to open and view them in Elorin")}</p>
      <div className="home-drop-actions"><Button variant="primary" onClick={openFile}><Folder size={20}/>{tr("Open File")}</Button><Button onClick={newFile}><PlusSquare size={20}/>{tr("New File")}</Button></div>
      {settings.showTips&&<small>{tr("Documents, images, media, code, spreadsheets, archives and more. Format capabilities vary.")}</small>}
    </section>
    <div className="home-bottom-grid">
      <section className="home-card"><header><h2>{tr("Recent Files")}</h2><button className="text-button" onClick={() => navigate('recents')}>{tr("View All")}{' '}<ArrowRight size={15}/></button></header>
        {error ? <p role="alert">{tr(error)}</p> : !files.length ? <p className="home-empty">{tr("Your recently opened files will appear here.")}</p> : files.slice(0,6).map(file => <button className="home-recent-row" key={file.id} title={file.path} onClick={() => openRecent ? openRecent(file.path) : onNotice(tr('Open recent files in the desktop app.'))}><span className={formatIconClass(file.name,file.extension)} aria-hidden="true"/><span>{file.name}</span><time dateTime={new Date(file.lastOpened).toISOString()}>{relativeTime(file.lastOpened)}</time></button>)}
        <header><h2>{tr('Favorites')}</h2><button className="text-button" onClick={()=>navigate('favorites')}>{tr('View All')} <ArrowRight size={15}/></button></header>
        {!favorites.length ? <p className="home-empty">{tr('Your saved file shortcuts.')}</p> : favorites.slice(0,3).map(file=><button className="home-recent-row" key={file.path} title={file.path} onClick={()=>openRecent?.(file.path)}><Star size={16}/><span>{file.name}</span></button>)}
        {recentService.clear && <button className="text-button home-clear" onClick={() => void recentService.clear!().then(() => setFiles([])).catch(e => onNotice(String(e)))}>{tr("Clear Recent Files")}</button>}
      </section>
      <section className="home-card"><header><h2>{tr("Quick Shortcuts")}</h2></header>{[
        {get label() { return tr("Open File"); },get description() { return tr("Browse and open a file"); },Icon:Folder,action:openFile},
        {get label() { return tr("New File"); },get description() { return tr("Create a text, Markdown, JSON or CSV file"); },Icon:PlusSquare,action:newFile},
        {get label() { return tr("Recent Files"); },get description() { return tr("Pick up where you left off"); },Icon:Clock3,action:()=>navigate('recents')},
        {get label() { return tr("Favorites"); },get description() { return tr("Quick access to important files"); },Icon:Star,action:()=>navigate('favorites')},
      ].map(({label,description,Icon,action})=><button className="home-shortcut" key={label} onClick={action}><Icon size={27}/><span><strong>{label}</strong><small>{description}</small></span><ArrowRight size={16}/></button>)}<button className="text-button home-folder" onClick={openFolder}>{tr("Open Folder")}</button></section>
      <section className="home-card"><header><h2>{tr("Supported File Types")}</h2></header>{libraryRoutes.map(({id,label,icon:Icon,formats})=><button className={`home-format-row category-${id}`} key={id} onClick={()=>navigate(id)}><Icon size={22}/><span>{label}</span><small>{tr(formats)}</small></button>)}</section>
    </div>
  </div>;
}
export function relativeTime(time:number){const hours=Math.floor(Math.max(0,Date.now()-time)/3600000);if(hours===0)return tr('Just now');return new Intl.RelativeTimeFormat(uiLanguage(),{numeric:'always'}).format(hours<24?-hours:-Math.floor(hours/24),hours<24?'hour':'day');}
