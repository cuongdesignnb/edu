import {http,authenticationChanged} from '../../api/client';
import {resetCredential,consumeResetCredential} from '../../api/fragments';
import {RepoError} from '../errors';

export const connectedAuthRepo={
  async requestPasswordReset(email:string){
    await http('forgotPassword',{body:{email:email.trim()},validateData:value=>!!value?.id&&value.status==='ACCEPTED'});
    return {accepted:true as const};
  },
  /** Presence enables the form; only the reset command validates and consumes a server challenge. */
  async checkResetToken(){return {state:resetCredential()?'present' as const:'missing' as const};},
  async completePasswordReset(_legacyToken:string,password:string,confirm:string){
    const token=resetCredential();if(!token)throw new RepoError('EXPIRED','Hãy mở đầy đủ đường dẫn đặt lại mật khẩu trong email.');
    if(password!==confirm)throw new RepoError('VALIDATION',undefined,{fieldErrors:{confirm:'Mật khẩu nhập lại không khớp'}});
    await http('resetPassword',{body:{token,password},validateData:value=>!!value?.id&&value.status==='COMPLETED'});
    consumeResetCredential();authenticationChanged();return {done:true as const};
  },
  async healthCheck(){const value=(await http('healthReady')).data;return {ok:value.status==='ok',buildSha:value.buildSha};},
};
