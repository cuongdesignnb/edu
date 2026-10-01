import {RepoError} from '../errors';

/** Missing integrations fail explicitly; a legacy repository is used only as a type. */
export function apiRepository<Legacy extends object,Native extends object>(native:Native):Native & Omit<Legacy,keyof Native>{
  return new Proxy(native,{
    get(target,key,receiver){
      if(Reflect.has(target,key))return Reflect.get(target,key,receiver);
      if(typeof key!=='string'||key==='then')return undefined;
      return async()=>{throw new RepoError('READ_ERROR','Chức năng hiện chưa sẵn sàng. Vui lòng thử lại sau.');};
    },
  }) as Native & Omit<Legacy,keyof Native>;
}
