import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),contract=JSON.parse(await fs.readFile(path.join(root,'backend/src/generated/contract.json'),'utf8'));
function type(s){
  if(!s)return 'unknown';let value;
  if(s.$ref)value=`ApiSchemas[${JSON.stringify(s.$ref.split('/').at(-1))}]`;
  else if(s.oneOf||s.anyOf)value='('+ (s.oneOf??s.anyOf).map(type).join(' | ')+')';
  else if(s.allOf)value='('+s.allOf.map(type).join(' & ')+')';
  else if(s.enum)value=s.enum.map(v=>JSON.stringify(v)).join(' | ');
  else if(s.type==='array')value=`Array<${type(s.items)}>`;
  else if(s.type==='object'||s.properties){
    const props=Object.entries(s.properties??{}).map(([key,schema])=>`${JSON.stringify(key)}${s.required?.includes(key)?'':'?'}: ${type(schema)};`);
    if(s.additionalProperties)props.push(`[key: string]: ${s.additionalProperties===true?'unknown':type(s.additionalProperties)};`);
    value='{ '+props.join(' ')+' }';
  }else value=({string:'string',number:'number',integer:'number',boolean:'boolean',null:'null'})[s.type]??'unknown';
  return s.nullable?`(${value}) | null`:value;
}
const schemas=Object.entries(contract.schemas).map(([name,schema])=>`  ${JSON.stringify(name)}: ${type(schema)};`).join('\n');
const operations=Object.fromEntries(contract.operations.map(o=>[o.id,{method:o.method,path:o.path,auth:o.auth,request:o.request,response:o.response,list:o.list,permission:o.permission}]));
const text='// Generated from the validated backend contract. Do not hand-edit.\n'
  +`export interface ApiSchemas {\n${schemas}\n}\n\nexport const apiOperations = ${JSON.stringify(operations,null,2)} as const;\n`
  +`export type OperationId = keyof typeof apiOperations;\nexport type ApiRequest<K extends OperationId> = (typeof apiOperations)[K]['request'] extends keyof ApiSchemas ? ApiSchemas[(typeof apiOperations)[K]['request']] : never;\n`
  +`export type ApiData<K extends OperationId> = (typeof apiOperations)[K]['response'] extends keyof ApiSchemas ? ApiSchemas[(typeof apiOperations)[K]['response']] : unknown;\n`;
await fs.mkdir(path.join(root,'src/lib/api'),{recursive:true});await fs.writeFile(path.join(root,'src/lib/api/generated.ts'),text);
console.log(`Generated ${contract.operations.length} operations and ${Object.keys(contract.schemas).length} browser DTO types.`);
