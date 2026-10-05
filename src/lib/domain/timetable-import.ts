export const SUPPORTED_TIMETABLE_EXTENSIONS=['xlsx','xls','xlsm','csv','ods'] as const;
export type SpreadsheetSheet={name:string;rows:string[][]};
export type ImportRow={key:string;classLabel:string;weekday:number;period:number;session:'morning'|'afternoon'|'unspecified';raw:string;subjectAlias:string;teacherAlias:string;roomAlias:string;ignored:boolean};
export type ParsedTimetable={mode:'MATRIX'|'NORMALIZED'|'MANUAL';effectiveDate:string|null;rows:ImportRow[];headerRows:number[]};
export const normalizeAlias=(value:string)=>value.trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
const header=(value:string)=>normalizeAlias(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
const day=(value:string,iso=false)=>{const original=header(value),names=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];const named=names.findIndex(n=>original===n||original===n.slice(0,3));if(named>=0)return named+1;const s=original.replace(/^(thu|t)\s*/,'');if(['cn','chu nhat'].includes(s))return 7;const n=Number(s);return Number.isInteger(n)&&n>=(iso?1:2)&&n<=7?n-(iso?0:1):0;};
function effectiveDate(rows:string[][]){for(const row of rows.slice(0,30)){const s=header(row.join(' ')),a=s.match(/ngay\s+(\d{1,2})\s+thang\s+(\d{1,2})\s+nam\s+(\d{4})/),b=s.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/),c=s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);const m=a??b,date=m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:c?.[0];if(date&&Number.isFinite(Date.parse(date))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date)return date;}return null;}
export function parseTimetableSheet(sheet:SpreadsheetSheet,manual?:{headerRow:number;classColumn:number;dayColumn:number;periodColumn:number;subjectColumn:number;teacherColumn:number;roomColumn:number}):ParsedTimetable{
 const rows=sheet.rows,result:ImportRow[]=[],headerRows:number[]=[];let session:ImportRow['session']='unspecified',weekday=0,isoWeekday=false,columns:{classLabel:string;column:number}[]=[],dayColumn=-1,periodColumn=-1;
 const push=(classLabel:string,d:string,p:string,raw:string,subject?:string,teacher?:string,room='')=>{
  const mapped=day(d,isoWeekday);if(mapped)weekday=mapped;else if(d.trim())weekday=0;const period=Number(p);if(!weekday||!Number.isInteger(period)||period<1||period>12||!raw.trim())return;
  const split=raw.split(/\s*[-–—]\s*/);
  result.push({key:`${sheet.name}:${result.length}`,classLabel:classLabel.trim().replace(/\s*\([^)]*\)\s*$/,''),weekday,period,session,raw:raw.trim(),subjectAlias:(subject??split[0]??'').trim(),teacherAlias:(teacher??split.slice(1).join('-')??'').trim(),roomAlias:room.trim(),ignored:['nghi','trong','-'].includes(header(raw))});
 };
 if(manual){for(const r of rows.slice(manual.headerRow+1))push(r[manual.classColumn]??'',r[manual.dayColumn]??'',r[manual.periodColumn]??'',r[manual.subjectColumn]??'',r[manual.subjectColumn]??'',r[manual.teacherColumn]??'',r[manual.roomColumn]??'');return {mode:'MANUAL',rows:result,headerRows:[manual.headerRow],effectiveDate:effectiveDate(rows)};}
 let mode:ParsedTimetable['mode']='MATRIX',normalized:{classColumn:number;subjectColumn:number;teacherColumn:number;roomColumn:number}|null=null;
 for(let index=0;index<rows.length;index++){
  const row=rows[index],keys=row.map(header),text=keys.join(' ');if(text.includes('buoi sang'))session='morning';if(text.includes('buoi chieu'))session='afternoon';
  const di=keys.findIndex(k=>['thu','weekday','day'].includes(k)),pi=keys.findIndex(k=>['tiet','period'].includes(k));
  if(di>=0&&pi>=0){headerRows.push(index);dayColumn=di;periodColumn=pi;weekday=0;isoWeekday=keys[di]!=='thu';
   const ci=keys.findIndex(k=>['lop','class'].includes(k)),si=keys.findIndex(k=>['mon','mon hoc','subject'].includes(k)),ti=keys.findIndex(k=>['giao vien','teacher'].includes(k)),ri=keys.findIndex(k=>['phong','room'].includes(k));
   if(ci>=0&&si>=0&&ti>=0){normalized={classColumn:ci,subjectColumn:si,teacherColumn:ti,roomColumn:ri};mode='NORMALIZED';}
   else{normalized=null;columns=row.map((classLabel,column)=>({classLabel,column})).filter(x=>x.column>Math.max(di,pi)&&/^\d{1,2}\s*[a-z]/i.test(x.classLabel.trim()));}
   continue;
  }
  if(dayColumn<0)continue;
  if(normalized)push(row[normalized.classColumn]??'',row[dayColumn]??'',row[periodColumn]??'',row[normalized.subjectColumn]??'',row[normalized.subjectColumn]??'',row[normalized.teacherColumn]??'',row[normalized.roomColumn]??'');
  else for(const col of columns)push(col.classLabel,row[dayColumn]??'',row[periodColumn]??'',row[col.column]??'');
 }
 return {mode,rows:result,headerRows,effectiveDate:effectiveDate(rows)};
}
export type ImportSettings={version:number;aliases:{subjects:Record<string,string>;teachers:Record<string,string>};periodTimes:Record<string,{start:string;end:string}>};
export function resolveTimetableRows(rows:ImportRow[],options:{classes:{id:string;name:string}[];subjects:{id:string;name:string}[];teachers:{id:string;name:string}[];rooms:{id:string;name:string}[]},settings:ImportSettings,classMapping:Record<string,string>={}){
 const exact=(list:{id:string;name:string}[],alias:string)=>{const found=list.filter(x=>normalizeAlias(x.name)===normalizeAlias(alias));return found.length===1?found[0]!.id:'';};
 const used=new Set<string>();
 return rows.map(r=>{
  const classId=classMapping[r.classLabel]??exact(options.classes,r.classLabel),subjectId=settings.aliases.subjects[normalizeAlias(r.subjectAlias)]??exact(options.subjects,r.subjectAlias),memberId=settings.aliases.teachers[normalizeAlias(r.teacherAlias)]??exact(options.teachers,r.teacherAlias),roomId=r.roomAlias?exact(options.rooms,r.roomAlias):null;
  const time=settings.periodTimes[`${r.session}:${r.period}`]??settings.periodTimes[`unspecified:${r.period}`];
  const periodNumber=r.session==='afternoon'&&r.period<=5?r.period+5:r.period,key=`${classId}:${r.weekday}:${periodNumber}`;
  const special=['shdc','sinh hoat'].includes(header(r.subjectAlias));
  const status=r.ignored||classId==='IGNORE'?'IGNORED':!classId?'CLASS_NEEDS_MAPPING':special&&(!subjectId||!memberId)?'SPECIAL_NEEDS_MAPPING':!subjectId?'SUBJECT_NEEDS_MAPPING':!memberId?'TEACHER_NEEDS_MAPPING':!time||time.start>=time.end?'PERIOD_TIME_MISSING':r.roomAlias&&!roomId?'ROOM_NEEDS_MAPPING':used.has(key)?'CONFLICT':'MATCHED';
  if(status==='MATCHED')used.add(key);
  return {...r,status,classId,entry:{weekday:r.weekday,periodNumber,subjectId,memberId,roomId,startsAtLocal:time?.start??'',endsAtLocal:time?.end??''}};
 });
}
