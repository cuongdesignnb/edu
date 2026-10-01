import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {apiRepository} from '@/lib/repositories/connected/facade';
import {platformExtraRepo,studentsExtraRepo} from '@/lib/repositories';
import {authenticationChanged,setStaffCsrf} from '@/lib/api/client';

afterEach(()=>{vi.unstubAllGlobals();authenticationChanged();});
describe('connected root boundary',()=>{
  it('delegates activated methods to the API and rejects a missing integration instead of reading a demo database',async()=>{
    authenticationChanged();setStaffCsrf('unit-csrf');const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:{codeTaken:false,slugTaken:true},requestId:'native-root'})));vi.stubGlobal('fetch',fetcher);
    expect(await platformExtraRepo.checkSchoolIdentity({} as never,'NATIVE','native-school')).toEqual({codeTaken:false,slugTaken:true});expect(fetcher.mock.calls[0][0]).toBe('/api/v1/platform/school-identity?code=NATIVE&slug=native-school');
    await expect(studentsExtraRepo.exportStudents({} as never,'school-id',[])).rejects.toMatchObject({code:'READ_ERROR'});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not expose a thenable or pretend an unavailable mutation was acknowledged',async()=>{
    const repository=apiRepository<{save:()=>Promise<{ok:boolean}>},{read:()=>Promise<number>}>({read:async()=>7});
    expect(await repository).toBe(repository);expect(await repository.read()).toBe(7);await expect(repository.save()).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('has no runtime route dependency on fixtures, IndexedDB, legacy repositories or demo sessions',()=>{
    const root=process.cwd(),source=path.join(root,'src'),seen=new Set<string>(),forbidden:string[]=[];
    const entries=(directory:string):string[]=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?entries(path.join(directory,entry.name)):entry.name.endsWith('.tsx')||entry.name.endsWith('.ts')?[path.join(directory,entry.name)]:[]);
    const resolve=(specifier:string,file:string)=>{
      const base=specifier.startsWith('@/')?path.join(source,specifier.slice(2)):specifier.startsWith('.')?path.resolve(path.dirname(file),specifier):null;
      if(!base)return null;return [base,base+'.ts',base+'.tsx',path.join(base,'index.ts'),path.join(base,'index.tsx')].find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile())??null;
    };
    const visitFile=(file:string)=>{
      if(seen.has(file)||!file.match(/\.tsx?$/))return;seen.add(file);
      const relative=path.relative(root,file).replaceAll('\\','/');
      if(relative.match(/^src\/lib\/(demo\/|repositories\/(store|core|demo-index|session|platform|platform-extra|students|students-extra|parent|parent-extra|school|staff|classroom|attendance|conduct|activities|announcements|reports|support|search|teacher-extra|school-ops-extra|school-org-extra)\.ts$|query\/demo-)/))forbidden.push(relative);
      const emitted=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.Preserve}}).outputText;
      const ast=ts.createSourceFile(file+'.js',emitted,ts.ScriptTarget.Latest,true);
      const walk=(node:ts.Node)=>{
        if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){const target=resolve(node.moduleSpecifier.text,file);if(target)visitFile(target);if(node.moduleSpecifier.text==='idb-keyval')forbidden.push('idb-keyval');}
        if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])){const target=resolve(node.arguments[0].text,file);if(target)visitFile(target);}
        ts.forEachChild(node,walk);
      };walk(ast);
    };
    for(const file of entries(path.join(source,'app')))visitFile(file);
    expect(seen.size).toBeGreaterThan(200);expect(forbidden).toEqual([]);
  });
});
