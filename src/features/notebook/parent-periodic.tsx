"use client";
import {http} from '@/lib/api/client';
import type {ApiSchemas} from '@/lib/api/generated';
import {captureParentSession} from '@/lib/api/parent-session';
import {useParent,useParentRead} from '@/features/parent/shell';
import {Card} from '@/components/ui/card';
import {PState} from '@/features/parent/views/common';
export function ParentPeriodicSection({periodType}:{periodType:'MONTH'|'TERM'|'YEAR'}){
 const p=useParent(),q=useParentRead(['periodic',periodType],async(key,slug)=>{if('preview' in key)return [] as ApiSchemas['ParentConduct'][];const owner=captureParentSession(slug,key.viewId),r=await http('listParentConduct',{params:{schoolSlug:slug},query:{periodType,limit:100},parentViewId:owner.viewId,signal:owner.signal});owner.assertCurrent();return r.data;});
 return <PState query={q}>{list=><Card className="space-y-3 p-4"><h2 className="font-bold">Xếp loại {periodType==='MONTH'?'tháng':periodType==='TERM'?'học kỳ':'năm'} đã công bố của con</h2>{p.preview&&<p>Để xem bản định kỳ, dùng link riêng đang có hiệu lực của gia đình.</p>}{!list.length&&<p>Chưa có bản định kỳ được công bố trong phạm vi link này.</p>}{list.map(r=><div className="rounded-xl border border-line p-3" key={r.periodId}><b>{r.periodLabel}</b><p>Điểm kỳ: {r.finalPoints} · Xếp loại: {r.classification??'Chưa có'}</p><p>Cộng: {r.bonusPoints} · Trừ: {r.penaltyPoints}</p><p className="text-sm text-muted">Công bố {new Date(r.publishedAt).toLocaleString('vi-VN')}</p></div>)}</Card>}</PState>;
}
