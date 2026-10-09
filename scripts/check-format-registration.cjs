/** Checks the production catalogue, not an alternative registration system. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),ts=require('typescript');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function calls(source,file,predicate){const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),result=[];function visit(n){if(ts.isCallExpression(n)&&predicate(n,ast))result.push(n);ts.forEachChild(n,visit);}visit(ast);return result;}
const modelByProjection={ImageDocument:'ReturnType<typeof decodePsd>',ScientificDataset:'Mat4Reader',GeometryDocument:'GeometryDocumentModel'};
const projectionByViewer={image:'ImageDocument',scientific:'ScientificDataset',mesh:'GeometryDocument',cad:'GeometryDocument',scene:'GeometryDocument','cad-drawing':'GeometryDocument',archive:'ContainerDocument',audio:'TimelineDocument',video:'TimelineDocument',subtitle:'TimelineDocument',ebook:'DocumentPages',presentation:'DocumentPages',pdf:'DocumentPages','office-document':'DocumentPages',email:'StructuredDocument',json:'StructuredDocument',spreadsheet:'TabularDataProvider',columnar:'TabularDataProvider',database:'TabularDataProvider',csv:'TabularDataProvider',markdown:'TextDocument','core.text-fallback':'TextDocument',hex:'BinaryDocument','core.binary-fallback':'BinaryDocument'};
function viewerIds(){
 const source=fs.readFileSync('src/viewer/builtins.ts','utf8'),ast=ts.createSourceFile('builtins.ts',source,ts.ScriptTarget.Latest,true),ids=new Set();
 function visit(n){
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='registerLazy'&&ts.isObjectLiteralExpression(n.arguments[0])){
   const id=n.arguments[0].properties.find(p=>p.name?.getText(ast)==='id');if(id?.initializer&&ts.isStringLiteral(id.initializer))ids.add(id.initializer.text);
  }
  if(ts.isForOfStatement(n)&&n.statement.getText(ast).includes('registerLazy')){let e=n.expression;while(ts.isAsExpression(e)||ts.isParenthesizedExpression(e))e=e.expression;if(ts.isArrayLiteralExpression(e))for(const t of e.elements)if(ts.isArrayLiteralExpression(t)&&ts.isStringLiteral(t.elements[0]))ids.add(t.elements[0].text);}
  ts.forEachChild(n,visit);
 }visit(ast);return ids;
}
function check(options={}){
 const catalogue=options.catalogue??read('src/formats/catalogue.json'),bindings=options.bindings??read('src/formats/content-adapters.json'),matrix=options.matrix??read('docs/formats/format-capability-matrix.json');
 const errors=[],ids=new Set(),parsers=new Map(),viewers=viewerIds(),rules=new Map();
 const fail=(id,message)=>errors.push(`${id}: ${message}`);
 const loader=fs.readFileSync('src/formats/content-adapter.ts','utf8');
 for(const b of bindings){
  if(parsers.has(b.id))fail(b.id,'duplicate parser ID');parsers.set(b.id,b);
  if(!viewers.has(b.viewer))fail(b.id,`missing Viewer ${b.viewer}`);
  if(projectionByViewer[b.viewer]!==b.projection)fail(b.id,'parser projection incompatible with registered Viewer input');
  if(modelByProjection[b.projection]!==b.outputModel)fail(b.id,`output model ${b.outputModel} incompatible with ${b.viewer}/${b.projection}`);
  for(const f of [b.module,b.worker])if(!f||!fs.existsSync(f))fail(b.id,`missing parser/worker source ${f}`);
  if(!fs.existsSync(b.module)||!fs.existsSync(b.worker))continue;
  const source=fs.readFileSync(b.module,'utf8'),ast=ts.createSourceFile(b.module,source,ts.ScriptTarget.Latest,true);
  let declaration;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===b.exportName)declaration=n;ts.forEachChild(n,visit);}visit(ast);
  const type=declaration?.type;
  if(!type||!ts.isTypeReferenceNode(type)||type.typeName.getText(ast)!=='ContentAdapter'||type.typeArguments?.[1]?.getText(ast)!==b.outputModel)fail(b.id,'exported ContentAdapter output contract differs from binding');
  const object=declaration?.initializer;
  const properties=object&&ts.isObjectLiteralExpression(object)?object.properties:[];
  const id=properties.find(p=>p.name?.getText(ast)==='id'),formats=properties.find(p=>p.name?.getText(ast)==='formats');
  const exported=declaration?.parent?.parent?.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
  if(!exported||!id?.initializer||!ts.isStringLiteral(id.initializer)||id.initializer.text!==b.id)fail(b.id,'parser identity differs from exported implementation');
  if(!formats?.initializer||!ts.isArrayLiteralExpression(formats.initializer)||b.formats.some(f=>!formats.initializer.elements.some(e=>ts.isStringLiteral(e)&&e.text===f)))fail(b.id,'exported parser format list differs from binding');
  const relative=path.relative('src/formats',b.module).replaceAll('\\','/').replace(/\.ts$/,'');
  if(!calls(loader,'loader.ts',n=>n.expression.kind===ts.SyntaxKind.ImportKeyword&&ts.isStringLiteral(n.arguments[0])&&n.arguments[0].text===relative).length||!loader.includes('.'+b.exportName))fail(b.id,'parser is not connected to production lazy loader');
  const worker=fs.readFileSync(b.worker,'utf8');
  for(const format of b.formats)if(!calls(worker,b.worker,n=>ts.isIdentifier(n.expression)&&n.expression.text==='parseFormat'&&ts.isStringLiteral(n.arguments[0])&&n.arguments[0].text===format).length||!loader.includes(`case '${format}':`))fail(format,'no actual worker dispatch through lazy parser loader');
 }
 for(const c of catalogue){
  if(ids.has(c.formatId))fail(c.formatId,'duplicate format ID');ids.add(c.formatId);
  const primary=c.supportedViews.find(v=>v.id==='primary');
  if(!primary||primary.viewerId!==c.viewerId)fail(c.formatId,'primary Viewer identity mismatch');
  for(const v of c.supportedViews){if(!viewers.has(v.viewerId))fail(c.formatId,`missing Viewer ${v.viewerId}`);if(projectionByViewer[v.viewerId]!==v.projection)fail(c.formatId,`projection ${v.projection} incompatible with Viewer ${v.viewerId}`);}
  if(c.parserId?.startsWith('viewer/')){if(c.parserId!==`viewer/${c.viewerId}`||!viewers.has(c.viewerId))fail(c.formatId,'missing viewer-owned parser pipeline');}
  else if(c.parserId){const b=parsers.get(c.parserId);if(!b||!b.formats.includes(c.formatId))fail(c.formatId,`missing parser ${c.parserId}`);else if(b.viewer!==c.viewerId||b.projection!==primary?.projection)fail(c.formatId,'parser output / Viewer input projection mismatch');}
  if(c.supportStatus==='adapter-implemented'&&!parsers.has(c.parserId))fail(c.formatId,'declared adapter support has no actual parser');
  if(['hex','core.binary-fallback'].includes(c.viewerId)&&c.parserId)fail(c.formatId,'raw/Hex fallback cannot declare a content parser');
  if(c.previewLevel==='detection-only'&&c.parserId)fail(c.formatId,'detection-only cannot declare implemented parsing');
  if(!['full','limited','read-only','unverified'].includes(c.editCapability)||!['original-format','limited-save','export-only','no-write'].includes(c.saveCapability))fail(c.formatId,'missing editing/save classification');
  if(c.canEdit!==c.canSave||c.canEdit!==!!c.writerId)fail(c.formatId,'editor and safe writer capability mismatch');
  if(c.writerId&&c.writerId!=='document.atomic-utf8')fail(c.formatId,'writer is not connected to an existing safe write path');
  if(c.canEdit&&!['core.text-fallback','markdown','json','csv'].includes(c.viewerId))fail(c.formatId,'specialized Viewer has no connected editing model');
  for(const key of [...c.extensions.map(e=>'extension:'+e.toLowerCase()),...c.filenames.map(e=>'filename:'+e.toLowerCase()),...(c.detectionRules?.magic??[]).map(r=>'magic:'+r.offset+':'+r.bytes.join(','))]){
   const previous=rules.get(key)??[];
   for(const p of previous)if(!c.ambiguityGroup||c.ambiguityGroup!==p.ambiguityGroup)fail(c.formatId,`${key} conflicts with ${p.formatId} without explicit ambiguity policy`);
   rules.set(key,[...previous,c]);
  }
 }
 for(const b of bindings)for(const id of b.formats)if(!catalogue.some(c=>c.formatId===id&&c.parserId===b.id))fail(b.id,`orphaned parser format ${id}`);
 const rowIds=new Set();
 for(const r of matrix.formats){
  if(rowIds.has(r.formatId))fail(r.formatId,'duplicate capability row');rowIds.add(r.formatId);
  const c=catalogue.find(c=>c.formatId===r.formatId);
  if(!c){fail(r.formatId,'capability row does not reference catalogue');continue;}
  if(r.parserId!==c.parserId||r.viewerId!==c.viewerId)fail(c.formatId,'stale capability parser/Viewer mapping');
  if(r.writerId!==c.writerId||r.editCapability!==c.editCapability||r.saveCapability!==c.saveCapability)fail(c.formatId,'stale editing/writer capability mapping');
  if(r.editEvidence?.runtimeStatus==='sample-verified'){
   const report=r.editEvidence.report&&fs.existsSync(r.editEvidence.report)?read(r.editEvidence.report):null;
   if(!c.canEdit||report?.status!=='PASS'||!r.editEvidence.roundTrips?.length)fail(c.formatId,'verified editing without editor, passed native run and round-trip evidence');
   for(const e of r.editEvidence.roundTrips??[])if(e.formatId!==c.formatId||e.status!=='passed'||!e.assertions?.length||!/^([a-f0-9]{64})$/.test(e.savedSha256??'')||!report?.roundTrips?.some(s=>s.name===e.name&&s.savedSha256===e.savedSha256&&s.status==='passed'))fail(c.formatId,'editing evidence does not match the executed native round trip');
  }
  if(r.parsingStatus==='implemented'&&c.supportStatus!=='adapter-implemented')fail(c.formatId,'implemented parsing status without an independently registered adapter');
  if((r.parser_implemented||r.main_content_verified||r.sample_verified)&&!c.parserId)fail(c.formatId,'raw/detection-only capability cannot claim parser or reading support');
  if(r.sampleStatus?.startsWith('verified')||r.renderingStatus==='sample-verified'){
   if(!c.parserId||!r.test_evidence?.length)fail(c.formatId,'verified status without content parser and sample evidence');
   for(const e of r.test_evidence??[]){
    if(e.status!=='passed'||!e.assertions?.length||!e.test_file||!fs.existsSync(e.test_file)||!e.fixture||!fs.existsSync(e.fixture)||e.fixture_sha256!==crypto.createHash('sha256').update(fs.readFileSync(e.fixture)).digest('hex'))fail(c.formatId,'invalid or stale verified sample evidence');
    if(e.resolved_viewer&&e.resolved_viewer!==c.viewerId)fail(c.formatId,'sample evidence resolved a different Viewer');
    if(e.report_file&&(!fs.existsSync(e.report_file)||read(e.report_file).status==='FAIL'))fail(c.formatId,'sample runtime report is missing or failed');
    if(e.runtime_report&&(!fs.existsSync(e.runtime_report)||read(e.runtime_report).status!=='PASS'))fail(c.formatId,'referenced native content run is missing or not passed');
   }
  }
 }
 if(matrix.formats.length!==catalogue.length)fail('matrix','capability row count differs from catalogue');
 const runtime=read('src/formats/runtime.json');
 if(!options.catalogue){const expanded=runtime.entries.map(([formatId,name,extensions,filenames,legacyType,profile,detectionRules,ambiguityGroup])=>({...runtime.profiles[profile],formatId,name,extensions,filenames,legacyType,detectionRules,...(ambiguityGroup?{ambiguityGroup}:{})}));for(const c of catalogue){const r=expanded.find(r=>r.formatId===c.formatId);if(!r||JSON.stringify(r.supportedViews)!==JSON.stringify(c.supportedViews)||r.parserId!==c.parserId||r.supportStatus!==c.supportStatus)fail(c.formatId,'stale generated runtime route');}}
 return {status:errors.length?'FAIL':'PASS',formatCount:catalogue.length,adapterCount:bindings.length,verifiedSamples:matrix.formats.filter(r=>r.sampleStatus?.startsWith('verified')).length,errors};
}
module.exports={check};
if(require.main===module){const result=check();console.log(JSON.stringify(result,null,2));if(result.errors.length)process.exitCode=1;}
