import fs from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'../..'),filename=path.join(root,'docs/backend-progress.json');
const progress=JSON.parse(await fs.readFile(filename,'utf8'));
const [,,status,evidence,...ids]=process.argv;
if(!['IMPLEMENTED','TESTED','BLOCKED','STATIC_VERIFIED'].includes(status)||!evidence||!ids.length)throw new Error('Usage: status actual-evidence screenId...');
for(const id of ids){
  const screen=progress.screens.find(value=>value.screenId===id);
  if(!screen)throw new Error(`Unknown screen ${id}`);
  screen.status=status;if(!screen.evidence.includes(evidence))screen.evidence.push(evidence);
}
await fs.writeFile(filename,JSON.stringify(progress,null,2)+'\n');
const operations=progress.operations.map(op=>`| ${op.operationId} | ${op.screenIds.join(', ')} | ${op.status} | ${op.evidence.join('; ')} |`).join('\n');
const screens=progress.screens.map(s=>`| ${s.screenId} | ${s.scope} | ${s.apiStatus??'NOT_REQUIRED'} | ${s.status} | ${s.staticReason} | ${s.evidence.join('; ')} |`).join('\n');
await fs.writeFile(path.join(root,'docs/backend-progress.md'),'# Backend operation and screen progress\n\nBaseline `14dfad5`. UI status is separate from API evidence.\n\n'
  +'| operationId | screenId | Status | Evidence |\n|---|---|---|---|\n'+operations+'\n\n'
  +'| screenId | Scope | API status | UI status | Static mapping | UI evidence |\n|---|---|---|---|---|---|\n'+screens+'\n');
console.log(`Updated ${ids.length} screen source statuses. API statuses are unchanged; IMPLEMENTED does not certify PostgreSQL/browser E2E.`);
