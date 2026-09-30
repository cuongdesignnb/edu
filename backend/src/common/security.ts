import crypto from 'node:crypto';
import * as argon2 from 'argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { runtimeConfig } from './config';
import { Problem } from './problem';
export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('base64url');
export const hashPassword = (password: string) => argon2.hash(password, {
  type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1,
});
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password);
export function equal(a: string, b: string) {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
export function csrfFor(sessionId: string, tokenHash: string) {
  return crypto.createHmac('sha256', runtimeConfig().key).update(`csrf:${sessionId}:${tokenHash}`).digest('base64url');
}
export function setCookie(reply: FastifyReply, name: string, value: string, ttlSeconds: number) {
  reply.setCookie(name, value, { path: '/', httpOnly: true, sameSite: 'lax',
    secure: runtimeConfig().secure, maxAge: ttlSeconds });
}
export function bootstrapCsrf(reply: FastifyReply) {
  const config = runtimeConfig();
  const value = `${randomToken()}.${Date.now()}`;
  const sig = crypto.createHmac('sha256', config.key).update(value).digest('base64url');
  const csrfToken = `${value}.${sig}`;
  setCookie(reply, config.csrfCookie, csrfToken, 3600);
  return csrfToken;
}
export function requireOrigin(req: FastifyRequest) {
  if (req.headers.origin !== runtimeConfig().appUrl) throw new Problem(403, 'CSRF_INVALID');
}
export function requireBootstrapCsrf(req: FastifyRequest) {
  requireOrigin(req);
  const config = runtimeConfig();
  const cookie = req.cookies[config.csrfCookie];
  const header = req.headers['x-csrf-token'];
  if (!cookie || typeof header !== 'string' || !equal(cookie, header)) throw new Problem(403, 'CSRF_INVALID');
  const [token, stamp, signature] = cookie.split('.');
  const age = Date.now() - Number(stamp);
  if (!token || !stamp || !signature || !Number.isFinite(age) || age < 0 || age > 3600000) throw new Problem(403, 'CSRF_INVALID');
  const sig = crypto.createHmac('sha256', config.key).update(`${token}.${stamp}`).digest('base64url');
  if (!equal(signature, sig)) throw new Problem(403, 'CSRF_INVALID');
}
export function requireSessionCsrf(req: FastifyRequest, csrfHash: string) {
  requireOrigin(req);
  const header = req.headers['x-csrf-token'];
  if (typeof header !== 'string' || !equal(hashToken(header), csrfHash)) throw new Problem(403, 'CSRF_INVALID');
}
export function encryptMail(payload: unknown) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', runtimeConfig().mailKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}
export function decryptMail(value: string): unknown {
  const [version, iv, tag, body] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('MAIL_PAYLOAD_INVALID');
  const decipher = crypto.createDecipheriv('aes-256-gcm', runtimeConfig().mailKey, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')) as unknown;
}
