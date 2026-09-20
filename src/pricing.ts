import type { CliConfig } from "./config.js";
import { CliError } from "./http.js";

export const PRICE_CATALOG_PATH = "/api/home-model-catalog";
export const PRICE_CATALOG_ORIGIN = "https://gptproto.com";

export type PriceCapability = "text" | "image" | "video" | "audio" | "3d" | "other";
export type PriceSort = "catalog" | "name" | "price";

interface CatalogEnvelope {
  readonly data?: {
    readonly items?: unknown;
  };
}

interface CatalogItem {
  readonly id?: unknown;
  readonly modelManufacturerName?: unknown;
  readonly modelName?: unknown;
  readonly model?: unknown;
  readonly alias?: unknown;
  readonly icon?: unknown;
  readonly platformInputPrice?: unknown;
  readonly platformOutPrice?: unknown;
  readonly platformLockPrice?: unknown;
  readonly platformCachePrice?: unknown;
  readonly platformReadCachePrice?: unknown;
  readonly priceType?: unknown;
  readonly priceTypeStr?: unknown;
  readonly modelTag?: unknown;
  readonly createTime?: unknown;
  readonly maxInTokenNumber?: unknown;
  readonly contextLabel?: unknown;
}

export interface ModelPrice {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  readonly catalog_model: string;
  readonly alias?: string;
  readonly capability: PriceCapability;
  readonly tags: readonly string[];
  readonly pricing: {
    readonly currency: "USD";
    readonly billing_unit: string;
    readonly input?: string;
    readonly output?: string;
    readonly fixed?: string;
    readonly cache_write?: string;
    readonly cache_read?: string;
    readonly starting_price: string;
    readonly starting_price_basis: "fixed" | "input" | "output" | "cache_write" | "cache_read";
  };
  readonly max_input_tokens?: number;
  readonly context_label?: string;
  readonly updated_at?: string;
  readonly catalog_id?: number;
  readonly icon?: string;
}

export interface PriceQuery {
  readonly model?: string;
  readonly capability?: string;
  readonly mode?: string;
  readonly search?: string;
  readonly sort?: PriceSort;
  readonly limit?: number;
  readonly language?: string;
}

export interface PriceSearchResult {
  readonly source: string;
  readonly language: string;
  readonly count: number;
  readonly models: readonly ModelPrice[];
  readonly warnings?: readonly string[];
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function numericString(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? text : undefined;
}

function modelSlug(modelName: string): string {
  return modelName.split("/")[0];
}

function capabilityFrom(modelName: string, tags: readonly string[]): PriceCapability {
  const operation = modelName.split("/").slice(1).join("/").toLowerCase();
  const values = [operation, ...tags.map((tag) => tag.toLowerCase())];
  if (values.some((value) => value.includes("-to-video") || value === "motion-control" || value === "start-end-frame")) {
    return "video";
  }
  if (values.some((value) => value.includes("-to-image") || value === "image-edit")) {
    return "image";
  }
  if (values.some((value) => value.includes("audio") || value === "voice-clone")) {
    return "audio";
  }
  if (values.some((value) => value.includes("-to-3d"))) {
    return "3d";
  }
  if (values.some((value) => value.includes("-to-text") || value === "file-analysis" || value === "web-search")) {
    return "text";
  }
  return "other";
}

export function normalizePriceCapability(value: string): PriceCapability {
  const normalized = value.trim().toLowerCase();
  if (normalized === "images") return "image";
  if (normalized === "videos") return "video";
  if (normalized === "audios") return "audio";
  if (["text", "image", "video", "audio", "3d", "other"].includes(normalized)) {
    return normalized as PriceCapability;
  }
  throw new CliError("--capability must be text, image, video, audio, 3d, or other", 2);
}

function normalizeItem(value: unknown): ModelPrice | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = value as CatalogItem;
  const providerName = stringValue(item.modelManufacturerName);
  const catalogModel = stringValue(item.modelName) ?? stringValue(item.model);
  if (!providerName || !catalogModel) return undefined;

