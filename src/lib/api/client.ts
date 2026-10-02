import {apiOperations,type OperationId,type ApiData,type ApiRequest} from './generated';
import {RepoError,type RepoErrorCode} from '../repositories/errors';

export interface ApiPage {limit:number;nextCursor:string|null;hasMore:boolean;total?:number}
export interface ApiEnvelope<T> {data:T;requestId:string;page?:ApiPage}
export interface ApiOptions<K extends OperationId> {
  params?:Record<string,string>;query?:Record<string,string|number|boolean|null|undefined>;
  body?:ApiRequest<K>;multipart?:FormData;idempotencyKey?:string;signal?:AbortSignal;
  parentViewId?:string;parentCsrf?:string;supportAccessId?:string;
  validateData?:(data:ApiData<K>)=>boolean;
}
interface HttpProblem {code?:string;status?:number;currentVersion?:number;resultId?:string;requestId?:string;fieldErrors?:{path:string;message:string}[]}
let staffCsrf:string|null=null,bootstrapCsrf:string|null=null,bootstrapPending:Promise<string>|null=null;
let authEpoch=0,accessEpoch=0;
let staffRequests=new AbortController();
function abortStaffRequests(){const old=staffRequests;staffRequests=new AbortController();old.abort();}
const authListeners=new Set<()=>void>();
const accessListeners=new Set<()=>void>();
const mutationListeners=new Set<()=>void>();
const retries=new Map<string,{key:string;at:number}>();
const blobs=new WeakMap<Blob,string>();

