import fs from 'node:fs';
import path from 'node:path';
import type { PoolConfig } from 'pg';

export function secret(name: string, required = true): string {
  const filename = process.env[`${name}_FILE`];
  const value = filename ? fs.readFileSync(filename, 'utf8').replace(/[\r\n]+$/, '') : process.env[name];
  if (required && !value) throw new Error(`Missing configuration ${name}`);
  return value ?? '';
}

export function databaseConfig(role?: 'app' | 'parent' | 'worker' | 'migrator'): PoolConfig {
  const envPrefix = role === 'parent' ? 'PARENT_DB' : role === 'worker' ? 'WORKER_DB'
    : role === 'migrator' ? 'MIGRATOR_DB' : 'DB';
  const defaultUser = role ? `edu_${role}` : 'edu_app';
  const passwordName = process.env[`${envPrefix}_PASSWORD_FILE`] || process.env[`${envPrefix}_PASSWORD`]
    ? `${envPrefix}_PASSWORD` : 'DB_PASSWORD';
  return {
    host: process.env.DB_HOST ?? 'postgres', port: Number(process.env.DB_PORT ?? '5432'),
    database: process.env.DB_NAME ?? 'edumanage_local',
    user: process.env[`${envPrefix}_USER`] ?? (role ? defaultUser : process.env.DB_USER ?? defaultUser),
    password: secret(passwordName),
    max: role === 'parent' ? 5 : role === 'migrator' ? 2 : role === 'worker' ? 5 : Number(process.env.DB_POOL_MAX ?? 10),
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    application_name: `edumanage_${role ?? 'app'}`,
  };
}

export function runtimeConfig() {
  const appEnv = process.env.APP_ENV;
  if (!['local', 'test', 'production'].includes(appEnv ?? '')) throw new Error('APP_ENV must be explicit');
  const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:18763';
  const url = new URL(appUrl);
  const key = secret('SECRET_KEY');
  const mailKey = secret('MAIL_PAYLOAD_KEY');
  if (!/^[a-fA-F0-9]{64}$/.test(key) || !/^[a-fA-F0-9]{64}$/.test(mailKey)) throw new Error('Keys must be 32-byte hex');
  const secure = process.env.COOKIE_SECURE === 'true';
  if (process.env.DATA_MODE !== 'connected') throw new Error('Backend requires connected mode');
  if (process.env.UI_LAB_ENABLED === 'true' || process.env.ACADEMIC_RESULTS_ENABLED === 'true') throw new Error('Unsupported module enabled');
  if (appEnv === 'production' && (url.protocol !== 'https:' || !secure || process.env.MAIL_MODE !== 'smtp'
    || !process.env.SMTP_HOST || !secret('SMTP_PASSWORD', false))) throw new Error('Unsafe production configuration');
  return {
    appEnv, appUrl: url.origin, secure, key: Buffer.from(key, 'hex'), mailKey: Buffer.from(mailKey, 'hex'),
    staffCookie: secure ? '__Host-edu_staff' : 'edu_staff',
    parentCookie: secure ? '__Host-edu_parent' : 'edu_parent',
    csrfCookie: secure ? '__Host-edu_csrf' : 'edu_csrf',
    storageRoot: path.resolve(process.env.STORAGE_ROOT ?? '/data/uploads'),
    mailRoot: path.resolve(process.env.LOCAL_MAIL_ROOT ?? '/data/mail'),
    buildSha: process.env.BUILD_SHA ?? 'development',
  };
}
export type RuntimeConfig = ReturnType<typeof runtimeConfig>;
