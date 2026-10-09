const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const [operation,id,installer,archive,commit]=process.argv.slice(2);
if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(id||''))throw Error('Supply a safe candidate ID');
const folder=path.resolve(__dirname,'../releases/candidates'),manifest=path.join(folder,id+'.json');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(operation==='verify'){
 const value=JSON.parse(fs.readFileSync(manifest,'utf8'));
 if(hash(installer)!==value.installerSha256)throw Error('Frozen installer hash mismatch');
 console.log(id+': verified '+value.installerSha256);
}else if(operation==='register'){
 if(fs.existsSync(manifest))throw Error('Candidate ID already registered');
 if(!archive)throw Error('Supply an archive directory outside the project');
 const source=path.resolve(installer),destination=path.resolve(archive,id),root=path.resolve(__dirname,'..');
 const relative=path.relative(root,destination);
 if(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))throw Error('Archive must be outside the project');
 let verifiedCommit=null;
 if(commit)verifiedCommit=execFileSync('git',['rev-parse','--verify',commit+'^{commit}'],{cwd:root,encoding:'utf8'}).trim();
 fs.mkdirSync(destination,{recursive:true});const copy=path.join(destination,path.basename(source));
 fs.copyFileSync(source,copy,fs.constants.COPYFILE_EXCL);
 const sha=hash(source);if(hash(copy)!==sha)throw Error('Archive copy mismatch');
 const value={candidateId:id,installerName:path.basename(source),installerSha256:sha,sourceCommit:verifiedCommit,sourceProvenance:verifiedCommit?'Caller attests verified build provenance':'UNKNOWN: installer predates Git import; no proven source mapping',registeredAt:new Date().toISOString(),buildDate:null,buildConfiguration:null,testEnvironment:'Independent Windows 11 x64 VM with isolated clean application data',limitations:['Not formal release acceptance','Do not overwrite the frozen installer','Fill build metadata only from verified build evidence']};
 fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(manifest,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({manifest,archive:copy,sha256:sha}));
}else throw Error('Use register or verify');
