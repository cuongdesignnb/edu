let counter = 0;

/** Local id for new demo records (prefix + time + counter). Never used as a security token. */
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Demo-only link token. Readable on purpose: this is NOT a production token design. */
export function newDemoToken(): string {
  counter += 1;
  return `demo-${Date.now().toString(36)}-${counter.toString(36)}`;
}
