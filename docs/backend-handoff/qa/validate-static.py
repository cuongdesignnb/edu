from pathlib import Path
import ast,collections,json,re,subprocess,yaml,hashlib,datetime
R=Path(__file__).resolve().parents[1];checks=[]
def check(name,cond,detail=''):
 checks.append({'name':name,'status':'PASS' if cond else 'FAIL','detail':detail})
 if not cond:print('FAIL',name,detail)
m=json.loads((R/'database/model.json').read_text());tables={t['name']:t for t in m['tables']};refs=m['foreign_keys']
check('DB_TABLE_NAMES_UNIQUE',len(tables)==len(m['tables']))
fkerrors=[]
for r in refs:
 try:
  a=tables[r['table']];b=tables[r['target']];ac={c['name']:c for c in a['columns']};bc={c['name']:c for c in b['columns']}
  assert len(r['columns'])==len(r['target_columns'])
  for x,y in zip(r['columns'],r['target_columns']):assert ac[x]['type']==bc[y]['type']
  assert r['target_columns']==['id'] or r['target_columns'] in b['uniques']
 except (KeyError,AssertionError):fkerrors.append(r)
check('FK_COLUMNS_TYPES_TARGET_UNIQUES',not fkerrors,str(len(refs))+' foreign keys checked')
sql=(R/'database/001-schema.sql').read_text();sqltables=re.findall(r'CREATE TABLE ([a-z_.]+)',sql)
check('SQL_TABLES_MATCH_MODEL',set(sqltables)==set(tables),f'{len(sqltables)} tables')
check('DBML_TABLES_MATCH_MODEL',set(re.findall(r'^Table ([a-z_.]+)',(R/'database/DATABASE.dbml').read_text(),re.M))==set(tables))
check('SQL_FKS_MATCH_MODEL',len(re.findall(' FOREIGN KEY ',sql))==len(refs))
rls=(R/'database/003-rls-and-grants.sql').read_text()
check('RLS_ALL_TENANT_TABLES_DECLARED',all('ALTER TABLE '+t['name']+' FORCE ROW LEVEL SECURITY;' in rls for t in tables.values() if t['tenant']),f'{sum(t["tenant"] for t in tables.values())} tables; declaration check only')
check('NO_DESTRUCTIVE_BASELINE_DROP',not re.search(r'\b(DROP TABLE|TRUNCATE|DROP DATABASE)\b',sql,re.I))
o=yaml.safe_load((R/'api/openapi.yaml').read_text());schema=o['components']['schemas'];bad=[];required_bad=[]
def walk(x,path=''):
 if isinstance(x,dict):
  if '$ref' in x:
   ref=x['$ref'];v=o
   try:
    assert ref.startswith('#/')
    for key in ref[2:].split('/'):v=v[key.replace('~1','/').replace('~0','~')]
   except (AssertionError,KeyError):bad.append(ref)
  if x.get('type')=='object' and 'properties' in x:
   if not set(x.get('required',[]))<=set(x['properties']):required_bad.append(path)
  for k,v in x.items():walk(v,path+'/'+str(k))
 elif isinstance(x,list):
  for v in x:walk(v,path)
walk(o)
check('OPENAPI_LOCAL_REF_RESOLUTION',not bad,str(len(schema))+' schemas; not official OpenAPI validator')
check('OPENAPI_REQUIRED_FIELDS_EXIST',not required_bad)
ids=[];badparams=[]
for path,verbs in o['paths'].items():
 for verb,op in verbs.items():
  ids.append(op['operationId'])
  pp={p['name'] for p in op.get('parameters',[]) if p['in']=='path'}
  if pp !=set(re.findall(r'{(\w+)}',path)):badparams.append(path)
check('OPENAPI_OPERATION_ID_UNIQUE',len(ids)==len(set(ids)),f'{len(ids)} operations, {len(o["paths"])} paths')
check('OPENAPI_PATH_PARAMETERS',not badparams)
ops=json.loads((R/'api/operations.json').read_text());check('OPENAPI_REGISTRY_MATCH',set(ids)=={x['id'] for x in ops})
front=json.loads((R/'inputs/screens.json').read_text());maps=json.loads((R/'api/frontend-api-map.json').read_text())
check('FRONTEND_REGISTRY_IDS_COVERED',{x['screen_id'] for x in maps}=={x['id'] for x in front},f'{len(front)} input screen/view IDs')
check('FRONTEND_OPERATION_REFS_RESOLVE',all(set(x['api_operation_ids'])<=set(ids) and (x['api_operation_ids'] or x['no_business_api_reason']) for x in maps))
check('NO_ACADEMIC_OPTIONAL_APIS',all(not x['api_operation_ids'] for x in maps if x['screen_id'].startswith('EX')))
perms=set(json.loads((R/'api/permissions.json').read_text()));roles=json.loads((R/'api/role-templates.json').read_text())['roles']
check('ROLE_ACTIONS_ALLOWLIST',all(set(x['actions'])<=perms for x in roles))
for name in ['local','production']:
 c=yaml.safe_load((R/f'deploy/compose.{name}.yml').read_text());services=c['services']
 ports=[(svc,p) for svc,s in services.items() for p in s.get('ports',[])]
 check('COMPOSE_'+name+'_LOOPBACK_ONLY',len(ports)==1 and ports[0][0]=='gateway' and ports[0][1].startswith('127.0.0.1:'),str(ports))
 check('COMPOSE_'+name+'_DEPENDENCY_NAMES',all(set(s.get('depends_on',{}))<=set(services) for s in services.values()))
 check('COMPOSE_'+name+'_SECRET_NAMES',all(all((x if isinstance(x,str) else x['source']) in c['secrets'] for x in s.get('secrets',[])) for s in services.values()))
 check('COMPOSE_'+name+'_PG_INTERNAL',not services['postgres'].get('ports') and services['postgres']['networks']==['data'] and c['networks']['data'].get('internal'))
 check('COMPOSE_'+name+'_NO_SOCKET',not any('/var/run/docker.sock' in v for s in services.values() for v in s.get('volumes',[])))
 if name=='production':check('COMPOSE_PRODUCTION_NO_BUILD',all('build' not in s for s in services.values()))
