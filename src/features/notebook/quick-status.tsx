"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {http} from '@/lib/api/client';
import {useClassroom} from '@/features/classroom/context';
import {Card} from '@/components/ui/card';
import type {NotebookWorkspace} from './types';
export function NotebookQuickStatus(){
 const {schoolId,classId,yearId,base,can}=useClassroom(),[data,setData]=useState<NotebookWorkspace|null>(null),[due,setDue]=useState<number|null>(null);
 useEffect(()=>{const a=new AbortController();if(can('groups.manage'))void http('getClassNotebookWorkspace',{params:{schoolId,classId},signal:a.signal}).then(r=>{if(!a.signal.aborted)setData(r.data as unknown as NotebookWorkspace);}).catch(()=>{});if(can('activity.manage'))void http('getClassActivitiesWorkspace',{params:{schoolId,classId,yearId},signal:a.signal}).then(r=>{if(!a.signal.aborted)setDue(r.data.activities.filter(x=>x.status==='ASSIGNED'&&new Date(x.dueAt).getTime()<=Date.now()+7*86400000).length);}).catch(()=>{});return()=>a.abort();},[schoolId,classId,yearId,can]);
 const missing=data?.officers.filter(o=>!o.revoked_at&&o.valid_from<=data.today&&(!o.valid_until||o.valid_until>data.today)&&!data.submissions.some(s=>s.officer_assignment_id===o.id&&s.submitted_at));
 return <Card className="space-y-3 p-4"><h2 className="font-bold">Sổ chủ nhiệm</h2>{data&&<p>Tuần {data.weeks.find(w=>w.id===data.weekId)?.week_number}: {missing?.length??0} cán bộ chưa nộp.</p>}{due!==null&&<p>{due} hoạt động đến hạn trong 7 ngày hoặc đã quá hạn.</p>}<div className="flex flex-wrap gap-3">{can('groups.manage')&&<Link className="text-primary underline" href={base+'/notebook'}>Theo dõi cán bộ / mở lại tuần</Link>}{can('conduct.review')&&<Link className="text-primary underline" href={base+'/periodic'}>Xếp loại tháng / kỳ / năm</Link>}{can('guardian.view')&&<Link className="text-primary underline" href={base+'/reports/zalo'}>Soạn tin Zalo</Link>}<Link className="text-primary underline" href={base+'/activities'}>Hoạt động & minh chứng</Link></div></Card>;
}
