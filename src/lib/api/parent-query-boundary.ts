import type {QueryClient} from '@tanstack/react-query';
import {onParentSessionChanged} from './parent-session';
import {onStaffAccessChanged} from './client';

/** Remove prior private results on a view switch; keep parent and staff owners independent. */
export function bindParentQueries(client:QueryClient){
  const purge=(preview:boolean)=>{
    const filters={predicate:(q:{queryKey:readonly unknown[]})=>q.queryKey[0]==='parent'&&(preview?q.queryKey[2]!==null:q.queryKey[2]===null)||q.queryKey[0]==='parent-file'};
    void client.cancelQueries(filters);client.removeQueries(filters);
  };
  const offParent=onParentSessionChanged(()=>purge(false)),offStaff=onStaffAccessChanged(()=>purge(true));
  return ()=>{offParent();offStaff();};
}
