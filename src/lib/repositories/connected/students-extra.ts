import type {ID} from '../../model/types';
import type {Ctx} from '../core';
import {http} from '../../api/client';
import {requiredValue,requiredId,displayedVersion,withStaffAccess} from './common';
import {guardianFormSource} from './guardian-form';
import {parentIssueContext,parentIssueSource} from './parent-access-issue';
import {apiPage} from '../../api/lists';
import type {ListQuery} from '../core';

export const connectedStudentsExtraRepo=withStaffAccess({
  async issueContext(_ctx:Ctx,schoolId:ID,yearId?:ID){return parentIssueContext((await http('getParentAccessIssueContext',{params:{schoolId},query:{yearId}})).data,schoolId);},
  async issueCandidates(_ctx:Ctx,schoolId:ID,studentId:ID,yearId?:ID){return parentIssueSource((await http('getStudentParentAccessIssueSource',{params:{schoolId,studentId},query:{yearId}})).data,schoolId,studentId,yearId);},
  async issueStudents(_ctx:Ctx,schoolId:ID,q:ListQuery,yearId?:ID){return apiPage('listParentAccessIssueStudents',{params:{schoolId},query:{yearId,q:q.q,sort:'fullName',dir:'asc'}},q,row=>({...row,id:requiredId(row.id),version:displayedVersion(row.version),classId:requiredId(row.classId)}));},
  async createOptions(_ctx:Ctx,schoolId:ID,yearId?:ID){const value=(await http('getStudentCreateOptions',{params:{schoolId},query:{yearId}})).data;
    return {today:requiredValue(value.today,'today'),classes:requiredValue(value.classes,'classes').map(c=>({...c,id:requiredId(c.id),version:displayedVersion(c.version),yearId:requiredId(c.yearId),canAddGuardian:requiredValue(c.canAddGuardian,'canAddGuardian')}))};
  },
  async guardianForm(_ctx:Ctx,schoolId:ID,studentId:ID,relationshipId?:ID){return guardianFormSource((await http('getStudentGuardianForm',{params:{schoolId,studentId},query:{relationshipId}})).data,schoolId,studentId,relationshipId);},
  async guardianSummary(_ctx:Ctx,schoolId:ID){const value=(await http('getGuardianDirectorySummary',{params:{schoolId}})).data;
    return {...value,guardians:requiredValue(value.guardians,'guardians'),verified:requiredValue(value.verified,'verified'),unverified:requiredValue(value.unverified,'unverified'),revoked:requiredValue(value.revoked,'revoked'),activeLinks:requiredValue(value.activeLinks,'activeLinks')};
  },
});
