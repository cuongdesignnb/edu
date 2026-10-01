import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const prior=JSON.parse(execFileSync('git',['show','600c3fd:backend/src/generated/contract.json'],{maxBuffer:32*1024*1024,encoding:'utf8'})),current=JSON.parse(await fs.readFile('backend/src/generated/contract.json','utf8'));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):v;
const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const result={base:'600c3fd',oldOperations:prior.operations.length,newOperations:current.operations.length,addedOperations:current.operations.filter(o=>!prior.operations.some(p=>p.id===o.id)).map(o=>o.id),changedExistingOperations:prior.operations.filter(o=>!equal(o,current.operations.find(p=>p.id===o.id))).map(o=>o.id),oldSchemas:Object.keys(prior.schemas).length,newSchemas:Object.keys(current.schemas).length,changedExistingSchemas:Object.keys(prior.schemas).filter(n=>!equal(prior.schemas[n],current.schemas[n]))};
await fs.writeFile('qa/backend/b6-conduct-rules-contract-diff.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(result.changedExistingOperations.length||result.changedExistingSchemas.length)process.exitCode=1;
