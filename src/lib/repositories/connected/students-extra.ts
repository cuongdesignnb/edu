import type {ID} from '../../model/types';
import type {Ctx} from '../core';
import {http} from '../../api/client';
import {requiredValue,withStaffAccess} from './common';

export const connectedStudentsExtraRepo=withStaffAccess({
  async guardianSummary(_ctx:Ctx,schoolId:ID){const value=(await http('getGuardianDirectorySummary',{params:{schoolId}})).data;
    return {...value,guardians:requiredValue(value.guardians,'guardians'),verified:requiredValue(value.verified,'verified'),unverified:requiredValue(value.unverified,'unverified'),revoked:requiredValue(value.revoked,'revoked'),activeLinks:requiredValue(value.activeLinks,'activeLinks')};
  },
});
