import { t as tr, useUiLanguage as useLocale } from "../i18n";
import {useMemo,useState} from 'react';
import {GridSurface} from '../viewer/shared/GridSurface';
import type {CsvSelection} from '../viewer/plugins/csv/csv-types';
import {Button} from '../components/common/ui';
import '../viewer/plugins/csv/csv.css';
/** QA-only synthetic random-access source. It allocates no array proportional to row count. */
export function VirtualGridFixture(){
  useLocale();
 const count=2**31;
 const model=useMemo(()=>({columns:[{id:'row',name:'Logical row',width:500}],rowSource:{count,get:(row:number)=>[String(row)]}}),[]);
 const [selection,select]=useState<CsvSelection>({kind:'none'}),[scroll,save]=useState({top:0,left:0}),[navigation,navigate]=useState(0);
 return <><p>{tr("QA · 2,147,483,648 logical rows · existing GridSurface · bounded DOM")}</p><Button onClick={()=>{select({kind:'cell',row:count-1,column:0,columnId:'row',rawValue:String(count-1),parsedValue:count-1});navigate(v=>v+1);}}>{tr("Go final logical row")}</Button><div style={{height:260,display:'flex',marginTop:12}}><GridSurface label={tr("Huge virtual grid")} model={model} header={false} selection={selection} select={value=>{select(value);navigate(v=>v+1);}} widths={{}} resize={()=>{}} scroll={scroll} saveScroll={(top,left)=>save({top,left})} navigation={navigation} inspect={()=>{}}/></div></>;
}
