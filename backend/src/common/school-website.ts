import {validation} from './problem';

export function validateSchoolWebsite(value:unknown){
  if(value===undefined||value===null)return;
  if(typeof value!=='string'||value.length>2048)validation('website','Website không hợp lệ');
  let url:URL;try{url=new URL(value);}catch{validation('website','Website cần đường dẫn http:// hoặc https://');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)validation('website','Website cần đường dẫn http:// hoặc https:// không chứa thông tin đăng nhập');
}
