import yauzl from 'yauzl';
import {Problem} from '../../common/problem';

/** Bounded, passive OOXML only; never extracts archive-controlled paths. */
export async function inspectOfficeDocument(filename:string,kind:'docx'|'xlsx'){
 const zip=await new Promise<yauzl.ZipFile>((resolve,reject)=>yauzl.open(filename,{lazyEntries:true,validateEntrySizes:true},(error,zip)=>error||!zip?reject(error):resolve(zip)));
 let entries=0,total=0,main=false,manifest=false;const seen=new Set<string>();
 try{while(true){
  const entry=await new Promise<yauzl.Entry|undefined>((resolve,reject)=>{const clean=()=>{zip.off('entry',onEntry);zip.off('end',onEnd);zip.off('error',onError);};const onEntry=(e:yauzl.Entry)=>{clean();resolve(e);},onEnd=()=>{clean();resolve(undefined);},onError=(e:Error)=>{clean();reject(e);};zip.once('entry',onEntry);zip.once('end',onEnd);zip.once('error',onError);zip.readEntry();});if(!entry)break;
  entries++;total+=entry.uncompressedSize;
  if(entries>1000||total>100*1024*1024||entry.uncompressedSize>20*1024*1024||seen.has(entry.fileName)||(entry.generalPurposeBitFlag&1)||entry.fileName.includes('..')||entry.fileName.startsWith('/')||entry.fileName.includes('\\')||/vba|macro|externalLinks|embeddings|activeX|oleObject|customUI|customXml/i.test(entry.fileName))throw new Problem(422,'OFFICE_CONTAINER_REJECTED');seen.add(entry.fileName);
  if(entry.fileName.endsWith('/'))continue;
  if(!/\.(xml|rels|png|jpe?g|gif)$/.test(entry.fileName))throw new Problem(422,'OFFICE_CONTAINER_REJECTED');
  const stream=await new Promise<NodeJS.ReadableStream>((resolve,reject)=>zip.openReadStream(entry,(error,stream)=>error||!stream?reject(error):resolve(stream)));
  const chunks:Buffer[]=[];let bytes=0;for await(const chunk of stream){bytes+=(chunk as Buffer).length;if(bytes>entry.uncompressedSize||bytes>20*1024*1024)throw new Problem(422,'OFFICE_CONTAINER_REJECTED');chunks.push(chunk as Buffer);}
  if(!/\.(xml|rels)$/.test(entry.fileName))continue;
  const xml=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
  if(/<!DOCTYPE|<!ENTITY|TargetMode\s*=\s*["']External["']|<(?:[\w.-]+:)?(?:instrText|fldSimple|f)(?:\s|>)/i.test(xml))throw new Problem(422,'OFFICE_ACTIVE_CONTENT_REJECTED');
  if(entry.fileName==='[Content_Types].xml'){const type=kind==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',name=kind==='docx'?'/word/document.xml':'/xl/workbook.xml';manifest=[...xml.matchAll(/<Override\b([^>]+)\/?\s*>/g)].some(match=>new RegExp('PartName\\s*=\\s*["\']'+name.replaceAll('.','\\.')+'["\']').test(match[1]!)&&match[1]!.includes(type));if(/macroEnabled|vbaProject|oleObject/i.test(xml))throw new Problem(422,'OFFICE_ACTIVE_CONTENT_REJECTED');}
  if(entry.fileName===(kind==='docx'?'word/document.xml':'xl/workbook.xml')){main=kind==='docx'?/<(?:\w+:)?document\b/.test(xml)&&xml.includes('http://schemas.openxmlformats.org/wordprocessingml/2006/main'):/<(?:\w+:)?workbook\b/.test(xml)&&xml.includes('http://schemas.openxmlformats.org/spreadsheetml/2006/main');}
 }
 if(!main||!manifest)throw new Problem(422,'OFFICE_TYPE_REJECTED');
 }finally{zip.close();}
}
