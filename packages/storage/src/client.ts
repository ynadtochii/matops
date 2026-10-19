export interface PresignPutInput {
  key: string;
  contentType: string;
  contentLength: number;
  cacheControl?: string;
  expiresIn: number;
}

export interface PresignedPut {
  url: string;
  headers: Record<string, string>;
}

export interface ObjectInfo {
  size: number;
  contentType: string;
}

export interface StoredObject extends ObjectInfo {
  body: ReadableStream<Uint8Array>;
}

export interface StorageClient {
  presignPut(input: PresignPutInput): Promise<PresignedPut>;
  head(key: string): Promise<ObjectInfo | null>;
  get(key: string, range?: { length: number }): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

export type StorageOperation = "presignPut" | "head" | "get" | "delete";

export class StorageError extends Error {
  readonly operation: StorageOperation;
  readonly status: number | undefined;
  readonly key: string;

  constructor(
    operation: StorageOperation,
    key: string,
    status?: number,
    options?: { cause?: unknown },
  ) {
    super(
      `[storage] ${operation} failed for ${key}${status ? ` (HTTP ${status})` : ""}`,
      options,
    );
    this.name = "StorageError";
    this.operation = operation;
    this.status = status;
    this.key = key;
  }
}

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/;

export function isSafeObjectKey(key: string): boolean {
  return (
    key.length <= 512 &&
    KEY_PATTERN.test(key) &&
    !key.includes("..") &&
    !key.includes("//") &&
    !key.endsWith("/")
  );
}

export function assertSafeObjectKey(
  operation: StorageOperation,
  key: string,
): void {
  if (!isSafeObjectKey(key)) throw new StorageError(operation, key);
}

export async function readBytes(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
