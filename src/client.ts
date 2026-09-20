import { readConfig, type CliConfig } from "./config.js";
import { findContract, type ApiContract, type HttpMethod } from "./contracts.js";
import { getApiDefinition, type ApiDefinition } from "./definitions.js";
import { ApiClient, CliError, type ApiResponse, type RequestSpec } from "./http.js";
import { queryPrices, type PriceQuery, type PriceSearchResult } from "./pricing.js";
export { extractApiResult, type ExtractedApiResult } from "./results.js";

const TERMINAL_STATUSES = new Set([
  "completed", "failed", "cancelled", "expired", "succeeded", "success",
]);

export const CUSTOM_CREATE_PATHS: Readonly<Record<string, string>> = {
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

export interface ClientCallResult {
  readonly response: ApiResponse;
  readonly contract: ApiContract;
  readonly definition?: ApiDefinition;
}

export interface ClientRequest extends RequestSpec {
  readonly method: HttpMethod;
  readonly allowReview?: boolean;
}

export interface WaitOptions {
  readonly video?: boolean;
  readonly resource?: string;
  readonly pollingPath?: string;
  readonly intervalMs?: number;
  readonly timeoutSeconds?: number;
}

function pathOnly(path: string): string {
  const index = path.indexOf("?");
  return index === -1 ? path : path.slice(0, index);
}

export function requirePublicContract(method: string, path: string, allowReview = false): ApiContract {
  if (!path.startsWith("/")) {
    throw new CliError("API path must start with / and must be relative to GPTPROTO_API_BASE_URL", 2);
  }
  const contract = findContract(method, path);
  if (!contract) throw new CliError(`Unlisted route: ${method.toUpperCase()} ${pathOnly(path)}`, 2);
  if (contract.status === "BLOCKED" || contract.status === "EXCLUDED") {
    throw new CliError(`${method.toUpperCase()} ${pathOnly(path)} is not available to public clients`, 2);
  }
  if (contract.status === "CONTRACT_REVIEW" && !allowReview) {
    throw new CliError(`${method.toUpperCase()} ${pathOnly(path)} requires explicit contract review`, 2);
  }
  return contract;
}

function removeProvider(value: string): string {
  const index = value.indexOf("/");
  return index > 0 && index < value.length - 1 ? value.slice(index + 1) : value;
}

function normalizeBody(contract: ApiContract, body: unknown): unknown {
  if (contract.family === "GPTProto custom") return body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const record = body as Record<string, unknown>;
  return typeof record.model === "string" ? { ...record, model: removeProvider(record.model) } : body;
}

function normalizeForm(contract: ApiContract, form: readonly [string, string][] | undefined): [string, string][] | undefined {
  if (!form) return undefined;
  if (contract.family === "GPTProto custom") return [...form];
  return form.map(([name, value]) => name === "model" ? [name, removeProvider(value)] : [name, value]);
}

function nestedString(body: unknown, names: readonly string[]): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  for (const name of names) {
    if (typeof record[name] === "string" && record[name]) return record[name] as string;
  }
  for (const name of ["data", "task", "result", "response"]) {
    const nested = nestedString(record[name], names);
    if (nested) return nested;
  }
  return undefined;
}

function taskId(body: unknown): string | undefined {
  return nestedString(body, ["id", "task_id", "video_id", "operation_id"]);
}

function taskStatus(body: unknown): string | undefined {
  return nestedString(body, ["status", "state"])?.toLowerCase();
}

function pollingUrl(body: unknown): string | undefined {
  return nestedString(body, ["polling_url"]);
}

export class GPTProtoClient {
  readonly config: CliConfig;

  constructor(config: CliConfig = readConfig(false)) {
    this.config = config;
  }

  status(): Record<string, unknown> {
    return {
      api_base_url: this.config.baseUrl,
      api_key_configured: Boolean(this.config.apiKey),
      contract_version: this.config.contractVersion,
      timeout_ms: this.config.timeoutMs,
      poll_interval_ms: this.config.pollIntervalMs,
      max_poll_ms: this.config.maxPollMs,
    };
  }

  private api(): ApiClient {
    if (!this.config.apiKey) throw new CliError("GPTProto API key is not configured", 2);
    return new ApiClient(this.config);
  }

