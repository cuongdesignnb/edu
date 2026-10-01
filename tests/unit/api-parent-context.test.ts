import {describe,expect,it} from 'vitest';
import type {ApiSchemas} from '@/lib/api/generated';
import {nativeParentContext} from '@/lib/repositories/connected/parent-context';

const slug='parent-school',wire=():ApiSchemas['ParentContext']=>({viewId:'70000000-0000-4000-8000-000000000001',school:{name:'Trường API',slug,publicContactPhone:null,shortName:null,motto:null,publicContactEmail:null,publicAddress:null},student:{displayName:'Học sinh API',classLabel:'Lớp API',schoolYearLabel:'2026–2027'},allowedSections:['overview','teachers'],allowDownload:false,csrfToken:'synthetic-private-csrf',expiresAt:'2026-10-01T08:00:00Z',today:'2026-10-01',year:{label:'2026–2027',startsOn:'2026-09-01',endsOn:'2027-06-01'},relationshipLabel:'Mẹ',linkExpiresAt:'2026-11-01T00:00:00Z',lastPublishedAt:null});
describe('Native parent context display projection',()=>{
  it('keeps server dates, nullable public contact and distinct link/session deadlines without returning secrets',()=>{
    const parsed=nativeParentContext(wire(),slug);expect(parsed.csrfToken).toBe('synthetic-private-csrf');expect(parsed.display).toMatchObject({today:'2026-10-01',expiresAt:'2026-11-01T00:00:00Z',sessionExpiresAt:'2026-10-01T08:00:00Z',year:{startsOn:'2026-09-01',endsOn:'2027-06-01'},modules:['teachers'],relation:'Mẹ',lastPublishedAt:null,student:{gender:null},school:{publicPhone:null,publicEmail:null,address:null,motto:null}});expect(parsed.display).not.toHaveProperty('viewId');expect(parsed.display).not.toHaveProperty('csrfToken');expect(JSON.stringify(parsed.display)).not.toContain('synthetic-private-csrf');
  });
  it('rejects another school/view identifier, missing server metadata and inconsistent year/link bounds',()=>{
    const cases=[{...wire(),school:{...wire().school,slug:'another-school'}},{...wire(),viewId:'raw-secret'},{...wire(),today:undefined},{...wire(),year:undefined},{...wire(),year:{...wire().year!,label:'Other year'}},{...wire(),year:{...wire().year!,startsOn:'2027-07-01'}},{...wire(),expiresAt:'2027-01-01T00:00:00Z'},{...wire(),lastPublishedAt:undefined}];
    for(const value of cases)expect(()=>nativeParentContext(value,slug)).toThrow();
  });
  it('does not borrow document download rights or accept an invented section/duplicate',()=>{
    for(const value of [{...wire(),allowDownload:true},{...wire(),allowedSections:['overview','unknown']},{...wire(),allowedSections:['overview','overview']}])expect(()=>nativeParentContext(value as ApiSchemas['ParentContext'],slug)).toThrow();
  });
  it('rejects private child fields and raw credentials before display mapping',()=>{
    for(const field of ['dateOfBirth','internalNote','guardians','token','tokenHash'])expect(()=>nativeParentContext({...wire(),student:{...wire().student,[field]:'private'}},slug)).toThrow();
  });
  it('marks staff preview explicitly and preserves an actual visible publication timestamp and public contacts',()=>{
    const value=wire();value.lastPublishedAt='2026-09-30T00:00:00Z';value.school.publicContactPhone='02812345678';value.school.publicContactEmail='school@example.invalid';const parsed=nativeParentContext(value,slug,true);expect(parsed.display).toMatchObject({isPreview:true,lastPublishedAt:value.lastPublishedAt,school:{publicPhone:'02812345678',publicEmail:'school@example.invalid'}});
  });
});
