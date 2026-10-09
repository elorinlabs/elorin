// A small set of existing real samples; this is not the full compatibility suite.
const {launch,delay,fs,path,assert}=require('./native-common.cjs');
const report={checks:[],errors:[],started:new Date().toISOString()};
(async()=>{let q;try{q=await launch('after',9282);const p=q.page;p.on('pageerror',e=>report.errors.push(e.message));report.executableSha256=q.executableSha256;
 const samples=[
  ['tests/fixtures/documents/basic.pdf',async()=>{await p.locator('.pdf-viewport canvas').first().waitFor();await p.waitForFunction(()=>{const c=document.querySelector('.pdf-viewport canvas');if(!c||!c.width||!c.height)return false;const data=c.getContext('2d').getImageData(0,0,Math.min(c.width,1000),Math.min(c.height,1400)).data;for(let i=0;i<data.length;i+=16)if(data[i+3]===255&&Math.min(data[i],data[i+1],data[i+2])<230)return true;return false;});}],
  ['tests/fixtures/documents/basic.docx',async()=>{await p.locator('.office-paper').filter({hasText:'Needle searchable paragraph'}).waitFor();}],
  ['test-fixtures/publishing/basic.epub',async()=>{await p.locator('.m11-reading').waitFor();await p.locator('.m11-reading').filter({hasText:'First chapter needle'}).waitFor();}],
  ['tests/fixtures/markdown/basic.md',async()=>{await p.getByRole('heading',{name:'Prism',exact:true}).waitFor();}],
  ['tests/fixtures/json/basic.json',async()=>{await p.getByText('Prism',{exact:false}).first().waitFor();}],
  ['tests/fixtures/csv/basic.csv',async()=>{await p.getByRole('gridcell',{name:'Alice',exact:true}).waitFor();}],
  ['tests/fixtures/spreadsheets/basic.xlsx',async()=>{await p.getByRole('gridcell',{name:'42',exact:true}).waitFor();}],
  ['test-fixtures/media/audio/basic.wav',async()=>{await p.waitForFunction(()=>[...document.querySelectorAll('audio')].some(a=>a.readyState>=1&&a.duration>0));}],
  ['tests/fixtures/module28/damaged.psd',async()=>{await p.getByRole('button',{name:'View as Hex',exact:true}).click();await p.locator('.hex-row .hex-ascii').filter({hasText:'8BPS'}).first().waitFor();}],
  ['test-fixtures/3d/mesh/basic.stl',async()=>{await p.getByRole('button',{name:'View top',exact:true}).waitFor();await p.locator('.geometry-viewport canvas').waitFor();}],
 ];
 for(const [file,verify]of samples){await q.open(file);await p.locator('.viewer-host[data-viewer-state=ready]').first().waitFor();await verify();report.checks.push(file+' real content loaded');console.log('PASS:',file);await p.locator('.file-tab[data-active=true] .tab-close').click();await p.waitForFunction(()=>document.querySelectorAll('.file-tab').length===0);}
 assert.equal(report.errors.length,0);report.status='PASS';
 }catch(e){report.status='FAIL';report.failure=String(e.stack||e);if(q)report.lastUi=await q.page.locator('body').innerText().catch(()=>'(closed)');console.error(report.failure);process.exitCode=1;}finally{if(q)report.cleanup=await q.close();fs.writeFileSync(path.join(__dirname,'smoke-report.json'),JSON.stringify(report,null,2));}})();
