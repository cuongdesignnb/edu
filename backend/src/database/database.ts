import { Injectable,Optional,Inject, type OnApplicationShutdown } from '@nestjs/common';
import { Pool, type PoolClient, type QueryResultRow, types } from 'pg';
import { databaseConfig } from '../common/config';
import { currentSupportRead } from '../common/support-context';
import { Problem } from '../common/problem';
types.setTypeParser(1082, value => value);
types.setTypeParser(1700, value => value);
export type Row = Record<string, unknown>;
export type Transaction = PoolClient;

@Injectable()
export class Database implements OnApplicationShutdown {
  readonly app:Pool;
  readonly parent:Pool;
  constructor(@Optional() @Inject('DATABASE_ROLE') role:'app'|'worker'='app') {
    this.app=new Pool(databaseConfig(role));
    this.parent=new Pool(databaseConfig('parent'));
    for (const pool of [this.app, this.parent]) pool.on('error', () => {
      // Never expose connection strings, passwords or SQL in logs.
      process.stderr.write(JSON.stringify({ event: 'database_pool_error' }) + '\n');
    });
  }
  async transaction<T>(fn: (tx: Transaction) => Promise<T>, context: {
    schoolId?: string; userId?: string; parentSessionId?: string; parent?: boolean;readOnly?:boolean;
  } = {}): Promise<T> {
    const support=currentSupportRead();
    if(support&&(context.parent||context.schoolId&&context.schoolId!==support.schoolId))throw new Problem(404,'RESOURCE_NOT_FOUND');
    const connection = await (context.parent ? this.parent : this.app).connect();
    let destroyed = false;
    try {
      await connection.query(context.readOnly||support?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
      // Empty values override any accidentally retained session setting as well.
      await connection.query(`SELECT set_config('app.school_id',$1,true),
        set_config('app.authenticated_user_id',$2,true),set_config('app.parent_session_id',$3,true),set_config('app.adjustment_id','',true),set_config('app.support_access_id',$4,true)`,
      [support?.schoolId??context.schoolId??'',support?.operatorId??context.userId??'',context.parentSessionId??'',support?.grantId??'']);
      const value = await fn(connection);
      await connection.query('COMMIT');
      return value;
    } catch (error) {
      try { await connection.query('ROLLBACK'); } catch { connection.release(true); destroyed = true; throw error; }
      throw error;
    } finally { if (!destroyed) connection.release(); }
  }
  async onApplicationShutdown() { await Promise.all([this.app.end(), this.parent.end()]); }
}
export async function one<T extends QueryResultRow>(tx: Transaction, sql: string, values: unknown[] = []): Promise<T | undefined> {
  return (await tx.query<T>(sql, values)).rows[0];
}
export const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : value;
