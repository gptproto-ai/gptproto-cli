#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import {
  CLI_CONTRACT_VERSION,
  findContract,
  type ApiContract,
  type HttpMethod,
} from "./contracts.js";
import { readConfig, setStoredKey, removeStoredKey, setStoredBaseUrl, type CliConfig } from "./config.js";
import {
  ApiClient,
  ApiError,
  CliError,
  type ApiResponse,
  type FormFile,
  type RequestSpec,
} from "./http.js";
import {
  hasFlag,
  option,
  options,
  parseArgs,
  type ParsedArgs,
} from "./args.js";
import {
  getApiDefinition,
  type ApiDefinition,
} from "./definitions.js";

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "expired",
  "succeeded",
  "success",
]);

const CUSTOM_CREATE_PATHS: Readonly<Record<string, string>> = {
  video: "/api/v3/videos",
  videos: "/api/v3/videos",
  image: "/api/v3/images",
  images: "/api/v3/images",
  speech: "/api/v3/audio/speech",
  "voice-clone": "/api/v3/audio/voice-clone",
  "lip-sync": "/api/v3/lip-sync",
  "3d": "/api/v3/3d",
  "image-edit": "/api/v3/images/edit",
};

const HELP = `gptproto ${CLI_CONTRACT_VERSION}

Usage:
  gptproto config [--base-url URL]
  gptproto key set --key KEY
  gptproto key remove
  gptproto models list [--capability NAME] [--json]
  gptproto model <provider/model> [--json]
  gptproto request <METHOD> <PATH> [--json JSON | --body FILE] [options]
  gptproto custom create <resource> [--json JSON | options] [--wait]
  gptproto task get <TASK_ID> [--video]
  gptproto task wait <TASK_ID> [--video]

GPTProto provides the live model catalog and each model's interface parameters.

Examples:
  gptproto request POST /v1/responses --json '{"model":"openai/gpt-4.1","input":"Hello"}'
  gptproto request POST /v1/messages --body claude-request.json
  gptproto request POST /v1/chat/completions --json '{"model":"openai/gpt-4.1","messages":[...]}' --stream
  gptproto request POST /v1/audio/transcriptions --form model=openai/whisper-1 --file file=audio.mp3
  gptproto custom create video --json '{"model":"provider/model","prompt":"A short scene"}' --wait
  gptproto custom create video --json '{"model":"provider/model","prompt":"Animate this image","frame_images":[{"type":"image_url","image_url":{"url":"https://example.com/first.png"},"frame_type":"first_frame"}]}' --wait

Runtime:
  GPTPROTO_API_BASE_URL       Optional override (default: https://gptproto.com)
  GPTPROTO_API_KEY            Required for API calls
  GPTPROTO_API_DOC_VERSION    Optional; must match ${CLI_CONTRACT_VERSION}
  GPTPROTO_TIMEOUT_MS         Optional request timeout (default: 600000 ms / 600s)
  GPTPROTO_POLL_INTERVAL_MS   Optional polling interval (default: 2000)
  GPTPROTO_MAX_POLL_SECONDS   Optional polling limit (default: 600)

Use --allow-review only for a documented endpoint marked CONTRACT_REVIEW.
Use --output-json to print an unprocessed JSON response, --output FILE for a file,
and --raw to print unprocessed stream events.
`;

async function dynamicModelsCommand(args: ParsedArgs): Promise<void> {
  const { client } = createClient();
  const capability = option(args, "capability");
  const path = capability ? `/v1/cli/models?capability=${encodeURIComponent(capability)}` : "/v1/cli/models";
  const response = await client.request({ method: "GET", path });
  print(response.body);
}

async function keyCommand(args: ParsedArgs): Promise<void> {
  const action = args.positionals[0];
  if (action === "remove") { await removeStoredKey(); process.stdout.write("API key removed\n"); return; }
  if (action === "set") {
    const value = option(args, "key") ?? process.env.GPTPROTO_API_KEY;
    if (!value) commandError("Usage: gptproto key set --key KEY");
    await setStoredKey(value); process.stdout.write("API key saved\n"); return;
  }
  commandError("Usage: gptproto key set --key KEY\n       gptproto key remove");
}

