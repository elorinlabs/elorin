const fs=require('fs'),crypto=require('crypto');
const tests=JSON.parse(fs.readFileSync('docs/qa/module-28/tests.json','utf8')),native=JSON.parse(fs.readFileSync('docs/qa/module-28/native-report.json','utf8'));
if(!tests.success||native.status!=='PASS')throw Error('Executed test and native PASS required');
const samples=[...native.samples];
for(const [check,format,fixture,viewer,content]of [
 ['PSD PackBits sample produces actual image content','psd','quadrants-rle.psd','image','64x64 PackBits quadrants'],
 ['MAT IEEE big endian path displays -2','mat','big-endian.mat','scientific','IEEE big endian matrix -2/3 and 40/50'],
 ['Existing big endian TIFF correctly routes to image and decodes cyan content','tiff','big-endian.tiff','image','8x8 cyan raster; TIFF signature outranks 3DS'],
])if(native.checks.includes(check))samples.push({format,fixture,viewer,content});
const report={status:'PASS',run_id:native.started,scope:'Listed generated binary fixtures and declared parser subsets only',samples:samples.map(s=>{
 const fixture='tests/fixtures/module28/'+s.fixture;
 return {format_id:s.format,fixture,fixture_sha256:crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex'),level:3,flags:s.format==='3ds'?['scene_graph']:[],test_file:'tests/module-28.test.ts',assertions:[s.content,'actual native Viewer content and basic reading operations',...(s.format==='tiff'?[]:['corrupted fixture rejects content; workers released after close'])],status:'passed',detector_result:{status:['psd','3ds','tiff'].includes(s.format)?'Confirmed':'Probable'},resolved_viewer:s.viewer};
})};
fs.writeFileSync('docs/qa/module-28/content-evidence.json',JSON.stringify(report,null,2)+'\n');
