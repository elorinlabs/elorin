const {chromium}=require(process.env.PRISM_PLAYWRIGHT||'playwright');
const fs=require('fs'),crypto=require('crypto'),assert=require('assert/strict');
const cases=[
 ['tests/fixtures/documents/basic.pdf','pdf','pdf','.pdf-page[data-rendered=true]','Needle'],
 ['tests/fixtures/documents/basic.docx','docx','office-document','.office-viewer','Document title'],
 ['tests/fixtures/documents/basic.odt','odt','office-document','.office-viewer','ODT heading'],
 ['tests/fixtures/spreadsheets/basic.xlsx','xlsx','spreadsheet','.m10-grid','00012345678901234567890'],
 ['tests/fixtures/spreadsheets/basic.ods','ods','spreadsheet','.m10-grid','ODS workbook'],
 ['tests/fixtures/presentations/basic.pptx','pptx','presentation','.m10-slide','Prism Presentation'],
 ['tests/fixtures/presentations/basic.odp','odp','presentation','.m10-slide','OpenDocument presentation'],
 ['tests/fixtures/image/basic.png','png','image','canvas[aria-label="Decoded image"]','IMAGE'],
 ['tests/fixtures/csv/basic.csv','csv','csv','[role=gridcell]','Alice'],
 ['tests/fixtures/csv/basic.tsv','tsv','csv','[role=gridcell]','TSV'],
 ['tests/fixtures/json/basic.json','json','json','[role=tree]','Prism'],
 ['tests/fixtures/markdown/basic.md','markdown','markdown','.markdown-viewer','Clarity'],
 ['test-fixtures/edit/code/basic.ts','typescript','core.text-fallback','.text-viewer','SOURCE'],
 ['test-fixtures/archive/basic.zip','zip','archive','.archive-row','ARCHIVE'],
 ['test-fixtures/data/sqlite/basic.sqlite','sqlite','database','.data-viewer','SQLITE'],
 ['test-fixtures/data/parquet/basic.parquet','parquet','columnar','.data-viewer','DATA'],
 ['test-fixtures/data/arrow/basic.arrow','arrow','columnar','.data-viewer','DATA'],
 ['test-fixtures/data/scientific/basic.h5','hdf5','scientific','.data-viewer','HDF'],
 ['test-fixtures/data/scientific/basic.nc','netcdf','scientific','.data-viewer','NETCDF'],
 ['test-fixtures/advanced22/int64.npy','npy','scientific','.data-viewer','9223372036854775807'],
 ...['stl','obj','ply','glb','gltf'].map(ext=>['test-fixtures/3d/mesh/basic.'+ext,ext,'mesh','.geometry-viewport canvas','GPU']),
 ...['step','iges'].map(ext=>['test-fixtures/3d/cad/basic.'+ext,ext,'cad','.geometry-viewport canvas','GPU']),
 ['test-fixtures/3d/drawing/basic.dxf','dxf','cad-drawing','.geometry-viewport canvas','GPU'],
 ['test-fixtures/advanced22/example.srt','srt','subtitle','.subtitle-viewer','SUBTITLE'],
 ['test-fixtures/media/audio/basic.wav','wav','audio','audio','MEDIA'],
 ['test-fixtures/media/video/basic.mp4','mp4','video','video','MEDIA'],
];
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 const results=[],errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 const host=page.locator('.tab-surface:not([hidden]) .viewer-host');
 try {
  for(const [file,format,viewer,selector,witness]of cases){
   const record={sample_id:file,sample_origin:'Existing repository fixture; generation method in fixture README or tests/generate-module-*.py; original tool versions not uniformly retained',sample_hash:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),format_id:format,test_environment:'Windows / Edge headless / Browser FileSource; not native protocol',test_result:'failed',asserted_capabilities:['content detection','registered routing','actual bounded preview','close'],actual_capabilities:[],limitations:['Only listed fixture/variant. No general L3 or L4 claim. Original generation tool versions are not uniformly retained.'],test_file:'tests/module-23-browser-qa.cjs',level:2};
   const started=Date.now();
   try {
    await page.goto(process.env.PRISM_QA_URL||'http://127.0.0.1:1420');
    await page.locator('input[type=file]').setInputFiles(file);
    await host.locator(selector).first().waitFor({timeout:120000,state:'attached'});
    await page.waitForFunction(()=>document.querySelector('.tab-surface:not([hidden]) .viewer-host')?.dataset.viewerState==='ready');
    record.detector_result={format_id:await host.getAttribute('data-format-id'),status:await host.getAttribute('data-detection-status')};
    record.resolved_viewer=await host.getAttribute('data-viewer-id');
    assert.equal(record.resolved_viewer,viewer,'actual resolved plugin');assert.equal(record.detector_result.format_id,format,'actual detected format');
    if(witness==='IMAGE'){const canvas=host.locator('canvas[aria-label="Decoded image"]');assert.ok(await canvas.evaluate(e=>e.width>0&&e.height>0&&e.getContext('2d').getImageData(0,0,e.width,e.height).data.some(v=>v!==0)));}
    else if(witness==='GPU'){await page.waitForFunction(()=>!!document.querySelector('.tab-surface:not([hidden]) canvas')?.dataset.renderStats);record.render_stats=JSON.parse(await host.locator('canvas').getAttribute('data-render-stats'));assert.ok(record.render_stats.geometries>0);}
    else if(witness==='MEDIA'){const m=host.locator(selector).first();await page.waitForFunction(s=>document.querySelector('.tab-surface:not([hidden]) '+s)?.readyState>=1,selector);assert.ok(await m.evaluate(e=>e.duration>0));await m.evaluate(e=>e.play());await page.waitForTimeout(200);assert.ok(await m.evaluate(e=>!e.paused&&e.currentTime>0));record.actual_capabilities.push('system codec metadata and playback');}
    else if(witness==='HDF'){await host.getByRole('button',{name:'Expand measurements',exact:true}).click();await host.getByRole('button',{name:'temperaturedataset',exact:true}).click();await host.getByRole('gridcell').filter({hasText:/^37$/}).waitFor();assert.equal(await host.getByRole('gridcell').first().innerText(),'0');}
    else if(witness==='NETCDF'){await host.getByRole('button',{name:'temperaturevariable',exact:true}).click();await host.getByRole('gridcell').first().waitFor();assert.ok(await host.getByRole('gridcell').count()>0);}
    else if(witness==='SQLITE'){await host.getByRole('button',{name:/^users/}).click();await host.getByRole('gridcell').filter({hasText:/^Alice$/}).waitFor();}
    else if(witness==='DATA'){if(file.endsWith('.parquet')){await host.getByRole('button',{name:'Expand Rows',exact:true}).click();await host.getByRole('button',{name:'Row group 1table',exact:true}).click();}await host.getByRole('gridcell').first().waitFor();assert.ok((await host.locator('.csv-grid').innerText()).length>0);}
    else if(witness==='ARCHIVE'){assert.ok(await host.locator('.archive-row').count()>0);}
    else if(witness==='SUBTITLE'){assert.ok(await host.getByRole('listitem').count()>0);}
    else if(witness==='TSV'){assert.ok(await host.getByRole('gridcell').count()>0);}
    else if(witness==='SOURCE'){assert.ok(await host.locator('.text-row').count()>0);}
    else await host.getByText(witness,{exact:false}).first().waitFor();
    if(file.endsWith('basic.ts')){await host.getByRole('button',{name:'View as Hex',exact:true}).click();await host.locator('[role=gridcell][data-offset="0"]').first().waitFor();assert.equal(await host.locator('[role=gridcell][data-offset="0"]').first().innerText(),fs.readFileSync(file)[0].toString(16).padStart(2,'0').toUpperCase());record.actual_capabilities.push('explicit Hex reads exact source byte');}
    await page.getByRole('button',{name:'Close Tab',exact:true}).click();await host.waitFor({state:'detached'});record.test_result='passed';record.actual_capabilities.push('content detection','routing','actual preview','close');
   }catch(e){record.error=e.stack;process.exitCode=1;}
   record.elapsed_ms=Date.now()-started;results.push(record);console.log(record.test_result,file,record.error?.split('\n')[0]||'');
  }
 }finally{fs.writeFileSync('docs/qa/module-23-format-evidence.json',JSON.stringify({run_id:'module23-browser-'+new Date().toISOString(),results,errors},null,2));await browser.close();if(errors.length)process.exitCode=1;}
})();
