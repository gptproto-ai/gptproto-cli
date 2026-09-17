import { readFile } from "node:fs/promises";
import {
  getApiDefinition,
  type ApiDefinition,
  type ParameterDefinition,
  type ParameterLocation,
} from "./definitions.js";
import { hasFlag, option, options, type ParsedArgs } from "./args.js";
import { CliError, type FormFile, type RequestSpec } from "./http.js";

export interface PreparedInvocation {
  readonly definition: ApiDefinition;
  readonly request: RequestSpec;
  readonly stream: boolean;
}

const CONTROL_OPTIONS = new Set([
  "param", "body", "json", "data", "header", "query", "form", "file",
  "stream", "wait", "interval", "timeout", "output", "dry-run",
  "allow-review", "poll-path", "method", "path", "provider-options",
]);

function fail(message: string): never {
  throw new CliError(message, 2);
}

function parsePair(value: string, optionName: string): [string, string] {
  const separator = value.indexOf("=");
  if (separator <= 0) {
    fail(`${optionName} must use name=value`);
  }
  return [value.slice(0, separator), value.slice(separator + 1)];
}

function parseHeader(value: string): [string, string] {
  const separator = value.indexOf(":");
  if (separator <= 0) {
    fail("--header must use Name: value");
  }
  return [value.slice(0, separator).trim(), value.slice(separator + 1).trim()];
}

