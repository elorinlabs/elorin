const fs=require('fs');
const native=fs.readFileSync('src-tauri/src/detection/extension.rs','utf8').split('pub fn basename_hint')[0];
const associations=JSON.parse(fs.readFileSync('src/formats/association-policy.json','utf8'));
const grouped=new Map();
for(const match of native.matchAll(/^\s*((?:"[^"]+"\s*\|?\s*)+)=>\s*(\w+)/gm)){
 const extensions=[...match[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);
 const type=({Text:'text',Sevenzip:'sevenzip',Rhino3dm:'3dm',Threeds:'3ds'})[match[2]]??match[2].toLowerCase();
 grouped.set(type,[...(grouped.get(type)??[]),...extensions]);
}
const groups={mesh:['stl','obj','ply','gltf','glb'],cad:['step','stp','iges','igs','jt','skp','3dm','sldprt','sldasm','catpart','catproduct'],scene:['fbx','dae','usd','usda','usdc','usdz','3ds','c4d','blend','max'],'cad-drawing':['dxf','dwg'],archive:['zip','tar','gz','tgz','sevenzip','rar','bz2','xz','zst'],audio:['mp3','wav','flac','aac','m4a','ogg','opus','wma','aiff'],video:['mp4','webm','mov','mkv','avi','mpeg','m4v'],ebook:['epub'],email:['eml','msg'],spreadsheet:['xlsx','xlsm','xls','xlsb','ods'],presentation:['pptx','pptm','ppsx','potx','ppt','odp'],pdf:['pdf'],'office-document':['docx','odt','rtf','doc'],markdown:['markdown'],json:['json'],csv:['csv','tsv'],image:['png','jpeg','gif','webp','svg','avif','bmp','ico','tiff','heic','heif'],columnar:['parquet','arrow','feather'],scientific:['hdf5','netcdf','mat'],database:['sqlite']};
const projections={mesh:'GeometryDocument',cad:'GeometryDocument',scene:'GeometryDocument','cad-drawing':'GeometryDocument',archive:'ContainerDocument',audio:'TimelineDocument',video:'TimelineDocument',ebook:'DocumentPages',email:'StructuredDocument',spreadsheet:'TabularDataProvider',presentation:'DocumentPages',pdf:'DocumentPages','office-document':'DocumentPages',markdown:'TextDocument',json:'StructuredDocument',csv:'TabularDataProvider',image:'ImageDocument',columnar:'TabularDataProvider',scientific:'ScientificDataset',database:'TabularDataProvider','core.text-fallback':'TextDocument','core.binary-fallback':'BinaryDocument'};
const detectedOnly=new Set(['jt','skp','3dm','sldprt','sldasm','catpart','catproduct','fbx','dae','3ds','usd','usda','usdc','usdz','c4d','blend','max','dwg']);
const textual=new Set(['text','markdown','json','yaml','xml','toml','javascript','typescript','jsx','tsx','python','c','cpp','java','go','rust','html','css','csv','tsv','svg']);
const records=[...grouped].map(([id,extensions])=>{
 const text=textual.has(id),implemented=!detectedOnly.has(id);
 const viewer=Object.keys(groups).find(key=>groups[key].includes(id))??'core.text-fallback';
 const assoc=associations.find(a=>extensions.includes(a.extension));
 const editable=['text','markdown','json','csv','tsv'].includes(id)||viewer==='core.text-fallback';
 const views=[{id:'primary',viewerId:viewer,projection:projections[viewer],label:implemented?'Primary view':'Format information'}];
 if(text&&viewer!=='core.text-fallback')views.push({id:'source',viewerId:'core.text-fallback',projection:'TextDocument',label:'Source text'});
 return {formatId:id,name:id.toUpperCase(),aliases:[],extensions,filenames:[],legacyType:id,detectionStatus:'implemented',previewLevel:!implemented?'detection-only':viewer==='core.text-fallback'?'basic-text':['json','csv','markdown'].includes(viewer)?'basic-structure':'partial',supportedViews:views,canInspect:true,canSearch:text||['pdf','spreadsheet','ebook','email','columnar','scientific','database','archive'].includes(viewer),canEdit:editable,canSave:editable,supportsVirtualSource:true,supportsRandomAccess:true,dependencies:viewer.startsWith('core.')?['existing text/binary viewer']:[`existing ${viewer} backend`],limitations:!implemented?['Recognized only; no specialized parser is implemented.']:['Existing viewer limits apply; recognition does not validate the entire document.'],resourceDependencies:['obj','gltf'].includes(id)?['local sibling resources']:[],isolation:['pdf','json','csv'].includes(viewer)?'worker':'in-process',association:{allowed:!!assoc,recommended:!!assoc?.recommendedDefault,category:assoc?.category??'Code'}};
});
function add(id,name,extensions,filenames,type,level='basic-text',viewer='core.text-fallback',limitations=[]){const base=records.find(r=>r.formatId===type)??records.find(r=>r.formatId==='text');records.push({...base,formatId:id,name,extensions,filenames,legacyType:type,previewLevel:level,canEdit:false,canSave:false,association:{allowed:false,recommended:false,category:'Code'},supportedViews:[{id:'primary',viewerId:viewer,projection:projections[viewer],label:level==='detection-only'?'Format information':'Source view'}],limitations:['No code, build script, or embedded command is executed.',...limitations]});}
projections.subtitle='TimelineDocument';
for(const id of ['srt','vtt','ass','ssa','sub']){
 add(id,id.toUpperCase(),[id],[],'text','partial','subtitle',['Plain subtitle text/timing preview; no ASS effects. MicroDVD requires declared FPS; VobSub is unsupported.']);
 const record=records.at(-1);record.canSearch=true;record.supportedViews.push({id:'source',viewerId:'core.text-fallback',projection:'TextDocument',label:'Source text'});
}
add('npy','NumPy array',['npy'],[],'unknown','partial','scientific',['Numeric/scalar/array preview only; object/pickle and structured dtype are disabled.']);
records.at(-1).supportedViews[0].projection='ScientificDataset';records.at(-1).detectionRules={backend:'static',magic:[{offset:0,bytes:[147,78,85,77,80,89]}]};
add('npz','NumPy ZIP collection',['npz'],[],'zip','partial','archive',['Safe archive navigation; contained numeric NPY entries use scientific preview.']);
for(const [id,extensions,signature] of [['psd',['psd'],[56,66,80,83,0,1]],['psb',['psb'],[56,66,80,83,0,2]],['exr',['exr'],[118,47,49,1]],['eps',['eps'],[37,33,80,83]],['ai',['ai'],[]],['fig',['fig'],[]],['sketch',['sketch'],[]],['lottie',['lottie'],[]],['bigtiff',['btf','bigtiff'],[]]]){
 add(id,id.toUpperCase(),extensions,[],'unknown','detection-only','hex',['Specialized decoder/rendering is not implemented; recognition or embedded thumbnails do not imply full fidelity.']);
 records.at(-1).supportedViews[0].projection='BinaryDocument';
 if(signature.length)records.at(-1).detectionRules={backend:'static',magic:[{offset:0,bytes:signature}]};
}
add('typescript-declaration','TypeScript declaration',['d.ts'],[],'typescript');
add('kotlin-script','Kotlin script',['gradle.kts','kts'],[],'text');
add('blade-template','Blade template',['blade.php'],[],'text');
add('dockerfile','Dockerfile',[],['Dockerfile'],'text');
add('cmake','CMake',[],['CMakeLists.txt'],'text');
add('go-module','Go module',[],['go.mod'],'text');
add('cargo-manifest','Cargo manifest',[],['Cargo.toml'],'toml');
add('gitignore','Git ignore',[],['.gitignore'],'text');
add('environment','Environment configuration',['env.local'],['.env','.env.local'],'text');
add('matlab-source','MATLAB source',['m'],[],'text');
add('objective-c','Objective-C source',['m'],[],'text');
// Module 19 extends the existing format catalogue; association policy remains explicit.
add('makefile','Makefile',[],['Makefile','GNUmakefile'],'text');
add('package-manifest','Package manifest',[],['package.json'],'json','basic-structure','json');
add('tsconfig','TypeScript configuration',[],['tsconfig.json'],'json');
add('pyproject','Python project configuration',[],['pyproject.toml'],'toml');
add('editorconfig','EditorConfig',[],['.editorconfig'],'text');
add('gradle','Gradle source',['gradle'],['build.gradle'],'text');
add('jsonc','JSON with comments',['jsonc'],[],'text');
add('json5','JSON5 source',['json5'],[],'text');
add('ini','INI source',['ini'],[],'text');
add('vue','Vue source',['vue'],[],'text');
add('svelte','Svelte source',['svelte'],[],'text');
add('astro','Astro source',['astro'],[],'text');
add('perl-source','Perl source',['pl','perl'],[],'text');
add('prolog-source','Prolog source',['pl'],[],'text');
for(const id of ['perl-source','prolog-source'])records.find(r=>r.formatId===id).ambiguityGroup='pl-source';
const sourceLanguages={javascript:'javascript',typescript:'typescript',jsx:'jsx',tsx:'tsx',python:'python',c:'c',cpp:'cpp',java:'java',go:'go',rust:'rust',html:'xml',css:'css',json:'json',yaml:'yaml',xml:'xml',toml:'ini','typescript-declaration':'typescript','kotlin-script':'kotlin','blade-template':'xml',dockerfile:'dockerfile',makefile:'makefile',cmake:'cmake','go-module':'go','cargo-manifest':'ini',gitignore:'plaintext',environment:'ini','matlab-source':'matlab','objective-c':'objectivec','package-manifest':'json',tsconfig:'jsonc',pyproject:'ini',editorconfig:'ini',gradle:'groovy',jsonc:'jsonc',json5:'javascript',ini:'ini',vue:'xml',svelte:'xml',astro:'xml','perl-source':'perl','prolog-source':'prolog'};
for(const record of records)if(sourceLanguages[record.formatId])record.sourceLanguage=sourceLanguages[record.formatId];
add('nifti-gzip','Compressed NIfTI',['nii.gz'],[],'gz','detection-only','core.binary-fallback',['Compression signature cannot confirm the inner NIfTI format. Medical preview is not implemented.']);
add('tar-zstd','Zstandard TAR',['tar.zst'],[],'zst','partial','archive',['Container name is a hint; decompression support is determined by the existing archive backend.']);
add('notebook-json','Notebook JSON source',['ipynb'],[],'json','basic-structure','json',['Notebook viewer and kernel execution are not implemented.']);
for(const id of ['matlab-source','objective-c'])records.find(r=>r.formatId===id).ambiguityGroup='m-source';
// Preserve explicit signatures such as NPY/PSD; generation must not erase them.
for(const entry of records)entry.detectionRules??={backend:'existing-bounded-detector'};
for(const [id,mime]of Object.entries({pdf:'application/pdf',json:'application/json',png:'image/png',zip:'application/zip'}))records.find(r=>r.formatId===id).detectionRules.mimeTypes=[mime];
for(const [id,signature]of Object.entries({pdf:'%PDF-',png:'\x89PNG\r\n\x1a\n',zip:'PK\x03\x04'}))records.find(r=>r.formatId===id).detectionRules.magic=[{offset:0,bytes:Array.from(signature,c=>c.charCodeAt(0))}];
records.find(r=>r.formatId==='docx').detectionRules.containerEntries=['[Content_Types].xml','word/document.xml'];
records.find(r=>r.formatId==='epub').detectionRules.containerEntries=['mimetype','META-INF/container.xml'];
const notebook=records.find(r=>r.formatId==='notebook-json');notebook.supportedViews[0].label='JSON structure';notebook.supportedViews.push({id:'source',viewerId:'core.text-fallback',projection:'TextDocument',label:'JSON source'});
records.push({...records.find(r=>r.formatId==='text'),formatId:'unknown',name:'Unknown format',extensions:[],legacyType:'unknown',previewLevel:'detection-only',canEdit:false,canSave:false,canSearch:false,supportedViews:[{id:'primary',viewerId:'core.binary-fallback',projection:'BinaryDocument',label:'Format information'}],association:{allowed:false,recommended:false,category:'Unknown'}});
// Module 18 adds raw-byte interpretation, without changing specialized detection or associations.
for(const record of records){
 record.supportedViews.push({id:'hex',viewerId:'hex',projection:'BinaryDocument',label:'Raw bytes / Hex (read only)'});
 if(record.formatId==='unknown'){record.previewLevel='basic-structure';record.canSearch=true;record.supportedViews[0].label='Binary / Hex';record.limitations=['Raw byte viewing does not identify or validate the original format.'];}
}
// Concrete parser bindings are metadata for the existing registry, not another registry.
for(const binding of JSON.parse(fs.readFileSync('src/formats/content-adapters.json','utf8')))for(const id of binding.formats){
 const record=records.find(r=>r.formatId===id);if(!record)throw Error('Adapter format must already be registered: '+id);
 record.previewLevel='partial';record.isolation='worker';record.canEdit=false;record.canSave=false;
 record.canSearch=binding.viewer==='scientific';
 record.supportedViews[0]={id:'primary',viewerId:binding.viewer,projection:binding.projection,label:'Primary view'};
 record.limitations=[binding.scope];record.dependencies=[binding.module];
}
fs.mkdirSync('src/formats',{recursive:true});fs.writeFileSync('src/formats/catalogue.json',JSON.stringify(records,null,2)+'\n');
// Deduplicate repeated policies in the startup metadata without changing the full export matrix.
const profiles=[],profileKeys=new Map(),entries=records.map(record=>{
 const {formatId,name,extensions,filenames,legacyType,detectionRules,ambiguityGroup,...profile}=record;
 const key=JSON.stringify(profile);let at=profileKeys.get(key);if(at===undefined){at=profiles.length;profiles.push(profile);profileKeys.set(key,at);}
 return [formatId,name,extensions,filenames,legacyType,at,detectionRules??null,ambiguityGroup??null];
});
fs.writeFileSync('src/formats/runtime.json',JSON.stringify({profiles,entries})+'\n');
console.log(`${records.length} format definitions generated; new formats have no association permission`);

