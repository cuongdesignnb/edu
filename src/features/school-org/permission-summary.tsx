"use client";
import {useState} from "react";
import {Check} from "lucide-react";
import {permissionCatalog} from "@/lib/api/generated";
import {staffRepo} from "@/lib/repositories";
import {fmtDateTime} from "@/lib/formatters";

type Member=Awaited<ReturnType<typeof staffRepo.member>>;
/** Show each effective action once while preserving every grant, scope and expiry. */
export function PermissionSummary({m,compact}:{m:Pick<Member,"effectiveGrants"|"assignments"|"accessActive">;compact?:boolean}){
 const [all,setAll]=useState(false),limit=compact?4:8;
 const actions=[...new Set(m.effectiveGrants.flatMap(g=>g.actions))];
 const shown=all?actions:actions.slice(0,limit);
 const scopeLabel={SCHOOL:"Toàn trường",CLASS:"Theo lớp",SUBJECT:"Theo môn"};
 return <div className="space-y-3">
  <div className="flex flex-wrap gap-2 text-sm text-muted">{(["SCHOOL","CLASS","SUBJECT"] as const).map(scope=><span key={scope}>{scopeLabel[scope]}: {new Set(m.effectiveGrants.filter(g=>g.scopeType===scope).flatMap(g=>g.actions)).size} quyền</span>)}</div>
  {!actions.length?<p className="text-sm text-muted">{m.accessActive?"Không có quyền đang hiệu lực.":"Quyền tại trường đang bị chặn."}</p>:<ul className="space-y-2">{shown.map(action=><li key={action} className="rounded-xl border border-line p-3">
   <p className="flex items-center gap-2 text-sm font-semibold"><Check className="size-4 text-success" aria-hidden/>{permissionCatalog.find(p=>p.action===action)?.label??"Quyền khác"}</p>
   <details className="mt-1 text-xs text-muted"><summary className="cursor-pointer">Nguồn và thời hạn ({m.effectiveGrants.filter(g=>g.actions.includes(action)).length})</summary><ul className="mt-2 space-y-2">{m.effectiveGrants.filter(g=>g.actions.includes(action)).map(g=>{
    const assignment=m.assignments?.find(a=>a.roleGrantId===g.id);
    return <li key={g.id}><p>Nguồn: {assignment?.label??g.roleLabel} · {g.roleLabel}</p><p>Phạm vi: {assignment?.label??scopeLabel[g.scopeType as keyof typeof scopeLabel]}</p><p>Hiệu lực: {fmtDateTime(g.validFrom)}{g.validUntil?` đến trước ${fmtDateTime(g.validUntil)}`:" — không thời hạn"}</p></li>;
   })}</ul></details>
  </li>)}</ul>}
  {actions.length>limit&&<button type="button" className="text-sm font-semibold text-primary-strong hover:underline" aria-expanded={all} onClick={()=>setAll(v=>!v)}>{all?"Thu gọn":`Xem thêm ${actions.length-limit} quyền`}</button>}
 </div>;
}
