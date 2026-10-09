const{spawnSync}=require('child_process'),fs=require('fs'),path=require('path');
const tier=(process.argv[2]||'FAST').toUpperCase();if(!['FAST','STANDARD','EXTENDED'].includes(tier))throw Error('Use FAST, STANDARD or EXTENDED');
const pnpm=process.env.PRISM_PNPM||'pnpm';
const results=[],run=(id,command,args,cwd='.')=>{const start=Date.now(),r=spawnSync(command,args,{cwd,encoding:'utf8',shell:process.platform==='win32'&&command.endsWith('.cmd'),windowsHide:true,maxBuffer:32*1024*1024});fs.writeFileSync(`docs/qa/module-23-suite-${id}.log`,(r.stdout||'')+(r.stderr||'')+(r.error?.message||''));results.push({id,status:r.error?'environment_blocked':r.status===0?'passed':'failed',elapsed_ms:Date.now()-start,command:[command,...args],log:`docs/qa/module-23-suite-${id}.log`});};
run('fast',pnpm,['exec','vitest','run','tests/viewer-registry.test.ts','tests/viewer-lifecycle.test.ts','tests/viewer-host.test.tsx','tests/module-17.test.tsx','tests/module-23.test.tsx','--maxWorkers=2']);
if(tier!=='FAST'){
 run('typescript',pnpm,['exec','vitest','run','--maxWorkers=2']);
 run('rust','cargo',['test','-j1'],'src-tauri');
 run('build',pnpm,['build']);
 run('browser',process.execPath,['tests/module-23-browser-qa.cjs']);
}
if(tier==='EXTENDED'){
 for(const[id,args]of [['native',['tests/module-23-native-qa.cjs']],['idle30',['tests/module-23-native-qa.cjs','--mode=idle','--duration=1800']],['cycles30',['tests/module-23-native-qa.cjs','--mode=cycles','--duration=1800']]]){
  if(process.argv.includes('--run-'+id))run(id,process.execPath,args);else results.push({id,status:'not_run',reason:'Opt-in isolated native app on CDP 9230 required. Short tests do not replace 30-minute tests.'});
 }
 results.push({id:'installer',status:'not_run',reason:'Build latest NSIS and run tests/module-16-installer-qa.ps1 in a clean per-user installation environment; preserve UserChoice.'});
}
const statuses=['passed','failed','skipped','not_run','unsupported','environment_blocked'];const report={tier,started_from:process.cwd(),finished:new Date().toISOString(),results,counts:Object.fromEntries(statuses.map(s=>[s,results.filter(r=>r.status===s).length]))};fs.mkdirSync('docs/qa',{recursive:true});fs.writeFileSync(`docs/qa/module-23-suite-${tier.toLowerCase()}.json`,JSON.stringify(report,null,2));console.log(report);if(results.some(r=>['failed','environment_blocked'].includes(r.status)))process.exitCode=1;
