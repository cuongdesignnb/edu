import {RepoError} from '../errors';
/** Canonical publication HTML permits these formatting tags and no attributes.
 * Reject active/unknown markup before passing it to the browser HTML parser. */
export function safeParentHtml(value:unknown){
 const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận nội dung thông báo an toàn.');
 if(typeof value!=='string'||!value.trim()||value.length>4000)throw invalid();
 let cursor=0;for(const match of value.matchAll(/<[^>]*>/g)){
  if(value.slice(cursor,match.index).includes('<')||!/^<\/?(?:p|h2|h3|ul|ol|li|br|strong|em|b|i|blockquote)\s*\/?>$/i.test(match[0]))throw invalid();cursor=match.index!+match[0].length;
 }
 if(value.slice(cursor).includes('<'))throw invalid();return value;
}
