import type { Membership } from "./access";
import { canEnroll, runsBranch } from "./access";

export const FILE_KINDS = ["avatar", "academy_icon"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FILE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type FileType = (typeof FILE_TYPES)[number];

const MB = 1024 * 1024;

interface FileKindRule {
  maxBytes: number;
  maxImageEdge: number;
  prefix: string;
}

export const FILE_RULES: Record<FileKind, FileKindRule> = {
  avatar: { maxBytes: 2 * MB, maxImageEdge: 512, prefix: "avatar" },
  academy_icon: { maxBytes: 2 * MB, maxImageEdge: 512, prefix: "icon" },
};

const EXTENSIONS: Record<FileType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const ACADEMY_STORAGE_QUOTA_BYTES = 1024 * MB;
export const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
export const UPLOAD_URL_SECONDS = 300;
export const UPLOADS_PER_HOUR = 20;
export const PUBLIC_FILE_CACHE_CONTROL = "public, max-age=2592000, immutable";
export const SNIFF_BYTES = 16;

export function isFileKind(value: string): value is FileKind {
  return (FILE_KINDS as readonly string[]).includes(value);
}

export function isFileType(value: string): value is FileType {
  return (FILE_TYPES as readonly string[]).includes(value);
}

export function canUploadFile(kind: FileKind, membership: Membership): boolean {
  return kind === "avatar" ? canEnroll(membership) : runsBranch(membership);
}

export type UploadProblem =
  "type_not_allowed" | "empty" | "too_large" | "quota";

export function uploadProblem(input: {
  kind: FileKind;
  contentType: string;
  sizeBytes: number;
  academyUsedBytes: number;
}): UploadProblem | null {
  const rule = FILE_RULES[input.kind];
  if (!isFileType(input.contentType)) return "type_not_allowed";
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1) return "empty";
  if (input.sizeBytes > rule.maxBytes) return "too_large";
  if (input.academyUsedBytes + input.sizeBytes > ACADEMY_STORAGE_QUOTA_BYTES)
    return "quota";
  return null;
}

function startsWith(bytes: Uint8Array, prefix: readonly number[], at = 0) {
  return prefix.every((b, i) => bytes[at + i] === b);
}

export function sniffFileType(bytes: Uint8Array): FileType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  )
    return "image/webp";
  return null;
}

const ENTITY_ID = /^[A-Za-z0-9_-]{1,64}$/;
const FILE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function fileKey(input: {
  kind: FileKind;
  entityId: string;
  fileId: string;
  contentType: FileType;
}): string {
  if (!ENTITY_ID.test(input.entityId) || !FILE_ID.test(input.fileId)) {
    throw new Error("fileKey: invalid entity or file id");
  }
  return `${FILE_RULES[input.kind].prefix}/${input.entityId}/${input.fileId}.${EXTENSIONS[input.contentType]}`;
}

const PUBLIC_KEY =
  /^(avatar|icon)\/[A-Za-z0-9_-]{1,64}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function isPublicFileKey(key: string): boolean {
  return PUBLIC_KEY.test(key);
}

export function publicFileUrl(appUrl: string, key: string): string;
export function publicFileUrl(
  appUrl: string,
  key: string | null,
): string | null;
export function publicFileUrl(appUrl: string, key: string | null) {
  return key ? `${appUrl.replace(/\/+$/, "")}/files/${key}` : null;
}

export function pendingUploadCutoff(now: Date): Date {
  return new Date(now.getTime() - PENDING_UPLOAD_TTL_MS);
}

export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
