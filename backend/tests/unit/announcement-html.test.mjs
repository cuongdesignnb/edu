import test from 'node:test';
import assert from 'node:assert/strict';
import { announcementHtml } from '../../dist/modules/announcements/html.js';
test('announcement HTML retains paragraph/list formatting while dropping executable markup, URLs and tracking resources',()=>{
  const result=announcementHtml('<h2 onclick="run()">Tiêu đề</h2><p style="color:red">Nội dung <strong>rõ ràng</strong></p><ul><li>Mục</li></ul><script>run()</script><img src="https://tracker.invalid"><a href="javascript:run()">Đọc</a><svg><script>run()</script></svg>');
  assert.match(result,/<h2>Tiêu đề<\/h2>/);assert.match(result,/<strong>rõ ràng<\/strong>/);assert.match(result,/<li>Mục<\/li>/);assert.doesNotMatch(result,/script|onclick|style=|javascript:|tracker|<img|<a|<svg/);
  assert.equal(announcementHtml(result),result);
  assert.throws(()=>announcementHtml('<script>run()</script>'),e=>e.status===422);
});
