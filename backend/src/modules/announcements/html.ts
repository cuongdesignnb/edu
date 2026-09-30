import sanitizeHtml from 'sanitize-html';
import { validation } from '../../common/problem';
export function announcementHtml(input:string){
  const result=sanitizeHtml(input,{allowedTags:['p','h2','h3','ul','ol','li','br','strong','em','b','i','blockquote'],allowedAttributes:{},allowedSchemes:[],allowProtocolRelative:false,
    nonTextTags:['script','style','textarea','option','noscript','iframe','svg','math','xmp'],nestingLimit:20,parseStyleAttributes:false});
  if(result.length>50000||!sanitizeHtml(result,{allowedTags:[],allowedAttributes:{}}).trim())validation('sanitizedHtml','Cần nội dung thông báo hợp lệ');return result;
}
