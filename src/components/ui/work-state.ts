// Read-only coordination for optional UI: forms and commands keep their own guards.
const dirtyForms=new Set<string>();
let commands=0;
const notify=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('edu:work-state'));};
export function markFormDirty(id:string,dirty:boolean){if(dirty)dirtyForms.add(id);else dirtyForms.delete(id);notify();}
export function commandStarted(){commands++;notify();}
export function commandFinished(){commands=Math.max(0,commands-1);notify();}
export function hasWorkInProgress(){return commands>0||dirtyForms.size>0;}
