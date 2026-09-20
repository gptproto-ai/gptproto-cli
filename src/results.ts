import type { ApiDefinition } from "./definitions.js";

export interface ExtractedApiResult {
  readonly type: "text" | "media" | "json" | "error";
  readonly text?: string;
  readonly urls?: readonly string[];
  readonly error?: string;
  readonly value: unknown;
}

function collectTextParts(content: unknown): string[] {
  if (typeof content === "string") return content ? [content] : [];
  if (!Array.isArray(content)) return [];
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      if (part) parts.push(part);
      continue;
    }
    if (!part || typeof part !== "object") continue;
    const record = part as Record<string, unknown>;
    if (typeof record.text === "string" && record.text) parts.push(record.text);
    else if (typeof record.output_text === "string" && record.output_text) parts.push(record.output_text);
  }
  return parts;
}

export function extractTextResult(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { return extractTextResult(JSON.parse(trimmed) as unknown); } catch { return value; }
    }
    return value;
  }
  if (!value || typeof value !== "object") return undefined;
  const body = value as Record<string, unknown>;

  if (typeof body.output_text === "string" && body.output_text) return body.output_text;
  if (Array.isArray(body.output_text)) {
    const parts = collectTextParts(body.output_text);
    if (parts.length) return parts.join("");
  }
  if (Array.isArray(body.output)) {
    const parts: string[] = [];
    for (const item of body.output) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      parts.push(...collectTextParts(record.content));
      if (typeof record.text === "string") parts.push(record.text);
    }
    if (parts.length) return parts.join("");
  }
  if (Array.isArray(body.content)) {
    const parts = collectTextParts(body.content);
    if (parts.length) return parts.join("");
  }
  if (Array.isArray(body.choices)) {
    const parts: string[] = [];
    for (const choice of body.choices) {
      if (!choice || typeof choice !== "object") continue;
      const item = choice as Record<string, unknown>;
      if (typeof item.text === "string") parts.push(item.text);
      const candidate = item.message ?? item.delta;
      if (candidate && typeof candidate === "object") {
        parts.push(...collectTextParts((candidate as Record<string, unknown>).content));
      }
    }
    if (parts.length) return parts.join("");
  }
  if (Array.isArray(body.candidates)) {
    const parts: string[] = [];
    for (const candidate of body.candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const record = candidate as Record<string, unknown>;
      const content = record.content;
      if (content && typeof content === "object") {
        parts.push(...collectTextParts((content as Record<string, unknown>).parts));
      }
    }
    if (parts.length) return parts.join("");
  }
  if (body.data && typeof body.data === "object") return extractTextResult(body.data);
  return typeof body.text === "string" ? body.text : undefined;
}

export function extractErrorResult(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = value as Record<string, unknown>;
  if (typeof body.error === "string" && body.error) return body.error;
  if (body.error && typeof body.error === "object") {
    const message = (body.error as Record<string, unknown>).message;
    if (typeof message === "string" && message) return message;
  }
  if (typeof body.message === "string" && /fail|error/i.test(String(body.status ?? ""))) {
    return body.message;
  }
  return undefined;
}

export function extractMediaResult(value: unknown): string[] {
  const urls: string[] = [];
  const visit = (node: unknown, key = ""): void => {
    if (typeof node === "string") {
      if (
        key !== "polling_url" &&
        /^(unsigned_urls|outputs|output|url|uri|image_url|video_url|audio_url|result)$/i.test(key) &&
        /^https?:\/\//.test(node)
      ) urls.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, key);
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [name, child] of Object.entries(node as Record<string, unknown>)) visit(child, name);
  };
  visit(value);
  return [...new Set(urls)];
}

const TEXT_RESPONSES = new Set([
  "OPENAI-002", "OPENAI-003", "OPENAI-007", "OPENAI-008", "OPENAI-009",
  "CLAUDE-001", "GOOGLE-001", "GOOGLE-002", "GOOGLE-003",
]);

const MEDIA_RESPONSES = new Set([
  "CUST-001", "CUST-004", "CUST-005", "CUST-006", "CUST-007", "CUST-008", "CUST-009",
  "OPENAI-004", "OPENAI-005", "VEO-001", "VIDU-001", "KLING-001", "KLING-002",
  "KLING-003", "KLING-004", "RUNWAY-001", "RUNWAY-002", "RUNWAY-003", "RUNWAY-004",
  "RUNWAY-005", "SORA-001", "SORA-003", "WAN-001", "WAN-002",
]);

export function extractApiResult(value: unknown, definition?: ApiDefinition): ExtractedApiResult {
  const error = extractErrorResult(value);
  if (error) return { type: "error", error, value };
  if (TEXT_RESPONSES.has(definition?.id ?? "")) {
    const text = extractTextResult(value);
    if (text !== undefined) return { type: "text", text, value };
  }
  if (MEDIA_RESPONSES.has(definition?.id ?? "")) {
    const urls = extractMediaResult(value);
    if (urls.length) return { type: "media", urls, value };
  }
  // Polling endpoints have their own API IDs, but completed task bodies still
  // carry the same documented media URL fields as the create operation.
  const urls = extractMediaResult(value);
  if (urls.length) return { type: "media", urls, value };
  return { type: "json", value };
}
