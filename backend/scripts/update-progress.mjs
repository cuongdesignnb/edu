import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const filename=path.join(root,'docs/backend-progress.json');
const progress=JSON.parse(await fs.readFile(filename,'utf8'));
const [, ,status,evidence,...ids]=process.argv;
if(!['IMPLEMENTED','TESTED','BLOCKED'].includes(status)||!evidence||!ids.length)throw new Error('Usage: status evidence operationId...');
for(const id of ids){
  const op=progress.operations.find(op=>op.operationId===id);
  if(!op)throw new Error(`Unknown operation ${id}`);
  op.status=status;if(!op.evidence.includes(evidence))op.evidence.push(evidence);
}
for(const screen of progress.screens){
  if(!screen.operationIds.length)continue;
  const states=screen.operationIds.map(id=>progress.operations.find(op=>op.operationId===id).status);
  // API completion alone never certifies frontend connection/E2E.
  screen.apiStatus=states.every(s=>s==='TESTED')?'TESTED':states.every(s=>['TESTED','IMPLEMENTED'].includes(s))?'IMPLEMENTED':'PARTIAL';
}
await fs.writeFile(filename,JSON.stringify(progress,null,2)+'\n');
const rows=progress.operations.map(op=>`| ${op.operationId} | ${op.screenIds.join(', ')} | ${op.status} | ${op.evidence.join('; ')} |`).join('\n');
const screens=progress.screens.map(s=>`| ${s.screenId} | ${s.scope} | ${s.apiStatus??'NOT_REQUIRED'} | ${s.status} | ${s.staticReason} | ${s.evidence.join('; ')} |`).join('\n');
await fs.writeFile(path.join(root,'docs/backend-progress.md'),'# Backend operation and screen progress\n\nBaseline `14dfad5`. UI status is separate from API evidence.\n\n'
  +'| operationId | screenId | Status | Evidence |\n|---|---|---|---|\n'+rows+'\n\n'
  +'| screenId | Scope | API status | UI status | Static mapping | UI evidence |\n|---|---|---|---|---|---|\n'+screens+'\n');
console.log(`Updated ${ids.length} operations; connected UI is still pending until B6 evidence.`);
