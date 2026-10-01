"use client";
import {useSyncExternalStore} from 'react';
import {getScenario,onScenarioChange} from '../demo/scenario';

/** Only the disabled design lab subscribes to mock scenarios. */
export function useScenario(){
  return useSyncExternalStore(cb=>{const off=onScenarioChange(cb);window.addEventListener('storage',cb);return()=>{off();window.removeEventListener('storage',cb);};},getScenario,getScenario);
}
