import assert from "node:assert/strict";
import {
  CURRENT_VERSION,
  NPM_PACKAGE_NAME,
  NPM_REGISTRY,
  compareVersions,
  fetchNpmVersionInfo,
  npmInstallArgs,
} from "../dist/version.js";

assert.equal(CURRENT_VERSION, "1.1.0");
assert.equal(compareVersions("0.5.1-beta.2", "0.5.1-beta.10"), -1);
assert.equal(compareVersions("0.5.1-beta.10", "0.5.1"), -1);
assert.equal(compareVersions("1.0.0", "0.9.9"), 1);

const metadata = {
  versions: {
    "0.4.0": {},
    "0.5.0": {},
    "1.0.0": {},
    "1.0.1-beta.1": {},
    "1.0.1": {},
    "1.1.0": {},
    "1.1.1-beta.1": {},
    "1.1.1": {},
  },
  "dist-tags": { latest: "1.1.1" },
};
const info = await fetchNpmVersionInfo(async (url, options) => {
  assert.equal(url, `${NPM_REGISTRY}/${encodeURIComponent(NPM_PACKAGE_NAME)}`);
  assert.equal(options.headers.accept, "application/vnd.npm.install-v1+json");
  return new Response(JSON.stringify(metadata), { status: 200 });
});
assert.equal(info.current, "1.1.0");
assert.equal(info.latest, "1.1.1");
assert.deepEqual(info.newer, ["1.1.1", "1.1.1-beta.1"]);
assert.deepEqual(npmInstallArgs("1.0.1"), [
  "install", "--global", "@gptproto-ai/cli@1.0.1", `--registry=${NPM_REGISTRY}`,
]);
assert.throws(() => npmInstallArgs("1.0.1;echo unsafe"), /Invalid version/);

const unpublished = await fetchNpmVersionInfo(
  async () => new Response("not found", { status: 404 }),
);
assert.equal(unpublished.published, false);
assert.equal(unpublished.latest, null);
assert.deepEqual(unpublished.newer, []);

await assert.rejects(
  fetchNpmVersionInfo(async () => new Response("failure", { status: 500 })),
  /HTTP 500/,
);

console.log("gptproto-cli version test passed");
