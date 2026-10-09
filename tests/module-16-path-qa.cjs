const {chromium}=require(process.env.PRISM_PLAYWRIGHT),fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),report={checks:[],errors:[]};
const target=JSON.parse(fs.readFileSync('test-fixtures/productivity/paths/long-path-reference.json'));
const primary=spawn(path.resolve('src-tauri/target/debug/prism.exe'),[target.path],{windowsHide:true,stdio:'ignore',env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9238',WEBVIEW2_USER_DATA_FOLDER:path.resolve('.qa-tools/module16-long-path-webview')}});primary.unref();
(async()=>{let browser;try{
assert.ok(target.length>260);report.pathLength=target.length;
for(let i=0;i<80;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9238');break;}catch{await sleep(250);}}
assert.ok(browser,'native WebView');const page=browser.contexts()[0].pages()[0];page.on('pageerror',e=>report.errors.push(e.message));
await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-elorin-tab]')).some(b=>b.textContent==='long-path.txt'&&b.getAttribute('aria-pressed')==='true'));
await page.locator('.viewer-host:visible .text-viewport').waitFor();assert.ok((await page.locator('.viewer-host:visible').innerText()).includes('long path Unicode works'));report.checks.push('native argv and viewer read Windows path longer than 260 characters');assert.equal(report.errors.length,0);report.checks.push('no renderer errors');
await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'}));
}catch(e){report.failure=e.stack;process.exitCode=1;}finally{if(browser)await browser.close().catch(()=>{});fs.writeFileSync('docs/qa/module-16-path-runtime.json',JSON.stringify(report,null,2));}console.log(report);})();
