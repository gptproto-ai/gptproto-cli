import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

export const NPM_PACKAGE_NAME = "@gptproto-ai/cli";
export const NPM_REGISTRY = "https://registry.npmjs.org";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

export const CURRENT_VERSION = packageJson.version;

interface ParsedVersion {
  readonly core: readonly bigint[];
  readonly prerelease: readonly string[];
}

function parseVersion(value: string): ParsedVersion | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value);
  if (!match) return null;
  return {
    core: [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])],
    prerelease: match[4]?.split(".") ?? [],
  };
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error(`Invalid version: ${!a ? left : right}`);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] < b.core[index]) return -1;
    if (a.core[index] > b.core[index]) return 1;
  }
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
  if (b.prerelease.length === 0 && a.prerelease.length > 0) return -1;
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const x = a.prerelease[index];
    const y = b.prerelease[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNumeric = /^\d+$/.test(x);
    const yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) {
      if (BigInt(x) < BigInt(y)) return -1;
      if (BigInt(x) > BigInt(y)) return 1;
    } else if (xNumeric !== yNumeric) {
      return xNumeric ? -1 : 1;
    } else {
      if (x < y) return -1;
      if (x > y) return 1;
    }
  }
  return 0;
}

export interface NpmVersionInfo {
  readonly current: string;
  readonly latest: string | null;
  readonly newer: readonly string[];
  readonly publishedVersions: readonly string[];
  readonly published: boolean;
}

export async function fetchNpmVersionInfo(
  fetcher: typeof fetch = fetch,
): Promise<NpmVersionInfo> {
  const response = await fetcher(
    `${NPM_REGISTRY}/${encodeURIComponent(NPM_PACKAGE_NAME)}`,
    {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (response.status === 404) {
    return {
      current: CURRENT_VERSION,
      latest: null,
      newer: [],
      publishedVersions: [],
      published: false,
    };
  }
  if (!response.ok) {
    throw new Error(`npm registry returned HTTP ${response.status}`);
  }

  const metadata = await response.json() as {
    versions?: Record<string, unknown>;
    "dist-tags"?: Record<string, unknown>;
  };
  if (!metadata || typeof metadata.versions !== "object" || metadata.versions === null) {
    throw new Error("npm registry returned invalid package metadata");
  }
  const publishedVersions = Object.keys(metadata.versions)
    .filter((version) => parseVersion(version) !== null)
    .sort(compareVersions);
  const latestTag = metadata["dist-tags"]?.latest;
  const latest = typeof latestTag === "string" && publishedVersions.includes(latestTag)
    ? latestTag
    : null;
  return {
    current: CURRENT_VERSION,
    latest,
    newer: publishedVersions
      .filter((version) => compareVersions(version, CURRENT_VERSION) > 0)
      .reverse(),
    publishedVersions,
    published: true,
  };
}

export function npmInstallArgs(version: string): string[] {
  if (!parseVersion(version)) throw new Error(`Invalid version: ${version}`);
  return [
    "install",
    "--global",
    `${NPM_PACKAGE_NAME}@${version}`,
    `--registry=${NPM_REGISTRY}`,
  ];
}

export async function installNpmVersion(version: string): Promise<void> {
  const args = npmInstallArgs(version);
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm install failed with exit code ${code ?? "unknown"}`));
    });
  });
}
