import { AsyncLocalStorage } from 'node:async_hooks';
export interface SupportReadContext {grantId:string;operatorId:string;schoolId:string;classId:string|null;allowedActions:string[]}
const context=new AsyncLocalStorage<SupportReadContext>();
export const currentSupportRead=()=>context.getStore();
export function runSupportRead<T>(selected:SupportReadContext,work:()=>Promise<T>){return context.run(selected,work);}
export const supportReadOperations:Record<string,string[]>={
  'school.read':['getSchoolProfile'],'school.settings':['getSchoolSettings'],
  'class.read':['listClasss','getClass'],'assignment.read':['listAssignments'],
  'year.read':['listYears','getYear','listTerms','getTerm','listWeeks','getWeek'],
  'dictionary.read':['listDictionary'],'member.read':['listMembers','getMember'],
  'role.read':['listRoles','getRole'],'import.read':['listImports','getImport'],
};
