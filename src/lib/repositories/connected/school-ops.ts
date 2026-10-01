import type {Ctx} from '../core';
import {connectedAnnouncementsRepo} from './announcements';
import {withStaffAccess} from './common';
import {RepoError} from '../errors';
export const connectedSchoolOpsRepo=withStaffAccess({
 async announcementClassStudents(ctx:Ctx,schoolId:string,classId:string,yearId:string){const value=await connectedAnnouncementsRepo.composeOptions(ctx,schoolId,classId,yearId);if(!value.canSelectStudents)throw new RepoError('FORBIDDEN','Không có quyền chọn học sinh trong lớp này.');return value.students;},
});
