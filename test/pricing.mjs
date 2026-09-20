import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { normalizePriceCatalog, searchPrices } from "../dist/pricing.js";

const catalog = {
  data: {
    items: [
      {
        id: 1,
        modelManufacturerName: "OpenAI",
        modelName: "gpt-4.1/text-to-text",
        alias: "GPT 4.1",
        platformInputPrice: "2",
        platformOutPrice: "8",
        platformCachePrice: "0.5",
        platformReadCachePrice: "0.2",
        platformLockPrice: null,
        priceType: 1000000,
        priceTypeStr: "1M tokens",
        modelTag: "text-to-text,image-to-text",
      },
      {
        id: 2,
        modelManufacturerName: "Bytedance",
        modelName: "seedance-fast/text-to-video",
        alias: "Seedance Fast",
        platformInputPrice: "",
        platformOutPrice: "",
        platformLockPrice: "0.1",
        priceType: -1,
        priceTypeStr: "per time",
        modelTag: "text-to-video,image-to-video",
      },
      {
        id: 3,
        modelManufacturerName: "Bytedance",
        modelName: "seedance-pro/text-to-video",
        alias: "Seedance Pro",
        platformInputPrice: "",
        platformOutPrice: "",
        platformLockPrice: "0.3",
        priceType: -1,
        priceTypeStr: "per time",
        modelTag: "text-to-video,image-to-video",
      },
    ],
  },
};

const normalized = normalizePriceCatalog(catalog);
assert.equal(normalized.length, 3);
assert.equal(normalized[0].id, "openai/gpt-4.1");
assert.equal(normalized[0].capability, "text");
assert.equal(normalized[1].capability, "video");
assert.deepEqual(
  searchPrices(normalized, { capability: "videos", mode: "text-to-video", sort: "price", limit: 1 }).map((item) => item.id),
  ["bytedance/seedance-fast"],
);
assert.equal(searchPrices(normalized, { model: "OPENAI/GPT-4.1" })[0].pricing.output, "8");

const server = http.createServer((request, response) => {
  assert.equal(request.headers.authorization, undefined);
  assert.equal(request.url, "/api/home-model-catalog?language=en");
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(catalog));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("mock server did not start");

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/index.js", ...args], {
      env: {
        ...process.env,
        GPTPROTO_API_BASE_URL: `http://127.0.0.1:${address.port}`,
        GPTPROTO_PRICE_CATALOG_URL: `http://127.0.0.1:${address.port}/api/home-model-catalog`,
        GPTPROTO_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

try {
  const one = await run(["pricing", "openai/gpt-4.1", "--json"]);
  assert.equal(one.code, 0, one.stderr);
  assert.equal(JSON.parse(one.stdout).id, "openai/gpt-4.1");

  const cheapest = await run(["pricing", "list", "--capability", "video", "--sort", "price", "--limit", "1", "--json"]);
  assert.equal(cheapest.code, 0, cheapest.stderr);
  assert.equal(JSON.parse(cheapest.stdout).models[0].id, "bytedance/seedance-fast");

  const shorthand = await run(["pricing", "videos", "--mode", "text-to-video", "--cheapest", "1", "--json"]);
  assert.equal(shorthand.code, 0, shorthand.stderr);
  assert.equal(JSON.parse(shorthand.stdout).models[0].id, "bytedance/seedance-fast");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("gptproto-cli pricing test passed");