  const provider = providerName.toLowerCase();
  const model = modelSlug(catalogModel);
  const tags = (stringValue(item.modelTag) ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const input = numericString(item.platformInputPrice);
  const output = numericString(item.platformOutPrice);
  const fixed = numericString(item.platformLockPrice);
  const cacheWrite = numericString(item.platformCachePrice);
  const cacheRead = numericString(item.platformReadCachePrice);
  const entries = [
    ["fixed", fixed],
    ["input", input],
    ["output", output],
    ["cache_write", cacheWrite],
    ["cache_read", cacheRead],
  ] as const;
  const starting = entries.find((entry) => entry[1] !== undefined);
  if (!starting || starting[1] === undefined) return undefined;

  const result: ModelPrice = {
    id: `${provider}/${model}`,
    provider,
    model,
    catalog_model: catalogModel,
    ...(stringValue(item.alias) ? { alias: stringValue(item.alias) } : {}),
    capability: capabilityFrom(catalogModel, tags),
    tags,
    pricing: {
      currency: "USD",
      billing_unit: stringValue(item.priceTypeStr) ?? "unspecified",
      ...(input ? { input } : {}),
      ...(output ? { output } : {}),
      ...(fixed ? { fixed } : {}),
      ...(cacheWrite ? { cache_write: cacheWrite } : {}),
      ...(cacheRead ? { cache_read: cacheRead } : {}),
      starting_price: starting[1],
      starting_price_basis: starting[0],
    },
    ...(typeof item.maxInTokenNumber === "number" && item.maxInTokenNumber > 0
      ? { max_input_tokens: item.maxInTokenNumber }
      : {}),
    ...(stringValue(item.contextLabel) ? { context_label: stringValue(item.contextLabel) } : {}),
    ...(stringValue(item.createTime) ? { updated_at: stringValue(item.createTime) } : {}),
    ...(typeof item.id === "number" ? { catalog_id: item.id } : {}),
    ...(stringValue(item.icon) ? { icon: stringValue(item.icon) } : {}),
  };
  return result;
}

export function normalizePriceCatalog(value: unknown): ModelPrice[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CliError("GPTProto price catalog returned an invalid response", 4);
  }
  const items = (value as CatalogEnvelope).data?.items;
  if (!Array.isArray(items)) {
    throw new CliError("GPTProto price catalog response does not contain data.items", 4);
  }
  return items.map(normalizeItem).filter((item): item is ModelPrice => item !== undefined);
}

function catalogUrl(language: string): URL {
  const override = process.env.GPTPROTO_PRICE_CATALOG_URL?.trim();
  const url = override
    ? new URL(override)
    : new URL(PRICE_CATALOG_PATH, PRICE_CATALOG_ORIGIN);
  url.search = "";
  url.searchParams.set("language", language);
  return url;
}

export async function fetchPriceCatalog(
  config: Pick<CliConfig, "baseUrl" | "timeoutMs">,
  language = "en",
): Promise<ModelPrice[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(catalogUrl(language), {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new CliError("GPTProto price catalog returned non-JSON data", 4, response.status, text);
    }
    if (!response.ok) {
      throw new CliError(`Price catalog request failed with HTTP ${response.status}`, 4, response.status, body);
    }
    return normalizePriceCatalog(body);
  } catch (error) {
    if (error instanceof CliError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new CliError(`Price catalog request timed out after ${config.timeoutMs} ms`, 4);
    }
    throw new CliError(
      `Price catalog request failed: ${error instanceof Error ? error.message : String(error)}`,
      4,
    );
  } finally {
    clearTimeout(timer);
  }
}

function comparePrice(left: ModelPrice, right: ModelPrice): number {
  const difference = Number(left.pricing.starting_price) - Number(right.pricing.starting_price);
  return difference || left.id.localeCompare(right.id);
}

export function searchPrices(items: readonly ModelPrice[], query: PriceQuery): ModelPrice[] {
  let result = [...items];
  if (query.model) {
    const model = query.model.trim().toLowerCase();
    result = result.filter((item) => item.id.toLowerCase() === model);
  }
  if (query.capability) {
    const capability = normalizePriceCapability(query.capability);
    result = result.filter((item) => item.capability === capability);
  }
  if (query.mode?.trim()) {
    const mode = query.mode.trim().toLowerCase();
    result = result.filter((item) =>
      item.catalog_model.split("/").slice(1).join("/").toLowerCase() === mode ||
      item.tags.some((tag) => tag.toLowerCase() === mode),
    );
  }
  if (query.search?.trim()) {
    const needle = query.search.trim().toLowerCase();
    result = result.filter((item) => [
      item.id,
      item.alias ?? "",
      item.catalog_model,
      ...item.tags,
    ].some((value) => value.toLowerCase().includes(needle)));
  }
  if (query.sort === "price") result.sort(comparePrice);
  if (query.sort === "name") result.sort((left, right) => left.id.localeCompare(right.id));
  if (query.limit !== undefined) {
    if (!Number.isInteger(query.limit) || query.limit <= 0) {
      throw new CliError("--limit must be a positive integer", 2);
    }
    result = result.slice(0, query.limit);
  }
  return result;
}

export async function queryPrices(
  config: Pick<CliConfig, "baseUrl" | "timeoutMs">,
  query: PriceQuery = {},
): Promise<PriceSearchResult> {
  const language = query.language?.trim() || "en";
  const models = searchPrices(await fetchPriceCatalog(config, language), query);
  const billingUnits = new Set(models.map((item) => item.pricing.billing_unit));
  const warnings = query.sort === "price" && billingUnits.size > 1
    ? ["Prices with different billing units are not directly comparable; inspect each model's billing_unit and rate fields."]
    : undefined;
  return {
    source: catalogUrl(language).toString(),
    language,
    count: models.length,
    models,
    ...(warnings ? { warnings } : {}),
  };
}
