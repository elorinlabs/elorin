const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const root=path.resolve('test-fixtures/binary');fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(path.join(root,'tiny.bin'),Buffer.from([0,1,2,0x7f,0x80,0xff,65,66,67,0xc3,0xa9,0,0,0,0,0]));
fs.writeFileSync(path.join(root,'empty.bin'),Buffer.alloc(0));
const records=[];
for(const [name,size] of [['100mb.bin',100*1024**2],['1gb.bin',1024**3],['5gb.bin',5*1024**3]]){
 const file=path.join(root,name);fs.writeFileSync(file,Buffer.alloc(0));
 if(process.platform==='win32')execFileSync('fsutil.exe',['sparse','setflag',file],{windowsHide:true,stdio:'pipe'});
 const fd=fs.openSync(file,'r+');try{fs.ftruncateSync(fd,size);fs.writeSync(fd,Buffer.from([0,255,128]),0,3,0);fs.writeSync(fd,Buffer.from([0xde,0xad,0xbe,0xef]),0,4,65535);const text=Buffer.from('Elorin é','utf8');fs.writeSync(fd,text,0,text.length,32);fs.writeSync(fd,Buffer.from([0xde,0xad,0xbe,0xef]),0,4,size-4);}finally{fs.closeSync(fd);}
 let allocated='Sparse file (allocation not measured on this platform)',allocatedBytes;
 if(process.platform==='win32'){allocated=new TextDecoder('gbk').decode(execFileSync('fsutil.exe',['sparse','queryrange',file],{windowsHide:true}));const values=[...allocated.matchAll(/0x([\da-f]+)/ig)].map(m=>parseInt(m[1],16));allocatedBytes=values.filter((_,i)=>i%2===1).reduce((a,b)=>a+b,0);}
 records.push({name,size,allocatedBytes,allocatedRanges:allocated});
}
fs.mkdirSync('docs/qa',{recursive:true});fs.writeFileSync('docs/qa/module-18-sparse-fixtures.json',JSON.stringify({platform:process.platform,files:records},null,2));console.log(records);
