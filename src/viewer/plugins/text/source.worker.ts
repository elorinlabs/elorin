import {analyzeSource} from './source-analysis';
self.onmessage=async ({data}:{data:{text:string;language:string;filename:string}})=>{try{self.postMessage({value:await analyzeSource(data.text,data.language,data.filename)});}catch(error){self.postMessage({error:(error as Error).message});}};
