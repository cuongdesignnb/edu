export type TourKey='platform-overview'|'school-overview'|'teacher-overview'|'class-homeroom'|'class-subject'|'class-staff'|'parent-overview';
export type StaffTourKey=Exclude<TourKey,'parent-overview'>;
export interface TourStep {targets:readonly string[];title:string;description:string}
const step=(target:string|string[],title:string,description:string):TourStep=>({targets:Array.isArray(target)?target:[target],title,description});
const help=step('tour-help','Cần xem lại hướng dẫn?','Mở Trợ giúp → Xem lại hướng dẫn. Bạn có thể bỏ qua bất kỳ lúc nào.');
const classroom=[
 step('class-context','Lớp đang mở','Kiểm tra lớp, trường và năm học trước khi làm việc. Nếu dạy nhiều lớp, chọn lớp khác ở ô Lớp đang mở.'),
 step('class-sections','Sáu mục của lớp','Tổng quan, Học sinh, Điểm danh & Rèn luyện, Lịch & Tổ chức, Hoạt động, Phụ huynh & Báo cáo. Mở một mục, các phần nhỏ hiện ngay bên dưới.'),
 step('class-tasks','Việc cần làm hôm nay','Mỗi việc có sẵn nút để làm ngay. Làm xong, việc tự biến mất khỏi danh sách.'),
 step('class-quick','Thao tác nhanh','Lối tắt tới các việc làm hằng ngày: điểm danh, ghi rèn luyện, soạn thông báo…'),
 step('class-publication','Chốt và công bố','Lưu không đồng nghĩa công bố. Phụ huynh chỉ thấy thông tin đã được công bố.'),
 step('class-tour','Hướng dẫn lớp này','Mở nút này để xem lại cách dùng trong lớp hiện tại.'),
];
export const TOURS:Record<TourKey,{version:1;autoPrompt:boolean;steps:readonly TourStep[]}>= {
 'platform-overview':{version:1,autoPrompt:true,steps:[
  step('workspace-overview','Tổng quan nền tảng','Theo dõi tình hình vận hành và các việc cần xử lý.'),
  step('platform-schools','Danh sách và tạo trường','Mở Trường học để xem danh sách hoặc tạo trường theo quyền được cấp.'),
  step('platform-operations','Vận hành','Theo dõi các tác vụ vận hành nền tảng tại đây.'),
  step('platform-support','Hỗ trợ có ủy quyền','Chỉ truy cập dữ liệu trường trong phạm vi hỗ trợ đã được trường cho phép.'),
  step('platform-settings','Cấu hình nền tảng','Xem và quản lý cấu hình theo quyền vận hành hiện hành.'),help]},
 'school-overview':{version:1,autoPrompt:true,steps:[
  step(['school-context','workspace-overview'],'Đúng trường, đúng năm học','Kiểm tra trường và năm học đang chọn trước khi làm việc.'),
  step('school-classes','Năm học và lớp','Tổ chức năm học và danh sách lớp tại đây.'),
  step('school-teachers','Giáo viên và phân công','Xem nhân sự và các phân công trong phạm vi quyền được cấp.'),
  step('school-students','Học sinh và gia đình','Quản lý danh sách học sinh và thông tin gia đình theo quyền.'),
  step('school-publication','Rà soát và công bố','Lưu không đồng nghĩa công bố. Phụ huynh chỉ thấy thông tin đã được công bố.'),
  step('school-reports','Báo cáo','Xem báo cáo và tải dữ liệu trong phạm vi được cấp.'),help]},
 'teacher-overview':{version:1,autoPrompt:true,steps:[
  step('workspace-overview','Đúng trường, đúng năm học','Kiểm tra trường và năm học của lớp trước khi làm việc.'),
  step('teacher-my-classes','Lớp học của bạn','Đây là những lớp được nhà trường phân công cho bạn. Mở một lớp để bắt đầu.'),
  step(['teacher-tasks','teacher-tasks-nav'],'Việc cần làm hôm nay','Theo dõi các việc còn thiếu và thời hạn cần xử lý tại đây.'),
  step('teacher-schedule','Lịch dạy của bạn','Xem lịch theo ngày hoặc tuần trong phạm vi được phân công.'),
  step('teacher-announcements','Thông báo liên quan','Các thông báo bạn được phép đọc tập trung tại đây.'),help]},
 'class-homeroom':{version:1,autoPrompt:true,steps:classroom},
 'class-subject':{version:1,autoPrompt:true,steps:classroom.filter(s=>!s.targets.includes('class-publication'))},
 'class-staff':{version:1,autoPrompt:true,steps:classroom},
 'parent-overview':{version:1,autoPrompt:true,steps:[
  step(['parent-overview','parent-context'],'Thông tin của con','Thông tin được nhà trường cho phép tra cứu, chỉ xem.'),
  step('parent-attendance','Chuyên cần','Xem tình hình chuyên cần đã được chia sẻ.'),
  step('parent-conduct','Thi đua đã công bố','Chỉ kết quả đã công bố mới xuất hiện ở đây.'),
  step('parent-timetable','Lịch học','Theo dõi lịch học được chia sẻ của con.'),
  step('parent-announcements','Thông báo','Đọc thông báo dành cho gia đình.'),
  step('parent-teachers','Giáo viên liên hệ','Xem đầu mối liên hệ mà nhà trường cho phép chia sẻ.'),help]},
};
export function permittedSteps(key:TourKey,platformActions:readonly string[]=[]){
 const required:Record<string,string>={'platform-schools':'platform.schools.read','platform-support':'platform.support','platform-operations':'platform.operations','platform-settings':'platform.settings'};
 return TOURS[key].steps.filter(s=>key!=='platform-overview'||s.targets.every(target=>!required[target]||platformActions.includes(required[target])));
}
export function visibleTarget(step:TourStep):HTMLElement|null{
 for(const target of step.targets){
  for(const element of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)){
   const style=getComputedStyle(element);
   if(!element.isConnected||!element.getClientRects().length||style.display==='none'||style.visibility==='hidden'||element.closest('[aria-hidden="true"]'))continue;
   const rect=element.getBoundingClientRect(),x=Math.max(0,Math.min(innerWidth-1,rect.left+rect.width/2)),y=Math.max(0,Math.min(innerHeight-1,rect.top+rect.height/2));
   if(rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth&&typeof document.elementFromPoint==='function'){
    const front=document.elementFromPoint(x,y);if(front&&!element.contains(front))continue;
   }
   return element;
  }
 }return null;
}
