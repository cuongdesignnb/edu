import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { inspectXlsx,readXlsx } from '../../dist/modules/files/xlsx.js';

test('XLSX parser bounds sparse dimensions and rejects formulas before workbook allocation',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'edumanage-xlsx-')),filename=path.join(folder,'input.xlsx');
  try{
    const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Học sinh');
    sheet.addRow(['code','name']);sheet.addRow(['HS-TEST','Nguyễn Văn Giả']);
    // Exercise the UUID v4 dependency used by ExcelJS extension formatting.
    sheet.addConditionalFormatting({ref:'A2',rules:[{type:'dataBar',minLength:0,maxLength:100,gradient:true,
      cfvo:[{type:'min'},{type:'max'}],color:{argb:'FF3377AA'}}]});
    await book.xlsx.writeFile(filename);assert.deepEqual(await readXlsx(filename),[['code','name'],['HS-TEST','Nguyễn Văn Giả']]);
    sheet.getCell('A5002').value='sparse';await book.xlsx.writeFile(filename);
    await assert.rejects(inspectXlsx(filename),error=>error.code==='IMPORT_LIMIT_EXCEEDED');
    const formula=new ExcelJS.Workbook(),other=formula.addWorksheet('Formula');other.getCell('A1').value={formula:'1+1',result:2};
    await formula.xlsx.writeFile(filename);await assert.rejects(inspectXlsx(filename),error=>error.code==='XLSX_ACTIVE_CONTENT_REJECTED');
  }finally{await fs.unlink(filename).catch(error=>{if(error.code!=='ENOENT')throw error;});await fs.rmdir(folder);}
});
