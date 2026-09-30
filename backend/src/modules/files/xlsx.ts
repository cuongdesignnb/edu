import yauzl from 'yauzl';
import ExcelJS from 'exceljs';
import { Problem } from '../../common/problem';

// Inspect the ZIP before allowing a workbook parser to allocate its contents.
// No archive entries are extracted to caller-controlled filesystem paths.
export async function inspectXlsx(filename:string){
  const zip=await new Promise<yauzl.ZipFile>((resolve,reject)=>yauzl.open(filename,{lazyEntries:true,validateEntrySizes:true},(error,zip)=>error||!zip?reject(error):resolve(zip)));
  let entries=0,bytes=0,sheets=0,workbook=false;
  try{
    while(true){
      const next=new Promise<yauzl.Entry|undefined>((resolve,reject)=>{
        const clean=()=>{zip.off('entry',entry);zip.off('end',end);zip.off('error',error);};
        const entry=(value:yauzl.Entry)=>{clean();resolve(value);};
        const end=()=>{clean();resolve(undefined);};const error=(e:Error)=>{clean();reject(e);};
        zip.once('entry',entry);zip.once('end',end);zip.once('error',error);zip.readEntry();
      });
      const entry=await next;if(!entry)break;
      entries++;bytes+=entry.uncompressedSize;
      if(entries>1000||bytes>100*1024*1024||entry.uncompressedSize>20*1024*1024||(entry.generalPurposeBitFlag&1)
        ||entry.fileName.includes('..')||entry.fileName.startsWith('/')||/externalLinks|vbaProject|embeddings|activeX/i.test(entry.fileName))
        throw new Problem(422,'XLSX_CONTAINER_REJECTED');
      if(entry.fileName.endsWith('/'))continue;
      if(!/\.(xml|rels)$/.test(entry.fileName))throw new Problem(422,'XLSX_CONTAINER_REJECTED');
      const stream=await new Promise<NodeJS.ReadableStream>((resolve,reject)=>zip.openReadStream(entry,(error,stream)=>error||!stream?reject(error):resolve(stream)));
      const chunks:Buffer[]=[];let actual=0;
      for await(const chunk of stream){actual+=(chunk as Buffer).length;if(actual>entry.uncompressedSize||actual>20*1024*1024)throw new Problem(422,'XLSX_CONTAINER_REJECTED');chunks.push(chunk as Buffer);}
      const xml=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
      if(/<!DOCTYPE|<!ENTITY|<(?:[\w.-]+:)?f(?:\s|>)/i.test(xml)||(/\.rels$/.test(entry.fileName)&&/TargetMode\s*=\s*["']External["']/i.test(xml)))throw new Problem(422,'XLSX_ACTIVE_CONTENT_REJECTED');
      if(entry.fileName==='xl/workbook.xml')workbook=true;
      if(/^xl\/worksheets\/sheet\d+\.xml$/.test(entry.fileName)){
        sheets++;
        if((xml.match(/<(?:[\w.-]+:)?row\b/g)??[]).length>5001||(xml.match(/<(?:[\w.-]+:)?c\b/g)??[]).length>250050)throw new Problem(422,'IMPORT_LIMIT_EXCEEDED');
        for(const match of xml.matchAll(/\b(?:r|ref)\s*=\s*["']([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?["']/g)){
          const column=(letters:string)=>[...letters].reduce((value,char)=>value*26+char.charCodeAt(0)-64,0);
          if(column(match[1]!)>50||Number(match[2])>5001||(match[3]&&column(match[3])>50)||(match[4]&&Number(match[4])>5001))throw new Problem(422,'IMPORT_LIMIT_EXCEEDED');
        }
      }
    }
    if(!workbook||sheets!==1)throw new Problem(422,'XLSX_SHEET_LIMIT');
  }finally{zip.close();}
}
export async function readXlsx(filename:string){
  await inspectXlsx(filename);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(filename);
  const sheet=workbook.worksheets[0];
  if(!sheet||workbook.worksheets.length!==1||sheet.rowCount>5001||sheet.columnCount>50)throw new Problem(422,'IMPORT_LIMIT_EXCEEDED');
  const rows:string[][]=[];
  sheet.eachRow({includeEmpty:false},row=>{
    const values:string[]=[];
    for(let column=1;column<=sheet.columnCount;column++){
      const cell=row.getCell(column),value=cell.value;
      if(value&&typeof value==='object'&&'formula' in value)throw new Problem(422,'XLSX_ACTIVE_CONTENT_REJECTED');
      values.push(value instanceof Date?value.toISOString().slice(0,10):cell.text);
    }
    rows.push(values);
  });return rows;
}
