import type { ContentAdapter, RangeInput } from '../../../formats/content-adapter';
import type { DataNode, DataPage, DataRequest } from './types';
import { dataCell } from './precision';
const widths=[8,4,4,2,2,1],names=['float64','float32','int32','int16','uint16','uint8'];
interface Matrix {node:DataNode;offset:number;rows:number;cols:number;width:number;type:number;little:boolean;imaginary:boolean}
/** MAT Level 4 full numeric matrices. No scripts, objects, sparse payloads or evaluation. */
export class Mat4Reader {
  nodes:DataNode[]=[];private matrices=new Map<string,Matrix>();
  constructor(private input:RangeInput){}
  private async read(at:number,n:number){const bytes=await this.input.read(at,n);if(bytes.length!==n)throw Error('Source Changed: truncated MAT range');return bytes;}
  async open(){
    const size=this.input.size;if(!Number.isSafeInteger(size)||size<20)throw Error('Corrupted File: MAT header');
    let at=0;
    while(at<size){
      if(this.nodes.length>=128)throw Error('Resource Limit Exceeded: MAT matrix count');
      if(size-at<20)throw Error('Corrupted File: MAT matrix header');
      const b=await this.read(at,20),v=new DataView(b.buffer,b.byteOffset,b.byteLength);
      if(at===0&&new TextDecoder().decode(b).startsWith('MATLAB'))throw Error('UnsupportedFormat: MAT Level 5; use Level 4 or HDF5/v7.3');
      const valid=(little:boolean)=>{const code=v.getInt32(0,little);return code>=0&&code<2000&&Math.floor(code/1000)===(little?0:1)&&Math.floor(code/100)%10===0&&Math.floor(code/10)%10<=5&&code%10<=2;};
      const little=valid(true);if(!little&&!valid(false))throw Error('UnsupportedFormat: MAT machine/header type');
      const code=v.getInt32(0,little),type=Math.floor(code/10)%10,rows=v.getInt32(4,little),cols=v.getInt32(8,little),imag=v.getInt32(12,little),nameLength=v.getInt32(16,little);
      if(code%10!==0)throw Error('UnsupportedFormat: MAT text/sparse matrix');
      if(rows<0||cols<0||![0,1].includes(imag)||nameLength<2||nameLength>256||at+20+nameLength>size)throw Error('Corrupted File: MAT dimensions/name');
      const width=widths[type],elements=BigInt(rows)*BigInt(cols),offset=at+20+nameLength,end=BigInt(offset)+elements*BigInt(width)*BigInt(imag+1);
      if(end>BigInt(size))throw Error('Corrupted File: MAT matrix payload');
      const nameBytes=await this.read(at+20,nameLength);
      if(nameBytes.at(-1)!==0||nameBytes.subarray(0,-1).some(b=>b<32||b>126))throw Error('Corrupted File: MAT variable name');
      const name=new TextDecoder().decode(nameBytes.subarray(0,-1)),id=`matrix:${this.nodes.length}`;
      const node:DataNode={id,name,kind:'dataset',rows,shape:[rows,cols],metadata:{version:'Level 4',dtype:names[type],shape:[rows,cols],endianness:little?'Little Endian':'Big Endian',complex:!!imag,order:'column-major',readOnly:true}};
      this.nodes.push(node);this.matrices.set(id,{node,offset,rows,cols,width,type,little,imaginary:!!imag});at=Number(end);
    }
    return this.nodes;
  }
  describe(id:string){const m=this.matrices.get(id);if(!m)throw Error('Invalid Structure: MAT matrix identity');return m.node;}
  async page(r:DataRequest):Promise<DataPage>{
    const m=this.matrices.get(r.node);if(!m)throw Error('Invalid Structure: MAT matrix identity');
    // Scientific filters apply only to loaded samples in the existing DataGrid.
    if(!Number.isSafeInteger(r.start)||r.start<0||!Number.isSafeInteger(r.count)||r.count<1||r.count>128||r.columns.length>16||r.columns.some(c=>!Number.isSafeInteger(c)||c<0||c>=m.cols)||r.fixed?.some(n=>n!==0))throw Error('Invalid Structure: MAT page');
    const count=Math.min(r.count,Math.max(0,m.rows-r.start)),values=Array.from({length:count},()=>Array(r.columns.length));
    for(let c=0;c<r.columns.length;c++){
      const offset=m.offset+(r.columns[c]*m.rows+r.start)*m.width;
      if(!count)continue;
      const b=await this.read(offset,count*m.width),v=new DataView(b.buffer,b.byteOffset,b.byteLength);
      const ib=m.imaginary?await this.read(offset+m.rows*m.cols*m.width,count*m.width):undefined,iv=ib&&new DataView(ib.buffer,ib.byteOffset,ib.byteLength);
      for(let row=0;row<count;row++){const real=this.value(v,row*m.width,m),value=iv?{r:real,i:this.value(iv,row*m.width,m)}:real;values[row][c]=dataCell(value,names[m.type]);}
    }
    return {start:r.start,columns:r.columns,values,hasMore:r.start+count<m.rows,rows:m.rows};
  }
  private value(v:DataView,at:number,m:Matrix){switch(m.type){case 0:return v.getFloat64(at,m.little);case 1:return v.getFloat32(at,m.little);case 2:return v.getInt32(at,m.little);case 3:return v.getInt16(at,m.little);case 4:return v.getUint16(at,m.little);default:return v.getUint8(at);}}
}
export const mat4Adapter:ContentAdapter<RangeInput,Mat4Reader>={id:'mat-level4',formats:['mat'],async parse(input){const reader=new Mat4Reader(input);await reader.open();return reader;}};
