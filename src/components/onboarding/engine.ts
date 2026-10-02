import {driver,type Driver} from 'driver.js';
import 'driver.js/dist/driver.css';
import './tour.css';
import {permittedSteps,visibleTarget,type TourKey} from './registry';
import {readStaffContext} from '@/lib/api/session';

export async function startTour(key:TourKey,signal:AbortSignal,onEnd:(status:'skipped'|'completed')=>void,onUnavailable:()=>void){
 let steps=permittedSteps(key,readStaffContext()?.platformActions).flatMap(s=>{const element=visibleTarget(s);return element?[{element,popover:{title:s.title,description:s.description}}]:[];});
 if(signal.aborted)return ()=>undefined;
 if(!steps.length){onUnavailable();return ()=>undefined;}
 let engine:Driver|null=null,disposed=false;
 const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
 const inert=new Map<HTMLElement,boolean>();
 const cleanup=()=>{
  if(disposed)return;disposed=true;
  observer.disconnect();signal.removeEventListener('abort',cleanup);
  if(missingTimer)clearTimeout(missingTimer);
  document.removeEventListener('keydown',keyboard,true);document.removeEventListener('keyup',keyUp,true);
  document.removeEventListener('click',block,true);document.removeEventListener('pointerdown',block,true);
  engine?.destroy();inert.forEach((value,el)=>{el.inert=value;});
  if(opener?.isConnected&&!opener.closest('[inert]')&&opener.getClientRects().length)opener.focus();
  else document.querySelector<HTMLElement>('[data-tour="tour-help"]')?.focus();
 };
 const finish=(status:'skipped'|'completed')=>{cleanup();onEnd(status);};
 const block=(event:Event)=>{
  const target=event.target instanceof Element?event.target:null;
  if(!target?.closest('.edumanage-tour')){event.preventDefault();event.stopImmediatePropagation();}
 };
 const keyUp=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();}};
 const keyboard=(e:KeyboardEvent)=>{
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish('skipped');return;}
  const popover=document.querySelector<HTMLElement>('.edumanage-tour');
  if(e.key==='Tab'&&popover){
   const buttons=[...popover.querySelectorAll<HTMLButtonElement>('button')].filter(b=>!b.disabled&&b.getClientRects().length);
   const current=buttons.indexOf(document.activeElement as HTMLButtonElement);
   e.preventDefault();e.stopImmediatePropagation();buttons[(current+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();
  }else if(!popover?.contains(document.activeElement)){e.preventDefault();e.stopImmediatePropagation();}
 };
 let missingTimer:ReturnType<typeof setTimeout>|undefined;
 const observer=new MutationObserver(()=>{
  const active=engine?.getActiveElement();
  if(active&&(!active.isConnected||!active.getClientRects().length)){
   if(!missingTimer)missingTimer=setTimeout(()=>{if(!disposed){cleanup();onUnavailable();}},1500);
  }else if(missingTimer){clearTimeout(missingTimer);missingTimer=undefined;}
 });
 const move=(direction:1|-1)=>{
  const currentElement=engine?.getActiveElement();
  const remaining=steps.filter(s=>s.element.isConnected&&s.element.getClientRects().length);
  if(remaining.length!==steps.length){steps=remaining;engine?.setSteps(steps);const current=steps.findIndex(s=>s.element===currentElement);if(current<0){cleanup();onUnavailable();return;}engine?.moveTo(current);}
  let index=(engine?.getActiveIndex()??0)+direction;
  while(index>=0&&index<steps.length&&(!steps[index].element.isConnected||!steps[index].element.getClientRects().length))index+=direction;
  if(index>=0&&index<steps.length)engine?.moveTo(index);
  else if(direction===1&&engine?.isLastStep())finish('completed');
  else {cleanup();onUnavailable();}
 };
 engine=driver({steps,animate:!matchMedia('(prefers-reduced-motion: reduce)').matches,smoothScroll:false,
  overlayColor:'#0b1b3a',overlayOpacity:0.55,stageRadius:12,stagePadding:6,
  disableActiveInteraction:true,allowClose:true,overlayClickBehavior:()=>undefined,allowKeyboardControl:false,
  showProgress:true,progressText:'Bước {{current}}/{{total}}',nextBtnText:'Tiếp theo',prevBtnText:'Quay lại',doneBtnText:'Hoàn tất',
  showButtons:['previous','next','close'],popoverClass:'edumanage-tour',
  onCloseClick:()=>finish('skipped'),onNextClick:()=>move(1),onPrevClick:()=>move(-1),onDoneClick:()=>finish('completed'),
  onPopoverRender:(popover)=>{
   popover.wrapper.dataset.tourOverlay='true';popover.wrapper.setAttribute('role','dialog');popover.wrapper.setAttribute('aria-modal','true');
   popover.title.id='edu-tour-title';popover.description.id='edu-tour-description';
   popover.wrapper.setAttribute('aria-labelledby',popover.title.id);popover.wrapper.setAttribute('aria-describedby',popover.description.id);
   popover.closeButton.setAttribute('aria-label','Đóng hướng dẫn');
   const skip=document.createElement('button');skip.type='button';skip.textContent='Bỏ qua';skip.className='edu-tour-skip';skip.onclick=()=>finish('skipped');popover.footerButtons.prepend(skip);
   for(const child of document.body.children){if(child instanceof HTMLElement&&!child.contains(popover.wrapper)&&!child.classList.contains('driver-overlay')){if(!inert.has(child))inert.set(child,child.inert);child.inert=true;}}
   popover.nextButton.focus();
  },
  onDestroyed:()=>{if(!disposed)cleanup();},
 });
 document.addEventListener('keydown',keyboard,true);document.addEventListener('keyup',keyUp,true);
 document.addEventListener('click',block,true);document.addEventListener('pointerdown',block,true);
 signal.addEventListener('abort',cleanup,{once:true});
 observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','style','class']});
 engine.drive();
 return ()=>{if(missingTimer)clearTimeout(missingTimer);cleanup();};
}
