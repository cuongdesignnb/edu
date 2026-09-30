import test from 'node:test';
import assert from 'node:assert/strict';
import {operationView} from '../../dist/modules/platform/platform-data.js';

test('operation evidence validates metadata values and omits secret-like values and unknown fields',()=>{
  const view=operationView({id:'fixture',startedAt:null,finishedAt:null,summary:{rows:12,byteSize:-1,p95ReadMs:Infinity,checksum:'private://token',errorCode:'https://private/token',schemaRevision:'031-operations-health.sql',retentionDays:7,privatePassword:'hidden'}});
  assert.deepEqual(view,{id:'fixture',summary:{rows:12,schemaRevision:'031-operations-health.sql',retentionDays:7}});
  const checksum='a'.repeat(64);assert.equal(operationView({summary:{checksum,errorCode:'DISK_FULL'}}).summary.checksum,checksum);
});