for p in (R/'scripts').glob('*.py'):
 try:ast.parse(p.read_text());v=True
 except SyntaxError:v=False
 check('PYTHON_SYNTAX_'+p.name,v)
for p in list((R/'scripts').glob('*.sh'))+[R/'deploy/init-db.sh']:
 result=subprocess.run(['bash','-n',str(p)],capture_output=True,text=True)
 check('BASH_SYNTAX_'+p.name,result.returncode==0,result.stderr)
check('SVG_EXPECTED_COUNT',len(list((R/'diagrams').glob('*.svg')))==11)
html=(R/'DATABASE-DIAGRAMS.html').read_text()
check('DIAGRAM_HTML_EMBEDS_ALL_SVGS',html.count('<svg')==11)
check('DIAGRAM_HTML_NO_EXTERNAL_SCRIPTS',not re.search(r'<script[^>]+src=',html))
check('DIAGRAM_BROWSER_PREVIEWS_EXIST',all((R/'qa/previews'/s).is_file() for s in ['architecture-view.png','parent-publication-view.png','diagram-mobile.png']))
# markdown actual document links only; paths in code examples intentionally refer to future source.
badlinks=[]
for p in R.rglob('*.md'):
 if 'inputs' in p.parts:continue
 for target in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if target.startswith(('http:','https:','#','mailto:')):continue
  path=target.split('#')[0]
  if not (p.parent/path).exists():badlinks.append((str(p.relative_to(R)),target))
# Handoff QA is written immediately below; expected missing before creation is exempt here.
badlinks=[x for x in badlinks if x[1]!='qa/HANDOFF-QA.md']
check('DOCUMENT_LINK_TARGETS_EXIST',not badlinks,str(badlinks))
check('NO_SECRETS_PACKAGED',not (R/'.secrets').exists() and not any(p.name in ['db_app_password','db_admin_password','app_key','mail_key'] for p in R.rglob('*')))
failed=[c for c in checks if c['status']=='FAIL']
report={'checked_at':'2026-09-30','scope':'static handoff checks + rendering only','summary':'PASS_STATIC' if not failed else 'FAIL_STATIC','table_count':len(tables),'fk_count':len(refs),'api_operations':len(ids),'api_paths':len(o['paths']),'frontend_items':len(front),'checks':checks,'not_run':['PostgreSQL migration execution','Database/RLS fixture integration tests','Official OpenAPI validator (package unavailable)','Docker Compose config/build/up (Docker unavailable)','Application unit/contract/E2E tests (source implementation not provided)','Performance benchmark','Production aaPanel deployment','Backup restore drill']}
(R/'qa/static-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
lines=['# Kết quả kiểm tra bộ handoff','', '**Trạng thái:** '+report['summary']+' · 30/09/2026','', 'Đây là kiểm tra tài liệu/config và trình xem sơ đồ, **không phải kiểm thử ứng dụng đã triển khai**.','', '| Kiểm tra | Kết quả | Ghi chú |','|---|---|---|']
for c in checks:lines.append('| '+c['name']+' | '+c['status']+' | '+c['detail'].replace('|','/')+' |')
lines+=['','## Kiểm tra chưa chạy','']+['- **NOT_RUN:** '+x for x in report['not_run']]+['','## Giới hạn môi trường','', 'Môi trường tạo tài liệu không có Docker hoặc PostgreSQL server/client và không có source ứng dụng frontend/backend đã lập trình. Thử cài công cụ validate bổ sung không thành công do DNS/network; không thay kết quả này bằng PASS. Ràng buộc SQL được đối chiếu tĩnh với model, chưa chứng minh PostgreSQL chấp nhận và thực thi đúng.','', '11 sơ đồ SVG được render bằng Graphviz. HTML được nạp nội dung trực tiếp trong Chromium/Playwright, chuyển tab/zoom và chụp desktop/mobile, không có JavaScript page errors. Điều hướng file:// bị chính sách browser môi trường chặn; không khẳng định đã thử mở file trên máy người dùng. HTML tự chứa SVG, không cần CDN hoặc network để hiển thị.','', 'Ảnh trong qa/previews chỉ là trình xem tài liệu, không phải ảnh CMS đang chạy. Agent phải chạy migration, validator chính thức, Compose, integration/E2E và đo hiệu năng trước khi báo hoàn tất.']
(R/'qa/HANDOFF-QA.md').write_text('\n'.join(lines)+'\n')
print(report['summary'],len(checks),'checks','FAILURES',failed)
if failed:raise SystemExit(1)
