"use client";
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {useIsFetching} from '@tanstack/react-query';
import {BookOpenText} from 'lucide-react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {http} from '@/lib/api/client';
import {useSession} from '@/lib/query/hooks';
import {useToast} from '@/components/ui/toast';
import {hasWorkInProgress} from '@/components/ui/work-state';
import {Modal} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {TOURS,visibleTarget,type TourKey,type StaffTourKey} from './registry';
import {markInvited,wasInvited,progressKey,sessionProgress,rememberProgress,readParentProgress,saveParentProgress} from './progress';

type TourApi={start:(key?:TourKey)=>void;active:boolean};
const Context=createContext<TourApi|null>(null);
export function useTour(){return useContext(Context);}
let activeOwner:symbol|null=null;
export function TourProvider({tourKey,schoolId,contextKey,enabled=true,parent=false,preview=false,children,prepareNavigation,restoreNavigation}:{tourKey:TourKey;schoolId?:string;contextKey:string;enabled?:boolean;parent?:boolean;preview?:boolean;children:ReactNode;prepareNavigation?:()=>void;restoreNavigation?:()=>void}){
 const {actor}=useSession(),pathname=usePathname(),fetching=useIsFetching(),toast=useToast();
 const owner=parent?'parent':actor.kind==='anonymous'?'':actor.userId;
 const [welcome,setWelcome]=useState(false),[active,setActive]=useState(false);
 const lease=useRef(Symbol('tour')),request=useRef<AbortController|null>(null),destroy=useRef<(()=>void)|null>(null);
 const openRef=useRef<HTMLElement|null>(null),progress=useRef<Set<string>|null>(null),loading=useRef(false);
 const current=useRef({owner,schoolId,contextKey,pathname,enabled,parent,preview,fetching});
 useEffect(()=>{current.current={owner,schoolId,contextKey,pathname,enabled,parent,preview,fetching};},[owner,schoolId,contextKey,pathname,enabled,parent,preview,fetching]);
 const safe=()=>{
  if(!current.current.enabled||!current.current.owner||preview||hasWorkInProgress()||current.current.fetching>0)return false;
  if(document.querySelector('[role="dialog"],[role="alertdialog"],[role="menu"],[aria-busy="true"]'))return false;
  return !!document.querySelector('main h1')&&!document.querySelector('main [role="alert"]');
 };
 const cleanup=()=>{
  request.current?.abort();request.current=null;destroy.current?.();destroy.current=null;
  if(activeOwner===lease.current)activeOwner=null;
  restoreNavigation?.();setActive(false);setWelcome(false);
 };
 const finish=(key:TourKey,status:'skipped'|'completed')=>{
  const snapshot={...current.current};cleanup();
  requestAnimationFrame(()=>{if(snapshot.contextKey!==current.current.contextKey||snapshot.pathname!==current.current.pathname)return;const opener=openRef.current;const target=opener?.isConnected&&opener!==document.body&&opener.getClientRects().length?opener:document.querySelector<HTMLElement>('[data-tour="tour-help"]');target?.focus();});
  if(snapshot.preview)return;
  if(snapshot.parent){if(!saveParentProgress(status))toast.push({tone:'info',title:'Đã đóng hướng dẫn',detail:'Chưa lưu được trên trình duyệt; chỉ ghi nhớ trong phiên này.'});return;}
  rememberProgress(progressKey(snapshot.owner,snapshot.schoolId,key),status);
  const controller=new AbortController();request.current=controller;
  void http('putMyOnboarding',{params:{tourKey:key as StaffTourKey},body:{schoolId:snapshot.schoolId??null,tourVersion:1,status},signal:controller.signal})
   .catch(()=>{if(!controller.signal.aborted&&snapshot.contextKey===current.current.contextKey)toast.push({tone:'info',title:'Chưa đồng bộ trạng thái hướng dẫn',detail:'Bạn vẫn dùng CMS bình thường. Máy khác có thể còn mời xem hướng dẫn.'});})
   .finally(()=>{if(request.current===controller)request.current=null;});
 };
 const start=(key:TourKey=tourKey,fromWelcome=false)=>{
  if(!enabled||preview||hasWorkInProgress()||(!fromWelcome&&!safe())||activeOwner&&activeOwner!==lease.current)return;
  if(parent&&key!=='parent-overview'||!parent&&key==='parent-overview')return;
  openRef.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  setWelcome(false);setActive(true);activeOwner=lease.current;
  const controller=new AbortController();request.current?.abort();request.current=controller;
  if(!key.startsWith('class-'))prepareNavigation?.();
  // Wait for safe navigation UI to render. This is a DOM condition, not a load delay.
  const ready=()=>TOURS[key].steps.some(s=>visibleTarget(s));
  let stopWaiting=()=>undefined;
  const launch=async()=>{
   stopWaiting();
   try{
    const {startTour}=await import('./engine');if(controller.signal.aborted)return;
    const stop=await startTour(key,controller.signal,status=>finish(key,status),()=>{cleanup();toast.push({tone:'info',title:'Chưa tìm thấy phần cần hướng dẫn',detail:'Bạn có thể mở lại từ Trợ giúp khi trang sẵn sàng.'});});
    if(controller.signal.aborted)stop();else destroy.current=stop;
   }catch{if(!controller.signal.aborted){cleanup();toast.push({tone:'info',title:'Chưa tải được hướng dẫn',detail:'Bạn vẫn có thể dùng CMS và mở lại hướng dẫn sau.'});}}
  };
  let frame=0;
  const deadline=window.setTimeout(()=>{stopWaiting();cleanup();},2500);
  const check=()=>{if(controller.signal.aborted){stopWaiting();return;}if(ready()){void launch();return;}frame=requestAnimationFrame(check);};
  stopWaiting=()=>{cancelAnimationFrame(frame);clearTimeout(deadline);};
  // Two paint cycles allow an existing mobile drawer to mount before target filtering.
  frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(check);});
  controller.signal.addEventListener('abort',stopWaiting,{once:true});
 };
 useEffect(()=>{
  progress.current=null;loading.current=false;
  let disposed=false;const controller=new AbortController();
  const invite=()=>{
   if(disposed||!TOURS[tourKey].autoPrompt||!safe()||wasInvited(owner)||activeOwner)return;
   if(readParentProgress()&&parent)return;
   if(sessionProgress(progressKey(owner,schoolId,tourKey)))return;
   if(!parent&&progress.current===null){
    if(loading.current)return;loading.current=true;
    void http('getMyOnboarding',{query:{schoolId},signal:controller.signal}).then(r=>{if(!disposed){progress.current=new Set(r.data.progress.map(p=>p.tourKey));invite();}}).catch(()=>{/* No auto prompt when server progress is uncertain. Manual replay remains available. */}).finally(()=>{loading.current=false;});return;
   }
   if(progress.current?.has(tourKey))return;
   if(!TOURS[tourKey].steps.some(s=>visibleTarget(s)))return;
   markInvited(owner);activeOwner=lease.current;openRef.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setWelcome(true);
  };
  const observer=new MutationObserver(invite);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-busy','hidden','data-state']});
  window.addEventListener('edu:work-state',invite);invite();
  return()=>{disposed=true;controller.abort();observer.disconnect();window.removeEventListener('edu:work-state',invite);cleanup();};
  // Context identity owns all outstanding requests and overlays.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[owner,schoolId,contextKey,pathname,tourKey,enabled,parent,preview]);
 useEffect(()=>{if(!fetching)window.dispatchEvent(new Event('edu:work-state'));},[fetching]);
 return <Context.Provider value={{start:(key)=>start(key),active:active||welcome}}>
  {children}
  <Modal open={welcome} onOpenChange={open=>{if(!open)finish(tourKey,'skipped');}} title="Chào mừng bạn đến với EduManage" description="Cùng xem nhanh các khu vực bạn sẽ dùng thường xuyên. Bạn có thể bỏ qua và xem lại trong Trợ giúp." size="sm"
   footer={<><Button variant="ghost" onClick={()=>finish(tourKey,'skipped')}>Bỏ qua</Button><Button variant="primary" onClick={()=>start(tourKey,true)}>Bắt đầu hướng dẫn</Button></>}>
   <p data-tour-welcome className="text-sm text-body">Hướng dẫn chỉ giới thiệu giao diện. Đóng hướng dẫn khi bạn muốn làm việc.</p>
  </Modal>
 </Context.Provider>;
}
export function TourHelp({className=''}:{className?:string}){
 const tour=useTour(),replay=useRef(false);if(!tour)return null;
 return <Menu.Root modal={false}>
  <Menu.Trigger asChild><button type="button" data-tour="tour-help" className={`btn btn-ghost btn-sm ${className}`} aria-label="Trợ giúp" disabled={tour.active}><BookOpenText className="size-4" aria-hidden/><span className="hidden sm:inline">Trợ giúp</span></button></Menu.Trigger>
  <Menu.Portal><Menu.Content align="end" sideOffset={6} className="z-[70] rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-pop)]" onCloseAutoFocus={()=>{if(replay.current){replay.current=false;requestAnimationFrame(()=>tour.start());}}}>
   <Menu.Item className="cursor-pointer rounded-lg px-3 py-2 text-sm text-ink outline-none data-[highlighted]:bg-primary-light" onSelect={()=>{replay.current=true;}}>Xem lại hướng dẫn</Menu.Item>
  </Menu.Content></Menu.Portal>
 </Menu.Root>;
}
