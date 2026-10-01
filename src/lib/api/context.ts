import type {Ctx} from '../repositories/core';
import {captureStaffAccess} from './client';
import {readStaffSession,serverNowISO,serverToday} from './session';
import type {Actor} from '../permissions/can';
import {RepoError} from '../repositories/errors';

/** Capture during render/query setup, then retain this same owner for the callback. */
export function makeStaffCtx(schoolId?:string):Ctx{
  return {actor:readStaffSession()?.actor??{kind:'anonymous'},today:serverToday(schoolId),now:serverNowISO(),staffOwner:captureStaffAccess()};
}
export function makeConnectedCtx(actor:Actor):Ctx{
  const value=makeStaffCtx();
  if(actor.kind!==value.actor.kind||actor.kind!=='anonymous'&&value.actor.kind!=='anonymous'&&actor.userId!==value.actor.userId)throw new RepoError('NO_SESSION');
  return value;
}
