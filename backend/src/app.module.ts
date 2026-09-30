import { Module } from '@nestjs/common';
import { Database } from './database/database';
import { IdentityService } from './modules/identity/identity.service';
import { Permissions } from './common/permissions';
import { Commands } from './common/commands';
import { OrganizationService } from './modules/academics/organization.service';
import { StudentsService } from './modules/students/students.service';
import { InvitationsService } from './modules/identity/invitations.service';
import { StaffService } from './modules/staff/staff.service';
import { TransitionsService } from './modules/students/transitions.service';
import { FilesService } from './modules/files/files.service';
import { ImportsService } from './modules/imports/imports.service';
import { PublicationsService } from './modules/publications/publications.service';
import { AttendanceService } from './modules/attendance/attendance.service';
import { RulesService } from './modules/conduct/rules.service';
const services=[Database,IdentityService,Permissions,Commands,OrganizationService,StudentsService,InvitationsService,StaffService,TransitionsService,FilesService,ImportsService,PublicationsService,AttendanceService,RulesService];
@Module({providers:services,exports:services})
export class AppModule {}
