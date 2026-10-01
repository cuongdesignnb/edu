import {defineConfig} from '@playwright/test';

/** Browser contract checks use intercepted API responses. They do not certify PostgreSQL E2E. */
const prefix=process.env.EDU_NATIVE_QA_PREFIX??'b6-native-activation';
export default defineConfig({
  testDir:'tests/native-ui-contract',timeout:45_000,expect:{timeout:10_000},workers:1,fullyParallel:false,
  outputDir:`qa/backend/${prefix}-browser-artifacts-final`,
  reporter:[['list'],['json',{outputFile:`qa/backend/${prefix}-browser-results-final.json`}]],
  use:{baseURL:'http://127.0.0.1:18763',channel:'msedge',viewport:{width:1448,height:1086},locale:'vi-VN',timezoneId:'Asia/Ho_Chi_Minh',reducedMotion:'reduce',trace:'retain-on-failure',screenshot:'only-on-failure'},
});
