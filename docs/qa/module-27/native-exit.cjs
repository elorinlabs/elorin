const {launch,delay,processes,fs,path,assert}=require('./native-common.cjs');
const {execFileSync}=require('child_process');
(async()=>{let q;const report={started:new Date().toISOString()};try{
 q=await launch('after',9272);report.executableSha256=q.executableSha256;
 const file=path.resolve('.qa-tools/module27/normal-exit.txt');fs.writeFileSync(file,'Normal exit resource check');await q.open(file);
 await q.page.locator('.viewer-host[data-viewer-state=ready]').waitFor();const ids=processes(q.app.pid).map(p=>p.id);
 await q.page.getByRole('button',{name:'Close window',exact:true}).click();
 for(let i=0;i<50&&q.app.exitCode===null;i++)await delay(100);
 assert.equal(q.app.exitCode,0);await delay(1500);
 report.processesRemaining=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',`@(${ids.join(',')}) | ForEach-Object {Get-Process -Id $_ -ErrorAction SilentlyContinue | Select-Object Id,ProcessName} | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true})||'[]');
 assert.deepEqual(report.processesRemaining,[]);report.status='PASS';console.log('PASS: Native titlebar normal exit terminates app and every observed child process');
 }catch(e){report.status='FAIL';report.failure=String(e.stack||e);console.error(report.failure);process.exitCode=1;}finally{if(q)report.cleanup=await q.close();fs.writeFileSync(path.join(__dirname,'exit-report.json'),JSON.stringify(report,null,2));}})();
