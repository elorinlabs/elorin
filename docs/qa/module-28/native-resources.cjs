const {launch,invoke,fs,path,assert}=require('./native-common.cjs');
(async()=>{let q;const report={started:new Date().toISOString()};try{q=await launch('after',9283);const p=q.page;
 const base=path.resolve('.qa-tools/module28/resources-'+Date.now()),container=path.join(base,'container');fs.mkdirSync(container,{recursive:true});const file=path.join(container,'external-texture.3ds'),secret=path.join(base,'secret.png');
 fs.copyFileSync('tests/fixtures/module28/external-texture.3ds',file);fs.copyFileSync('tests/fixtures/image/basic.png',secret);
 await q.open(file);const alert=p.getByRole('alert').first();await alert.waitFor();await alert.locator('summary').click();assert.match(await alert.innerText(),/external textures/);
 const denied=await p.evaluate(async path=>{try{await window.__TAURI_INTERNALS__.invoke('file_size',{path});return 'GRANTED';}catch(e){return e.code??String(e);}},secret);assert.equal(denied,'PERMISSION_DENIED');
 report.status='PASS';report.check='3DS ../secret.png is rejected before decode and an existing unselected sibling remains PERMISSION_DENIED';report.executableSha256=q.executableSha256;console.log('PASS:',report.check);
 }catch(e){report.status='FAIL';report.failure=String(e.stack||e);console.error(report.failure);process.exitCode=1;}finally{if(q)report.cleanup=await q.close();fs.writeFileSync(path.join(__dirname,'resource-report.json'),JSON.stringify(report,null,2));}})();
