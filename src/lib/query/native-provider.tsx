"use client";
import {createContext,Fragment,useContext,useEffect,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {bindStaffQueries} from '../api/query-boundary';
import {onStaffAccessChanged,staffAccessRevision} from '../api/client';
import {onStaffSessionChange,readStaffSession,watchStaffAuthentication} from '../api/session';
import type {RepoError} from '../repositories/errors';
import {PageSkeleton} from '@/components/ui/states';

type Connection={status:'loading'|'ready'|'error';error:RepoError|null;restored:boolean};
const ConnectionContext=createContext<Connection|null>(null);
export function useNativeConnection(){const value=useContext(ConnectionContext);if(!value)throw new Error('NativeStaffProvider is required');return value;}
export function useStaffPrivateScope(){
  const revision=useSyncExternalStore(onStaffAccessChanged,staffAccessRevision,()=>0);
  const session=useSyncExternalStore(onStaffSessionChange,readStaffSession,()=>null);
  return `${session?.actor.kind??'anonymous'}:${session?.actor.kind==='anonymous'?'':session?.actor.userId??''}:${revision}`;
}
/** Wrap private staff layouts so dirty forms cannot survive an actor/scope change. */
export function StaffPrivateScope({children}:{children:ReactNode}){return <Fragment key={useStaffPrivateScope()}>{children}</Fragment>;}

/** Candidate for root activation together with the native repository facade. */
export function NativeStaffProvider({children}:{children:ReactNode}){
  const client=useQueryClient(),[connection,setConnection]=useState<Connection>({status:'loading',error:null,restored:false});
  const retry=useRef<(()=>Promise<boolean>)|null>(null);
  useEffect(()=>{
    const bridge=bindStaffQueries(client,{onReady:()=>setConnection({status:'ready',error:null,restored:true}),onError:error=>setConnection(previous=>({...previous,status:'error',error}))});
    retry.current=bridge.refresh;void bridge.refresh();
    const focus=()=>{void bridge.refresh();},visible=()=>{if(document.visibilityState==='visible')focus();};
    const offBroadcast=watchStaffAuthentication(focus);
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visible);
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')focus();},30_000);
    return()=>{retry.current=null;window.clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible);offBroadcast();bridge.dispose();};
  },[client]);
  const notice=connection.status==='error'?<div role="alert" className="p-4 text-center"><p className="text-danger-text">{connection.error?.message}</p><button type="button" className="mt-2 font-semibold text-primary-strong" onClick={()=>{setConnection(previous=>({...previous,status:previous.restored?'error':'loading'}));void retry.current?.();}}>Thử lại</button></div>:null;
  if(!connection.restored)return connection.status==='loading'?<PageSkeleton />:notice;
  // A temporary refresh error keeps the owned form mounted. Authentication and
  // actual permission changes still remount StaffPrivateScope and purge queries.
  return <ConnectionContext.Provider value={connection}>{notice}{children}</ConnectionContext.Provider>;
}