async function dynamicModelCommand(args: ParsedArgs): Promise<void> {
  const id = args.positionals[0];
  if (!id || !id.includes("/")) commandError("Usage: gptproto model <provider/model>");
  const [provider, ...parts] = id.split("/");
  const { client } = createClient();
  const response = await client.request({ method: "GET", path: `/v1/cli/models/${encodeURIComponent(provider)}/${encodeURIComponent(parts.join("/"))}` });
  if (hasFlag(args, "json")) {
    print(response.body);
    return;
  }
  printModelDescriptor(response.body);
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function writeParameter(
  name: string,
  value: unknown,
  indent: string,
  requiredByParent = false,
): void {
  const parameter = asRecord(value);
  if (!parameter) {
    process.stdout.write(`${indent}${name}\n`);
    return;
  }
  const type = typeof parameter.type === "string" ? parameter.type : "value";
  const required = parameter.required === true || requiredByParent ? " required" : "";
  const parts = [`${indent}${name}: ${type}${required}`];
  if (Array.isArray(parameter.enum) && parameter.enum.length > 0) {
    parts.push(`enum: ${parameter.enum.map(String).join(" | ")}`);
  }
  if (parameter.default !== undefined) {
    parts.push(`default: ${JSON.stringify(parameter.default)}`);
  }
  if (parameter.minimum !== undefined || parameter.maximum !== undefined) {
    parts.push(`range: ${parameter.minimum ?? "-∞"}..${parameter.maximum ?? "∞"}`);
  }
  if (parameter.minimum_pixels !== undefined) parts.push(`minimum pixels: ${parameter.minimum_pixels}`);
  if (parameter.max_items !== undefined) parts.push(`max items: ${parameter.max_items}`);
  if (typeof parameter.pattern === "string") parts.push(`pattern: ${parameter.pattern}`);
  if (Array.isArray(parameter.examples) && parameter.examples.length > 0) {
    parts.push(`examples: ${parameter.examples.map(String).join(", ")}`);
  }
  if (typeof parameter.description === "string") parts.push(parameter.description);
  process.stdout.write(`${parts.join("; ")}\n`);

  const itemSchema = asRecord(parameter.items);
  if (itemSchema) {
    process.stdout.write(`${indent}  items: ${typeof itemSchema.type === "string" ? itemSchema.type : "value"}\n`);
    writeSchemaProperties(itemSchema, `${indent}    `);
  }
  if (asRecord(parameter.properties)) writeSchemaProperties(parameter, `${indent}  `);
}

function writeSchemaProperties(schema: JsonRecord, indent: string): void {
  const properties = asRecord(schema.properties);
  if (!properties) return;
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === "string")
      : [],
  );
  for (const [name, property] of Object.entries(properties)) {
    writeParameter(name, property, indent, required.has(name));
  }
}

function printModelDescriptor(value: unknown): void {
  const descriptor = asRecord(value);
  if (!descriptor || typeof descriptor.id !== "string") {
    print(value);
    return;
  }
  const capabilities = Array.isArray(descriptor.capabilities)
    ? descriptor.capabilities.map(String).join(", ")
    : "not specified";
  process.stdout.write(`Model: ${descriptor.id}\n`);
  process.stdout.write(`Capabilities: ${capabilities}\n`);

  const interfaces = Array.isArray(descriptor.interfaces) ? descriptor.interfaces : [];
  if (interfaces.length === 0) {
    process.stdout.write("No callable interface is currently published for this model.\n");
    return;
  }
  process.stdout.write("Calls:\n");
  for (const item of interfaces) {
    const entry = asRecord(item);
    if (!entry) continue;
    const method = typeof entry.method === "string" ? entry.method : "?";
    const path = typeof entry.path === "string" ? entry.path : "?";
    const capability = typeof entry.capability === "string" ? entry.capability : undefined;
    const mode = typeof entry.mode === "string" ? entry.mode : undefined;
    process.stdout.write(`  ${method} ${path}${capability ? `  (${capability}${mode ? `/${mode}` : ""})` : ""}\n`);
    if (typeof entry.model_format === "string") {
      const modelValue = entry.model_format === "model"
        ? "model name only; CLI sends gpt-4.1 for openai/gpt-4.1"
        : "full provider/model";
      process.stdout.write(`    Model value: ${modelValue}\n`);
    }
    const request = asRecord(entry.request);
    if (request) {
      if (typeof request.content_type === "string") {
        process.stdout.write(`    Request: ${request.content_type}\n`);
      }
      const parameters = asRecord(request.parameters);
      if (parameters && Object.keys(parameters).length > 0) {
        process.stdout.write("    Parameters:\n");
        for (const [name, parameter] of Object.entries(parameters)) {
          writeParameter(name, parameter, "      ");
        }
      }
    }
    const response = asRecord(entry.response);
    if (response && typeof response.type === "string") {
      process.stdout.write(`    Response: ${response.type}\n`);
    }
    const supportsStream = Boolean(asRecord(request?.parameters)?.stream);
    if (supportsStream) process.stdout.write("    Streaming: supported with --stream\n");
    if (Array.isArray(entry.supported_modes) && entry.supported_modes.length > 0) {
      process.stdout.write(`    Supported modes: ${entry.supported_modes.map(String).join(", ")}\n`);
    }
    process.stdout.write(`    Async: ${entry.async === true ? "yes" : "no"}\n`);
    if (typeof entry.poll_path === "string") {
      process.stdout.write(`    Poll: ${entry.poll_path}\n`);
    }
  }
}

