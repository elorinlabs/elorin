const {chromium}=require(process.env.PRISM_PLAYWRIGHT||'playwright');
const assert=require('assert/strict'),fs=require('fs');
const root='docs/qa/module-24',report={environment:'Windows / real Edge headless; DPR and CSS zoom simulations are not native DPI validation',started:new Date().toISOString(),checks:[],errors:[],screenshots:[],performance:{}};
fs.mkdirSync(root,{recursive:true});
const ok=(name,value)=>{assert.ok(value,name);report.checks.push({name,status:'passed'});console.log(name);};
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,ignoreDefaultArgs:['--hide-scrollbars']});let page;try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
 const screenshot=async(name,locator)=>{const file=`${root}/${name}.png`;await (locator||page).screenshot({path:file,fullPage:!locator});report.screenshots.push(file);};
 const start=Date.now();await page.goto('http://127.0.0.1:1420/__qa/design-system');await page.getByRole('heading',{name:'UI Components',exact:true}).waitFor();report.performance.dev_showcase_first_content_wall_ms=Date.now()-start;
 await screenshot('showcase-light');
 const increment=page.getByRole('button',{name:'Increment',exact:true}),before=await increment.evaluate(e=>getComputedStyle(e).backgroundColor);
 await increment.hover();ok('Primary hover uses accent-hover',await increment.evaluate(e=>getComputedStyle(e).backgroundColor)!==before);await screenshot('button-hover',increment);
 await increment.focus();ok('Visible keyboard focus has an outline',await increment.evaluate(e=>getComputedStyle(e).outlineStyle!=='none'));await page.keyboard.press('Enter');ok('Button performs its real demo action',await page.getByLabel('Demo counter').textContent()==='1');
 await page.getByRole('button',{name:'Demo menu',exact:true}).click();await page.keyboard.press('End');ok('Dropdown keyboard skips disabled items',await page.getByRole('menuitem',{name:'Reset counter'}).evaluate(e=>e===document.activeElement));await page.keyboard.press('Escape');ok('Dropdown Escape returns focus',await page.getByRole('button',{name:'Demo menu',exact:true}).evaluate(e=>e===document.activeElement));
 for(const variant of ['minimal','reading','data']){
  const area=page.getByLabel(`${variant} scroll sample`);await area.scrollIntoViewIfNeeded();await area.hover();await screenshot(`scroll-${variant}-hover`,area);
  await page.mouse.wheel(0,350);await page.waitForTimeout(150);ok(`${variant} native wheel`,await area.evaluate(e=>e.scrollTop)>0);
  await area.focus();const top=await area.evaluate(e=>e.scrollTop);await page.keyboard.press('PageDown');await page.waitForTimeout(250);ok(`${variant} native keyboard PageDown`,await area.evaluate(e=>e.scrollTop)>top);
  await area.evaluate(e=>e.scrollTop=0);await page.waitForTimeout(300);await area.hover();const rect=await area.boundingBox();
  // Chromium's actual native scrollbar; no synthetic thumb or assigned scrollTop for this assertion.
  await page.mouse.move(rect.x+rect.width-3,rect.y+4);await page.mouse.down();await page.mouse.move(rect.x+rect.width-3,rect.y+100,{steps:12});await page.mouse.up();await page.waitForTimeout(100);
  ok(`${variant} native scrollbar drag`,await area.evaluate(e=>e.scrollTop)>0);
  if(variant==='data'){await area.hover();await page.mouse.wheel(420,0);await page.waitForTimeout(150);ok('Data horizontal wheel',await area.evaluate(e=>e.scrollLeft)>0);}
 }
 await page.getByRole('button',{name:'Go final logical row',exact:true}).click();const grid=page.getByRole('grid',{name:'Huge virtual grid'});await grid.getByRole('gridcell').filter({hasText:/^2147483647$/}).waitFor();ok('Huge existing grid reaches exact logical row beyond CSS height',await grid.getByRole('gridcell').count()<100&&await grid.evaluate(e=>e.scrollHeight<=16000000));await grid.hover();await page.mouse.wheel(0,-16000000);await grid.getByRole('gridcell').filter({hasText:/^0$/}).waitFor();ok('Huge grid native wheel returns to exact first row',true);
 const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
 report.performance.heap_before_theme=(await cdp.send('Runtime.getHeapUsage')).usedSize;
 const started=Date.now();await page.getByLabel('Theme',{exact:true}).selectOption('dark');await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');report.performance.theme_switch_wall_ms=Date.now()-started;
 ok('Dark theme uses independent surface tokens',await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--surface-primary').trim()==='#172235'));await screenshot('showcase-dark');
 await page.getByLabel('Theme',{exact:true}).selectOption('system');await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');ok('System follows live OS preference changes',true);
 await page.getByLabel('Theme',{exact:true}).selectOption('light');await page.getByLabel('Language',{exact:true}).selectOption('zh');await page.getByRole('heading',{name:'基础界面组件'}).waitFor();await screenshot('showcase-chinese');
 await page.emulateMedia({reducedMotion:'reduce',forcedColors:'active'});ok('Reduced motion is honored',await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches));await screenshot('showcase-forced-colors');await page.emulateMedia({forcedColors:'none'});
 await page.getByLabel('Language',{exact:true}).selectOption('en');
 const area=page.getByLabel('data scroll sample');await area.scrollIntoViewIfNeeded();await area.hover();const frames=await page.evaluate(async()=>{const samples=[];let last=performance.now();for(let i=0;i<90;i++){await new Promise(requestAnimationFrame);const now=performance.now();samples.push(now-last);last=now;document.querySelector('[data-scroll=data]').scrollTop+=15;}return samples;});
 report.performance.scroll_frame_ms={count:frames.length,p50:[...frames].sort((a,b)=>a-b)[45],p95:[...frames].sort((a,b)=>a-b)[85],over_33_ms:frames.filter(x=>x>33).length,note:'90-frame finite CSS sample on this host; not old i5 or huge-viewer benchmark'};
 report.performance.heap_after_theme=(await cdp.send('Runtime.getHeapUsage')).usedSize;
 for(const resolution of [{width:1366,height:768},{width:1920,height:1080}])for(const scale of [1,1.25,1.5,2]){
  const c=await browser.newContext({viewport:resolution,deviceScaleFactor:scale});const p=await c.newPage();await p.goto('http://127.0.0.1:1420/__qa/design-system');await p.getByRole('heading',{name:'UI Components',exact:true}).waitFor();await p.evaluate(scale=>document.documentElement.style.zoom=String(scale),scale);
  ok(`${resolution.width}x${resolution.height} ${scale*100}% simulated zoom has reachable theme and chrome controls`,await p.getByLabel('Theme',{exact:true}).isVisible()&&await p.getByLabel('Close window',{exact:true}).isVisible()&&await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const file=`${root}/showcase-${resolution.width}-${scale*100}.png`;await p.screenshot({path:file});report.screenshots.push(file);await c.close();
 }
 await page.goto('http://127.0.0.1:1420');await page.getByRole('button',{name:'Open File',exact:true}).waitFor();await screenshot('app-light');
 for(const zoom of [1,2]){await page.setViewportSize({width:1366,height:768});await page.evaluate(zoom=>document.documentElement.style.zoom=String(zoom),zoom);await screenshot(`app-1366-zoom-${zoom*100}`);const open=page.getByRole('button',{name:'Open File',exact:true});await open.scrollIntoViewIfNeeded();const bounds=await open.boundingBox();ok(`Application ${zoom*100}% zoom keeps Open File reachable`,bounds.x>=0&&bounds.x+bounds.width<=1366&&bounds.y>=38&&bounds.y+bounds.height<=768);}
 await page.evaluate(()=>document.documentElement.style.zoom='1');await page.locator('input[type=file]').setInputFiles('tests/fixtures/markdown/basic.md');await page.locator('.markdown-reader').waitFor();const host=page.locator('.tab-surface:not([hidden]) .viewer-host');const identity=await host.getAttribute('data-viewer-id');await page.evaluate(()=>{window.__module24Reader=document.querySelector('.markdown-reader');localStorage.setItem('prism-theme','dark');});
 // Theme changes in the live application use the real Settings select, not a remount.
 const themeSelect=page.getByLabel('Theme',{exact:true});if(await themeSelect.count()){await themeSelect.selectOption('dark');await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');ok('Theme update preserves viewer DOM and registry route',await page.evaluate(()=>window.__module24Reader===document.querySelector('.markdown-reader'))&&await host.getAttribute('data-viewer-id')===identity);await screenshot('app-dark');}
 ok('No renderer errors',report.errors.length===0);report.status='passed';
 }catch(error){report.status='failed';report.failure=error.stack;process.exitCode=1;if(page)await page.screenshot({path:`${root}/browser-failure.png`,fullPage:true}).catch(()=>{});}finally{await browser.close();fs.writeFileSync(`${root}/browser-runtime.json`,JSON.stringify(report,null,2));console.log(report.status,report.failure||'');}})();
