import Papa from 'papaparse';
export const PASTE_LIMIT=500,PASTE_BYTES=200*1024;
export const PASTE_FIELDS={fullName:'Họ và tên',studentCode:'Mã HS',dateOfBirth:'Ngày sinh',gender:'Giới tính',guardianName:'Tên phụ huynh',guardianPhone:'Điện thoại',guardianEmail:'Email phụ huynh',relationshipLabel:'Quan hệ'};
export type PasteField=keyof typeof PASTE_FIELDS;
export type PasteValues=Partial<Record<PasteField,string>>;
export interface PasteTable{columns:string[];rows:string[][];mapping:Record<number,PasteField|''>;needsMapping:boolean}
export const foldHeader=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases:Record<PasteField,string[]>={fullName:['Họ tên','Họ và tên','Tên','Full name','Name','fullName'],studentCode:['Mã HS','Mã học sinh','Student code','Code','studentCode'],dateOfBirth:['Ngày sinh','DOB','Date of birth','dateOfBirth'],gender:['Giới tính','Gender'],guardianName:['Tên phụ huynh','Người giám hộ','Guardian','guardianName'],guardianPhone:['SĐT','Điện thoại','Phone','guardianPhone'],guardianEmail:['Email phụ huynh','Guardian email','guardianEmail'],relationshipLabel:['Quan hệ','Relationship','relationshipLabel']};
const aliasMap=new Map(Object.entries(aliases).flatMap(([key,values])=>values.map(v=>[foldHeader(v),key as PasteField] as const)));
export function parsePaste(text:string):PasteTable{
 if(new TextEncoder().encode(text).length>PASTE_BYTES)throw new Error('Danh sách vượt 200 KB. Hãy dùng Nhập từ tệp.');
 const lines=text.replace(/^\uFEFF/,'').split(/\r\n|\n|\r/).filter(l=>l.trim());
 if(!lines.length)throw new Error('Hãy dán danh sách học sinh.');
 let rows:string[][];
 if(lines.some(l=>l.includes('\t')))rows=Papa.parse<string[]>(lines.join('\n'),{delimiter:'\t',skipEmptyLines:true}).data;
 else{
  const candidates=[',',';'].map(delimiter=>Papa.parse<string[]>(lines.join('\n'),{delimiter,skipEmptyLines:true}));
  const csv=candidates.find(p=>!p.errors.length&&p.data.every(r=>r.length===p.data[0]!.length)&&p.data[0]!.length>1&&(p.data[0]!.some(c=>aliasMap.has(foldHeader(c)))||p.data[0]!.length>=3));
  rows=csv?.data??lines.map(l=>[l]);
 }
 rows=rows.map(r=>r.map(c=>c.trim()));const width=Math.max(...rows.map(r=>r.length));
 if(width>20||rows.some(r=>r.length!==width))throw new Error('Số cột không nhất quán. Kiểm tra vùng đã sao chép.');
 const detected=rows[0]!.map(c=>aliasMap.get(foldHeader(c))??'');
 const hasHeader=detected.includes('fullName')||(width>1&&detected.filter(Boolean).length>=2);
 const columns=hasHeader?rows.shift()!:Array.from({length:width},(_,i)=>`Cột ${i+1}`),mapping:PasteTable['mapping']={};
 if(hasHeader)detected.forEach((f,i)=>{if(f&&!Object.values(mapping).includes(f))mapping[i]=f;});else if(width===1)mapping[0]='fullName';
 if(rows.length>PASTE_LIMIT)throw new Error('Tối đa 500 học sinh/lần. Hãy dùng Nhập từ tệp.');
 if(!rows.length)throw new Error('Chưa có dòng học sinh bên dưới tiêu đề.');
 return {columns,rows,mapping,needsMapping:!Object.values(mapping).includes('fullName')||width>1&&!hasHeader};
}
export function mappedRows(table:PasteTable):PasteValues[]{return table.rows.map(row=>Object.fromEntries(Object.entries(table.mapping).filter(([,f])=>f).map(([i,f])=>[f,row[Number(i)]?.trim()??''])));}
export function normalizePasteDate(value:string){const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value),iso=m?`${m[3]}-${m[2]!.padStart(2,'0')}-${m[1]!.padStart(2,'0')}`:value,d=new Date(iso+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(iso)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:undefined;}
export function previewPaste(rows:PasteValues[],today:string){
 const codes=new Map<string,number>(),names=new Map<string,number>();for(const r of rows){if(r.studentCode)codes.set(r.studentCode,(codes.get(r.studentCode)??0)+1);const n=foldHeader(r.fullName??'');if(n)names.set(n,(names.get(n)??0)+1);}
 return rows.map(r=>{const errors:string[]=[],warnings:string[]=[],values={...r};
  if(!r.fullName?.trim())errors.push('THIẾU TÊN');
  if(r.studentCode&&((codes.get(r.studentCode)??0)>1||!/^[\p{L}\p{N}_.-]{1,64}$/u.test(r.studentCode)))errors.push('MÃ TRÙNG / SAI');
  if(r.dateOfBirth){const d=normalizePasteDate(r.dateOfBirth);if(!d||d<'1900-01-01'||d>today)errors.push('NGÀY SINH SAI');else values.dateOfBirth=d;}
  if(r.gender){const g=foldHeader(r.gender);if(!['nam','nu','male','female'].includes(g))errors.push('GIỚI TÍNH SAI');else values.gender=['nam','male'].includes(g)?'Nam':'Nữ';}
  if((names.get(foldHeader(r.fullName??''))??0)>1)warnings.push('NGHI TRÙNG TÊN — tiếp tục sẽ tạo hồ sơ riêng');
  return {values,errors,warnings};
 });
}