function print(value: unknown): void {
  if (typeof value === "string") {
    process.stdout.write(`${value}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
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
    const rec = part as Record<string, unknown>;
    if (typeof rec.text === "string" && rec.text) parts.push(rec.text);
    else if (typeof rec.output_text === "string" && rec.output_text) parts.push(rec.output_text);
  }
  return parts;
}

function extractTextResult(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return extractTextResult(JSON.parse(trimmed));
      } catch {
        return value;
      }
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

  // OpenAI Responses: output[].content[].text
  if (Array.isArray(body.output)) {
    const parts: string[] = [];
    for (const item of body.output) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      parts.push(...collectTextParts(rec.content));
      if (typeof rec.text === "string") parts.push(rec.text);
    }
    if (parts.length) return parts.join("");
  }

  // Claude Messages: content[].text
  if (Array.isArray(body.content)) {
    const parts = collectTextParts(body.content);
    if (parts.length) return parts.join("");
  }

  // OpenAI Chat Completions / Completions
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

  // Gemini generateContent: candidates[].content.parts[].text
  if (Array.isArray(body.candidates)) {
    const parts: string[] = [];
    for (const candidate of body.candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const rec = candidate as Record<string, unknown>;
      if (typeof rec.text === "string") parts.push(rec.text);
      const content = rec.content;
      if (content && typeof content === "object") {
        parts.push(...collectTextParts((content as Record<string, unknown>).parts));
        if (typeof (content as Record<string, unknown>).text === "string") {
          parts.push((content as Record<string, unknown>).text as string);
        }
      }
    }
    if (parts.length) return parts.join("");
  }

  if (body.message && typeof body.message === "object") {
    const nested = collectTextParts((body.message as Record<string, unknown>).content);
    if (nested.length) return nested.join("");
  }
  if (body.data && typeof body.data === "object") {
    const nested = extractTextResult(body.data);
    if (nested) return nested;
  }
  return typeof body.text === "string" ? body.text : undefined;
}

function extractErrorMessage(value: unknown): string | undefined {
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

function extractMediaResult(value: unknown): string[] {
  const urls: string[] = [];
  const take = (node: unknown): void => {
    if (typeof node === "string" && /^https?:\/\//.test(node)) urls.push(node);
  };
  if (value && typeof value === "object") {
    const body = value as Record<string, unknown>;
    for (const key of ["unsigned_urls", "outputs", "output"]) {
      if (Array.isArray(body[key])) {
        for (const item of body[key] as unknown[]) take(item);
      }
    }
    if (urls.length) return [...new Set(urls)];
  }
  const visit = (node: unknown, key = ""): void => {
    if (typeof node === "string") {
      if (
        key !== "polling_url" &&
        /^(unsigned_urls|outputs|output|url|uri|image_url|video_url|audio_url|result)$/i.test(key) &&
        /^https?:\/\//.test(node)
      ) {
        urls.push(node);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, key);
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [name, child] of Object.entries(node as Record<string, unknown>)) {
      visit(child, name);
    }
  };
  visit(value);
  return [...new Set(urls)];
}

function printExtractedResult(value: unknown, definition?: ApiDefinition): void {
  const error = extractErrorMessage(value);
  const id = definition?.id;
  const textResponse = new Set([
    "OPENAI-002", "OPENAI-003", "OPENAI-007", "OPENAI-008", "OPENAI-009",
    "CLAUDE-001", "GOOGLE-001", "GOOGLE-002", "GOOGLE-003",
  ]);
  const mediaResponse = new Set([
    "CUST-001", "CUST-004", "CUST-005", "CUST-006", "CUST-007", "CUST-008", "CUST-009",
    "OPENAI-004", "OPENAI-005", "VEO-001", "VIDU-001", "KLING-001", "KLING-002",
    "KLING-003", "KLING-004", "RUNWAY-001", "RUNWAY-002", "RUNWAY-003", "RUNWAY-004",
    "RUNWAY-005", "SORA-001", "SORA-003", "WAN-001", "WAN-002",
  ]);

  if (textResponse.has(id ?? "")) {
    const text = extractTextResult(value);
    if (text !== undefined) {
      print(text);
      return;
    }
  }
  if (mediaResponse.has(id ?? "")) {
    const urls = extractMediaResult(value);
    if (urls.length) {
      process.stdout.write(`${urls.join("\n")}\n`);
      return;
    }
  }
  if (error) commandError(error);
  print(value);
}

function responseProfile(definition: ApiDefinition): Record<string, unknown> {
  const textResponse = new Set([
    "OPENAI-003", "OPENAI-007", "OPENAI-008", "OPENAI-009",
    "CLAUDE-001", "GOOGLE-001", "GOOGLE-002", "GOOGLE-003",
  ]);
  const mediaResponse = new Set([
    "CUST-001", "CUST-004", "CUST-005", "CUST-006", "CUST-007", "CUST-008", "CUST-009",
    "OPENAI-004", "OPENAI-005", "VEO-001", "VIDU-001", "KLING-001", "KLING-002",
    "KLING-003", "KLING-004", "RUNWAY-001", "RUNWAY-002", "RUNWAY-003", "RUNWAY-004",
    "RUNWAY-005", "SORA-001", "SORA-003", "WAN-001", "WAN-002",
  ]);
  if (textResponse.has(definition.id)) {
    return {
      type: "json",
      default_output: "text",
      stream: Boolean(definition.autoStream || definition.parameters.some((item) => item.name === "stream")),
    };
  }
  if (mediaResponse.has(definition.id)) {
    return {
      type: "json",
      default_output: "urls",
      async: Boolean(definition.async),
      poll_path: definition.poll?.path,
    };
  }
  if (definition.id === "OPENAI-002" || definition.id === "VEO-003" || definition.id === "SORA-004") {
    return { type: "binary", default_output: "file", requires: "--output FILE" };
  }
  return { type: "json", default_output: "json" };
}

function printHelp(): void {
  process.stdout.write(HELP);
}

function commandError(message: string): never {
  throw new CliError(message, 2);
}

function parseMethod(value: string): HttpMethod {
  const method = value.toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    commandError(`Unsupported HTTP method: ${value}`);
  }
  return method as HttpMethod;
}

function getConfig(requireCredentials: boolean): CliConfig {
  try {
    return readConfig(requireCredentials);
  } catch (error) {
    throw new CliError(
      error instanceof Error ? error.message : String(error),
      2,
    );
  }
}

function createClient(): { client: ApiClient; config: CliConfig } {
  const config = getConfig(true);
  return { client: new ApiClient(config), config };
}

function parseJson(text: string, source: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new CliError(
      `Invalid JSON in ${source}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      2,
    );
  }
}