function parseFile(value: string): FormFile {
  const [field, path] = parsePair(value, "--file");
  return { field, path };
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    fail(`Unable to read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function parseJsonFile(path: string): Promise<unknown> {
  const text = await readText(path);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    fail(`Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parameterVariants(name: string): string[] {
  const snake = name.replaceAll("-", "_");
  const camel = snake.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  return [...new Set([name, snake, camel])];
}

function findParameter(
  definition: ApiDefinition,
  rawName: string,
  preferredLocation?: ParameterLocation,
): ParameterDefinition | undefined {
  const variants = parameterVariants(rawName);
  return definition.parameters.find((parameter) =>
    variants.includes(parameter.name) &&
    (!preferredLocation || parameter.location === preferredLocation),
  ) ?? definition.parameters.find((parameter) => variants.includes(parameter.name));
}

function nestedGet(target: unknown, name: string): unknown {
  let current = target;
  for (const part of name.split(".")) {
    if (typeof current !== "object" || current === null || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function nestedSet(target: Record<string, unknown>, name: string, value: unknown): void {
  const parts = name.split(".");
  let current = target;
  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (existing === undefined) {
      current[part] = {};
    } else if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
      fail(`Cannot set ${name}: ${part} is not an object`);
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

function scalarValue(raw: string, type: ParameterDefinition["type"], name: string): unknown {
  if (type === "string") {
    return raw;
  }
  if (type === "integer" || type === "number") {
    const value = Number(raw);
    if (!Number.isFinite(value) || (type === "integer" && !Number.isInteger(value))) {
      fail(`--param ${name} expects a ${type}`);
    }
    return value;
  }
  if (type === "boolean") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    fail(`--param ${name} expects true or false`);
  }
  return undefined;
}

async function parseValue(
  raw: string,
  parameter: ParameterDefinition,
): Promise<unknown> {
  if (parameter.type !== "json") {
    if (raw.startsWith("@")) {
      return scalarValue(await readText(raw.slice(1)), parameter.type, parameter.name);
    }
    return scalarValue(raw, parameter.type, parameter.name);
  }
  const text = raw.startsWith("@") ? await readText(raw.slice(1)) : raw;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Official APIs such as embeddings and completions accept a plain string
    // or an array; keep the string form convenient while preserving JSON.
    return text;
  }
}

function nonEmpty(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function validateValue(parameter: ParameterDefinition, value: unknown): void {
  if (parameter.location === "file") {
    if (parameter.required && !value) {
      fail(`Missing required parameter: ${parameter.name}`);
    }
    return;
  }

  if (!nonEmpty(value)) {
    if (parameter.required) fail(`Missing required parameter: ${parameter.name}`);
    return;
  }
  if (parameter.type === "string" && typeof value !== "string") {
    fail(`${parameter.name} must be a string`);
  }
  if (parameter.type === "integer" && (typeof value !== "number" || !Number.isInteger(value))) {
    fail(`${parameter.name} must be an integer`);
  }
  if (parameter.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    fail(`${parameter.name} must be a number`);
  }
  if (parameter.type === "boolean" && typeof value !== "boolean") {
    fail(`${parameter.name} must be true or false`);
  }
  if (parameter.enum && typeof value === "string" && !parameter.enum.includes(value)) {
    fail(`${parameter.name} must be one of: ${parameter.enum.join(", ")}`);
  }
  if (typeof value === "number") {
    if (parameter.minimum !== undefined && value < parameter.minimum) {
      fail(`${parameter.name} must be at least ${parameter.minimum}`);
    }
    if (parameter.maximum !== undefined && value > parameter.maximum) {
      fail(`${parameter.name} must be at most ${parameter.maximum}`);
    }
  }
}

function pathValue(
  definition: ApiDefinition,
  body: unknown,
  values: Map<string, unknown>,
  name: string,
): unknown {
  return values.get(name) ?? nestedGet(body, name);
}

function resolvePath(
  definition: ApiDefinition,
  body: unknown,
  values: Map<string, unknown>,
): string {
  return definition.path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = pathValue(definition, body, values, name);
    if (!nonEmpty(value)) {
      fail(`Missing path parameter: ${name}`);
    }
    return encodeURIComponent(String(value));
  });
}

function addQuery(target: [string, string][], name: string, value: unknown): void {
  if (value === undefined) return;
  target.push([name, typeof value === "string" ? value : JSON.stringify(value)]);
}

async function readInitialBody(args: ParsedArgs): Promise<Record<string, unknown> | undefined> {
  const bodyPath = option(args, "body", "json");
  const inline = option(args, "data");
  if (bodyPath && inline) fail("Use only one of --body/--json and --data");
  if (!bodyPath && !inline) return undefined;
  const value = bodyPath ? await parseJsonFile(bodyPath) : (() => {
    try { return JSON.parse(inline as string) as unknown; } catch { fail("--data must contain valid JSON"); }
  })();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("Automatic JSON calls require an object request body");
  }
  return value as Record<string, unknown>;
}

function collectDirectParameters(args: ParsedArgs): [string, string][] {
  const result: [string, string][] = options(args, "param").map((value) => parsePair(value, "--param"));
  for (const [name, values] of args.options.entries()) {
    if (CONTROL_OPTIONS.has(name)) continue;
    for (const value of values) result.push([name, value]);
  }
  return result;
}

function requestHeaders(args: ParsedArgs): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const value of options(args, "header")) {
    const [name, headerValue] = parseHeader(value);
    headers[name] = headerValue;
  }
  return headers;
}

function requestQuery(args: ParsedArgs): [string, string][] {
  return options(args, "query").map((value) => parsePair(value, "--query"));
}

