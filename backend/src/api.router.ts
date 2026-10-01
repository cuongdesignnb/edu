import crypto from 'node:crypto';
import type { Readable } from 'node:stream';
import type { FastifyInstance,FastifyRequest,FastifyReply,HTTPMethods } from 'fastify';
import { operations,validateSchema,validateJsonResponse,type Operation } from './common/contract';
import { Database } from './database/database';
import { IdentityService,userDto,type Principal } from './modules/identity/identity.service';
import { Permissions } from './common/permissions';
import { Problem,mapError } from './common/problem';
import { runtimeConfig } from './common/config';
import { bootstrapCsrf,requireBootstrapCsrf,requireSessionCsrf } from './common/security';
import { verifyInstallation } from './database/verify';
import type { ParentPrincipal } from './modules/parents/parent.service';
import { runSupportRead,type SupportReadContext } from './common/support-context';
const serverPermissions=new WeakMap<FastifyInstance,Permissions>();
export interface ActorContext {
  requestId:string;operation:Operation;principal?:Pick<Principal,'userId'>;
  params:Record<string,string>;query:Record<string,string>;body:Record<string,unknown>;
}
export interface RequestContext extends ActorContext {
  request:FastifyRequest;reply:FastifyReply;principal?:Principal;parent?:ParentPrincipal;
}
export interface Result { data:unknown;status?:number;page?:{limit:number;nextCursor:string|null;hasMore:boolean;total?:number};
  binary?:{stream:Readable;contentType:string;filename:string;byteSize?:number} }
export type Handler=(context:RequestContext)=>Promise<Result>;
export function installRoutes(server:FastifyInstance,db:Database,identity:IdentityService,permissions:Permissions) {
  serverPermissions.set(server,permissions);
  const handlers:Record<string,Handler>={
    healthLive:async()=>({data:{status:'ok',buildSha:runtimeConfig().buildSha}}),
    healthReady:async()=>{
      try {await verifyInstallation(db.app,runtimeConfig().storageRoot);await db.parent.query('SELECT 1');}
      catch {throw new Problem(503,'DEPENDENCY_UNAVAILABLE');}
      return {data:{status:'ok',buildSha:runtimeConfig().buildSha}};
    },
    getCsrf:async c=>({data:{csrfToken:bootstrapCsrf(c.reply)}}),
    login:async c=>({data:await identity.login(c.body as {email:string;password:string},c.request,c.reply)}),
    logout:async c=>({data:await identity.logout(c.principal!,c.reply)}),
    getMyProfile:async c=>({data:userDto(c.principal!.user)}),
    getMyContext:async c=>({data:await permissions.context(c.principal!)}),
    updateMyProfile:async c=>({data:await identity.updateProfile(c.principal!,c.body as {expectedVersion:number;displayName?:string})}),
    listMySessions:async c=>({data:await identity.sessions(c.principal!),page:{limit:100,nextCursor:null,hasMore:false}}),
    revokeMySession:async c=>({data:await identity.revokeSession(c.principal!,c.params.sessionId!)}),
    forgotPassword:async c=>({data:await identity.forgot(c.body as {email:string},c.request)}),
    resetPassword:async c=>({data:await identity.reset(c.body as {token:string;password:string},c.request)}),
    changePassword:async c=>({data:await identity.change(c.principal!,c.body as {currentPassword:string;newPassword:string})}),
  };
  registerHandlers(server,handlers,identity);
  return Object.keys(handlers);
}
export function registerHandlers(server:FastifyInstance,handlers:Record<string,Handler>,identity:IdentityService,parentAuthenticate?:(request:FastifyRequest,slug:string)=>Promise<ParentPrincipal>) {
  for(const operation of operations) {
    const handler=handlers[operation.id];
    if(!handler) continue; // Unimplemented operations remain absent and NOT_STARTED.
    server.route({method:operation.method as HTTPMethods,url:operation.path.replace(/\{([^}]+)\}/g,':$1'),
      handler:async(request,reply)=>{
        const requestId=crypto.randomUUID(),start=performance.now();
        let selectedSupport:SupportReadContext|undefined;
        let supportAudited=false;
        const auditSupport=async(status:number)=>{
          if(!selectedSupport||supportAudited)return;supportAudited=true;
          try{await serverPermissions.get(server)!.auditSupportRead(selectedSupport,operation.id,requestId,status);}
          catch{throw new Problem(503,'DEPENDENCY_UNAVAILABLE');}
        };
        reply.header('X-Request-ID',requestId).header('Cache-Control','no-store')
          .header('Referrer-Policy','no-referrer').header('X-Content-Type-Options','nosniff');
        if(operation.path.startsWith('/api/v1/parent/'))reply.header('X-Robots-Tag','noindex, nofollow');
        try {
          if(operation.request&&operation.id!=='uploadFile') validateSchema(operation.request,request.body);
          else if(request.body!==undefined && request.body!==null) throw new Problem(422,'VALIDATION_ERROR');
          const params=request.params as Record<string,string>,query=request.query as Record<string,string>;
          for(const [key,value] of Object.entries(params)) if(key.endsWith('Id') && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Problem(404,'RESOURCE_NOT_FOUND');
          let principal=operation.auth==='staff'?await identity.authenticate(request):undefined;
          if(request.headers['x-support-access']!==undefined){
            const policy=serverPermissions.get(server);if(!principal||!policy)throw new Problem(403,'SUPPORT_READ_ONLY');
            selectedSupport=await policy.resolveSupport(principal,operation,params,query,request.headers['x-support-access']);principal={...principal,support:selectedSupport};
          }
          const parent=operation.auth==='parent'&&parentAuthenticate?await parentAuthenticate(request,params.schoolSlug!):undefined;
          if(operation.auth==='parent'&&!parent)throw new Problem(401,'PARENT_ACCESS_INVALID');
          if(operation.method!=='GET') {
            if(principal) requireSessionCsrf(request,principal.csrfHash);
            else if(parent)requireSessionCsrf(request,parent.csrfHash);
            else requireBootstrapCsrf(request);
          }
          const context={request,reply,requestId,operation,principal,parent,params,query,body:(request.body??{}) as Record<string,unknown>};
          const result=await (selectedSupport?runSupportRead(selectedSupport,()=>handler(context)):handler(context));
          const status=result.status??200;
          if(result.binary){
            const file=result.binary;
            reply.header('Content-Type',file.contentType).header('Content-Disposition',`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
            if(file.byteSize!==undefined)reply.header('Content-Length',file.byteSize);
            return reply.code(status).send(file.stream);
          }
          const response={data:result.data,...(result.page?{page:result.page}:{}),requestId};
          validateJsonResponse(operation,status,response);
          await auditSupport(status);
          return reply.code(status).send(response);
        }catch(error){
          let problem=mapError(error);
          try{await auditSupport(problem.status);}catch{problem=new Problem(503,'DEPENDENCY_UNAVAILABLE');}
          if(problem.status===429||problem.status===503)reply.header('Retry-After','60');
          return reply.code(problem.status).type('application/problem+json').send(problem.response(requestId));
        }finally {
          // Route template only; no request body/query, raw URL, cookies or errors.
          if(process.env.APP_ENV!=='test')process.stdout.write(JSON.stringify({event:'request',requestId,operationId:operation.id,
            status:reply.statusCode,durationMs:Math.round(performance.now()-start)})+'\n');
        }
      }});
  }
}
