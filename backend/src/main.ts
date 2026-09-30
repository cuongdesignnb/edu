import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter,type NestFastifyApplication } from '@nestjs/platform-fastify';
import cookie from '@fastify/cookie';
import { AppModule } from './app.module';
import { Database } from './database/database';
import { IdentityService } from './modules/identity/identity.service';
import { Permissions } from './common/permissions';
import { installRoutes,registerHandlers } from './api.router';
import { OrganizationService } from './modules/academics/organization.service';
import { StudentsService } from './modules/students/students.service';
import { InvitationsService } from './modules/identity/invitations.service';
import { StaffService } from './modules/staff/staff.service';
import { TransitionsService } from './modules/students/transitions.service';
import { runtimeConfig } from './common/config';

export async function createApplication() {
  runtimeConfig();
  const adapter=new FastifyAdapter({logger:false,bodyLimit:1024*1024,trustProxy:false});
  const app=await NestFactory.create<NestFastifyApplication>(AppModule,adapter,{logger:false});
  const server=adapter.getInstance();
  await server.register(cookie);
  installRoutes(server,app.get(Database),app.get(IdentityService),app.get(Permissions));
  registerHandlers(server,app.get(OrganizationService).handlers(),app.get(IdentityService));
  registerHandlers(server,app.get(StudentsService).handlers(),app.get(IdentityService));
  registerHandlers(server,app.get(InvitationsService).handlers(),app.get(IdentityService));
  registerHandlers(server,app.get(StaffService).handlers(),app.get(IdentityService));
  registerHandlers(server,app.get(TransitionsService).handlers(),app.get(IdentityService));
  app.enableShutdownHooks();
  await app.init();
  return app;
}
if(require.main===module)createApplication().then(async app=>{
  await app.listen(Number(process.env.PORT??3001),'0.0.0.0');
  process.stdout.write(JSON.stringify({event:'api_ready_to_listen',buildSha:runtimeConfig().buildSha})+'\n');
}).catch(()=>{process.stderr.write('{"event":"startup_failed"}\n');process.exitCode=1;});