export async function prepareInvocation(
  apiId: string,
  args: ParsedArgs,
): Promise<PreparedInvocation> {
  const definition = getApiDefinition(apiId);
  if (!definition) fail(`Unknown API-ID: ${apiId}. Run "gptproto api list".`);

  const initialBody = await readInitialBody(args);
  const bodyObject: Record<string, unknown> = initialBody ? { ...initialBody } : {};
  const values = new Map<string, unknown>();

  for (const [rawName, rawValue] of collectDirectParameters(args)) {
    const parameter = findParameter(definition, rawName);
    if (!parameter) {
      fail(`Unknown parameter for ${definition.id}: ${rawName}. Run "gptproto api describe ${definition.id}".`);
    }
    const value = await parseValue(rawValue, parameter,);
    values.set(parameter.name, value);
    if (parameter.location === "body") nestedSet(bodyObject, parameter.name, value);
  }

  if (hasFlag(args, "stream")) {
    const streamParameter = findParameter(definition, "stream", "body") ?? findParameter(definition, "stream", "form");
    if (streamParameter) {
      values.set(streamParameter.name, true);
      if (streamParameter.location === "body") nestedSet(bodyObject, streamParameter.name, true);
    }
  }

  const files = options(args, "file").map(parseFile);
  const form: [string, string][] = options(args, "form").map((value) => parsePair(value, "--form"));
  const headers = requestHeaders(args);
  const query = requestQuery(args);
  const path = resolvePath(definition, bodyObject, values);

  if (definition.requestStyle === "none") {
    if (initialBody || values.size > 0 && definition.parameters.some((item) => item.location === "body" && values.has(item.name))) {
      fail(`${definition.id} does not accept a JSON request body`);
    }
  }
  if (definition.requestStyle === "json" && (files.length > 0 || form.length > 0)) {
    fail(`${definition.id} uses JSON; do not use --form or --file`);
  }
  if (definition.requestStyle === "multipart" && initialBody) {
    fail(`${definition.id} uses multipart; pass fields with --param and files with --file`);
  }

  for (const parameter of definition.parameters) {
    let value: unknown;
    if (parameter.location === "body") value = nestedGet(bodyObject, parameter.name);
    else value = values.get(parameter.name);
    if (parameter.location === "file") value = files.some((item) => item.field === parameter.name) ? true : undefined;
    if (parameter.location === "header" && value === undefined && parameter.defaultValue !== undefined) {
      value = parameter.defaultValue;
    }
    validateValue(parameter, value);
    if (parameter.location === "query") addQuery(query, parameter.name, value);
    if (parameter.location === "form" && value !== undefined) form.push([parameter.name, typeof value === "string" ? value : JSON.stringify(value)]);
    if (parameter.location === "header" && value !== undefined) {
      headers[parameter.wireName ?? parameter.name] = String(value);
    }
  }

  const oneOfImageOrVideo = definition.id === "CUST-009";
  if (oneOfImageOrVideo && !nonEmpty(nestedGet(bodyObject, "image")) && !nonEmpty(nestedGet(bodyObject, "video"))) {
    fail("CUST-009 requires image or video");
  }

  if (definition.id === "OPENAI-005") {
    const hasMultipartImage = files.some((item) => item.field === "image");
    const hasJsonImages = nonEmpty(nestedGet(bodyObject, "images"));
    const hasPrompt = nonEmpty(nestedGet(bodyObject, "prompt")) ||
      form.some(([name, value]) => name === "prompt" && value !== "");
    if (!hasMultipartImage && !hasJsonImages) {
      fail("OPENAI-005 requires multipart image or JSON images");
    }
    if (!hasPrompt) {
      fail("OPENAI-005 requires prompt");
    }
  }

  if (definition.id === "SORA-001") {
    const hasPrompt = nonEmpty(nestedGet(bodyObject, "prompt")) ||
      form.some(([name, value]) => name === "prompt" && value !== "");
    if (!hasPrompt) {
      fail("SORA-001 requires prompt");
    }
  }

  const stream = definition.autoStream || hasFlag(args, "stream") || nestedGet(bodyObject, "stream") === true || form.some(([name, value]) => name === "stream" && value === "true");
  const request: RequestSpec = {
    method: definition.method,
    path,
    body: definition.requestStyle === "json" ||
      (definition.requestStyle === "json-or-multipart" && files.length === 0 && form.length === 0)
      ? bodyObject
      : undefined,
    form,
    files,
    headers,
    query,
  };
  return { definition, request, stream };
}

export function describeParameters(definition: ApiDefinition): string {
  return definition.parameters.map((parameter) => {
    const required = parameter.required ? "required" : "optional";
    const constraints = [
      parameter.enum ? `one of ${parameter.enum.join("|")}` : "",
      parameter.minimum !== undefined ? `min ${parameter.minimum}` : "",
      parameter.maximum !== undefined ? `max ${parameter.maximum}` : "",
    ].filter(Boolean).join(", ");
    return `  ${parameter.name.padEnd(34)} ${parameter.location.padEnd(6)} ${parameter.type.padEnd(8)} ${required.padEnd(8)} ${constraints} ${parameter.description ?? ""}`.trimEnd();
  }).join("\n");
}
