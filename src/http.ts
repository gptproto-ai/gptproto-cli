import { readFile } from "node:fs/promises";
import type { CliConfig } from "./config.js";

export interface FormFile {
  readonly field: string;
  readonly path: string;
  readonly contentType?: string;
}

export interface RequestSpec {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
  readonly form?: readonly [string, string][];
  readonly files?: readonly FormFile[];
  readonly headers?: Readonly<Record<string, string>>;
  readonly query?: readonly [string, string][];
}

export interface ApiResponse {
  readonly status: number;
  readonly contentType: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly raw: Buffer;
}

export class CliError extends Error {
  readonly exitCode: number;
  readonly status?: number;
  readonly details?: unknown;

  constructor(
    message: string,
    exitCode = 1,
    status?: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
    this.status = status;
    this.details = details;
  }
}

export class ApiError extends CliError {
  constructor(status: number, details: unknown) {
    const message =
      typeof details === "object" &&
      details !== null &&
      "error" in details &&
      typeof details.error === "object" &&
      details.error !== null &&
      "message" in details.error
        ? String(details.error.message)
        : `API request failed with HTTP ${status}`;
    super(message, status >= 400 && status < 500 ? 3 : 4, status, details);
    this.name = "ApiError";
  }
}

function responseHeaders(response: Response): Record<string, string> {
  const result: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

async function decodeBody(
  response: Response,
): Promise<{ body: unknown; raw: Buffer; contentType: string }> {
  const raw = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "";
  if (raw.length === 0) {
    return { body: null, raw, contentType };
  }

  const text = raw.toString("utf8");
  if (contentType.includes("json") || looksLikeJson(text)) {
    try {
      return { body: JSON.parse(text) as unknown, raw, contentType };
    } catch {
      return { body: text, raw, contentType };
    }
  }
  if (contentType.startsWith("text/")) {
    return { body: text, raw, contentType };
  }
  return { body: raw, raw, contentType };
}

function baseUrlWithPath(baseUrl: string, path: string): string {
  if (!path.startsWith("/")) {
    throw new CliError("API path must start with /", 2);
  }
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  const queryIndex = path.indexOf("?");
  const pathname = queryIndex === -1 ? path : path.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : path.slice(queryIndex + 1);
  base.pathname = `${basePath}${pathname}` || "/";
  base.search = query ? `?${query}` : "";
  return base.toString();
}

function appendQuery(
  urlString: string,
  query: readonly [string, string][] | undefined,
): string {
  if (!query || query.length === 0) {
    return urlString;
  }
  const url = new URL(urlString);
  for (const [key, value] of query) {
    url.searchParams.append(key, value);
  }
  return url.toString();
}

function isAbsoluteApiUrl(path: string): boolean {
  return /^https?:\/\//i.test(path);
}

export class ApiClient {
  private readonly config: CliConfig;

  constructor(config: CliConfig) {
    if (!config.apiKey) {
      throw new CliError("API key is required", 2);
    }
    this.config = config;
  }

  private buildUrl(spec: RequestSpec): string {
    if (isAbsoluteApiUrl(spec.path)) {
      throw new CliError(
        "Absolute URLs are not accepted; use a path under GPTPROTO_API_BASE_URL",
        2,
      );
    }
    return appendQuery(
      baseUrlWithPath(this.config.baseUrl, spec.path),
      spec.query,
    );
  }

  private async buildBody(
    spec: RequestSpec,
    headers: Headers,
  ): Promise<string | FormData | undefined> {
    const hasForm = (spec.form?.length ?? 0) > 0;
    const hasFiles = (spec.files?.length ?? 0) > 0;
    if (hasForm || hasFiles) {
      if (spec.body !== undefined) {
        throw new CliError(
          "JSON body cannot be combined with multipart fields",
          2,
        );
      }
      const form = new FormData();
      for (const [key, value] of spec.form ?? []) {
        form.append(key, value);
      }
      for (const file of spec.files ?? []) {
        const bytes = await readFile(file.path);
        const blob = new Blob([bytes], {
          type: file.contentType ?? "application/octet-stream",
        });
        form.append(file.field, blob, file.path.split("/").pop() ?? "upload");
      }
      return form;
    }
    if (spec.body === undefined) {
      return undefined;
    }
    if (typeof spec.body === "string") {
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      return spec.body;
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return JSON.stringify(spec.body);
  }

  private async fetch(
    spec: RequestSpec,
    accept: string,
  ): Promise<Response> {
    const headers = new Headers();
    headers.set("authorization", `Bearer ${this.config.apiKey as string}`);
    headers.set("accept", accept);
    for (const [key, value] of Object.entries(spec.headers ?? {})) {
      if (key.toLowerCase() === "authorization") {
        throw new CliError(
          "The Authorization header is managed by GPTPROTO_API_KEY",
          2,
        );
      }
      headers.set(key, value);
    }

    const body = await this.buildBody(spec, headers);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      return await fetch(this.buildUrl(spec), {
        method: spec.method.toUpperCase(),
        headers,
        body,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new CliError(
          `Request timed out after ${this.config.timeoutMs} ms`,
          4,
        );
      }
      throw new CliError(
        `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        4,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async request(spec: RequestSpec): Promise<ApiResponse> {
    const response = await this.fetch(
      spec,
      "application/json, text/plain, */*",
    );
    const decoded = await decodeBody(response);
    if (!response.ok) {
      const error = new ApiError(response.status, decoded.body);
      error.message += ` (${spec.method} ${new URL(this.buildUrl(spec)).origin}${new URL(this.buildUrl(spec)).pathname})`;
      throw error;
    }
    return {
      status: response.status,
      contentType: decoded.contentType,
      headers: responseHeaders(response),
      body: decoded.body,
      raw: decoded.raw,
    };
  }

  async stream(spec: RequestSpec): Promise<void> {
    const response = await this.fetch(spec, "text/event-stream");
    if (!response.ok) {
      const decoded = await decodeBody(response);
      throw new ApiError(response.status, decoded.body);
    }
    if (!response.body) {
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        process.stdout.write(decoder.decode(chunk.value, { stream: true }));
      }
      process.stdout.write(decoder.decode());
    } finally {
      reader.releaseLock();
    }
  }

  async streamResponseText(spec: RequestSpec): Promise<void> {
    const response = await this.fetch({
      ...spec,
      headers: {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        ...(spec.headers ?? {}),
      },
    }, "text/event-stream");
    if (!response.ok) {
      const decoded = await decodeBody(response);
      throw new ApiError(response.status, decoded.body);
    }
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let wrote = false;
    const skipEventTypes = new Set([
      "message_start",
      "message_stop",
      "message_delta",
      "content_block_start",
      "content_block_stop",
      "ping",
      "response.created",
      "response.in_progress",
      "response.completed",
      "response.output_item.added",
      "response.output_item.done",
      "response.content_part.added",
      "response.content_part.done",
    ]);
    const textFromUnknown = (node: unknown): string => {
      if (typeof node === "string") return node;
      if (!node || typeof node !== "object") return "";
      const rec = node as Record<string, unknown>;
      if (typeof rec.text === "string") return rec.text;
      if (typeof rec.output_text === "string") return rec.output_text;
      if (typeof rec.content === "string") return rec.content;
      if (Array.isArray(rec.content)) {
        return rec.content
          .map((part) => textFromUnknown(part))
          .join("");
      }
      if (rec.content && typeof rec.content === "object") {
        const nested = textFromUnknown(rec.content);
        if (nested) return nested;
      }
      if (Array.isArray(rec.parts)) {
        return rec.parts.map((part) => textFromUnknown(part)).join("");
      }
      return "";
    };
    const emitData = (data: string): void => {
      if (!data || data === "[DONE]") return;
      try {
        const payload = JSON.parse(data) as Record<string, unknown>;
        const eventType = typeof payload.type === "string" ? payload.type : "";
        if (eventType.endsWith(".done") || skipEventTypes.has(eventType)) return;
        let delta = "";
        if (payload.delta !== undefined) delta += textFromUnknown(payload.delta);
        if (typeof payload.output_text === "string") delta += payload.output_text;
        if (Array.isArray(payload.choices)) {
          for (const choice of payload.choices) {
            if (!choice || typeof choice !== "object") continue;
            const item = choice as Record<string, unknown>;
            delta += textFromUnknown(item.delta ?? item.message ?? item);
          }
        }
        if (Array.isArray(payload.candidates)) {
          for (const candidate of payload.candidates) {
            delta += textFromUnknown(candidate);
          }
        }
        if (Array.isArray(payload.content)) {
          delta += textFromUnknown({ content: payload.content });
        }
        if (delta) {
          process.stdout.write(delta);
          wrote = true;
        }
      } catch {
        // Ignore non-JSON stream metadata; raw streaming remains available via request --stream.
      }
    };
    const consumeLines = (): void => {
      let newline = buffer.search(/\r?\n/);
      while (newline !== -1) {
        const match = buffer.slice(newline).match(/^\r?\n/);
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + (match?.[0].length ?? 1));
        if (line.startsWith("data:")) emitData(line.slice(5).trimStart());
        newline = buffer.search(/\r?\n/);
      }
    };
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        consumeLines();
      }
      buffer += decoder.decode();
      if (buffer.startsWith("data:")) emitData(buffer.slice(5).trimStart());
      if (wrote) process.stdout.write("\n");
    } finally {
      reader.releaseLock();
    }
  }
}
