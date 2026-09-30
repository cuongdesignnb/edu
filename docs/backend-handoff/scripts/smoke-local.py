#!/usr/bin/env python3
"""Smoke public endpoints only; không phải test đầy đủ phân quyền."""
import json,urllib.request,urllib.error
from pathlib import Path
r=Path(__file__).resolve().parents[1]
e=dict(x.strip().split('=',1) for x in (r/'.env.local-docker').read_text().splitlines() if x.strip() and not x.startswith('#') and '=' in x)
base=e['APP_URL']; checks=[('/gateway-health',False),('/api/v1/health/live',True),('/api/v1/health/ready',True),('/login',False)]
for path,isjson in checks:
 with urllib.request.urlopen(base+path,timeout=10) as response:
  b=response.read()
  if response.status!=200:raise SystemExit('FAIL '+path)
  if isjson:
   value=json.loads(b)
   if value.get('data',{}).get('status')!='ok':raise SystemExit('API envelope/status sai '+path)
 print('PASS '+path)
try:urllib.request.urlopen(base+'/api/v1/me/context',timeout=10)
except urllib.error.HTTPError as ex:
 if ex.code!=401:raise SystemExit('FAIL /me/context phải 401 khi chưa login')
 print('PASS anonymous /me/context=401')
else:raise SystemExit('FAIL anonymous đọc được staff context')
print('SMOKE_BASIC=PASS; AUTHENTICATED_E2E=NOT_RUN_BY_THIS_SCRIPT')
