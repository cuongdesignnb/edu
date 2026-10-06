import {ERROR_MESSAGES,type RepoError,type RepoErrorCode} from '../repositories/errors';

export const FIELD_LABELS:Record<string,string>={roleId:'Vai trò',assignment:'Phân công',yearId:'Năm học',classId:'Lớp',subjectId:'Môn học',startsOn:'Phân công từ ngày',endsOn:'Phân công đến ngày',reason:'Lý do',displayName:'Họ và tên',fullName:'Họ và tên',email:'Email',password:'Mật khẩu',confirm:'Xác nhận mật khẩu',confirmed:'Xác nhận gán',validFrom:'Hiệu lực tài khoản từ',validUntil:'Hiệu lực tài khoản đến',studentCode:'Mã học sinh',dateOfBirth:'Ngày sinh',gender:'Giới tính',mapping:'Ghép cột',form:'Biểu mẫu',_form:'Biểu mẫu'};
const titles:Record<RepoErrorCode,string>={VALIDATION:'Dữ liệu chưa hợp lệ',DUPLICATE:'Dữ liệu bị trùng',CONFLICT:'Dữ liệu đã thay đổi',FORBIDDEN:'Bạn không có quyền thực hiện',NOT_FOUND:'Không tìm thấy dữ liệu',LOCKED:'Dữ liệu đã bị khóa',REVOKED:'Quyền truy cập đã bị thu hồi',EXPIRED:'Quyền truy cập đã hết hạn',SUSPENDED:'Chức năng đang tạm ngừng',NO_SESSION:'Phiên đăng nhập đã hết hạn',NETWORK:'Chưa kết nối được máy chủ',READ_ERROR:'Không tải được dữ liệu',UNVERIFIED:'Người giám hộ chưa được xác minh'};
export function normalizeFieldErrors(errors:Record<string,string>={}){return Object.fromEntries(Object.entries(errors).map(([key,value])=>[key.replace(/^\//,'').replaceAll('/','.').replace(/^assignment\./,''),value]));}
// Only curated messages and field errors enter UI feedback; never serialize details/body.
export function commandErrorToast(error:RepoError){
 const entries=Object.entries(normalizeFieldErrors(error.fieldErrors)).filter(([,value])=>!!value.trim());
 const first=entries[0],field=first?`${FIELD_LABELS[first[0]]??'Mục cần kiểm tra'} — ${first[1]}`:undefined;
 const detail=field?(entries.length>1?`Có ${entries.length} mục cần kiểm tra. Lỗi đầu tiên: ${field}`:field):(error.message||ERROR_MESSAGES[error.code]);
 return {tone:'error' as const,title:titles[error.code],detail};
}
