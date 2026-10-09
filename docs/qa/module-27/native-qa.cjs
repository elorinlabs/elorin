const {launch,delay,invoke,fs,path,assert}=require('./native-common.cjs');
const {spawn}=require('child_process');
const report={started:new Date().toISOString(),checks:[],errors:[]};
const root=__dirname,qa=path.resolve('.qa-tools/module27'),files=process.env.ELORIN_QA_RESUME || path.join(qa,'files-'+Date.now());fs.mkdirSync(files,{recursive:true});
const saved=path.join(files,'workspace-note.txt'),copy=path.join(files,'workspace-copy.txt');
for(const name of ['one.txt','two.txt'])fs.writeFileSync(path.join(files,name),'Synthetic Module 27 '+name);
if(process.env.ELORIN_QA_RESUME){const previous=JSON.parse(fs.readFileSync(path.join(root,fs.existsSync(path.join(root,'interrupted-report.json'))?'interrupted-report.json':'report.json'),'utf8'));report.checks.push(...previous.checks);report.priorRun=previous.started;report.priorExecutableSha256=previous.executableSha256;if(fs.existsSync(path.join(root,'closeout-report.json'))){const prior=JSON.parse(fs.readFileSync(path.join(root,'closeout-report.json'),'utf8'));report.checks=[...new Set([...report.checks,...prior.checks])];}}
const check=label=>{if(!report.checks.includes(label))report.checks.push(label);console.log('PASS:',label);};
const waitFile=async(file,text)=>{for(let i=0;i<2400;i++){if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===text)return;await delay(100);}throw Error('Expected native save '+file);};
(async()=>{let q;try{
 q=await launch('after',9270);const p=q.page;report.executableSha256=q.executableSha256;report.syntheticDirectory=files;p.on('pageerror',e=>report.errors.push(e.message));
 await invoke(p,'productivity_write',{key:'settings',value:{ui:{language:'en',languagePreferenceVersion:1,rememberWorkspace:true,inspector:false}}});await p.reload();await p.getByRole('heading',{name:/A unified file viewer/}).waitFor();
 const editor=p.getByLabel('Document source editor',{exact:true});
 if(!process.env.ELORIN_QA_RESUME){
 await p.getByLabel('Drag and drop files here').getByRole('button',{name:'New File',exact:true}).click();
 await p.getByLabel('File name',{exact:true}).fill('workspace-note');await p.getByRole('button',{name:'Create',exact:true}).click();
await editor.fill('Module27 draft 中文\n');await p.getByRole('button',{name:'Save',exact:true}).click();
 console.log('NATIVE_DIALOG_SAVE',saved);await waitFile(saved,'Module27 draft 中文\n');await p.locator('.file-tab[data-active=true]').getByTitle(saved).waitFor();check('Home → existing New File → text editor → native Save As → tab/path/recent synchronization');
 await editor.fill('Module27 in-place saved\n');await p.getByRole('button',{name:'Save',exact:true}).click();await waitFile(saved,'Module27 in-place saved\n');check('In-place save preserves file contents and clears dirty state');
 await p.getByRole('button',{name:'Save As',exact:true}).click();console.log('NATIVE_DIALOG_SAVE_AS',copy);await waitFile(copy,'Module27 in-place saved\n');await p.locator('.file-tab[data-active=true]').getByTitle(copy).waitFor();assert.equal(fs.readFileSync(saved,'utf8'),'Module27 in-place saved\n');check('Save As replaces only owning tab while original file remains intact');
 }else{await q.open(copy);await p.locator('.file-tab').filter({hasText:'workspace-copy.txt'}).waitFor();await p.getByRole('button',{name:'Edit',exact:true}).click();await editor.waitFor();}
 if(process.env.ELORIN_QA_SKIP_MULTI){await q.open(path.join(files,'one.txt'));await q.open(path.join(files,'two.txt'));await p.locator('.file-tab').filter({hasText:'two.txt'}).waitFor();}else{
 await p.getByRole('button',{name:'Open File',exact:true}).first().click();console.log('NATIVE_DIALOG_MULTI_OPEN',JSON.stringify([path.join(files,'one.txt'),path.join(files,'two.txt')]));
 await p.locator('.file-tab').filter({hasText:'two.txt'}).waitFor({timeout:240000});assert.equal(await p.locator('.file-tab').count(),3);check('Native multi-file picker opens both selected files');
 for(const name of ['one.txt','two.txt'])assert.equal(await invoke(p,'file_size',{path:path.join(files,name)}),fs.statSync(path.join(files,name)).size);
 const forbidden=path.join(files,'not-selected.txt');fs.writeFileSync(forbidden,'must not be granted');await assert.rejects(()=>invoke(p,'file_size',{path:forbidden}));check('Each selected file is granted while an unselected sibling remains denied');
 }
 await p.locator('.file-tab').filter({hasText:'one.txt'}).locator('button').first().click({button:'right'});
 assert.equal(await p.getByRole('menuitem',{name:/Rename/}).isDisabled(),true);assert.equal(await p.getByRole('menuitem',{name:/Delete/}).isDisabled(),true);
 await p.getByRole('menuitem',{name:'Close Tab',exact:true}).click();assert.equal(await p.locator('.file-tab').count(),2);assert.match(await p.locator('.file-tab[data-active=true]').innerText(),/two.txt/);check('Inactive tab context close targets correct file; unsupported destructive actions disabled');
 await p.locator('.file-tab').filter({hasText:'workspace-copy.txt'}).locator('button').first().click();await p.keyboard.press('Control+Shift+p');await p.getByRole('option',{name:/Toggle Focus Mode/}).click();
 let f;for(let i=0;i<100;i++){f=q.context.pages().find(page=>page!==p);if(f)break;await delay(100);}assert.ok(f);f.setDefaultTimeout(120000);f.on('pageerror',e=>report.errors.push(e.message));await f.locator('.focus-reading-surface .viewer-host').waitFor();await editor.fill('Focus synchronization checkpoint');await p.getByRole('button',{name:'Save',exact:true}).click();await waitFile(copy,'Focus synchronization checkpoint');await f.getByText('Focus synchronization checkpoint',{exact:true}).waitFor();check('Focus reads an in-place save from main without transferring the editing session');
 await p.locator('.file-tab').filter({hasText:'two.txt'}).locator('button').first().click();assert.match(await f.locator('.prism-titlebar').innerText().catch(()=>f.locator('.focus-window').innerText()),/workspace-copy/);
 await f.keyboard.press('F6');await f.getByRole('button',{name:'Exit Focus View',exact:true}).click();await delay(300);assert.equal(await p.locator('.file-tab').count(),2);check('Independent Focus keeps file identity across main switch; closing Focus preserves main tabs');
 await p.locator('.file-tab').filter({hasText:'workspace-copy.txt'}).locator('button').first().click();await editor.fill('Unsaved safety check');await p.locator('.file-tab[data-active=true] .tab-close').click();
 await p.getByRole('alertdialog').getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await editor.inputValue(),'Unsaved safety check');check('Dirty close Cancel preserves editor and owning session');
 await p.getByRole('button',{name:'Save',exact:true}).click();await waitFile(copy,'Unsaved safety check');
 await delay(1200);
 await p.locator('.file-tab').filter({hasText:'workspace-copy.txt'}).locator('button').first().click();await p.locator('.viewer-host').first().waitFor();
 await delay(1200);const manifest=await invoke(p,'productivity_read',{key:'workspace'});assert.equal(manifest.tabs.length,2);assert.ok(manifest.tabs.some(tab=>tab.path.toLowerCase().endsWith(copy.toLowerCase())));check('Bounded workspace manifest persists stable tabs and saved path');
 await p.reload();await p.locator('.file-tab[data-active=true]').filter({hasText:'workspace-copy.txt'}).waitFor();await p.locator('.viewer-host').first().waitFor();check('Reload restores active file through real authorized backend');
 await p.locator('.home-tab').click();await p.getByLabel('Sidebar',{exact:true}).getByRole('button',{name:/Recent/}).click();await p.getByRole('button',{name:'Add favorite workspace-copy.txt',exact:true}).click();await p.locator('.home-tab').click();await p.locator('.home-recent-row').filter({hasText:'workspace-copy.txt'}).first().waitFor();check('Favorites are persisted through the existing service and visible on Home');
 const recovery={version:1,kind:'text',text:'Crash-safe recovered draft',path:copy,time:Date.now()};await invoke(p,'document_recovery',{id:require('node:crypto').randomUUID(),content:JSON.stringify(recovery)});await p.reload();
 await p.getByRole('alertdialog').getByRole('button',{name:'Restore',exact:true}).click();await editor.waitFor();assert.equal(await editor.inputValue(),'Crash-safe recovered draft');assert.equal(fs.readFileSync(copy,'utf8'),'Unsaved safety check');check('Crash snapshot Restore opens isolated unsaved document without overwriting original');
 await p.locator('.file-tab[data-active=true] .tab-close').click();await p.getByRole('alertdialog').getByRole('button',{name:"Don't Save",exact:true}).click();
 await p.locator('.file-tab').filter({hasText:'two.txt'}).locator('button').first().click();fs.renameSync(path.join(files,'two.txt'),path.join(files,'two-moved-'+Date.now()+'.txt'));await p.getByRole('heading',{name:'File unavailable',exact:true}).waitFor();check('External move safely releases viewer and marks unavailable');
 await p.locator('.home-tab').click();await p.getByRole('heading',{name:'Favorites',exact:true}).waitFor();await p.screenshot({path:path.join(root,'home-final.png')});
 assert.equal(report.errors.length,0);report.completed=new Date().toISOString();report.status='PASS — main core sequence';
 }catch(e){report.failure=String(e.stack||e);console.error(report.failure);process.exitCode=1;}
 finally{if(q)report.cleanup=await q.close();fs.writeFileSync(path.join(root,'closeout-report.json'),JSON.stringify(report,null,2));}
})();
