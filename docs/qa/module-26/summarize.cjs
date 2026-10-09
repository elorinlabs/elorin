const fs=require('fs'),path=require('path');const root=__dirname,read=n=>JSON.parse(fs.readFileSync(path.join(root,n+'.json'),'utf8')),fmt=n=>Number(n).toFixed(2),mib=n=>fmt(n/1048576);
const before=read('before-csv-profile'),after=read('after-csv-profile'),native=read('report'),idle=read('panel-idle');
if([before,after,native,idle].some(r=>r.status!=='passed'))throw Error('Cannot summarize a failed run');
let s='# Module 26 最终测量\n\nCSV：1366×768 CDP 视口、4× CPU、索引完成、一万数据行×32列、三轮各180帧。P95≤33ms未达标，不能宣称整体性能改善。\n\n|版本/轮次|P50 ms|P95 ms|>33ms比例|布局矩形读取|表格DOM节点|\n|---|---:|---:|---:|---:|---:|\n';
for(const [label,r] of [['Module25',before],['Module26',after]])r.runs.forEach((x,i)=>s+=`|${label}/${i+1}|${fmt(x.p50)}|${fmt(x.p95)}|${fmt(x.longFrameRatio*100)}%|${x.layoutRectReads}|${x.nodes}|\n`);
s+='\n## 原生稳定空闲\n\n每组排除10秒转换期；CPU秒为应用及子进程累计，内存为工作集汇总。\n\n|状态|稳定秒|累计CPU秒|工作集MiB 前→后|进程 前→后|\n|---|---:|---:|---:|---:|\n';
for(const x of [...native.cpu,idle.cpu]){if(x.stableSeconds<60)throw Error('Sample under 60 seconds');s+=`|${x.label}|${fmt(x.stableSeconds)}|${fmt(x.cpuSeconds)}|${mib(x.memoryBefore)} → ${mib(x.memoryAfter)}|${x.processesBefore} → ${x.processesAfter}|\n`;}
s+=`\n独立双面板回归监听器净变化：${idle.listenerGrowth}；无持续增长。打开/关闭循环后的滚动覆盖层数量 ${native.resourcesBefore.overlays} → ${native.resourcesAfter.overlays}，面板 ${native.resourcesBefore.panels} → ${native.resourcesAfter.panels}。退出残留进程：${JSON.stringify(native.processesRemaining)}。\n\n最终 QA EXE SHA-256：\`${native.executableSha256}\`。CSV 改后 EXE：\`${after.executableSha256}\`。个人正式配置校验未变：${native.personalDataUnchanged}；冻结安装包未变：${native.frozenInstallerUnchanged}。\n\n原生交互断言通过，但该状态不代表CSV性能阈值已达标。多屏、系统DPI150%/200%、物理高对比度未验证。\n`;
fs.writeFileSync(path.join(root,'measurements.md'),s);
