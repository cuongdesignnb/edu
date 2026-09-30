import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
import {finished} from 'node:stream/promises';
import {once} from 'node:events';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import {Problem} from '../../common/problem';
export interface ReportColumn {key:string;label:string}
export interface ReportRow {studentId?:string;classId?:string;label:string;values:Record<string,unknown>}
export interface ReportData {reportType:string;title:string;schoolName:string;yearName:string;scopeLabel:string;from:string;to:string;
  metrics:{key:string;label:string;value:number;denominator:number|null;unit:string;asOf:string}[];asOf:string;rows:ReportRow[];
  columns:ReportColumn[];dataSource:'LIVE_INTERNAL'|'PUBLISHED_SNAPSHOT';publicationIds:string[];notes:string[]}
function scalar(value:unknown){if(value===null||value===undefined)return '';if(typeof value==='object')return JSON.stringify(value);return String(value);}
export function spreadsheetText(value:unknown){const text=scalar(value);return /^[\s\x00-\x1f]*[=+\-@]/u.test(text)?"'"+text:text;}
export async function renderReport(filename:string,format:string,report:ReportData){
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  const columns=[{key:'label',label:report.rows.some(r=>r.studentId)?'Học sinh':'Lớp'},...report.columns];
  const cells=(row:ReportRow)=>[row.label,...report.columns.map(col=>row.values[col.key])];
  const contextColumns=['Trường','Năm học','Từ ngày','Đến ngày (loại trừ)','Thời điểm dữ liệu','Nguồn dữ liệu'];
  const contextCells=[report.schoolName,report.yearName,report.from,report.to,report.asOf,report.dataSource];
  if(format==='CSV'){
    const out=createWriteStream(filename,{flags:'wx',mode:0o600});const completed=finished(out);completed.catch(()=>{});
    const write=async(values:unknown[])=>{if(!out.write(values.map(v=>'"'+spreadsheetText(v).replaceAll('"','""')+'"').join(',')+'\r\n'))await once(out,'drain');};
    try{out.write('\uFEFF');await write([...columns.map(c=>c.label),...contextColumns]);for(const row of report.rows)await write([...cells(row),...contextCells]);out.end();await completed;}
    catch(error){out.destroy();throw error;}return 'text/csv; charset=utf-8';
  }
  if(format==='XLSX'){
    const workbook=new ExcelJS.stream.xlsx.WorkbookWriter({filename,useStyles:true,useSharedStrings:false});
    workbook.creator='EduManage';workbook.created=new Date(report.asOf);
    const sheet=workbook.addWorksheet('Báo cáo',{views:[{state:'frozen',ySplit:1}]});
    sheet.columns=columns.map(c=>({key:c.key,width:c.key==='label'?32:22}));
    const header=sheet.addRow(columns.map(c=>c.label));header.font={bold:true};header.commit();
    for(const row of report.rows)sheet.addRow(cells(row).map(v=>typeof v==='number'?v:spreadsheetText(v))).commit();
    sheet.commit();const context=workbook.addWorksheet('Phạm vi');context.columns=[{width:30},{width:80}];for(let i=0;i<contextColumns.length;i++)context.addRow([contextColumns[i],spreadsheetText(contextCells[i])]).commit();context.addRow(['Bản công bố được ghim',report.publicationIds.join(', ')]).commit();for(const note of report.notes)context.addRow(['Ghi chú',spreadsheetText(note)]).commit();context.commit();await workbook.commit();await fs.chmod(filename,0o600);return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if(format!=='PDF')throw new Problem(422,'INVALID_EXPORT_FORMAT');
  if(report.rows.length*Math.max(1,Math.ceil(report.columns.length/4))>5000)throw new Problem(422,'PDF_ROW_LIMIT_EXCEEDED');
  const fontRoot=path.resolve(__dirname,'../../../assets/fonts');
  // Runtime dist/modules/reports resolves to backend/assets. Tests use dist too.
  const document=new PDFDocument({size:'A4',margin:40,bufferPages:true,info:{Title:report.title,Author:'EduManage',CreationDate:new Date(report.asOf)}});
  document.registerFont('Noto',path.join(fontRoot,'NotoSans-Regular.ttf')).registerFont('NotoBold',path.join(fontRoot,'NotoSans-Bold.ttf'));
  const out=createWriteStream(filename,{flags:'wx',mode:0o600}),completed=finished(out);completed.catch(()=>{});document.pipe(out);
  const width=document.page.width-80,bodyBottom=document.page.height-70;
  const header=()=>{
    let y=35;
    const line=(text:string,font:string,size:number)=>{document.font(font).fontSize(size).fillColor('#18344a');const height=document.heightOfString(text,{width});document.text(text,40,y,{width});y+=height+8;};
    line(report.schoolName,'NotoBold',12);line(report.title,'NotoBold',15);
    line(`${report.yearName} | ${report.scopeLabel==='Lớp'?'Phạm vi trường':report.scopeLabel} | ${report.from} - ${report.to} (ngày cuối loại trừ)`,'Noto',8);
    line(`${report.dataSource==='PUBLISHED_SNAPSHOT'?'Bản đã công bố được ghim':'Dữ liệu nội bộ tại thời điểm đọc'} | ${report.asOf}`,'Noto',8);
    return y+10;
  };
  // Split wide tables into panels, repeating the identifying column. No invisible columns.
  const panels:ReportColumn[][]=[];for(let i=1;i<columns.length;i+=4)panels.push([columns[0]!,...columns.slice(i,i+4)]);if(!panels.length)panels.push([columns[0]!]);
  let first=true,drawn=0;
  for(const panel of panels){if(!first)document.addPage();first=false;let y=header();
    const labelWidth=panel.length===1?width:150,cellWidth=panel.length===1?width:(width-labelWidth)/(panel.length-1);
    const draw=(values:string[],isHeader=false)=>{
      if(++drawn>10000)throw new Problem(422,'PDF_ROW_LIMIT_EXCEEDED');
      document.font(isHeader?'NotoBold':'Noto').fontSize(isHeader?8:8.5);
      const heights=values.map((v,i)=>document.heightOfString(v,{width:(i?cellWidth:labelWidth)-12})),height=Math.max(24,...heights.map(h=>h+12));
      if(height>bodyBottom-145)throw new Problem(422,'PDF_CELL_TOO_LONG');
      if(y+height>bodyBottom){document.addPage();y=header();draw(panel.map(c=>c.label),true);}
      let x=40;for(let i=0;i<values.length;i++){const w=i?cellWidth:labelWidth;
        document.rect(x,y,w,height).fillAndStroke(isHeader?'#eaf0f4':'#ffffff','#d9e2e8');
        document.fillColor('#18344a').text(values[i]!,x+6,y+6,{width:w-12});x+=w;}
      y+=height;
    };
    draw(panel.map(c=>c.label),true);for(const row of report.rows){
      const values=panel.map(c=>scalar(c.key==='label'?row.label:row.values[c.key]));
      const parts=values.map(text=>{const chars=Array.from(text),chunks:string[]=[];for(let i=0;i<chars.length;i+=300)chunks.push(chars.slice(i,i+300).join(''));return chunks.length?chunks:[''];});
      for(let i=0;i<Math.max(...parts.map(p=>p.length));i++)draw(parts.map((p,j)=>p[i]??(j===0?values[0]!+' (tiếp)':'')));
    }
    if(!report.rows.length){document.font('Noto').fontSize(10).text('Không có dữ liệu trong phạm vi đã chọn.',40,y+12,{width});}
  }
  const pages=document.bufferedPageRange();for(let i=pages.start;i<pages.start+pages.count;i++){
    document.switchToPage(i);document.font('Noto').fontSize(8).fillColor('#526373').text(`EduManage | Trang ${i+1}/${pages.count}`,40,document.page.height-55,{width,align:'center',lineBreak:false});
  }
  document.end();await completed;return 'application/pdf';
}
