const {chromium}=require(process.env.PRISM_PLAYWRIGHT);
(async()=>{const b=await chromium.connectOverCDP('http://127.0.0.1:9223');const p=b.contexts()[0].pages()[0];p.on('dialog',d=>d.accept()); await p.reload();await p.getByRole('button',{name:'Open File',exact:true}).click();await b.close();})();
