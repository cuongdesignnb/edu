import { Module } from '@nestjs/common';
import { Database } from './database/database';
import { IdentityService } from './modules/identity/identity.service';
import { Permissions } from './common/permissions';
@Module({ providers: [Database,IdentityService,Permissions], exports: [Database,IdentityService,Permissions] })
export class AppModule {}
