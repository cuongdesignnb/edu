import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {inspectOfficeDocument} from '../../dist/modules/files/office.js';

function crc32(bytes){let n=0xffffffff;for(const byte of bytes){n^=byte;for(let bit=0;bit<8;bit++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;}
function archive(files){const locals=[],central=[];let offset=0;for(const [name,value]of Object.entries(files)){const filename=Buffer.from(name),bytes=Buffer.from(value),crc=crc32(bytes),local=Buffer.alloc(30),entry=Buffer.alloc(46);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(filename.length,26);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(bytes.length,20);entry.writeUInt32LE(bytes.length,24);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(offset,42);const chunk=Buffer.concat([local,filename,bytes]);locals.push(chunk);central.push(Buffer.concat([entry,filename]));offset+=chunk.length;}const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(central.length,8);end.writeUInt16LE(central.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,directory,end]);}
const types={docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'};
test('passive OOXML class documents accept exact main type and reject active relationships, formula fields and unsafe archives',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'edu-passive-office-'));
 try{let i=0;for(const kind of ['docx','xlsx']){
  const main=kind==='docx'?'word/document.xml':'xl/workbook.xml',base={'[Content_Types].xml':`<Types><Override PartName="/${main}" ContentType="${types[kind]}"/></Types>`,[main]:kind==='docx'?'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Học sinh tổng hợp</w:t></w:r></w:p></w:body></w:document>':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>'};
  const check=async files=>{const file=path.join(root,`${i++}.${kind}`);await fs.writeFile(file,archive(files));return inspectOfficeDocument(file,kind);};await check(base);
  for(const files of [{...base,'_rels/.rels':'<Relationship TargetMode="External" Target="https://external.invalid"/>'},{...base,[main]:'<!DOCTYPE document [<!ENTITY x SYSTEM "file:///private">]><document/>'},{...base,[main]:'<document><w:instrText>DDE dangerous</w:instrText></document>'},{...base,[main]:'<worksheet><f>HYPERLINK("https://external.invalid")</f></worksheet>'},{...base,'word/vbaProject.bin':'macro'},{...base,'../traversal.xml':'<document/>'},{...base,'[Content_Types].xml':'<Types><Override ContentType="application/x-invalid"/></Types>'}])await assert.rejects(check(files));
 }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
