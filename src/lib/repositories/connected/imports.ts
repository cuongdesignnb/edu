import {http,download,captureStaffAccess} from '../../api/client';
import type {ApiSchemas} from '../../api/generated';
import {apiList} from '../../api/lists';
import type {Ctx} from '../core';
import {RepoError} from '../errors';
import {withStaffAccess,requiredId,displayedVersion} from './common';

export type ImportJob=ApiSchemas['ImportJob'];
const invalid=()=>new RepoError('READ_ERROR','Phản hồi lô nhập không hợp lệ. Hãy tải lại.');
function job(v:ImportJob,id?:string){requiredId(v.id);if(id&&v.id!==id||!Number.isSafeInteger(v.version)||v.version<1||!v.summary||Object.values(v.summary).some(n=>!Number.isSafeInteger(n)||n<0)||!['STUDENTS','STAFF','CLASSES','TIMETABLE'].includes(v.kind)||!['UPLOADED','VALIDATING','READY','APPLYING','COMPLETED','FAILED','CANCELLED'].includes(v.status)||v.previewHash!==undefined&&!/^[a-f0-9]{64}$/.test(v.previewHash)||v.columns!==undefined&&(!Array.isArray(v.columns)||v.columns.length>50||new Set(v.columns).size!==v.columns.length))throw invalid();return {...v,id:requiredId(v.id),summary:v.summary};}
const wait=()=>new Promise<void>(resolve=>setTimeout(resolve,400));
const uploaded=new WeakMap<File,{schoolId:string;id:string;owner:ReturnType<typeof captureStaffAccess>}>();
async function workspace(s:string){const v=(await http('getImportWorkspace',{params:{schoolId:s}})).data;if(v.schoolId!==s||v.kinds.length!==4||new Set(v.kinds.map(k=>k.kind)).size!==4)throw invalid();return v;}
export const connectedImportsRepo=withStaffAccess({
 async importWorkspace(_ctx:Ctx,s:string){return workspace(s);},
 async importKinds(_ctx:Ctx,s:string){return (await workspace(s)).kinds;},
 async imports(_ctx:Ctx,s:string){return (await apiList('listImports',{params:{schoolId:s},query:{sort:'createdAt',dir:'desc'}},1000)).map(v=>job(v));},
 async importJob(_ctx:Ctx,s:string,id:string){return job((await http('getImport',{params:{schoolId:s,importId:id}})).data,id);},
 async importRows(_ctx:Ctx,s:string,id:string){return apiList('listImportRows',{params:{schoolId:s,importId:id}},5000);},
 async uploadImport(_ctx:Ctx,s:string,kind:ApiSchemas['ImportCreate']['kind'],yearId:string,classId:string|undefined,file:File){
  const owner=captureStaffAccess();let state=uploaded.get(file);
  if(state){state.owner.assertCurrent();if(state.schoolId!==s)throw invalid();}
  else{const form=new FormData();form.append('purpose','IMPORT');form.append('file',file,file.name);if(classId)form.append('classId',classId);const received=(await http('uploadFile',{params:{schoolId:s},multipart:form})).data;state={schoolId:s,id:requiredId(received.id),owner};uploaded.set(file,state);}
  for(let i=0;i<75;i++){owner.assertCurrent();const v=(await http('getFile',{params:{schoolId:s,fileId:state.id}})).data;if(v.status==='READY'){return job((await http('createImport',{params:{schoolId:s},body:{kind,fileId:state.id,yearId,classId}})).data);}if(['REJECTED','REVOKED','ARCHIVED'].includes(v.status))throw new RepoError('VALIDATION','Tệp bị từ chối; chọn tệp CSV/XLSX hợp lệ.');await wait();}
  throw new RepoError('NETWORK','Tệp vẫn đang được kiểm tra. Giữ tệp đã chọn để thử lại.');
 },
 async validateImport(_ctx:Ctx,s:string,id:string,version:number,mapping:{sourceColumn:string;targetField:string}[],mode:ApiSchemas['ImportMapping']['mode']){return job((await http('validateImport',{params:{schoolId:s,importId:id},body:{expectedVersion:displayedVersion(version),mapping,mode}})).data,id);},
 async commitImportJob(_ctx:Ctx,s:string,id:string,displayed:ImportJob){if(!displayed.previewHash||displayed.status!=='READY')throw new RepoError('VALIDATION','Cần kiểm tra và xem trước lô nhập.');return job((await http('commitImport',{params:{schoolId:s,importId:id},body:{expectedVersion:displayedVersion(displayed.version),previewHash:displayed.previewHash}})).data,id);},
 async cancelImportJob(_ctx:Ctx,s:string,id:string,version:number,reason='Người dùng hủy lô nhập trong giao diện'){return job((await http('cancelImport',{params:{schoolId:s,importId:id},body:{expectedVersion:displayedVersion(version),reason}})).data,id);},
 async importErrors(_ctx:Ctx,s:string,id:string){return download('downloadImportErrors',{params:{schoolId:s,importId:id}});},
});
