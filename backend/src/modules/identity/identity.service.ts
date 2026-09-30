import { Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Database, one, iso, type Transaction } from '../../database/database';
import { runtimeConfig } from '../../common/config';
import { Problem } from '../../common/problem';
import { hashToken, randomToken, csrfFor, setCookie, hashPassword, verifyPassword, encryptMail } from '../../common/security';
import type { SupportReadContext } from '../../common/support-context';

export interface UserRow {
  id: string; email_normalized: string; display_name: string; status: string;
  password_hash: string | null; version: number; created_at: Date; updated_at: Date;
  self_work_phone: string | null; self_bio: string | null;
}
export interface Principal {
  sessionId: string; userId: string; csrfHash: string; tokenHash: string; user: UserRow;
  support?:SupportReadContext;
}
export function userDto(user: UserRow) {
  return { id: user.id, email: user.email_normalized, displayName: user.display_name,
    status: user.status, version: user.version, createdAt: iso(user.created_at), updatedAt: iso(user.updated_at),
    workPhone: user.self_work_phone, bio: user.self_bio };
}

@Injectable()
export class IdentityService {
  private dummyHash: Promise<string> = hashPassword(randomToken());
  constructor(private readonly db: Database) {}
  async rateLimit(key: string, limit: number, seconds: number) {
    const hash = hashToken(`rate:${key}`);
    const start = new Date(Math.floor(Date.now() / (seconds * 1000)) * seconds * 1000);
    const result = await this.db.app.query<{ hits: number }>(`INSERT INTO identity.rate_limit_buckets
      (bucket_hash,window_start,hits,expires_at) VALUES($1,$2,1,$2::timestamptz+($3 * interval '1 second'))
      ON CONFLICT(bucket_hash,window_start) DO UPDATE SET hits=identity.rate_limit_buckets.hits+1 RETURNING hits`,
    [hash, start, seconds]);
    if ((result.rows[0]?.hits ?? 0) > limit) throw new Problem(429, 'RATE_LIMITED');
  }
  async optional(req: FastifyRequest): Promise<Principal | undefined> {
    const token = req.cookies[runtimeConfig().staffCookie];
    if (!token) return undefined;
    const tokenHash = hashToken(token);
    const result = await this.db.transaction(async tx => {
      const session = await one<{ id: string; user_id: string; csrf_hash: string; token_hash: string; last_seen_at: Date }>(tx,
        `SELECT s.id,s.user_id,s.csrf_hash,s.token_hash,s.last_seen_at FROM identity.staff_sessions s
          JOIN identity.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL
          AND s.idle_expires_at>now() AND s.absolute_expires_at>now() AND u.status='ACTIVE' FOR UPDATE OF s`, [tokenHash]);
      if (!session) return undefined;
      const user = await one<UserRow>(tx, 'SELECT * FROM identity.users WHERE id=$1', [session.user_id]);
      if (!user) return undefined;
      if (Date.now() - session.last_seen_at.getTime() >= 60000) await tx.query(`UPDATE identity.staff_sessions
        SET last_seen_at=now(),idle_expires_at=LEAST(absolute_expires_at,now()+interval '30 minutes') WHERE id=$1`, [session.id]);
      return { sessionId: session.id, userId: session.user_id, csrfHash: session.csrf_hash, tokenHash, user };
    });
    return result;
  }
  async authenticate(req: FastifyRequest): Promise<Principal> {
    const principal = await this.optional(req);
    if (!principal) throw new Problem(401, 'UNAUTHENTICATED');
    return principal;
  }
  async login(input: { email: string; password: string }, req: FastifyRequest, reply: FastifyReply) {
    const email = input.email.trim().toLowerCase();
    await this.rateLimit(`login:ip:${req.ip}`, 30, 60);
    await this.rateLimit(`login:email:${email}`, 10, 300);
    const user = (await this.db.app.query<UserRow>('SELECT * FROM identity.users WHERE email_normalized=$1', [email])).rows[0];
    const valid = await verifyPassword(user?.password_hash ?? await this.dummyHash, input.password);
    if (!valid || !user || user.status !== 'ACTIVE') throw new Problem(401, 'INVALID_CREDENTIALS');
    const token = randomToken(), tokenHash = hashToken(token), sessionId = crypto.randomUUID();
    const csrfToken = csrfFor(sessionId, tokenHash);
    await this.db.transaction(async tx => {
      // Any old browser session is revoked on login to defeat fixation.
      const old = req.cookies[runtimeConfig().staffCookie];
      if (old) await tx.query('UPDATE identity.staff_sessions SET revoked_at=now() WHERE token_hash=$1', [hashToken(old)]);
      await tx.query(`INSERT INTO identity.staff_sessions(id,user_id,token_hash,csrf_hash,idle_expires_at,absolute_expires_at,user_agent_summary)
        VALUES($1,$2,$3,$4,now()+interval '30 minutes',now()+interval '12 hours',$5)`,
      [sessionId, user.id, tokenHash, hashToken(csrfToken), (req.headers['user-agent'] ?? '').slice(0,200)]);
    });
    setCookie(reply, runtimeConfig().staffCookie, token, 43200);
    return { user: userDto(user), csrfToken };
  }
  async logout(principal: Principal, reply: FastifyReply) {
    await this.db.app.query('UPDATE identity.staff_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2', [principal.sessionId, principal.userId]);
    setCookie(reply, runtimeConfig().staffCookie, '', 0);
    return { id: principal.sessionId, status: 'REVOKED' };
  }
  async sessions(principal: Principal) {
    const rows = (await this.db.app.query<{ id: string; user_agent_summary: string | null; created_at: Date; last_seen_at: Date; absolute_expires_at: Date }>(
      `SELECT id,user_agent_summary,created_at,last_seen_at,absolute_expires_at FROM identity.staff_sessions
        WHERE user_id=$1 AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now() ORDER BY created_at DESC,id LIMIT 100`,
    [principal.userId])).rows;
    return rows.map(row => ({ id: row.id, deviceSummary: row.user_agent_summary ?? '', current: row.id === principal.sessionId,
      createdAt: iso(row.created_at), lastSeenAt: iso(row.last_seen_at), expiresAt: iso(row.absolute_expires_at) }));
  }
  async revokeSession(principal: Principal, id: string) {
    const result = await this.db.app.query('UPDATE identity.staff_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 RETURNING id', [id, principal.userId]);
    if (!result.rowCount) throw new Problem(404, 'RESOURCE_NOT_FOUND');
    return { id, status: 'REVOKED' };
  }
  async updateProfile(principal: Principal, patch: { expectedVersion: number; displayName?: string; workPhone?:string|null; bio?:string|null }) {
    return this.db.transaction(async tx => {
      const row = await one<UserRow>(tx, 'SELECT * FROM identity.users WHERE id=$1 FOR UPDATE', [principal.userId]);
      if (!row) throw new Problem(401, 'UNAUTHENTICATED');
      if (row.version !== patch.expectedVersion) throw new Problem(409, 'VERSION_CONFLICT', undefined, row.version);
      const changed = await one<UserRow>(tx, 'UPDATE identity.users SET display_name=$2,self_work_phone=$3,self_bio=$4 WHERE id=$1 RETURNING *',
        [row.id, patch.displayName?.trim() ?? row.display_name,
          patch.workPhone===undefined?row.self_work_phone:patch.workPhone?.trim()||null,
          patch.bio===undefined?row.self_bio:patch.bio?.trim()||null]);
      return userDto(changed!);
    });
  }
  async forgot(input: { email: string }, req: FastifyRequest) {
    await this.rateLimit(`forgot:ip:${req.ip}`, 10, 300);
    await this.rateLimit(`forgot:email:${input.email.toLowerCase()}`, 5, 900);
    const id = crypto.randomUUID();
    await this.db.transaction(async tx => {
      const user = await one<UserRow>(tx, 'SELECT * FROM identity.users WHERE email_normalized=$1 AND status=$2', [input.email.trim().toLowerCase(), 'ACTIVE']);
      // Do a password hash in both cases to narrow the enumeration timing signal.
      await hashPassword(randomToken());
      if (!user) return;
      const token = randomToken();
      await tx.query(`INSERT INTO identity.auth_challenges(id,user_id,email_normalized,token_hash,expires_at)
        VALUES($1,$2,$3,$4,now()+interval '30 minutes')`, [id,user.id,user.email_normalized,hashToken(token)]);
      await tx.query(`INSERT INTO identity.mail_outbox(user_id,template_key,encrypted_payload,dedupe_key)
        VALUES($1,'PASSWORD_RESET',$2,$3)`, [user.id,encryptMail({ email: user.email_normalized,
          url: `${runtimeConfig().appUrl}/reset-password#token=${token}` }),`reset:${id}`]);
    });
    return { id, status: 'ACCEPTED' };
  }
  async reset(input: { token: string; password: string }, req: FastifyRequest) {
    await this.rateLimit(`reset:${req.ip}`, 20, 300);
    const hash = await hashPassword(input.password);
    return this.db.transaction(async tx => {
      const challenge = await one<{ id: string; user_id: string }>(tx, `SELECT id,user_id FROM identity.auth_challenges
        WHERE token_hash=$1 AND purpose='PASSWORD_RESET' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`, [hashToken(input.token)]);
      if (!challenge) throw new Problem(422, 'INVALID_RESET_TOKEN');
      await tx.query('UPDATE identity.auth_challenges SET consumed_at=now() WHERE id=$1', [challenge.id]);
      await this.setPassword(tx, challenge.user_id, hash);
      return { id: challenge.id, status: 'COMPLETED' };
    });
  }
  async change(principal: Principal, input: { currentPassword: string; newPassword: string }) {
    const hash = await hashPassword(input.newPassword);
    await this.db.transaction(async tx => {
      const user = await one<UserRow>(tx, 'SELECT * FROM identity.users WHERE id=$1 FOR UPDATE', [principal.userId]);
      if (!user?.password_hash || !await verifyPassword(user.password_hash, input.currentPassword)) throw new Problem(401, 'INVALID_CREDENTIALS');
      await this.setPassword(tx, principal.userId, hash);
    });
    return { id: principal.userId, status: 'COMPLETED' };
  }
  private async setPassword(tx: Transaction, userId: string, hash: string) {
    await tx.query(`UPDATE identity.users SET password_hash=$2,password_changed_at=now(),authz_version=authz_version+1 WHERE id=$1`, [userId,hash]);
    await tx.query('UPDATE identity.staff_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
  }
}
