"use client";
import {useEffect,useState} from 'react';
import {http} from '@/lib/api/client';
import {useClassroom} from '@/features/classroom/context';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Modal} from '@/components/ui/dialog';
import type {Week} from './types';
export function ScheduleCopyControls({kind}:{kind:'DUTY'|'TIMETABLE'}){
 const {schoolId,classId,readOnly,can,header}=useClassroom(),[weeks,setWeeks]=useState<Week[]>([]),[weekId,setWeekId]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[withdraw,setWithdraw]=useState(false),[reason,setReason]=useState('');
 const allowed=can(kind==='DUTY'?'duty.manage':'timetable.edit');
 useEffect(()=>{if(!allowed)return;const a=new AbortController();void http('getClassNotebookWorkspace',{params:{schoolId,classId},signal:a.signal}).then(r=>{if(a.signal.aborted)return;const w=r.data as unknown as {weeks:Week[];weekId:string};setWeeks(w.weeks);setWeekId(w.weekId);}).catch(()=>{});return()=>a.abort();},[schoolId,classId,allowed]);
 const run=async(remove=false)=>{setBusy(true);try{if(remove)await http('withdrawClassNotebookTimetable',{params:{schoolId,classId},body:{weekId,reason}});else await http('copyClassNotebookSchedule',{params:{schoolId,classId},body:{weekId,kind}});setMessage(remove?'Đã rút các tiết tương lai; lịch sử tiết đã dùng được giữ.':'Đã tạo bản nháp từ tuần trước. Mở danh sách bản nháp để rà soát và công bố.');setWithdraw(false);window.dispatchEvent(new Event('edumanage:mutation'));}catch(e){setMessage(e instanceof Error?e.message:'Chưa lưu được');}finally{setBusy(false);}};
 if(!allowed||readOnly)return null;
 return <Card className="space-y-2 p-4"><div className="flex flex-wrap items-center gap-3"><label>Tuần nhận<select aria-label="Tuần nhận bản copy" className="input ml-2" value={weekId} onChange={e=>setWeekId(e.target.value)}>{weeks.map(w=><option key={w.id} value={w.id}>Tuần {w.week_number} · {w.starts_on}</option>)}</select></label><Button disabled={busy||!weekId} onClick={()=>void run()}>Copy tuần trước sang bản nháp</Button>{kind==='TIMETABLE'&&header.nativeActions.includes('schedule.publish')&&<Button disabled={busy||!weekId} onClick={()=>setWithdraw(true)}>Rút lịch tương lai của tuần</Button>}</div>{message&&<p role="status">{message}</p>}<Modal open={withdraw} onOpenChange={setWithdraw} title="Rút lịch tương lai" description="Các tiết đã học hoặc đã có dữ liệu được giữ trong lịch sử." footer={<Button variant="primary" disabled={busy||reason.trim().length<5} onClick={()=>void run(true)}>Xác nhận rút lịch</Button>}><label>Lý do<textarea className="input mt-1 w-full" value={reason} onChange={e=>setReason(e.target.value)}/></label></Modal></Card>;
}
