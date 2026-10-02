import {describe,it,expect} from 'vitest';
import {nativeReportCatalog,nativeExport} from '@/lib/repositories/connected/reports';
import {nativeSearch} from '@/lib/repositories/connected/search';
import type {ApiSchemas} from '@/lib/api/generated';
const schoolId='68100000-0000-4000-8000-000000000001',classId='68100000-0000-4000-8000-000000000002',yearId='68100000-0000-4000-8000-000000000003',studentId='68100000-0000-4000-8000-000000000004';
const catalog=():ApiSchemas['ReportCatalog']=>({schoolId,yearId,yearStart:'2026-09-01',yearEnd:'2027-06-01',classId,today:'2026-10-02',role:'Bộ môn',canExport:false,hiddenCount:2,reports:[{type:'attendance',title:'Chuyên cần',description:'Tiết được phân công'}],students:[],weeks:[],grades:[]});
const job=():ApiSchemas['ExportJob']=>({id:studentId,version:4,createdAt:'2026-10-02T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z',expiresAt:'2026-10-03T00:00:00Z',requestedBy:classId,reportType:'student-directory',format:'CSV',status:'QUEUED',title:'Danh sách được chọn',rowCount:1,fileName:'real.csv',filters:{yearId,from:'2026-09-01',to:'2027-06-01'}});
describe('report and search receipts fail closed and preserve exact sources',()=>{
 it('retains a genuine limited catalog and rejects foreign duplicated or missing metadata',()=>{
  expect(nativeReportCatalog(catalog(),schoolId,yearId,classId)).toMatchObject({role:'Bộ môn',canExport:false,hiddenCount:2,students:[]});
  for(const r of [{...catalog(),schoolId:classId},{...catalog(),yearId:schoolId},{...catalog(),classId:null},{...catalog(),yearStart:null},{...catalog(),reports:[catalog().reports[0],catalog().reports[0]]}])expect(()=>nativeReportCatalog(r as ApiSchemas['ReportCatalog'],schoolId,yearId,classId)).toThrow();
 });
 it('keeps displayed job version and pending state rather than treating queue acceptance as completion',()=>{
  expect(nativeExport(job())).toMatchObject({version:4,status:'queued',rowCount:1,yearId,params:{to:'2027-05-31'}});
  for(const r of [{...job(),status:'COMPLETED'},{...job(),version:0},{...job(),rowCount:-1},{...job(),title:undefined}])expect(()=>nativeExport(r as ApiSchemas['ExportJob'])).toThrow();
 });
 it('routes class-bound hits to the authorized workspace and denies foreign or incomplete results',()=>{
  const item={kind:'student' as const,id:studentId,schoolId,yearId,classId,title:'Học sinh tổng hợp',sub:'Lớp thật',schoolWorkspace:false};
  expect(nativeSearch({schoolId,items:[item]},schoolId)[0].href).toBe(`/classroom/${schoolId}/${yearId}/${classId}/students/${studentId}`);
  for(const row of [{schoolId:yearId,items:[item]},{schoolId,items:[item,item]},{schoolId,items:[{...item,schoolId:yearId}]},{schoolId,items:[{...item,classId:null}]}])expect(()=>nativeSearch(row,schoolId)).toThrow();
  expect(()=>nativeSearch({schoolId:null,items:[item]})).toThrow();
 });
});
