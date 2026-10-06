import type {QueryClient} from '@tanstack/react-query';
import {onStaffAccessChanged,onStaffMutationAcknowledged} from './client';
import {restoreStaffSession} from './session';
import {RepoError,isRepoError} from '../repositories/errors';

export const STAFF_QUERY_DOMAIN='staff-api';
type Options={onReady:()=>void;onError:(error:RepoError)=>void;restore?:()=>Promise<unknown>};

/** One cache partition for staff; parent/public requests keep independent ownership. */
export function bindStaffQueries(client:QueryClient,options:Options){
  let alive=true,pending:Promise<boolean>|null=null,mutationRevision=0,refreshedRevision=0;
  const filters={queryKey:[STAFF_QUERY_DOMAIN]};
  const purge=()=>{void client.cancelQueries(filters);client.removeQueries(filters);};
  const offAccess=onStaffAccessChanged(purge);
  const refresh=():Promise<boolean>=>{
    if(!alive)return Promise.resolve(false);if(pending)return pending;
    const work=(async()=>{
      try{
        let observed:number;
        do{
          observed=mutationRevision;
          await (options.restore??restoreStaffSession)();if(!alive)return false;
          options.onReady();
          const retryFailed=observed!==refreshedRevision;
          await client.invalidateQueries({...filters,predicate:q=>retryFailed||q.state.status!=='error'});
          refreshedRevision=observed;
        }while(alive&&observed!==mutationRevision);
        return alive;
      }catch(error){if(alive)options.onError(isRepoError(error)?error:new RepoError('READ_ERROR','Không tải được phiên từ máy chủ. Hãy thử lại.'));return false;}
    })();
    pending=work;void work.finally(()=>{if(pending===work)pending=null;});return work;
  };
  const offMutation=onStaffMutationAcknowledged(()=>{mutationRevision++;void refresh();});
  return {refresh,dispose(){alive=false;offAccess();offMutation();}};
}
