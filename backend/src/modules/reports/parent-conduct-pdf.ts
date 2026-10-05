import {createWriteStream} from 'node:fs';
import path from 'node:path';
import {finished} from 'node:stream/promises';
import PDFDocument from 'pdfkit';
import type {ReportData} from './report-render';
type Week={weekNumber:number;finalPoints:string;basePoints?:string;bonusPoints?:string;penaltyPoints?:string;classification:string|null;lines:{label:string;delta:string;reason?:string|null;occurredAt:string}[]};
export async function renderParentConductPdf(filename:string,report:ReportData){
 const out=createWriteStream(filename,{flags:'wx',mode:0o600}),completed=finished(out);completed.catch(()=>{});
 const doc=new PDFDocument({size:'A4',margins:{top:36,bottom:36,left:36,right:36},autoFirstPage:false});doc.pipe(out);
 doc.registerFont('regular',path.resolve(__dirname,'../../../assets/fonts/NotoSans-Regular.ttf'));
 doc.registerFont('bold',path.resolve(__dirname,'../../../assets/fonts/NotoSans-Bold.ttf'));
 const left=36,width=523,right=559;
 const text=(value:string,x:number,y:number,w:number,bold=false,size=10,align:'left'|'center'='left')=>doc.font(bold?'bold':'regular').fontSize(size).fillColor('#111111').text(value,x,y,{width:w,align});
 const header=(name:string,continuation=false,department='')=>{
  doc.addPage();if(department)text(department,left,36,245,true,9,'center');text(report.schoolName,left,department?54:36,245,true,10,'center');
  text('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',290,36,269,true,9,'center');text('Độc lập - Tự do - Hạnh phúc',290,54,269,true,9,'center');
  text('PHIẾU BÁO CÁO KẾT QUẢ RÈN LUYỆN',left,88,width,true,15,'center');
  const next=new Date(report.from+'T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
  const period=report.from.endsWith('-01')&&report.to===next.toISOString().slice(0,10)?`THÁNG ${Number(report.from.slice(5,7))}`:`${report.from} đến ${report.to} (ngày cuối loại trừ)`;
  text(`THỜI GIAN: ${period} - NĂM HỌC: ${report.yearName}`,left,113,width,false,10,'center');
  text(`Học sinh: ${name}${continuation?' — tiếp theo':''}`,left,140,width,true,11);return 164;
 };
 for(const student of report.rows){
  const v=student.values,department=String(v.reportHeader??'');let y=header(student.label,false,department);
  text(`Lớp: ${String(v.className??report.scopeLabel)}     GVCN: ${String(v.homeroomName??'')}`,left,y,width);y+=25;
  doc.rect(left,y,width,52).stroke();doc.moveTo(left+width/2,y).lineTo(left+width/2,y+52).stroke();text('ĐIỂM TỔNG HỢP CÁC TUẦN',left+7,y+7,width/2-14,true,10,'center');text(String(v.totalPoints??'—'),left+7,y+27,width/2-14,true,13,'center');
  text('XẾP LOẠI TUẦN CUỐI ĐÃ CÔNG BỐ',left+width/2+7,y+7,width/2-14,true,9,'center');text(String(v.classification??'Chưa xếp loại').toLocaleUpperCase('vi'),left+width/2+7,y+27,width/2-14,true,13,'center');y+=64;
  text('2. BẢNG KÊ CHI TIẾT ĐIỂM SỐ & VI PHẠM KỶ LUẬT',left,y,width,true,10);y+=21;
  const drawRow=(week:string,points:string,detail:string)=>{
   doc.font('regular').fontSize(10);const h=Math.max(30,doc.heightOfString(detail,{width:width-157})+14);
   if(y+h>750){y=header(student.label,true,department);}
   doc.rect(left,y,width,h).stroke();doc.moveTo(left+55,y).lineTo(left+55,y+h).stroke();doc.moveTo(left+135,y).lineTo(left+135,y+h).stroke();
   text(week,left+6,y+7,43);text(points,left+61,y+7,68,true);text(detail,left+142,y+7,width-149);y+=h;
  };
  drawRow('Tuần','Điểm','Chi tiết điểm cộng / trừ đã chia sẻ');
  for(const w of v.weeks as Week[]){
   const details=w.lines.length?w.lines.map(l=>`${l.label}: ${Number(l.delta)>0?'+':''}${l.delta}${l.reason?` — ${l.reason}`:''}`):[Number(w.penaltyPoints??0)<0?'Chưa có chi tiết được chia sẻ trong tuần; điểm giữ theo bản công bố.':'Thực hiện tốt nội quy, không có vi phạm được chia sẻ.'];
   const lines=[`Cộng: ${w.bonusPoints??'0'} · Trừ: ${w.penaltyPoints??'0'}`,...details];
   // Split by wrapped text height; oversized histories continue without clipping.
   let chunk='';for(const line of lines.flatMap(line=>line.match(/[\s\S]{1,800}/g)??[])){const next=chunk?chunk+'\n'+line:line;doc.font('regular').fontSize(10);
    if(doc.heightOfString(next,{width:width-157})>390&&chunk){drawRow(String(w.weekNumber),String(w.finalPoints),chunk);chunk=line;}else chunk=next;
   }if(chunk)drawRow(String(w.weekNumber),String(w.finalPoints),chunk);
  }
  if(y+95>750)y=header(student.label,true,department);
  y+=18;text('Phụ huynh học sinh',left,y,245,true,11,'center');text('Giáo viên chủ nhiệm',300,y,259,true,11,'center');
  text('(Ký và ghi rõ họ tên)',left,y+20,245,false,9,'center');text(String(v.homeroomName??''),300,y+56,259,true,10,'center');
  text('Nguồn: các bản công bố được ghim khi tạo báo cáo. Chưa có xếp loại tháng độc lập.',left,783,width,false,7);
 }
 if(!report.rows.length){header('Chưa có kết quả đã công bố');text('Không có dữ liệu trong khoảng đã chọn.',left,185,width);}
 doc.end();await completed;return 'application/pdf';
}
