import {
  CLI_CONTRACT_VERSION,
  normalizeContractVersion,
} from "./contracts.js";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { readFileSync } from "node:fs";

export const DEFAULT_API_BASE_URL = "https://gptproto.com";
const KEY_FILE = join(homedir(), ".config", "gptproto", "key");
const URL_FILE = join(homedir(), ".config", "gptproto", "base-url");

export async function setStoredBaseUrl(value: string): Promise<void> {
  const url = value.trim().replace(/\/+$/, "");
  validateBaseUrl(url);
  await mkdir(join(homedir(), ".config", "gptproto"), { recursive: true, mode: 0o700 });
  await writeFile(URL_FILE, url + "\n", { mode: 0o600 });
}

export async function setStoredKey(key: string): Promise<void> {
  await mkdir(join(homedir(), ".config", "gptproto"), { recursive: true, mode: 0o700 });
  await writeFile(KEY_FILE, key.trim() + "\n", { mode: 0o600 });
}
export async function removeStoredKey(): Promise<void> { try { await unlink(KEY_FILE); } catch { /* already absent */ } }
async function storedKey(): Promise<string | null> { try { return (await readFile(KEY_FILE, "utf8")).trim() || null; } catch { return null; } }

export interface CliConfig {
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly contractVersion: string;
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
  readonly maxPollMs: number;
}

const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_MAX_POLL_MS = 10 * 60_000;

function positiveInteger(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function validateBaseUrl(baseUrl: string): void {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("GPTPROTO_API_BASE_URL must use http or https");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("API base URL must not contain credentials, query parameters or a fragment");
  }
}

function normalizedApiKey(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  return value.trim().replace(/^Bearer\s+/i, "");
}

export function readConfig(requireCredentials = false): CliConfig {
  let savedUrl: string | undefined;
  try { savedUrl = readFileSync(URL_FILE, "utf8").trim(); } catch { savedUrl = undefined; }
  const baseUrl =
    process.env.GPTPROTO_API_BASE_URL?.trim() || savedUrl || DEFAULT_API_BASE_URL;
  let saved: string | undefined;
  try { saved = readFileSync(KEY_FILE, "utf8"); } catch { saved = undefined; }
  const apiKey = normalizedApiKey(process.env.GPTPROTO_API_KEY) || normalizedApiKey(saved);
  const requestedVersion = normalizeContractVersion(
    process.env.GPTPROTO_API_DOC_VERSION?.trim() || CLI_CONTRACT_VERSION,
  );
  const expectedVersion = normalizeContractVersion(CLI_CONTRACT_VERSION);

  validateBaseUrl(baseUrl);
  if (requestedVersion !== expectedVersion) {
    throw new Error(
      `Unsupported API document version ${requestedVersion}; this CLI supports ${expectedVersion}`,
    );
  }
  if (requireCredentials && !apiKey) {
    throw new Error("GPTPROTO_API_KEY is required for API calls");
  }

  return {
    baseUrl,
    apiKey,
    contractVersion: expectedVersion,
    timeoutMs: positiveInteger(
      "GPTPROTO_TIMEOUT_MS",
      process.env.GPTPROTO_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    ),
    pollIntervalMs: positiveInteger(
      "GPTPROTO_POLL_INTERVAL_MS",
      process.env.GPTPROTO_POLL_INTERVAL_MS,
      DEFAULT_POLL_INTERVAL_MS,
    ),
    maxPollMs: positiveInteger(
      "GPTPROTO_MAX_POLL_SECONDS",
      process.env.GPTPROTO_MAX_POLL_SECONDS
        ? `${Number(process.env.GPTPROTO_MAX_POLL_SECONDS) * 1000}`
        : undefined,
      DEFAULT_MAX_POLL_MS,
    ),
  };
}
