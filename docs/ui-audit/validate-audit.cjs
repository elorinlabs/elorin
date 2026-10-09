/* Read-only source verification; writes only audit artifacts in this directory. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
const before=JSON.parse(fs.readFileSync(path.join(__dirname,'source-freeze-before.json'),'utf8'));
const changed=[],missing=[],after=[];
for(const entry of before){const p=path.join(root,entry.path);if(!fs.existsSync(p)){missing.push(entry.path);continue;}const sha256=hash(p);after.push({path:entry.path,sha256});if(sha256!==entry.sha256.toUpperCase())changed.push(entry.path);}
const inventory=execFileSync('rg',['--files','src','src-tauri','scripts','tests','public','-g','!src-tauri/target/**','-g','!**/*.png','-g','!**/*.jpg'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).concat(['package.json','pnpm-lock.yaml','index.html','vite.config.ts']);
const normalized=p=>p.replaceAll('\\','/').toLowerCase();
const prior=new Set(before.map(x=>normalized(x.path)));
const added=inventory.filter(p=>!prior.has(normalized(p)));
const spec='C:/Users/nanli/Downloads/Elorin_UIUX_Codex_Master_Spec (1).md';
const zip='C:/Users/nanli/Downloads/Elorin_UI_%E9%A1%B5%E9%9D%A2%E6%A0%87%E6%B3%A8_11%E5%BC%A0.zip';
const refDir=path.join(__dirname,'reference');
const referenceFiles=fs.readdirSync(refDir).filter(p=>fs.statSync(path.join(refDir,p)).isFile());
const references=[spec,zip,...referenceFiles.map(p=>path.join(refDir,p))].map(p=>({path:p,bytes:fs.statSync(p).size,sha256:hash(p)}));
const specText=fs.readFileSync(spec,'utf8');
const chapters=Array.from({length:16},(_,i)=>({chapter:i,present:new RegExp('^## '+i+'\\.','m').test(specText)}));
const matrix=JSON.parse(fs.readFileSync(path.join(__dirname,'UI_FEATURE_MATRIX.json'),'utf8'));
const docs=['UI_AUDIT.md','UI_FEATURE_MATRIX.md','UI_INTERACTION_SPEC.md','UI_IMPLEMENTATION_PLAN.md','UI_RUNTIME_MAP.md','UI_GAPS_AND_PRIORITY.md'];
const documentManifest=docs.map(p=>({path:'docs/'+p,bytes:fs.statSync(path.join(root,'docs',p)).size,sha256:hash(path.join(root,'docs',p))}));
const refCoverage=Object.fromEntries(Array.from({length:11},(_,i)=>{const ref=String(i+1).padStart(2,'0');return[ref,matrix.rows.filter(r=>r.ref_image===ref).length]}));
const rowProblems=[];
const ids=new Set();
for(const r of matrix.rows){if(ids.has(r.id))rowProblems.push('duplicate '+r.id);ids.add(r.id);for(const key of ['ref_image','region','control','interaction','existing_runtime_component_path','backend_service_path','state_management','status','tests','module_owner','evidence'])if(!r[key])rowProblems.push(`${r.id}: empty ${key}`);if(!fs.existsSync(path.join(root,r.existing_runtime_component_path)))rowProblems.push(`${r.id}: invalid source path`);if(!matrix.anchors[r.evidence])rowProblems.push(`${r.id}: invalid evidence`);for(const p of r.existing_tests||[])if(!fs.existsSync(path.join(root,p)))rowProblems.push(`${r.id}: missing test ${p}`);}
const historical=['docs/qa/module-24-suite-typescript.log','docs/qa/module-24-suite-rust.log','docs/qa/module-24-suite-standard.json','docs/qa/module-24/browser-runtime.json','docs/qa/module-24/native-chrome-runtime.json','docs/qa/module-24/native-close-runtime.json','docs/qa/module-24/native-light-normal.png','docs/qa/module-24/native-light-maximized.png','docs/qa/module-23-verification.md'].map(p=>({path:p,exists:fs.existsSync(path.join(root,p)),...(fs.existsSync(path.join(root,p))?{sha256:hash(path.join(root,p)),modified_utc:fs.statSync(path.join(root,p)).mtime.toISOString()}: {})}));
const qaResults={};for(const p of ['browser','native-chrome','native-close']){const f=path.join(root,'docs/qa/module-24',p+'-runtime.json');if(fs.existsSync(f)){const data=JSON.parse(fs.readFileSync(f,'utf8'));qaResults[p]={status:data.status,checks:Array.isArray(data.checks)?data.checks.length:undefined,error:data.error,scope:'historical only; not executed by audit'};}}
const passed=changed.length===0&&missing.length===0&&added.length===0&&rowProblems.length===0&&chapters.every(c=>c.present)&&referenceFiles.filter(p=>p.endsWith('.png')).length===11&&Object.values(refCoverage).every(n=>n>0)&&historical.every(x=>x.exists);
const result={recorded_at_utc:new Date().toISOString(),scope:'Documentation integrity and source freeze only. No application tests/build/UI interaction executed.',status:passed?'passed':'failed',source_freeze:{count:before.length,changed,missing,added,comparison:'SHA256 per baseline; .png/.jpg excluded by original baseline; no asset edits performed'},matrix:{rows:matrix.rows.length,by_reference:refCoverage,problems:rowProblems},master_spec:{path:spec,chapters},reference_files:references,historical_evidence:historical,historical_qa_snapshot:qaResults,documentation:documentManifest,limitations:['No .git: branch and uncommitted diff cannot be established.','No fresh runtime/visual/input/DPI/accessibility/performance/installer tests.','No official per-number Module25–35 responsibility table found.']};
fs.writeFileSync(path.join(__dirname,'source-freeze-after.json'),JSON.stringify(after,null,2));
fs.writeFileSync(path.join(__dirname,'audit-validation.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,source_files:before.length,changed,missing,added,rows:matrix.rows.length,by_reference:refCoverage,rowProblems,chapters:chapters.filter(c=>!c.present),missingHistorical:historical.filter(x=>!x.exists)},null,2));
if(!passed)process.exitCode=1;