async function readTextFile(path: string): Promise<string> {
  if (path === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new CliError(
      `Unable to read ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      2,
    );
  }
}

async function readJsonOption(
  args: ParsedArgs,
): Promise<unknown | undefined> {
  const file = option(args, "body");
  if (option(args, "data") !== undefined) {
    commandError("--data is no longer supported; use --json JSON");
  }
  const inline = option(args, "json");
  if (file && inline) {
    commandError("Use only one of --body FILE and --json JSON");
  }
  if (file) {
    return parseJson(await readTextFile(file), file);
  }
  if (inline) {
    return parseJson(inline, "--json");
  }
  return undefined;
}

function parseKeyValue(value: string, optionName: string): [string, string] {
  const separator = value.indexOf("=");
  if (separator <= 0) {
    commandError(`${optionName} must use key=value`);
  }
  return [value.slice(0, separator), value.slice(separator + 1)];
}

function parseHeaders(args: ParsedArgs): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const raw of options(args, "header")) {
    const separator = raw.indexOf(":");
    if (separator <= 0) {
      commandError("--header must use Name: value");
    }
    headers[raw.slice(0, separator).trim()] = raw.slice(separator + 1).trim();
  }
  return headers;
}

function parseQuery(args: ParsedArgs): [string, string][] {
  return options(args, "query").map((raw) => parseKeyValue(raw, "--query"));
}

function parseForm(args: ParsedArgs): [string, string][] {
  return options(args, "form").map((raw) => parseKeyValue(raw, "--form"));
}

function parseFiles(args: ParsedArgs): FormFile[] {
  return options(args, "file").map((raw) => {
    const [field, path] = parseKeyValue(raw, "--file");
    return { field, path };
  });
}

function pathnameOf(path: string): string {
  const queryIndex = path.indexOf("?");
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}

function requireContract(
  method: string,
  path: string,
  args: ParsedArgs,
): ApiContract {
  if (!path.startsWith("/")) {
    commandError(
      "PATH must start with / and must be relative to GPTPROTO_API_BASE_URL",
    );
  }
  const contract = findContract(method, path);
  if (!contract) {
    commandError(
      `Unlisted route: ${method.toUpperCase()} ${pathnameOf(
        path,
      )}. Select a model with "gptproto model <provider/model>" and use one of its documented routes.`,
    );
  }
  if (contract.status === "BLOCKED") {
    commandError(`${method.toUpperCase()} ${pathnameOf(path)} is blocked and cannot be called by this CLI`);
  }
  if (contract.status === "EXCLUDED") {
    commandError(`${method.toUpperCase()} ${pathnameOf(path)} is excluded from public clients`);
  }
  if (
    contract.status === "CONTRACT_REVIEW" &&
    !hasFlag(args, "allow-review")
  ) {
    commandError(
      `${method.toUpperCase()} ${pathnameOf(path)} requires --allow-review after reviewing the contract`,
    );
  }
  return contract;
}

function valueAsNumber(
  args: ParsedArgs,
  name: string,
): number | undefined {
  const value = option(args, name);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    commandError(`--${name} must be numeric`);
  }
  return parsed;
}

function valueAsBoolean(
  args: ParsedArgs,
  name: string,
): boolean | undefined {
  const value = option(args, name);
  if (value === undefined && !args.flags.has(name)) {
    return undefined;
  }
  if (value === undefined || value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  commandError(`--${name} must be true or false`);
}

function setIfDefined(
  target: Record<string, unknown>,
  field: string,
  value: unknown,
): void {
  if (value !== undefined) {
    target[field] = value;
  }
}

async function buildCustomBody(
  resource: string,
  args: ParsedArgs,
): Promise<Record<string, unknown>> {
  const body = await readJsonOption(args);
  if (body !== undefined) {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      commandError("Custom request body must be a JSON object");
    }
    return body as Record<string, unknown>;
  }

  const result: Record<string, unknown> = {};
  setIfDefined(result, "model", option(args, "model"));
  setIfDefined(result, "prompt", option(args, "prompt"));

  if (resource === "video" || resource === "videos") {
    setIfDefined(result, "mode", option(args, "mode"));
    setIfDefined(result, "duration", valueAsNumber(args, "duration"));
    setIfDefined(result, "resolution", option(args, "resolution"));
    setIfDefined(result, "aspect_ratio", option(args, "aspect-ratio"));
    setIfDefined(result, "size", option(args, "size"));
    setIfDefined(
      result,
      "generate_audio",
      valueAsBoolean(args, "generate-audio"),
    );
    setIfDefined(result, "seed", valueAsNumber(args, "seed"));
    setIfDefined(result, "negative_prompt", option(args, "negative-prompt"));
  } else if (resource === "image" || resource === "images") {
    setIfDefined(result, "aspect_ratio", option(args, "aspect-ratio"));
    setIfDefined(result, "resolution", option(args, "resolution"));
    setIfDefined(result, "size", option(args, "size"));
    setIfDefined(result, "n", valueAsNumber(args, "n"));
    setIfDefined(result, "quality", option(args, "quality"));
    setIfDefined(result, "output_format", option(args, "output-format"));
    setIfDefined(result, "background", option(args, "background"));
    setIfDefined(result, "seed", valueAsNumber(args, "seed"));
  } else if (resource === "speech") {
    setIfDefined(result, "input", option(args, "input"));
    setIfDefined(result, "voice", option(args, "voice"));
    setIfDefined(result, "speed", valueAsNumber(args, "speed"));
  } else if (resource === "voice-clone") {
    setIfDefined(result, "audio", option(args, "audio"));
    setIfDefined(result, "text", option(args, "text"));
    setIfDefined(result, "custom_voice_id", option(args, "custom-voice-id"));
    setIfDefined(result, "accuracy", valueAsNumber(args, "accuracy"));
    setIfDefined(
      result,
      "need_noise_reduction",
      valueAsBoolean(args, "need-noise-reduction"),
    );
    setIfDefined(
      result,
      "need_volume_normalization",
      valueAsBoolean(args, "need-volume-normalization"),
    );
  } else if (resource === "lip-sync") {
    setIfDefined(result, "video", option(args, "video"));
    setIfDefined(result, "audio", option(args, "audio"));
  } else if (resource === "3d") {
    setIfDefined(result, "mode", option(args, "mode"));
    setIfDefined(result, "image", option(args, "image"));
    setIfDefined(result, "front_image_url", option(args, "front-image-url"));
    setIfDefined(result, "back_image_url", option(args, "back-image-url"));
    setIfDefined(result, "left_image_url", option(args, "left-image-url"));
    setIfDefined(result, "right_image_url", option(args, "right-image-url"));
  } else if (resource === "image-edit") {
    setIfDefined(result, "mode", option(args, "mode"));
    setIfDefined(result, "image", option(args, "image"));
    setIfDefined(result, "video", option(args, "video"));
    setIfDefined(result, "creativity", valueAsNumber(args, "creativity"));
    setIfDefined(
      result,
      "target_resolution",
      option(args, "target-resolution"),
    );
    setIfDefined(result, "size", option(args, "size"));
    setIfDefined(result, "output_format", option(args, "output-format"));
    setIfDefined(
      result,
      "enable_base64_output",
      valueAsBoolean(args, "enable-base64-output"),
    );
    setIfDefined(
      result,
      "enable_sync_mode",
      valueAsBoolean(args, "enable-sync-mode"),
    );
  }

  const providerOptions = option(args, "provider-options");
  if (providerOptions) {
    const parsed = parseJson(
      await readTextFile(providerOptions),
      providerOptions,
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      commandError("--provider-options must point to a JSON object");
    }
    result.provider =
      "options" in parsed ? parsed : { options: parsed };
  }

  const requiredFields =
    resource === "speech"
      ? ["model", "input", "voice"]
      : resource === "voice-clone"
        ? ["model", "audio"]
        : resource === "lip-sync"
          ? ["model", "video", "audio"]
          : resource === "3d"
            ? ["model", "image"]
            : resource === "image-edit"
              ? ["model"]
              : ["model", "prompt"];
  for (const field of requiredFields) {
    if (
      result[field] === undefined ||
      result[field] === null ||
      result[field] === ""
    ) {
      commandError(
        `Missing required option for custom ${resource}: --${field.replaceAll(
          "_",
          "-",
        )}`,
      );
    }
  }
  if (
    resource === "image-edit" &&
    result.image === undefined &&
    result.video === undefined
  ) {
    commandError("Custom image-edit requires --image or --video");
  }
  return result;
}

function idFromBody(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  for (const key of ["id", "task_id", "video_id", "operation_id"]) {
    if (typeof record[key] === "string" && record[key]) {
      return record[key];
    }
  }
  for (const key of ["data", "task", "result", "response"]) {
    const nested = idFromBody(record[key]);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function statusFromBody(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  for (const key of ["status", "state"]) {
    if (typeof record[key] === "string") {
      return record[key].toLowerCase();
    }
  }
  for (const key of ["data", "task", "result", "response"]) {
    const nested = statusFromBody(record[key]);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function pollingUrlFromBody(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.polling_url === "string") {
    return record.polling_url;
  }
  for (const key of ["data", "task", "result", "response"]) {
    const nested = pollingUrlFromBody(record[key]);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function toSameOriginPath(value: string, config: CliConfig): string {
  const base = new URL(config.baseUrl);
  const parsed = new URL(value, base);
  if (parsed.origin !== base.origin) {
    throw new CliError(
      "The API returned a polling URL outside GPTPROTO_API_BASE_URL",
      3,
    );
  }
  return `${parsed.pathname}${parsed.search}`;
}

function defaultPollingPath(
  id: string,
  resource: string | undefined,
): string {
  const encoded = encodeURIComponent(id);
  return resource === "video"
    ? `/api/v3/videos/${encoded}`
    : `/api/v3/tasks/result/${encoded}`;
}

async function waitForTask(
  client: ApiClient,
  config: CliConfig,
  initial: unknown,
  args: ParsedArgs,
  resource?: string,
  pollingPath?: string,
): Promise<unknown> {
  const id = idFromBody(initial);
  if (!id) {
    commandError("The response does not contain a task id");
  }
  let current = initial;
  let status = statusFromBody(current);
  if (status && TERMINAL_STATUSES.has(status)) {
    return current;
  }

  const returnedPollingUrl = pollingUrlFromBody(current);
  let path = returnedPollingUrl
    ? toSameOriginPath(returnedPollingUrl, config)
    : pollingPath ?? defaultPollingPath(id, resource);
  requireContract("GET", path, args);
  const interval = valueAsNumber(args, "interval") ?? config.pollIntervalMs;
  const timeoutSeconds =
    valueAsNumber(args, "timeout") ?? config.maxPollMs / 1000;
  if (interval <= 0 || timeoutSeconds <= 0) {
    commandError("--interval and --timeout must be positive");
  }
  const deadline = Date.now() + timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    const response = await client.request({ method: "GET", path });
    current = response.body;
    status = statusFromBody(current);
    if (status && TERMINAL_STATUSES.has(status)) {
      return current;
    }
    const nextPollingUrl = pollingUrlFromBody(current);
    if (nextPollingUrl) {
      path = toSameOriginPath(nextPollingUrl, config);
      requireContract("GET", path, args);
    }
  }
  throw new CliError(
    `Task ${id} did not reach a terminal state within ${timeoutSeconds} seconds`,
    4,
  );
}

async function emitResponse(
  response: ApiResponse,
  args: ParsedArgs,
  definition?: ApiDefinition,
): Promise<void> {
  const output = option(args, "output");
  if (output) {
    if (Buffer.isBuffer(response.body)) {
      await writeFile(output, response.body);
    } else if (typeof response.body === "string") {
      await writeFile(output, response.body, "utf8");
    } else {
      await writeFile(
        output,
        `${JSON.stringify(response.body, null, 2)}\n`,
        "utf8",
      );
    }
    process.stderr.write(`Wrote response to ${output}\n`);
    return;
  }
  if (Buffer.isBuffer(response.body)) {
    throw new CliError(
      `The API returned ${
        response.contentType || "binary data"
      }; use --output FILE`,
      2,
    );
  }
  if (hasFlag(args, "output-json")) {
    print(response.body);
    return;
  }
  printExtractedResult(response.body, definition);
}

async function callContract(
  client: ApiClient,
  method: HttpMethod,
  path: string,
  args: ParsedArgs,
  body?: unknown,
  prepared?: Pick<RequestSpec, "form" | "files" | "headers" | "query"> & { stream?: boolean },
): Promise<ApiResponse> {
  const contract = requireContract(method, path, args);
  const form = prepared?.form ?? parseForm(args);
  const files = prepared?.files ?? parseFiles(args);
  if (body !== undefined && (form.length > 0 || files.length > 0)) {
    commandError("A JSON body cannot be combined with --form or --file");
  }
  const spec: RequestSpec = {
    method,
    path,
    body: normalizeModelForRequest(contract, body),
    form: normalizeModelForForm(contract, form),
    files,
    headers: prepared?.headers ?? parseHeaders(args),
    query: prepared?.query ?? parseQuery(args),
  };
  if (prepared?.stream ?? hasFlag(args, "stream")) {
    if (hasFlag(args, "raw")) await client.stream(spec);
    else await client.streamResponseText(spec);
    return {
      status: 200,
      contentType: "text/event-stream",
      headers: {},
      body: null,
      raw: Buffer.alloc(0),
    };
  }
  return client.request(spec);
}

function modelNameWithoutProvider(value: string): string {
  const separator = value.indexOf("/");
  if (separator <= 0 || separator === value.length - 1) return value;
  return value.slice(separator + 1);
}

function usesProviderModel(contract: ApiContract): boolean {
  return contract.family === "GPTProto custom";
}

function normalizeModelForRequest(
  contract: ApiContract,
  body: unknown,
): unknown {
  if (usesProviderModel(contract)) return body;
  const request = asRecord(body);
  if (!request || typeof request.model !== "string") return body;
  return { ...request, model: modelNameWithoutProvider(request.model) };
}

function normalizeModelForForm(
  contract: ApiContract,
  form: readonly [string, string][],
): [string, string][] {
  if (usesProviderModel(contract)) return [...form];
  return form.map(([name, value]) =>
    name === "model" ? [name, modelNameWithoutProvider(value)] : [name, value],
  );
}

async function customCommand(args: ParsedArgs): Promise<void> {
  const [subcommand, resource] = args.positionals;
  if (subcommand !== "create" || !resource) {
    printHelp();
    return;
  }
  const normalizedResource = resource.toLowerCase();
  const path = CUSTOM_CREATE_PATHS[normalizedResource];
  if (!path) {
    commandError(`Unknown custom resource: ${resource}`);
  }
  const { client, config } = createClient();
  const body = await buildCustomBody(normalizedResource, args);
  const response = await callContract(client, "POST", path, args, body);
  const definition = getApiDefinition(requireContract("POST", path, args).id);
  if (hasFlag(args, "wait")) {
    const final = await waitForTask(
      client,
      config,
      response.body,
      args,
      normalizedResource === "video" || normalizedResource === "videos"
        ? "video"
        : undefined,
    );
    printExtractedResult(final, definition);
    return;
  }
  await emitResponse(response, args, definition);
}

function queryPathForTask(id: string, args: ParsedArgs): string {
  const customPath = option(args, "path");
  if (customPath) {
    return customPath.replace("{id}", encodeURIComponent(id));
  }
  return hasFlag(args, "video")
    ? `/api/v3/videos/${encodeURIComponent(id)}`
    : `/api/v3/tasks/result/${encodeURIComponent(id)}`;
}

async function taskCommand(args: ParsedArgs): Promise<void> {
  const [subcommand, id] = args.positionals;
  if (!subcommand || !id || !["get", "wait"].includes(subcommand)) {
    printHelp();
    return;
  }
  const { client, config } = createClient();
  const path = queryPathForTask(id, args);
  const response = await callContract(client, "GET", path, args);
  const definition = getApiDefinition(requireContract("GET", path, args).id);
  if (subcommand === "wait") {
    const final = await waitForTask(
      client,
      config,
      response.body,
      args,
      hasFlag(args, "video") ? "video" : undefined,
    );
    printExtractedResult(final, definition);
    return;
  }
  await emitResponse(response, args, definition);
}

async function requestCommand(args: ParsedArgs): Promise<void> {
  const positionalMethod = args.positionals[0];
  const positionalPath = args.positionals[1];
  const method = parseMethod(
    positionalMethod ?? option(args, "method") ?? "",
  );
  const path = positionalPath ?? option(args, "path");
  if (!path) {
    commandError("Usage: gptproto request <METHOD> <PATH> [--json JSON | --body FILE] [options]");
  }
  const body = await readJsonOption(args);
  const contract = requireContract(method, path, args);
  const definition = getApiDefinition(contract.id);
  const { client, config } = createClient();
  const response = await callContract(client, method, path, args, body);
  if (!hasFlag(args, "stream")) {
    if (hasFlag(args, "wait")) {
      if (!definition?.async) {
        commandError(`${definition?.id ?? contract.id} is not an asynchronous operation`);
      }
      const pollPath = definition.poll?.path?.replace(/\{[^}]+\}/g, encodeURIComponent(idFromBody(response.body) ?? ""));
      const final = await waitForTask(client, config, response.body, args, undefined, pollPath);
      printExtractedResult(final, definition);
      return;
    }
    await emitResponse(response, args, definition);
  }
}

function configCommand(): void {
  const config = getConfig(false);
  print({
    api_base_url: config.baseUrl,
    api_key_configured: Boolean(config.apiKey),
    contract_version: config.contractVersion,
    timeout_ms: config.timeoutMs,
    poll_interval_ms: config.pollIntervalMs,
    max_poll_ms: config.maxPollMs,
  });
}

async function run(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  if (hasFlag(args, "help", "h") || args.positionals[0] === "help") {
    printHelp();
    return;
  }
  if (
    hasFlag(args, "version", "V") ||
    args.positionals[0] === "--version" ||
    args.positionals[0] === "version"
  ) {
    process.stdout.write(`${CLI_CONTRACT_VERSION}\n`);
    return;
  }

  const command = args.positionals[0];
  if (!command) {
    printHelp();
    return;
  }

  const commandArgs: ParsedArgs = {
    positionals: args.positionals.slice(1),
    options: args.options,
    flags: args.flags,
  };
  if (command === "config") {
    const baseUrl = option(commandArgs, "base-url");
    if (baseUrl) await setStoredBaseUrl(baseUrl);
    configCommand();
    return;
  }
  if (command === "key") { await keyCommand(commandArgs); return; }
  if (command === "models") {
    const subcommand = commandArgs.positionals[0] ?? "list";
    if (subcommand === "list") {
      await dynamicModelsCommand({
        positionals: commandArgs.positionals.slice(1),
        options: commandArgs.options,
        flags: commandArgs.flags,
      });
      return;
    }
    commandError(`Unknown models command: ${subcommand}`);
  }
  if (command === "model") {
    await dynamicModelCommand(commandArgs);
    return;
  }
  if (command === "custom" || command === "unified") {
    await customCommand(commandArgs);
    return;
  }
  if (command === "task") {
    await taskCommand(commandArgs);
    return;
  }
  if (command === "request") {
    await requestCommand(commandArgs);
    return;
  }
  commandError(`Unknown command: ${command}`);
}

try {
  await run(process.argv.slice(2));
} catch (error) {
  if (error instanceof ApiError) {
    process.stderr.write(`Error: ${error.message}\n`);
    if (error.details !== undefined) {
      process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
    }
    process.exitCode = error.exitCode;
  } else if (error instanceof CliError) {
    process.stderr.write(`Error: ${error.message}\n`);
    if (error.details !== undefined) {
      process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
    }
    process.exitCode = error.exitCode;
  } else {
    process.stderr.write(
      `Error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
