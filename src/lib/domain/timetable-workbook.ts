import * as XLSX from 'xlsx';
import type {SpreadsheetSheet} from './timetable-import';

/** Decode cached spreadsheet values only; never execute formulas or macros. */
export function decodeTimetableWorkbook(buffer:ArrayBuffer):SpreadsheetSheet[]{
 const bytes=new Uint8Array(buffer);if(bytes.length>5*1024*1024)throw new Error('Tệp tối đa 5 MB');
 if(bytes[0]===0x50&&bytes[1]===0x4b){
  const view=new DataView(buffer);let total=0,entries=0;
  for(let i=0;i+46<bytes.length;i++){if(view.getUint32(i,true)!==0x02014b50)continue;const size=view.getUint32(i+24,true);total+=size;entries++;if(size>16*1024*1024||total>32*1024*1024||entries>2000)throw new Error('Workbook vượt giới hạn giải nén');}
 }
 const book=XLSX.read(bytes,{type:'array',codepage:65001,sheetRows:1001,cellFormula:false,cellHTML:false,cellStyles:false,bookVBA:false});
 if(book.SheetNames.length>20)throw new Error('Tối đa 20 sheet');
 return book.SheetNames.map(name=>{const sheet=book.Sheets[name]!;const range=XLSX.utils.decode_range(sheet['!ref']??'A1');if(range.e.c>99||range.e.r>999)throw new Error('Mỗi sheet tối đa 100 cột và 1000 dòng');return {name,rows:XLSX.utils.sheet_to_json<string[]>(sheet,{header:1,raw:false,defval:'',blankrows:true})};});
}
