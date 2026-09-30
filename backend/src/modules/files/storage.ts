import fs from 'node:fs/promises';
import { createReadStream,createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { runtimeConfig } from '../../common/config';
import { Problem } from '../../common/problem';
const uuid=/^[a-f0-9]{8}-[a-f0-9-]{27}$/i;
export function objectPath(schoolId:string,key:string){
  if(!uuid.test(schoolId)||!(/^[a-f0-9-]{36}(\.source|\.ready)?$/i.test(key)))throw new Problem(422,'INVALID_STORAGE_KEY');
  const root=runtimeConfig().storageRoot,target=path.resolve(root,schoolId,key);
  if(!target.startsWith(root+path.sep))throw new Problem(422,'INVALID_STORAGE_KEY');return target;
}
export function stagingPath(id=crypto.randomUUID()){
  if(!uuid.test(id))throw new Problem(422,'INVALID_STORAGE_KEY');return path.join(runtimeConfig().storageRoot,'.staging',id);
}
export async function storageAvailable(bytes:number){
  const root=runtimeConfig().storageRoot;await fs.mkdir(root,{recursive:true,mode:0o700});
  const stat=await fs.statfs(root);
  if(stat.bavail*stat.bsize<bytes+64*1024*1024)throw new Problem(503,'STORAGE_FULL');
}
export async function digestFile(filename:string){
  const hash=crypto.createHash('sha256');let bytes=0;
  for await(const chunk of createReadStream(filename)){hash.update(chunk as Buffer);bytes+=(chunk as Buffer).length;}
  return {sha256:hash.digest('hex'),bytes};
}
export async function atomicStore(schoolId:string,key:string,source:string){
  const target=objectPath(schoolId,key);await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
  await fs.rename(source,target);return target;
}
export function safeName(name:string){
  const result=name.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'_').trim().slice(0,200);
  return result||'upload';
}
export async function streamUpload(stream:NodeJS.ReadableStream,filename:string,maxBytes=25*1024*1024){
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});await storageAvailable(maxBytes);
  let bytes=0;const hash=crypto.createHash('sha256');
  const bounded=new Transform({transform(chunk:Buffer,_encoding,callback){
    bytes+=chunk.length;if(bytes>maxBytes)return callback(new Problem(422,'FILE_TOO_LARGE'));
    hash.update(chunk);callback(null,chunk);
  }});
  await pipeline(stream,bounded,createWriteStream(filename,{flags:'wx',mode:0o600}));
  return {bytes,sha256:hash.digest('hex')};
}
export async function removeStaging(filename:string){
  // Never accept a caller/client path or recursively remove a directory.
  const allowed=path.join(runtimeConfig().storageRoot,'.staging')+path.sep;
  if(!filename.startsWith(allowed))throw new Error('STAGING_PATH_REFUSED');
  try{await fs.unlink(filename);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
}
