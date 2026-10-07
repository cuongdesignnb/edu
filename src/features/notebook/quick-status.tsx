"use client";
import {useEffect,useState} from 'react';
import {http} from '@/lib/api/client';
import {useClassroom} from '@/features/classroom/context';
import type {NotebookWorkspace} from './types';

export interface NotebookTask {kind:'officers'|'activities-due';label:string;detail:string;verb:string;path:string}

/** Homeroom notebook signals for the class to-do list: officers who have not submitted this week, activities due soon. */
export function useNotebookTasks():NotebookTask[]{
 const {schoolId,classId,yearId,can}=useClassroom(),[data,setData]=useState<NotebookWorkspace|null>(null),[due,setDue]=useState<number|null>(null);
 useEffect(()=>{const a=new AbortController();if(can('groups.manage'))void http('getClassNotebookWorkspace',{params:{schoolId,classId},signal:a.signal}).then(r=>{if(!a.signal.aborted)setData(r.data as unknown as NotebookWorkspace);}).catch(()=>{});if(can('activity.manage'))void http('getClassActivitiesWorkspace',{params:{schoolId,classId,yearId},signal:a.signal}).then(r=>{if(!a.signal.aborted)setDue(r.data.activities.filter(x=>x.status==='ASSIGNED'&&new Date(x.dueAt).getTime()<=Date.now()+7*86400000).length);}).catch(()=>{});return()=>a.abort();},[schoolId,classId,yearId,can]);
 const missing=data?.officers.filter(o=>!o.revoked_at&&o.valid_from<=data.today&&(!o.valid_until||o.valid_until>data.today)&&!data.submissions.some(s=>s.officer_assignment_id===o.id&&s.submitted_at)).length??0;
 const week=data?.weeks.find(w=>w.id===data.weekId)?.week_number;
 return [
  ...(missing>0?[{kind:'officers' as const,label:'Cán bộ lớp chưa nộp báo cáo tuần',detail:`${missing} cán bộ chưa nộp${week?` tuần ${week}`:''}`,verb:'Xem & nhắc',path:'/notebook'}]:[]),
  ...(due?[{kind:'activities-due' as const,label:'Hoạt động sắp đến hạn',detail:`${due} hoạt động đến hạn trong 7 ngày hoặc đã quá hạn`,verb:'Xem',path:'/activities'}]:[]),
 ];
}
