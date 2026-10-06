import {describe,it,expect} from 'vitest';
import {commandErrorToast,normalizeFieldErrors} from '../../src/lib/query/command-toast';
import {RepoError,type RepoErrorCode} from '../../src/lib/repositories/errors';
describe('acknowledged command feedback',()=>{
 it.each([['VALIDATION','Dữ liệu chưa hợp lệ'],['DUPLICATE','Dữ liệu bị trùng'],['CONFLICT','Dữ liệu đã thay đổi'],['FORBIDDEN','Bạn không có quyền thực hiện'],['NETWORK','Chưa kết nối được máy chủ']] as [RepoErrorCode,string][])('renders %s with safe detail', (code,title)=>{const t=commandErrorToast(new RepoError(code,undefined,{details:{token:'PRIVATE_TOKEN',requestBody:{password:'PRIVATE_PASSWORD'}}}));expect(t.title).toBe(title);expect(JSON.stringify(t)).not.toMatch(/PRIVATE|requestBody|token/);});
 it('normalizes nested API validation and identifies the first useful field',()=>{const e=new RepoError('VALIDATION',undefined,{fieldErrors:{'assignment.classId':'Hãy chọn lớp.','assignment.startsOn':'Ngày chưa hợp lệ'}});expect(normalizeFieldErrors(e.fieldErrors)).toEqual({classId:'Hãy chọn lớp.',startsOn:'Ngày chưa hợp lệ'});expect(commandErrorToast(e).detail).toBe('Có 2 mục cần kiểm tra. Lỗi đầu tiên: Lớp — Hãy chọn lớp.');});
});
