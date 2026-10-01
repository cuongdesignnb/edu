"use client";
import {useCallback,useContext,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {NativeSchoolScope} from './native-school-scope';
import {useQuery,type UseQueryOptions} from '@tanstack/react-query';
import {onStaffAccessChanged,staffAccessRevision} from '../api/client';
import {makeStaffCtx} from '../api/context';
import {readStaffSession,onStaffSessionChange,adoptAuthenticatedSession,logoutStaff} from '../api/session';
import {STAFF_QUERY_DOMAIN} from '../api/query-boundary';
import type {Ctx} from '../repositories/core';
import {RepoError,isRepoError,errorMessage} from '../repositories/errors';
import {useToast} from '@/components/ui/toast';
import {useNativeConnection} from './native-provider';

export function useNativeSession(){
  const session=useSyncExternalStore(onStaffSessionChange,readStaffSession,()=>null);
  return {session,actor:session?.actor??{kind:'anonymous' as const},signIn:adoptAuthenticatedSession,signOut:logoutStaff,expire:logoutStaff};
}
/** The render owns this context; a delayed callback cannot adopt a newer identity. */
export function useNativeCtx(schoolId?:string):Ctx{
  const selectedSchool=useContext(NativeSchoolScope);schoolId??=selectedSchool;
  const {session}=useNativeSession(),revision=useSyncExternalStore(onStaffAccessChanged,staffAccessRevision,()=>0);
  return useMemo(()=>{const value=makeStaffCtx(schoolId);return {...value,actor:session?.actor??{kind:'anonymous'},staffOwner:{...value.staffOwner!,epoch:revision}};},[session,revision,schoolId]);
}
type ReadOptions<T>=Omit<UseQueryOptions<T,RepoError>,'queryKey'|'queryFn'|'enabled'|'meta'|'placeholderData'|'initialData'|'initialDataUpdatedAt'> & {enabled?:boolean;schoolId?:string};
export function useNativeRepo<T>(key:readonly unknown[],fn:(ctx:Ctx)=>Promise<T>,options:ReadOptions<T>={}){
  const {schoolId,...opts}=options,ctx=useNativeCtx(schoolId),connection=useNativeConnection();
  return useQuery<T,RepoError>({...opts,queryKey:[STAFF_QUERY_DOMAIN,ctx.staffOwner!.epoch,...key],
    queryFn:async({signal})=>{ctx.staffOwner!.assertCurrent();signal.throwIfAborted();const value=await fn(ctx);ctx.staffOwner!.assertCurrent();signal.throwIfAborted();return value;},
    enabled:connection.restored&&opts.enabled!==false,placeholderData:undefined,initialData:undefined,retry:false,staleTime:opts.staleTime??5000,refetchOnWindowFocus:false,
    refetchOnMount:opts.refetchOnMount??(query=>query.state.status!=='error')});
}

interface CommandOptions<R>{schoolId?:string;changesAuthentication?:boolean;success?:string|((result:R)=>string);onSuccess?:(result:R)=>void;onError?:(error:RepoError)=>void;silentError?:boolean}
export function useNativeCommand<A extends unknown[],R>(fn:(ctx:Ctx,...args:A)=>Promise<R>,options:CommandOptions<R>={}){
  const ctx=useNativeCtx(options.schoolId),toast=useToast(),[pending,setPending]=useState(false),[error,setError]=useState<RepoError|null>(null),inFlight=useRef(false);
  const run=useCallback(async(...args:A):Promise<R|undefined>=>{
    if(inFlight.current)return undefined;inFlight.current=true;setPending(true);setError(null);
    const call={ctx,fn,options};
    try{
      call.ctx.staffOwner!.assertCurrent();const result=await call.fn(call.ctx,...args);
      if(!call.options.changesAuthentication)call.ctx.staffOwner!.assertCurrent();
      if(call.options.success)toast.push({tone:'success',title:typeof call.options.success==='function'?call.options.success(result):call.options.success});
      call.options.onSuccess?.(result);return result;
    }catch(value){
      const failure=isRepoError(value)?value:new RepoError('NETWORK',errorMessage(value));
      // Check ownership before writing an error or callback into a private form.
      try{if(!call.options.changesAuthentication)call.ctx.staffOwner!.assertCurrent();}catch{return undefined;}
      setError(failure);call.options.onError?.(failure);
      if(!call.options.silentError&&!['VALIDATION','DUPLICATE','CONFLICT'].includes(failure.code))toast.push({tone:'error',title:failure.code==='NETWORK'?'Chưa nhận được xác nhận lưu':'Không thực hiện được',detail:failure.message});
      return undefined;
    }finally{inFlight.current=false;setPending(false);}
  },[ctx,fn,options,toast]);
  return {run,pending,error,reset:()=>setError(null)};
}
