"use client";
import type {ReactNode} from 'react';
import type {RepoError} from '@/lib/repositories/errors';
import {ErrorState} from '@/components/ui/states';

export function PickerState({query,empty,emptyText='Chưa có dữ liệu phù hợp.',children}:{query:{isLoading:boolean;error:RepoError|null;refetch:()=>unknown};empty?:boolean;emptyText?:string;children?:ReactNode}){
 if(query.error)return <ErrorState compact error={query.error} onRetry={()=>query.refetch()}/>;
 if(query.isLoading)return <p role="status" className="text-sm text-muted">Đang tải dữ liệu…</p>;
 return empty?<div className="space-y-2"><p className="text-sm text-muted">{emptyText}</p>{children}</div>:null;
}
