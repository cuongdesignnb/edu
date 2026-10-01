import test from 'node:test';
import assert from 'node:assert/strict';
import {blocksToAnnouncementHtml,announcementHtmlToBlocks} from '../../dist/modules/announcements/announcement-blocks.js';
test('native announcement semantic blocks round trip Vietnamese plaintext and line breaks without HTML execution',()=>{
 const blocks=[{type:'h',text:'Nội dung & yêu cầu <thật>'},{type:'p',text:'Phụ huynh đọc dòng thứ nhất\nDòng thứ hai'},{type:'li',text:'Mục 1 "giữ nguyên"'},{type:'li',text:"Mục 2 'giữ nguyên'"},{type:'p',text:'Kết thúc'}];assert.deepEqual(announcementHtmlToBlocks(blocksToAnnouncementHtml(blocks)),blocks);
 const attack=[{type:'p',text:'<script>alert(1)</script><img src=x onerror=alert(2)>'}];const html=blocksToAnnouncementHtml(attack);assert.equal(html.includes('<script>'),false);assert.equal(html.includes('<img'),false);assert.deepEqual(announcementHtmlToBlocks(html),attack);
});
test('native legacy HTML projection sanitizes executable tags and preserves real headings and list text only',()=>{
 assert.deepEqual(announcementHtmlToBlocks('<h2>Thông báo</h2><p>Nội dung <strong>rõ</strong><br>Tiếp theo<script>PRIVATE</script></p><ul><li>Một</li><li>Hai</li></ul>'),[{type:'h',text:'Thông báo'},{type:'p',text:'Nội dung rõ\nTiếp theo'},{type:'li',text:'Một'},{type:'li',text:'Hai'}]);
 for(const bad of [[],[{type:'iframe',text:'x'}],[{type:'p',text:' '}],Array.from({length:501},()=>({type:'p',text:'x'}))])assert.throws(()=>blocksToAnnouncementHtml(bad));
});
