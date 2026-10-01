import type {ID} from '../../model/types';
import type {Ctx} from '../core';
import {http} from '../../api/client';
import {requiredValue,requiredId,displayedVersion,withStaffAccess} from './common';
import {guardianFormSource} from './guardian-form';

export const connectedStudentsExtraRepo=withStaffAccess({
  async createOptions(_ctx:Ctx,schoolId:ID,yearId?:ID){const value=(await http('getStudentCreateOptions',{params:{schoolId},query:{yearId}})).data;
    return {today:requiredValue(value.today,'today'),classes:requiredValue(value.classes,'classes').map(c=>({...c,id:requiredId(c.id),version:displayedVersion(c.version),yearId:requiredId(c.yearId),canAddGuardian:requiredValue(c.canAddGuardian,'canAddGuardian')}))};
  },
  async guardianForm(_ctx:Ctx,schoolId:ID,studentId:ID,relationshipId?:ID){return guardianFormSource((await http('getStudentGuardianForm',{params:{schoolId,studentId},query:{relationshipId}})).data,schoolId,studentId,relationshipId);},
  async guardianSummary(_ctx:Ctx,schoolId:ID){const value=(await http('getGuardianDirectorySummary',{params:{schoolId}})).data;
    return {...value,guardians:requiredValue(value.guardians,'guardians'),verified:requiredValue(value.verified,'verified'),unverified:requiredValue(value.unverified,'unverified'),revoked:requiredValue(value.revoked,'revoked'),activeLinks:requiredValue(value.activeLinks,'activeLinks')};
  },
});
