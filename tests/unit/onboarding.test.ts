// @vitest-environment jsdom
import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest';
import {authenticationChanged} from '@/lib/api/client';
import {PARENT_PROGRESS_KEY,progressKey,sessionProgress,rememberProgress,readParentProgress,saveParentProgress,wasInvited,markInvited} from '@/components/onboarding/progress';
import {TOURS,permittedSteps,visibleTarget} from '@/components/onboarding/registry';
import {markFormDirty,commandStarted,commandFinished,hasWorkInProgress} from '@/components/ui/work-state';
const storage=():Storage=>{const values=new Map<string,string>();return {get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);},clear:()=>values.clear()};};
beforeEach(()=>{vi.stubGlobal('localStorage',storage());vi.stubGlobal('sessionStorage',storage());});
afterEach(()=>{vi.restoreAllMocks();localStorage.clear();sessionStorage.clear();authenticationChanged();document.body.innerHTML='';markFormDirty('form',false);commandFinished();vi.unstubAllGlobals();});
describe('guided tour ownership and safe UI state',()=>{
 it('keeps progress separate by user school and duty; completed cannot be downgraded in the session',()=>{
  const key=progressKey('u1','school-a','class-homeroom');rememberProgress(key,'completed');rememberProgress(key,'skipped');expect(sessionProgress(key)).toBe('completed');
  for(const other of [progressKey('u2','school-a','class-homeroom'),progressKey('u1','school-b','class-homeroom'),progressKey('u1','school-a','class-subject')])expect(sessionProgress(other)).toBeUndefined();
  authenticationChanged();expect(sessionProgress(key)).toBeUndefined();
 });
 it('stores only a parent UI flag; replay preserves completed and denied browser storage falls back to memory',()=>{
  saveParentProgress('completed');saveParentProgress('skipped');expect(readParentProgress()).toBe('completed');expect([...Array(localStorage.length)].map((_,i)=>localStorage.key(i))).toEqual([PARENT_PROGRESS_KEY]);expect(localStorage.getItem(PARENT_PROGRESS_KEY)).toBe('completed');
  vi.spyOn(localStorage,'getItem').mockImplementation(()=>{throw new Error('blocked');});vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('blocked');});expect(saveParentProgress('skipped')).toBe(false);expect(readParentProgress()).toBe('completed');
 });
 it('allows at most one auto invitation across workspace changes and clears only staff state on logout',()=>{
  markInvited('u1');expect(wasInvited('u1')).toBe(true);expect(wasInvited('u2')).toBe(false);authenticationChanged();expect(wasInvited('u1')).toBe(false);
 });
 it('omits subject whole-class publication and requires explicit platform authority',()=>{
  expect(TOURS['class-subject'].steps.some(s=>s.targets.includes('class-publication'))).toBe(false);expect(TOURS['class-homeroom'].autoPrompt).toBe(false);
  expect(permittedSteps('platform-overview',[]).map(s=>s.targets[0])).toEqual(['workspace-overview','tour-help']);
  for(const t of Object.values(TOURS))expect(t.steps.length).toBeLessThanOrEqual(7);
 });
 it('uses only visible stable targets and falls back when desktop navigation is hidden',()=>{
  document.body.innerHTML='<button data-tour="desktop" style="display:none"></button><button data-tour="mobile"></button>';
  document.querySelector<HTMLElement>('[data-tour="mobile"]')!.getClientRects=()=>[{width:40,height:40}] as unknown as DOMRectList;
  expect(visibleTarget({targets:['desktop','mobile'],title:'t',description:'d'})?.dataset.tour).toBe('mobile');
  document.querySelector('[data-tour="mobile"]')?.remove();expect(visibleTarget({targets:['desktop','mobile'],title:'t',description:'d'})).toBeNull();
 });
 it('blocks optional UI during dirty forms or overlapping commands, then recovers',()=>{
  markFormDirty('form',true);expect(hasWorkInProgress()).toBe(true);markFormDirty('form',false);commandStarted();commandStarted();commandFinished();expect(hasWorkInProgress()).toBe(true);commandFinished();expect(hasWorkInProgress()).toBe(false);
 });
});
