import type {Ctx} from '../repositories/core';
import {captureStaffAccess} from './client';
import {readStaffSession,serverNowISO,serverToday} from './session';

/** Capture during render/query setup, then retain this same owner for the callback. */
export function makeStaffCtx(schoolId?:string):Ctx{
  return {actor:readStaffSession()?.actor??{kind:'anonymous'},today:serverToday(schoolId),now:serverNowISO(),staffOwner:captureStaffAccess()};
}
