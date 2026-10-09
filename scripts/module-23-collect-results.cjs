const fs=require('fs'),crypto=require('crypto');
const results=[];
function record(id,file,valid){if(!fs.existsSync(file)){results.push({id,status:'not_run',source:file});return;}const data=JSON.parse(fs.readFileSync(file,'utf8'));results.push({id,status:valid(data)?'passed':'failed',source:file});}
record('standard','docs/qa/module-23-suite-standard.json',r=>r.results.every(x=>x.status==='passed'));
record('native-pressure-and-short-idle','docs/qa/module-23-native-runtime.json',r=>r.status==='passed'&&r.after_exit?.rows?.length===0);
record('native-vfs-repeat-resume','docs/qa/module-23-native-extra.json',r=>r.status==='passed');
record('native-8GiB-sparse','docs/qa/module-23-sparse-runtime.json',r=>!r.failure&&r.checks.length===2&&r.resources.sessions===0&&r.resources.tasks===0);
record('animation','docs/qa/module-23-animation-runtime.json',r=>!r.failure&&!r.errors.length);
record('system-media-codec-regression','docs/qa/module-23-media-runtime.json',r=>!r.failure&&!r.errors.length);
record('latest-installer','docs/qa/module-23-installer-runtime.json',r=>!r.errors.length&&r.checks.length>0&&r.setup_sha256===crypto.createHash('sha256').update(fs.readFileSync('src-tauri/target/release/bundle/nsis/Elorin_0.1.0_x64-setup.exe')).digest('hex'));
record('production-dependency-audit','docs/qa/module-23-dependency-audit.json',r=>Object.values(r.metadata.vulnerabilities).every(x=>x===0));
for(const id of ['idle-30-minutes','cycles-30-minutes','old-i5-hardware','production-cold-start-benchmark'])results.push({id,status:'not_run'});
results.push({id:'cargo-advisory-audit',status:'environment_blocked',source:'docs/qa/module-23-cargo-audit.log'});
record('development-dependency-audit','docs/qa/module-23-dependency-audit-all.json',r=>Object.values(r.metadata.vulnerabilities).every(x=>x===0));
const statuses=['passed','failed','skipped','not_run','unsupported','environment_blocked'];
const report={scope:'Module 23 delivery evidence index; NOT full release acceptance',generated:new Date().toISOString(),results,counts:Object.fromEntries(statuses.map(s=>[s,results.filter(r=>r.status===s).length]))};
fs.writeFileSync('docs/qa/module-23-delivery-results.json',JSON.stringify(report,null,2));console.log(report);
