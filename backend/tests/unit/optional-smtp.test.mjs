import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {runtimeConfig} from '../../dist/common/config.js';
import {encryptSmtpPassword,decryptSmtpPassword,encryptMail,decryptMail} from '../../dist/common/security.js';
import {validateSchema,operations,roleTemplates} from '../../dist/common/contract.js';

function configured(work){
 const prior={...process.env};
 Object.assign(process.env,{APP_ENV:'production',APP_URL:'https://chunhiemso.com',COOKIE_SECURE:'true',DATA_MODE:'connected',SECRET_KEY:'a'.repeat(64),MAIL_PAYLOAD_KEY:'b'.repeat(64),SMTP_HOST:'',SMTP_USER:'',SMTP_PASSWORD:'',MAIL_MODE:''});
 delete process.env.SECRET_KEY_FILE;delete process.env.MAIL_PAYLOAD_KEY_FILE;delete process.env.SMTP_PASSWORD_FILE;
 try{return work();}finally{for(const k of Object.keys(process.env))if(!(k in prior))delete process.env[k];Object.assign(process.env,prior);}
}
test('production starts with no SMTP but retains HTTPS secure cookie connected DB and key gates',()=>configured(()=>{
 assert.equal(runtimeConfig().appEnv,'production');
 for(const [key,value]of [['APP_URL','http://chunhiemso.com'],['COOKIE_SECURE','false'],['DATA_MODE','demo'],['MAIL_PAYLOAD_KEY','']]){
  const old=process.env[key];process.env[key]=value;assert.throws(()=>runtimeConfig());process.env[key]=old;
 }
}));
test('SMTP credentials are randomized authenticated ciphertext with a separate domain from outbox payloads',()=>configured(()=>{
 const secret=crypto.randomBytes(24).toString('hex'),a=encryptSmtpPassword(secret),b=encryptSmtpPassword(secret);
 assert.notEqual(a,b);assert.equal(decryptSmtpPassword(a),secret);assert.ok(!a.includes(secret));
 assert.throws(()=>decryptMail(a));assert.throws(()=>decryptSmtpPassword(encryptMail({secret})));
 const parts=a.split('.');parts[2]=Buffer.alloc(16).toString('base64url');assert.throws(()=>decryptSmtpPassword(parts.join('.')));
}));
test('only platform operator template has mail manage and new native responses reject credentials',()=>{
 for(const role of roleTemplates)assert.equal(role.actions.includes('platform.mail.manage'),role.code==='PLATFORM_OPERATOR');
 for(const [id,method]of [['getPlatformMailSettings','GET'],['updatePlatformMailSettings','PUT'],['testPlatformMailSettings','POST']]){
  const op=operations.find(o=>o.id===id);assert.equal(op.permission,'platform.mail.manage');assert.equal(op.method,method);assert.equal(op.auth,'staff');
 }
 const value={enabled:false,host:'',port:587,security:'STARTTLS',username:'',fromEmail:'',fromName:'',passwordConfigured:false,version:1,updatedAt:new Date().toISOString(),lastTestedAt:null,lastTestStatus:'NOT_TESTED',lastErrorCode:null,configurationStatus:'UNCONFIGURED'};
 validateSchema('PlatformMailSettings',value,true);
 for(const key of ['password','encrypted_password','encryptedPassword','token'])assert.throws(()=>validateSchema('PlatformMailSettings',{...value,[key]:'protected'},true));
});