/** Session/CSRF values are memory-only. Authentication itself is an HttpOnly cookie. */
export function setStaffCsrf(value:string|null){staffCsrf=value;}
export function authenticationChanged(){authEpoch++;accessEpoch++;abortStaffRequests();staffCsrf=null;bootstrapCsrf=null;bootstrapPending=null;retries.clear();authListeners.forEach(fn=>fn());accessListeners.forEach(fn=>fn());}
export function onAuthenticationChanged(fn:()=>void){authListeners.add(fn);return()=>{authListeners.delete(fn);};}
/** Permission changes invalidate private reads, while uncertain command keys stay bound to the same identity. */
export function authorizationChanged(){accessEpoch++;abortStaffRequests();accessListeners.forEach(fn=>fn());}
export function onStaffAccessChanged(fn:()=>void){accessListeners.add(fn);return()=>{accessListeners.delete(fn);};}
export function onStaffMutationAcknowledged(fn:()=>void){mutationListeners.add(fn);return()=>{mutationListeners.delete(fn);};}
export function staffAccessRevision(){return accessEpoch;}
function assertStaffAccess(epoch:number,identity:number){
  if(identity!==authEpoch)throw new RepoError('NO_SESSION','Phiên đã thay đổi. Vui lòng tải lại dữ liệu trước khi tiếp tục.');
  if(epoch!==accessEpoch)throw new RepoError('FORBIDDEN','Phạm vi quyền đã thay đổi. Vui lòng tải lại dữ liệu.',{details:{scopeChanged:true}});
}
/** Bind a composite read/command to the same identity and permission scope throughout. */
export function captureStaffAccess(){const epoch=accessEpoch,identity=authEpoch;return {epoch,assertCurrent(){assertStaffAccess(epoch,identity);}};}
function canonical(value:unknown):string{
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>JSON.stringify(key)+':'+canonical(v)).join(',')+'}';
}
async function fingerprint(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
function retryKey(hash:string,explicit?:string){
  if(explicit)return explicit;
  for(const [id,r]of retries)if(Date.now()-r.at>24*3600_000)retries.delete(id);
  const old=retries.get(hash);if(old)return old.key;
  if(retries.size>=256)retries.delete(retries.keys().next().value!);
  const key=crypto.randomUUID();retries.set(hash,{key,at:Date.now()});return key;
}
function formIdentity(form:FormData){return [...form.entries()].map(([key,v])=>{
  if(typeof v==='string')return [key,v];let id=blobs.get(v);if(!id){id=crypto.randomUUID();blobs.set(v,id);}return [key,{id,size:v.size,type:v.type,name:v.name}];
});}
function error(status:number,p:HttpProblem,auth:string,read:boolean,retryAfter:string|null,id:OperationId){
  let code:RepoErrorCode=status===401?(auth==='parent'?'REVOKED':'NO_SESSION'):status===403?'FORBIDDEN':status===404?'NOT_FOUND':status===409?'CONFLICT':status===410?'EXPIRED':status===422||status===400?'VALIDATION':read?'READ_ERROR':'NETWORK';
  if(p.code==='SCHOOL_SUSPENDED')code='SUSPENDED';
  if(p.code==='PERIOD_LOCKED'||p.code==='RULE_SET_IMMUTABLE')code='LOCKED';
  if(p.code==='DUPLICATE_SOURCE'||p.code==='POSSIBLE_DUPLICATE')code='DUPLICATE';
  if(p.code==='INVALID_CREDENTIALS')code='VALIDATION';
  const messages:Partial<Record<RepoErrorCode,string>>={NO_SESSION:'Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.',REVOKED:'Link tra cứu không còn hiệu lực hoặc đã bị thu hồi.',NETWORK:'Không nhận được xác nhận lưu từ máy chủ. Nội dung của bạn vẫn còn; hãy thử lại.',READ_ERROR:'Không tải được dữ liệu từ máy chủ. Vui lòng thử lại.'};
  const problemMessages:Record<string,string>={
    PARENT_ISSUE_SOURCE_CHANGED:'Nguồn cấp link đã thay đổi. Hãy tải lại và xác nhận học sinh, người nhận cùng thời hạn.',
    LINK_ALREADY_ISSUED:'Lệnh này đã cấp link, nhưng mã truy cập chỉ được trả một lần. Xem quyền đã cấp và chủ động cấp lại nếu chưa giữ được link.',
    SHARED_GUARDIAN_SCOPE:'Liên hệ này dùng chung cho nhiều học sinh. Cần người có quyền quản lý tất cả các lớp liên quan sửa liên hệ.',
    GUARDIAN_PRIMARY_CHANGED:'Liên hệ ưu tiên đã thay đổi. Hãy tải lại và kiểm tra trước khi lưu.',GUARDIAN_ARCHIVED:'Liên hệ giám hộ đã được lưu trữ. Hãy tải lại hồ sơ.',
    LAST_ADMIN_REQUIRED:'Trường cần còn ít nhất một quản trị đang có hiệu lực. Hãy phân công quản trị khác trước.',
    OWN_ROLES_EDIT_FORBIDDEN:'Không thể tự thay đổi vai trò của chính mình.',OWN_ROLE_EDIT_FORBIDDEN:'Không thể sửa mẫu quyền mà bạn đang giữ.',
    SELF_SUSPENSION_FORBIDDEN:'Không thể tự khóa hoặc kết thúc thành viên của chính mình.',
    DELEGATION_CEILING:'Không thể cấp quyền vượt quá quyền hiện tại của bạn.',DELEGATION_EXPIRY_CEILING:'Thời hạn được cấp phải nằm trong thời hạn quyền hiện tại của bạn.',
    INVITATION_UNAVAILABLE:'Lời mời đã hết hạn, bị thu hồi, đã được phản hồi hoặc không còn hiệu lực.',
    MEMBERSHIP_REACTIVATION_REQUIRED:'Thành viên đã bị khóa hoặc kết thúc. Quản trị trường cần mở lại trước khi nhận lời mời.',
  };
  const fieldErrors=p.fieldErrors?Object.fromEntries(p.fieldErrors.map(e=>[e.path.replace(/^\//,'').replace(/\//g,'.')||'form',e.message])):undefined;
  return new RepoError(code,p.code==='INVALID_CREDENTIALS'?(id==='changePassword'?'Mật khẩu hiện tại không đúng.':'Email hoặc mật khẩu không đúng.'):status===429?'Bạn đang thao tác quá nhanh. Hãy đợi rồi thử lại.':status===503?'Máy chủ chưa sẵn sàng. Nội dung chưa lưu vẫn được giữ để thử lại.':problemMessages[p.code??'']??messages[code],{fieldErrors,details:{httpStatus:status,problemCode:p.code,requestId:p.requestId,currentVersion:p.currentVersion,...(typeof p.resultId==='string'?{resultId:p.resultId}:{}),...(retryAfter?{retryAfter}: {})}});
}
async function csrfBootstrap(){
  if(bootstrapCsrf)return bootstrapCsrf;
  if(!bootstrapPending){const identity=authEpoch;
    const work=(async()=>{
      const response=await http('getCsrf',{});if(identity!==authEpoch)throw new RepoError('NO_SESSION','Phiên đã thay đổi trong lúc chuẩn bị yêu cầu.');const token=response.data.csrfToken;if(typeof token!=='string')throw new RepoError('READ_ERROR','Phản hồi bảo vệ phiên không hợp lệ.');bootstrapCsrf=token;return token;
    })().finally(()=>{if(bootstrapPending===work)bootstrapPending=null;});bootstrapPending=work;
  }return bootstrapPending;
}
async function sessionCsrf(){
  if(staffCsrf)return staffCsrf;
  const context=await http('getMyContext',{});const token=context.data.csrfToken;if(typeof token!=='string')throw new RepoError('NO_SESSION');staffCsrf=token;return token;
}
function urlFor<K extends OperationId>(id:K,options:ApiOptions<K>){
  const operation=apiOperations[id];const path=operation.path.replace(/\{([^}]+)\}/g,(_match,key:string)=>{
    const value=options.params?.[key];if(!value)throw new RepoError('VALIDATION','Thiếu tham chiếu cho yêu cầu dữ liệu.',{fieldErrors:{[key]:'Vui lòng chọn đối tượng.'}});return encodeURIComponent(value);
  });
  const query=new URLSearchParams();for(const [key,value]of Object.entries(options.query??{}))if(value!==undefined&&value!==null&&value!=='')query.set(key,String(value));
  return path+(query.size?'?'+query.toString():'');
}
async function send<K extends OperationId>(id:K,options:ApiOptions<K>):Promise<{response:Response;hash?:string;epoch:number;identity:number}>{
  const op=apiOperations[id],read=op.readOnly,headers:Record<string,string>={Accept:'application/json'},epoch=accessEpoch,identity=authEpoch;
  const url=urlFor(id,options);
  if(options.body!==undefined&&options.multipart)throw new RepoError('VALIDATION','Yêu cầu chứa hai kiểu nội dung.');
  let body:BodyInit|undefined,hash:string|undefined;
  if(options.multipart)body=options.multipart;else if(options.body!==undefined){body=JSON.stringify(options.body);headers['Content-Type']='application/json';}
  if(options.parentViewId)headers['X-Parent-View']=options.parentViewId;
  if(options.supportAccessId)headers['X-Support-Access']=options.supportAccessId;
  if(op.method!=='GET'){
    headers['X-CSRF-Token']=op.auth==='staff'?await sessionCsrf():op.auth==='parent'?options.parentCsrf??'':await csrfBootstrap();
    if(!headers['X-CSRF-Token'])throw new RepoError('REVOKED','Phiên tra cứu chưa được mở.');
    if(!read){hash=await fingerprint({id,params:options.params,query:options.query,body:options.multipart?formIdentity(options.multipart):options.body});headers['Idempotency-Key']=retryKey(hash,options.idempotencyKey);}
  }
  if(op.auth==='staff')assertStaffAccess(epoch,identity);
  let response:Response;
  const signals=[AbortSignal.timeout(options.multipart?120_000:30_000)];if(options.signal)signals.push(options.signal);if(op.auth==='staff')signals.push(staffRequests.signal);
  try{response=await fetch(url,{method:op.method,headers,body,credentials:'include',cache:'no-store',redirect:'error',signal:AbortSignal.any(signals)});}
  catch{if(op.auth==='staff')assertStaffAccess(epoch,identity);throw new RepoError(read?'READ_ERROR':'NETWORK',read?'Không kết nối được máy chủ để đọc dữ liệu. Hãy thử lại.':'Không nhận được xác nhận lưu. Giữ nguyên nội dung và thử lại với cùng lệnh.');}
  if(op.auth==='staff')assertStaffAccess(epoch,identity);
  if(!response.ok){
    let problem:HttpProblem={};try{problem=await response.json() as HttpProblem;}catch{/* Unparseable errors are still errors; no data fallback. */}
    if(op.auth==='staff')assertStaffAccess(epoch,identity);
    if(response.status<500&&response.status!==429&&hash)retries.delete(hash);
    if(problem.code==='CSRF_INVALID'){bootstrapCsrf=null;staffCsrf=null;}
    // A preview link can expire independently of the authenticated staff session.
    if(response.status===401&&op.auth==='staff'&&problem.code!=='INVALID_CREDENTIALS'&&!(op.permission==='parent_access.preview'&&problem.code==='PARENT_ACCESS_INVALID'))authenticationChanged();
    throw error(response.status,problem,op.auth,read,response.headers.get('retry-after'),id);
  }
  if(op.auth==='staff')assertStaffAccess(epoch,identity);
  return {response,hash,epoch,identity};
}
export async function http<K extends OperationId>(id:K,options:ApiOptions<K>={}):Promise<ApiEnvelope<ApiData<K>>>{
  const {response,hash,epoch,identity}=await send(id,options);let result:ApiEnvelope<ApiData<K>>;
  try{result=await response.json() as ApiEnvelope<ApiData<K>>;}catch{if(apiOperations[id].auth==='staff')assertStaffAccess(epoch,identity);throw new RepoError(apiOperations[id].readOnly?'READ_ERROR':'NETWORK','Không xác minh được phản hồi máy chủ. Hãy giữ nội dung và thử lại.');}
  if(apiOperations[id].auth==='staff')assertStaffAccess(epoch,identity);
  if(!result||typeof result!=='object'||!Object.hasOwn(result,'data')||typeof result.requestId!=='string')throw new RepoError(apiOperations[id].readOnly?'READ_ERROR':'NETWORK','Phản hồi API không đúng hợp đồng.');
  if(options.validateData&&!options.validateData(result.data))throw new RepoError(apiOperations[id].readOnly?'READ_ERROR':'NETWORK','Chưa xác minh được kết quả từ máy chủ. Hãy giữ nội dung để thử lại.');
  if(apiOperations[id].auth==='staff')assertStaffAccess(epoch,identity);
  if(hash)retries.delete(hash);if(hash&&apiOperations[id].auth==='staff')mutationListeners.forEach(fn=>fn());return result;
}
export async function download<K extends OperationId>(id:K,options:ApiOptions<K>={}):Promise<{blob:Blob;filename:string}>{
  const {response,hash,epoch,identity}=await send(id,options),disposition=response.headers.get('content-disposition')??'';let filename='download';
  const encoded=/filename\*=UTF-8''([^;]+)/i.exec(disposition);if(encoded)try{filename=decodeURIComponent(encoded[1]).replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'_');}catch{/* Safe filename remains. */}
  let blob:Blob;try{blob=await response.blob();}catch{if(apiOperations[id].auth==='staff')assertStaffAccess(epoch,identity);throw new RepoError(apiOperations[id].readOnly?'READ_ERROR':'NETWORK','Tệp chưa được tải đầy đủ. Vui lòng thử lại.');}
  if(apiOperations[id].auth==='staff')assertStaffAccess(epoch,identity);
  if(hash)retries.delete(hash);if(hash&&apiOperations[id].auth==='staff')mutationListeners.forEach(fn=>fn());return {blob,filename};
}
