"use client";
import {createContext} from 'react';

/** Selected route supplies school time only; every API request still authorizes its own scope. */
export const NativeSchoolScope = createContext<string | undefined>(undefined);
