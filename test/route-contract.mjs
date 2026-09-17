import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { unlink, writeFile } from "node:fs/promises";

const { API_CONTRACTS, findContract } = await import("../dist/contracts.js");
const { getApiDefinition } = await import("../dist/definitions.js");

const uploadPath = "/tmp/gptproto-cli-route-contract-upload.txt";
await writeFile(uploadPath, "route-contract-smoke");

const requests = [];
const server = http.createServer((request, response) => {
  let body = Buffer.alloc(0);
  request.on("data", (chunk) => {
    body = Buffer.concat([body, chunk]);
  });
  request.on("end", () => {
    assert.equal(request.headers.authorization, "Bearer route-contract-key");
    const pathname = new URL(request.url, "http://route-contract.local").pathname;
    const contract = findContract(request.method, pathname);
    assert.ok(contract, `Mock received an unregistered route: ${request.method} ${pathname}`);
    const definition = getApiDefinition(contract.id);
    assert.ok(definition);
    const contentType = request.headers["content-type"] ?? "";
    if (definition.requestStyle === "multipart") {
      assert.match(contentType, /^multipart\/form-data;/, `${contract.id} must use multipart`);
    } else if (definition.requestStyle !== "none") {
      assert.match(contentType, /^application\/json/, `${contract.id} must use JSON`);
    }

    let parsedBody;
    if (contentType.includes("application/json") && body.length > 0) {
      parsedBody = JSON.parse(body.toString("utf8"));
    }
    for (const parameter of definition.parameters) {
      if (!parameter.required) continue;
      if (parameter.location === "body") {
        assert.notEqual(nestedGet(parsedBody, parameter.name), undefined, `${contract.id} missing ${parameter.name}`);
      }
      if (parameter.location === "form" || parameter.location === "file") {
        assert.match(body.toString("utf8"), new RegExp(`name="${escapeRegExp(parameter.name)}"`), `${contract.id} missing ${parameter.name}`);
      }
      if (parameter.location === "header") {
        const headerName = (parameter.wireName ?? parameter.name).toLowerCase();
        assert.equal(request.headers[headerName], String(parameter.defaultValue ?? ""), `${contract.id} missing ${headerName}`);
      }
    }
    requests.push({
      method: request.method,
      url: request.url,
      contentType: request.headers["content-type"] ?? "",
      body,
    });
    if (definition.autoStream) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end('data: {"choices":[{"delta":{"content":"route-stream"}}]}\n\ndata: [DONE]\n\n');
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, method: request.method, path: request.url }));
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nestedGet(target, name) {
  let current = target;
  for (const part of name.split(".")) {
    if (!current || typeof current !== "object" || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

function sampleValue(parameter) {
  if (parameter.enum?.length) return parameter.enum[0];
  if (parameter.type === "boolean") return false;
  if (parameter.name === "model" || parameter.name.endsWith(".model")) return "smoke-model";
  if (parameter.name.includes("prompt")) return "smoke prompt";
  if (parameter.name === "messages") return [{ role: "user", content: "smoke" }];
  if (parameter.name === "contents") return [{ role: "user", parts: [{ text: "smoke" }] }];
  if (parameter.name === "instances") return [{ prompt: "smoke" }];
  if (parameter.name === "images") return ["https://example.test/image.png"];
  if (parameter.name === "input") return "smoke input";
  if (parameter.name === "voice") return "alloy";
  if (parameter.name === "max_tokens") return 64;
  if (parameter.type === "json") return {};
  if (parameter.type === "integer") return 1;
  if (parameter.type === "number") return 0.5;
  if (parameter.type === "boolean") return false;
  return "smoke";
}

function setNested(target, name, value) {
  const parts = name.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function jsonArguments(definition) {
  const body = {};
  for (const parameter of definition.parameters) {
    if (parameter.location === "body") setNested(body, parameter.name, sampleValue(parameter));
  }
  if (definition.id === "CUST-009") body.image = "https://example.test/image.png";
  if (definition.id === "OPENAI-005") {
    return JSON.stringify({
      images: [{ image_url: "https://example.test/image.png" }],
      prompt: "smoke edit",
    });
  }
  if (definition.id === "SORA-001") {
    return JSON.stringify({ model: "sora-2", prompt: "smoke video" });
  }
  return JSON.stringify(body);
}

function routeArguments(definition) {
  const path = definition.path.replace(/\{[^}]+\}/g, "smoke-id");
  const args = ["request", definition.method, path];
  if (definition.status === "CONTRACT_REVIEW") args.push("--allow-review");

  for (const parameter of definition.parameters) {
    if (parameter.location === "header" && parameter.required) {
      args.push("--header", `${parameter.wireName ?? parameter.name}: ${parameter.defaultValue ?? sampleValue(parameter)}`);
    }
    if (parameter.location === "query" && parameter.required) {
      args.push("--query", `${parameter.name}=${sampleValue(parameter)}`);
    }
  }

  if (definition.requestStyle === "json" || definition.requestStyle === "json-or-multipart") {
    args.push("--json", jsonArguments(definition));
  }

  if (definition.requestStyle === "multipart") {
    for (const parameter of definition.parameters) {
      if (parameter.location === "form" && parameter.required) {
        args.push("--form", `${parameter.name}=${String(sampleValue(parameter))}`);
      }
      if (parameter.location === "file" && parameter.required) {
        args.push("--file", `${parameter.name}=${uploadPath}`);
      }
    }
  }
  if (definition.autoStream) args.push("--stream");

  return args;
}

function runCli(port, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["dist/index.js", ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GPTPROTO_API_BASE_URL: `http://127.0.0.1:${port}`,
        GPTPROTO_API_KEY: "route-contract-key",
        GPTPROTO_POLL_INTERVAL_MS: "1",
        GPTPROTO_MAX_POLL_SECONDS: "5",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

try {
  for (const contract of API_CONTRACTS) {
    const definition = getApiDefinition(contract.id);
    assert.ok(definition, `Missing definition for ${contract.id}`);
    const result = await runCli(port, routeArguments(definition));
    assert.equal(result.code, 0, `${contract.id}: ${result.stderr}`);
    if (definition.autoStream) {
      assert.match(result.stdout, /route-stream/, `${contract.id} response stream was not processed`);
    } else {
      assert.equal(JSON.parse(result.stdout).ok, true, `${contract.id} response was not processed`);
    }
  }
  assert.equal(requests.length, API_CONTRACTS.length);
  console.log(`gptproto-cli route contract test passed (${requests.length} API routes)`);
} finally {
  server.close();
  await unlink(uploadPath).catch(() => {});
}
