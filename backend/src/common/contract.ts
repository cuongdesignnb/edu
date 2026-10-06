import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import contract from '../generated/contract.json';
import { Problem } from './problem';

export type Operation = (typeof contract.operations)[number];
export const operations = contract.operations;
export const permissions: readonly string[] = contract.permissions;
export const roleTemplates = contract.roles;
export const permissionCatalog = contract.permissionCatalog;
const ajv = new Ajv({ strict: false, allErrors: true, coerceTypes: false, removeAdditional: false });
addFormats(ajv);
ajv.addFormat('binary',()=>true); // Multipart bytes are separately streamed/validated.
ajv.addSchema({ components: { schemas: contract.schemas } }, 'contract');
const validators = new Map<string, ValidateFunction>();
export function validateSchema(name: string, value: unknown, response = false): void {
  let validate = validators.get(name);
  if (!validate) {
    validate = ajv.compile({ $ref: `contract#/components/schemas/${name}` });
    validators.set(name, validate);
  }
  if (validate(value)) return;
  if (response) throw new Problem(500, 'RESPONSE_CONTRACT_ERROR');
  throw new Problem(422, 'VALIDATION_ERROR', validate.errors?.map(error => ({
    path: error.instancePath || '/', code: error.keyword, message: 'Dữ liệu không hợp lệ',
  })));
}
export function responseSchema(operation: Operation, status: number): string | undefined {
  const responses = operation.responses as unknown as Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }>;
  const ref = responses[String(status)]?.content?.['application/json']?.schema?.$ref;
  return ref?.split('/').at(-1);
}
/** A JSON success may never bypass validation through an undeclared status. */
export function validateJsonResponse(operation:Operation,status:number,response:unknown):void {
  const schema=responseSchema(operation,status);
  if(!schema)throw new Problem(500,'RESPONSE_STATUS_CONTRACT_ERROR');
  validateSchema(schema,response,true);
}
