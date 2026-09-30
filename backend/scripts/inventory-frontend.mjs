import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const root=path.resolve(import.meta.dirname,'../..'),directory=path.join(root,'src/lib/repositories'),methods=[];
for(const name of (await fs.readdir(directory)).filter(n=>n.endsWith('.ts')).sort()){
  const text=await fs.readFile(path.join(directory,name),'utf8'),file=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true);
  const collect=(repo,node)=>{if(!ts.isObjectLiteralExpression(node))return;for(const member of node.properties){
    if(!ts.isMethodDeclaration(member)||!member.name)continue;
    methods.push({repository:repo,method:member.name.getText(file),file:`src/lib/repositories/${name}`,line:file.getLineAndCharacterOfPosition(member.pos).line+1,parameters:member.parameters.map(p=>p.getText(file)),returnType:member.type?.getText(file)??'inferred',status:'NOT_STARTED'});
  }};
  const visit=node=>{
    if(ts.isVariableDeclaration(node)&&node.name.getText(file).endsWith('Repo')&&node.initializer)collect(node.name.getText(file),node.initializer);
    if(ts.isCallExpression(node)&&node.expression.getText(file)==='Object.assign'&&node.arguments[0]?.getText(file).endsWith('Repo'))for(const argument of node.arguments.slice(1))collect(node.arguments[0].getText(file),argument);
    ts.forEachChild(node,visit);
  };visit(file);
}
const candidates=[],aliases={connectedSessionRepo:'sessionRepo',connectedAuthRepo:'authDemoRepo',connectedSchoolRepo:'schoolRepo'};
for(const name of (await fs.readdir(path.join(directory,'connected'))).filter(n=>n.endsWith('.ts')).sort()){
  const source=await fs.readFile(path.join(directory,'connected',name),'utf8'),file=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true);
  const visit=node=>{
    if(ts.isVariableDeclaration(node)&&aliases[node.name.getText(file)]&&node.initializer&&ts.isObjectLiteralExpression(node.initializer)){
      for(const member of node.initializer.properties)if((ts.isMethodDeclaration(member)||ts.isPropertyAssignment(member))&&member.name)candidates.push({repository:aliases[node.name.getText(file)],method:member.name.getText(file),file:`src/lib/repositories/connected/${name}`,status:'IMPLEMENTED',activated:false,evidence:['Frontend typecheck/lint; API transport/session unit checks are separate from browser acceptance.']});
    }
    ts.forEachChild(node,visit);
  };visit(file);
}
for(const method of methods){const candidate=candidates.find(c=>c.repository===method.repository&&c.method===method.method);if(candidate)method.connectedCandidate=candidate;}
const file=path.join(root,'docs/frontend-adapter-inventory.json');await fs.writeFile(file,JSON.stringify({baseline:'14dfad5',mode:'CONNECTED_ADAPTERS_PENDING',methodCount:methods.length,candidateCount:candidates.length,methods,extensions:candidates.filter(c=>!methods.some(m=>m.repository===c.repository&&m.method===c.method))},null,2)+'\n');
console.log(JSON.stringify({methodCount:methods.length,repositories:Object.fromEntries([...new Set(methods.map(m=>m.repository))].map(r=>[r,methods.filter(m=>m.repository===r).length]))}));
