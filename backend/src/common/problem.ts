export class Problem extends Error {
  constructor(public readonly status: number, public readonly code: string,
    public readonly fieldErrors?: { path: string; code: string; message: string }[],
    public readonly currentVersion?: number,public readonly resultId?:string) { super(code); }
  response(requestId: string) {
    return { type: `urn:edumanage:problem:${this.code.toLowerCase()}`, title: this.code,
      status: this.status, code: this.code, requestId,
      ...(this.fieldErrors ? { fieldErrors: this.fieldErrors } : {}),
      ...(this.currentVersion ? { currentVersion: this.currentVersion } : {}),
      ...(this.resultId ? { resultId:this.resultId } : {}) };
  }
}
export function notFound(): never { throw new Problem(404, 'RESOURCE_NOT_FOUND'); }
export function validation(path: string, message: string): never {
  throw new Problem(422, 'VALIDATION_ERROR', [{ path, code: 'INVALID', message }]);
}
export function mapError(error: unknown): Problem {
  if (error instanceof Problem) return error;
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code === '23505') return new Problem(409, 'DUPLICATE_SOURCE');
  if (code === '23P01') return new Problem(409, 'SCHEDULE_CONFLICT');
  if(code.startsWith('FST_REQ_FILE_TOO_LARGE')||code.startsWith('FST_FILES_LIMIT')||code.startsWith('FST_FIELDS_LIMIT')||code.startsWith('FST_PARTS_LIMIT'))return new Problem(422,'UPLOAD_LIMIT_EXCEEDED');
  if(['ENOSPC','EDQUOT','EIO','ENOENT','EACCES'].includes(code))return new Problem(503,'STORAGE_UNAVAILABLE');
  if (['23503', '23514', '22P02', '22007', '22008'].includes(code)) return new Problem(422, 'VALIDATION_ERROR');
  if (['08000', '08003', '08006', '57P01', 'ECONNREFUSED', 'ETIMEDOUT', '53300','40P01','40001'].includes(code)) return new Problem(503, 'DEPENDENCY_UNAVAILABLE');
  return new Problem(500, 'INTERNAL_ERROR');
}