  async listModels(capability?: string): Promise<unknown> {
    const path = capability
      ? `/v1/cli/models?capability=${encodeURIComponent(capability)}`
      : "/v1/cli/models";
    return (await this.api().request({ method: "GET", path })).body;
  }

  async describeModel(model: string): Promise<unknown> {
    const [provider, ...parts] = model.split("/");
    if (!provider || parts.length === 0) throw new CliError("model must use provider/model", 2);
    const path = `/v1/cli/models/${encodeURIComponent(provider)}/${encodeURIComponent(parts.join("/"))}`;
    return (await this.api().request({ method: "GET", path })).body;
  }

  async pricing(query: PriceQuery = {}): Promise<PriceSearchResult> {
    return queryPrices(this.config, query);
  }

  async request(spec: ClientRequest): Promise<ClientCallResult> {
    const contract = requirePublicContract(spec.method, spec.path, spec.allowReview);
    const response = await this.api().request({
      method: spec.method,
      path: spec.path,
      body: normalizeBody(contract, spec.body),
      form: normalizeForm(contract, spec.form),
      files: spec.files,
      headers: spec.headers,
      query: spec.query,
    });
    return { response, contract, definition: getApiDefinition(contract.id) };
  }

  async customCreate(resource: string, body: Record<string, unknown>): Promise<ClientCallResult> {
    const path = CUSTOM_CREATE_PATHS[resource.toLowerCase()];
    if (!path) throw new CliError(`Unknown custom resource: ${resource}`, 2);
    return this.request({ method: "POST", path, body });
  }

  async taskGet(id: string, video = false): Promise<ClientCallResult> {
    const path = video
      ? `/api/v3/videos/${encodeURIComponent(id)}`
      : `/api/v3/tasks/result/${encodeURIComponent(id)}`;
    return this.request({ method: "GET", path });
  }

  private sameOriginPath(value: string): string {
    const base = new URL(this.config.baseUrl);
    const target = new URL(value, base);
    if (target.origin !== base.origin) {
      throw new CliError("The API returned a polling URL outside GPTPROTO_API_BASE_URL", 3);
    }
    return `${target.pathname}${target.search}`;
  }

  async waitForTask(initial: unknown, options: WaitOptions = {}): Promise<ClientCallResult> {
    const id = taskId(initial);
    if (!id) throw new CliError("The response does not contain a task id", 2);
    const initialStatus = taskStatus(initial);
    if (initialStatus && TERMINAL_STATUSES.has(initialStatus)) {
      const path = options.video ? `/api/v3/videos/${encodeURIComponent(id)}` : `/api/v3/tasks/result/${encodeURIComponent(id)}`;
      const contract = requirePublicContract("GET", path);
      return {
        response: { status: 200, contentType: "application/json", headers: {}, body: initial, raw: Buffer.from(JSON.stringify(initial)) },
        contract,
        definition: getApiDefinition(contract.id),
      };
    }
    let path = pollingUrl(initial)
      ? this.sameOriginPath(pollingUrl(initial) as string)
      : options.pollingPath?.replace(/\{[^}]+\}/g, encodeURIComponent(id))
        ?? (options.video || options.resource === "video" || options.resource === "videos"
          ? `/api/v3/videos/${encodeURIComponent(id)}`
          : `/api/v3/tasks/result/${encodeURIComponent(id)}`);
    const intervalMs = options.intervalMs ?? this.config.pollIntervalMs;
    const timeoutSeconds = options.timeoutSeconds ?? this.config.maxPollMs / 1000;
    if (intervalMs <= 0 || timeoutSeconds <= 0) throw new CliError("Polling interval and timeout must be positive", 2);
    const deadline = Date.now() + timeoutSeconds * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      const result = await this.request({ method: "GET", path });
      const status = taskStatus(result.response.body);
      if (status && TERMINAL_STATUSES.has(status)) return result;
      const next = pollingUrl(result.response.body);
      if (next) path = this.sameOriginPath(next);
    }
    throw new CliError(`Task ${id} did not reach a terminal state within ${timeoutSeconds} seconds`, 4);
  }

  async taskWait(id: string, options: WaitOptions = {}): Promise<ClientCallResult> {
    const first = await this.taskGet(id, Boolean(options.video));
    return this.waitForTask(first.response.body, options);
  }
}
