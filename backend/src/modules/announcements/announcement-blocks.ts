import {Parser} from 'htmlparser2';
import {validation} from '../../common/problem';
import {announcementHtml} from './html';
export type AnnouncementBlock={type:'p'|'h'|'li';text:string};
const escape=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
/** The existing composer owns plaintext semantic blocks; encode them before native sanitization. */
export function blocksToAnnouncementHtml(blocks:AnnouncementBlock[]){
 if(!Array.isArray(blocks)||!blocks.length||blocks.length>500)validation('body','Cần nội dung thông báo, tối đa 500 khối');
 let html='',list=false;
 for(const b of blocks){if(!b||!['p','h','li'].includes(b.type)||typeof b.text!=='string'||!b.text.trim()||b.text.length>50000)validation('body','Khối nội dung không hợp lệ');
  if(b.type==='li'&&!list){html+='<ul>';list=true;}else if(b.type!=='li'&&list){html+='</ul>';list=false;}
  const tag=b.type==='h'?'h3':b.type;html+=`<${tag}>${escape(b.text).replace(/\r?\n/g,'<br>')}</${tag}>`;
 }
 if(list)html+='</ul>';return announcementHtml(html);
}
/** Project native sanitized sources back to the same paragraph/heading/list UI without injecting HTML. */
export function announcementHtmlToBlocks(input:string):AnnouncementBlock[]{
 const safe=announcementHtml(input),blocks:AnnouncementBlock[]=[];let type:AnnouncementBlock['type']='p',text='';
 const flush=()=>{if(text.trim())blocks.push({type,text:text.trim()});text='';};
 const parser=new Parser({onopentag(name){if(['p','h2','h3','li','blockquote'].includes(name)){flush();type=name==='li'?'li':name==='h2'||name==='h3'?'h':'p';}else if(name==='br')text+='\n';},ontext(value){text+=value;},onclosetag(name){if(['p','h2','h3','li','blockquote'].includes(name))flush();}},{decodeEntities:true});
 parser.write(safe);parser.end();flush();if(!blocks.length||blocks.length>500)validation('body','Nội dung thông báo vượt giới hạn khối');return blocks;
}
