// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ToastProvider} from '../../src/components/ui/toast';
import {useNativeCommand,useNativeRepo} from '../../src/lib/query/native-hooks';
import {RepoError,type RepoErrorCode} from '../../src/lib/repositories/errors';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
vi.mock('@/lib/api/context',()=>({makeStaffCtx:()=>({actor:{kind:'anonymous'},staffOwner:{epoch:0,assertCurrent:()=>undefined}})}));
vi.mock('@/lib/api/session',()=>({readStaffSession:()=>null,onStaffSessionChange:()=>()=>undefined,adoptAuthenticatedSession:vi.fn(),logoutStaff:vi.fn()}));
vi.mock('@/lib/query/native-provider',()=>({useNativeConnection:()=>({restored:true})}));
let root:Root|undefined;const client=new QueryClient();
async function mount(child:React.ReactNode){const host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root!.render(<QueryClientProvider client={client}><ToastProvider>{child}</ToastProvider></QueryClientProvider>));}
async function click(){await act(async()=>{document.querySelector('button')!.click();await new Promise(r=>setTimeout(r,5));});}
afterEach(async()=>{if(root)await act(async()=>root!.unmount());root=undefined;client.clear();document.body.innerHTML='';});
describe('native user command toasts',()=>{
 it.each(['VALIDATION','DUPLICATE','CONFLICT','FORBIDDEN','NETWORK'] as RepoErrorCode[])('keeps inline errors and shows %s Toast',async code=>{function Form(){const cmd=useNativeCommand(async()=>{throw new RepoError(code,undefined,{fieldErrors:{'assignment.classId':'Hãy chọn lớp.'},details:{token:'SECRET'}});});return <><button onClick={()=>void cmd.run()}>Lưu</button>{cmd.error&&<p data-inline>{cmd.error.fieldErrors?.['assignment.classId']}</p>}</>;}
 await mount(<Form/>);await click();expect(document.querySelector('[data-inline]')?.textContent).toBe('Hãy chọn lớp.');expect(document.querySelector('[role=alert]')?.textContent).toContain('Lớp — Hãy chọn lớp.');expect(document.body.textContent).not.toContain('SECRET');});
 it('announces success only after the server acknowledgement',async()=>{const gate=Promise.withResolvers<string>();function Form(){const cmd=useNativeCommand(()=>gate.promise,{success:'Đã lưu phân công'});return <button onClick={()=>void cmd.run()}>Lưu</button>;}await mount(<Form/>);await click();expect(document.querySelector('[role=status]')).toBeNull();await act(async()=>{gate.resolve('ACK');await gate.promise;});expect(document.querySelector('[role=status]')?.textContent).toContain('Đã lưu phân công');});
 it('initial read remains quiet while an explicit Retry shows Toast',async()=>{function Read(){const query=useNativeRepo(['toast-read'],async()=>{throw new RepoError('READ_ERROR');});return <button onClick={()=>void query.refetch()}>Thử lại</button>;}await mount(<Read/>);await act(async()=>{await new Promise(r=>setTimeout(r,30));});expect(document.querySelector('[role=alert]')).toBeNull();await click();expect(document.querySelector('[role=alert]')?.textContent).toContain('Không tải được dữ liệu');});
});
