import type { DataNode, DataPage, DataRequest } from './types';
import { dataCell } from './precision';
import { gridSlice } from './slice';
/** NPY literal header only. Object/pickle and structured dtypes never execute or decode. */
export class NpyReader {
  node!: DataNode; offset=0; width=0; kind=''; little=true; fortran=false;
  constructor(private read: (at:number,n:number)=>Promise<Uint8Array>,private size:number){}
  async open() {
    const prefix=await this.read(0,Math.min(12,this.size));
    if(prefix.length<10||prefix[0]!==147||new TextDecoder().decode(prefix.subarray(1,6))!=='NUMPY')throw Error('Corrupted File: NPY signature');
    const version=prefix[6],start=version===1?10:12;
    if(![1,2,3].includes(version)||prefix[7]!==0||prefix.length<start)throw Error('Recognized but Unsupported: NPY version');
    const v=new DataView(prefix.buffer,prefix.byteOffset,prefix.byteLength),length=version===1?v.getUint16(8,true):v.getUint32(8,true);
    if(length>65536||length<1||start+length>this.size)throw Error('Resource Limit Exceeded: NPY header');
    const header=new TextDecoder(version===3?'utf-8':'latin1',{fatal:true}).decode(await this.read(start,length));
    const descr=/['"]descr['"]\s*:\s*['"]([^'"]+)['"]/.exec(header),order=/['"]fortran_order['"]\s*:\s*(True|False)/.exec(header),shape=/['"]shape['"]\s*:\s*\(([^)]*)\)/.exec(header);
    if(!descr||!order||!shape)throw Error('Recognized but Unsupported: NPY structured/object header; pickle is disabled');
    const residue=header.replace(descr[0],'').replace(order[0],'').replace(shape[0],'');
    if(!/^\s*\{[\s,]*\}\s*$/.test(residue)||!header.endsWith('\n'))throw Error('Invalid Structure: NPY literal header');
    const dtype=/^([<>=|])([biufc])(1|2|4|8|16)$/.exec(descr[1]);
    if(!dtype)throw Error('Recognized but Unsupported: NPY dtype; object/pickle payload disabled');
    const dims=shape[1].trim().split(',').map(s=>s.trim()).filter(Boolean);
    if(dims.length>32||dims.some(s=>!/^\d{1,20}$/.test(s)))throw Error('Invalid Structure: NPY dimensions');
    let elements=1n;for(const dim of dims){elements*=BigInt(dim);if(elements>((1n<<64n)-1n))throw Error('Resource Limit Exceeded: NPY shape overflow');}
    if(dims.some(s=>BigInt(s)>BigInt(Number.MAX_SAFE_INTEGER)))throw Error('Resource Limit Exceeded: grid dimensions exceed precise Number range');
    this.width=Number(dtype[3]);this.kind=dtype[2];this.little=dtype[1]==='<'||dtype[1]==='='&&new Uint8Array(new Uint16Array([1]).buffer)[0]===1||dtype[1]==='|';this.fortran=order[1]==='True';this.offset=start+length;
    if((this.kind==='f'&&![2,4,8].includes(this.width))||(this.kind==='c'&&![8,16].includes(this.width))||(['b','i','u'].includes(this.kind)&&this.width>8)||(this.kind==='b'&&this.width!==1))throw Error('Recognized but Unsupported: NPY dtype width');
    if(BigInt(this.offset)+elements*BigInt(this.width)!==BigInt(this.size))throw Error('Corrupted File: NPY payload length differs from shape');
    const dimensions=dims.map(Number);
    this.node={id:'array',name:'Array',kind:'dataset',shape:dimensions,rows:dimensions.at(-2)??dimensions[0]??1,metadata:{dtype:descr[1],shape:dimensions,fortranOrder:this.fortran,endianness:this.little?'Little Endian':'Big Endian',payloadOffset:String(this.offset),elements:String(elements),pickle:'disabled',version:`${version}.0`}};
    return [this.node];
  }
  async page(r:DataRequest):Promise<DataPage>{
    if(r.node!=='array'||!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.count)||r.count<1||r.count>128||r.columns.length>16)throw Error('Invalid Structure: NPY page');
    const shape=this.node.shape!,rows=this.node.rows!,cols=shape.length>=2?shape.at(-1)!:1;
    if(r.columns.some(c=>!Number.isSafeInteger(c)||c<0||c>=cols))throw Error('Invalid Structure: NPY column');
    gridSlice(shape,r,this.width,'npy-page');
    const count=Math.min(r.count,Math.max(0,rows-r.start));
    const offsets:{at:number;row:number;col:number}[]=[];
    for(let row=0;row<count;row++)for(let col=0;col<r.columns.length;col++){
      const coords=shape.map((_,i)=>i<shape.length-2?r.fixed?.[i]??0:i===shape.length-2||shape.length===1?r.start+row:r.columns[col]);
      let index=0n,stride=1n;const axes=shape.map((_,i)=>i);if(!this.fortran)axes.reverse();for(const i of axes){index+=BigInt(coords[i])*stride;stride*=BigInt(shape[i]);}
      const at=BigInt(this.offset)+index*BigInt(this.width);if(at>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Resource Limit Exceeded: source offset');offsets.push({at:Number(at),row,col});
    }
    const values=Array.from({length:count},()=>Array(r.columns.length));offsets.sort((a,b)=>a.at-b.at);
    for(let i=0;i<offsets.length;){let end=i+1;while(end<offsets.length&&offsets[end].at-offsets[end-1].at<=4096&&offsets[end].at+this.width-offsets[i].at<=1048576)end++;
      const start=offsets[i].at,buffer=await this.read(start,offsets[end-1].at+this.width-start);if(buffer.byteLength!==offsets[end-1].at+this.width-start)throw Error('Source Changed: truncated NPY range');const v=new DataView(buffer.buffer,buffer.byteOffset,buffer.byteLength);
      for(let n=i;n<end;n++){const item=offsets[n];values[item.row][item.col]=dataCell(this.value(v,item.at-start),this.node.metadata.dtype as string);}i=end;
    }
    return {start:r.start,columns:r.columns,values,hasMore:r.start+count<rows,rows};
  }
  private value(v:DataView,at:number):unknown {
    if(this.kind==='b')return v.getUint8(at)!==0;
    if(this.kind==='c'){const half=this.width/2;return {r:half===4?v.getFloat32(at,this.little):v.getFloat64(at,this.little),i:half===4?v.getFloat32(at+half,this.little):v.getFloat64(at+half,this.little)};}
    if(this.kind==='f'){if(this.width===4)return v.getFloat32(at,this.little);if(this.width===8)return v.getFloat64(at,this.little);const bits=v.getUint16(at,this.little),sign=bits&0x8000?-1:1,exp=(bits>>10)&31,fraction=bits&1023;return exp===31?fraction?NaN:sign*Infinity:exp===0?sign*fraction*2**-24:sign*(1+fraction/1024)*2**(exp-15);}
    const signed=this.kind==='i';if(this.width===8)return signed?v.getBigInt64(at,this.little):v.getBigUint64(at,this.little);if(this.width===4)return signed?v.getInt32(at,this.little):v.getUint32(at,this.little);if(this.width===2)return signed?v.getInt16(at,this.little):v.getUint16(at,this.little);return signed?v.getInt8(at):v.getUint8(at);
  }
}
