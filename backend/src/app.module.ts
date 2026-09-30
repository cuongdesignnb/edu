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
@Module({ providers: [Database,IdentityService,Permissions,Commands,OrganizationService,StudentsService,InvitationsService,StaffService,TransitionsService], exports: [Database,IdentityService,Permissions,Commands,OrganizationService,StudentsService,InvitationsService,StaffService,TransitionsService] })
export class AppModule {}
