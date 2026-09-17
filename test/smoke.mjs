import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";

let polls = 0;

const server = http.createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    assert.equal(request.headers.authorization, "Bearer smoke-test-key");

    if (request.method === "GET" && request.url === "/v1/cli/models/openai/gpt-4.1") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "openai/gpt-4.1",
        capabilities: ["text"],
        interfaces: [{
          capability: "text",
          method: "POST",
          path: "/v1/responses",
          model_format: "model",
          request: {
            content_type: "application/json",
            parameters: {
              model: { type: "string", required: true },
              input: { type: "array", required: true },
              input_references: {
                type: "array",
                items: {
                  type: "object",
                  required: ["type", "image_url"],
                  properties: {
                    type: { type: "string", enum: ["image_url"] },
                    image_url: {
                      type: "object",
                      required: ["url"],
                      properties: {
                        url: { type: "string", format: "uri" },
                      },
                    },
                  },
                },
              },
              stream: { type: "boolean", default: false },
              truncation: { type: "string", enum: ["auto", "disabled"], default: "auto" },
            },
          },
          response: { type: "json" },
        }],
      }));
      return;
    }

    if (request.method === "GET" && request.url === "/v1/cli/models/openai/gpt-4o") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "openai/gpt-4o",
        capabilities: ["text"],
        interfaces: [{
          capability: "text",
          method: "POST",
          path: "/v1/chat/completions",
          model_format: "model",
          request: { parameters: { model: { type: "string" }, messages: { type: "array" } } },
        }],
      }));
      return;
    }

    if (request.method === "GET" && request.url === "/v1/cli/models/google/gemini-2.5-flash") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "google/gemini-2.5-flash",
        capabilities: ["text"],
        interfaces: [{
          capability: "text",
          method: "POST",
          path: "/v1beta/models/{model}:generateContent",
          model_format: "provider/model",
          request: { parameters: { contents: { type: "array" } } },
        }],
      }));
      return;
    }

    if (request.method === "GET" && request.url === "/v1/cli/models/openai/gpt-image-2") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "openai/gpt-image-2",
        capabilities: ["image"],
        interfaces: [{
          capability: "image",
          method: "POST",
          path: "/api/v3/images",
          async: true,
          poll_path: "/api/v3/tasks/result/{id}",
          model_format: "provider/model",
          request: { parameters: { model: { type: "string" }, prompt: { type: "string" } } },
        }],
      }));
      return;
    }

    if (request.method === "GET" && request.url === "/v1/cli/models/claude/claude-opus-4-7") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "claude/claude-opus-4-7",
        capabilities: ["text"],
        interfaces: [{
          capability: "text",
          method: "POST",
          path: "/v1/messages",
          model_format: "model",
          request: {
            parameters: {
              model: { type: "string", required: true },
              max_tokens: { type: "integer", required: true },
              messages: { type: "array", required: true },
            },
          },
        }],
      }));
      return;
    }

    if (request.method === "POST" && request.url === "/api/v3/videos") {
      assert.equal(JSON.parse(body).model, "provider/model");
      response.writeHead(202, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: "smoke-task",
          status: "pending",
          polling_url: "/api/v3/videos/smoke-task",
        }),
      );
      return;
    }

    if (request.method === "GET" && request.url === "/api/v3/videos/smoke-task") {
      polls += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: "smoke-task",
          status: polls > 1 ? "completed" : "in_progress",
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/v1/chat/completions") {
      const parsed = JSON.parse(body);
      if (parsed.messages) {
        assert.equal(parsed.model, "gpt-4.1");
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          id: "smoke-chat",
          choices: [{ message: { role: "assistant", content: "Chat text only" } }],
        }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: "smoke-chat",
          received_model: parsed.model,
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/v1/responses") {
      const parsed = JSON.parse(body);
      assert.equal(parsed.model, "gpt-4.1");
      const stream = parsed.stream === true
        || String(request.headers.accept ?? "").includes("text/event-stream");
      if (stream) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          'data: {"type":"response.output_text.delta","delta":"Hello "}\n\n' +
          'data: {"type":"response.output_text.delta","delta":"world"}\n\n' +
          'data: {"type":"response.output_text.done","text":"Hello world"}\n\n' +
          'data: [DONE]\n\n',
        );
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "resp_smoke",
        output: [{ type: "message", content: [{ type: "output_text", text: "Responses text only" }] }],
      }));
      return;
    }

    if (request.method === "POST" && request.url === "/v1beta/models/gemini-2.5-flash:generateContent") {
      const parsed = JSON.parse(body);
      assert.equal(parsed.model, "gemini-2.5-flash");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Gemini text only" }] } }],
      }));
      return;
    }

    if (request.method === "POST" && request.url === "/v1beta/models/gemini-2.5-flash:streamGenerateContent") {
      const parsed = JSON.parse(body);
      assert.equal(parsed.model, "gemini-2.5-flash");
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(
        'data: {"candidates":[{"content":{"parts":[{"text":"Gemini stream"}]}}]}\n\n' +
          "data: [DONE]\n\n",
      );
      return;
    }

    if (request.method === "POST" && request.url === "/api/v3/images") {
      response.writeHead(202, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "smoke-image",
        status: "pending",
        polling_url: "/api/v3/tasks/result/smoke-image",
      }));
      return;
    }

    if (request.method === "GET" && request.url === "/api/v3/tasks/result/smoke-image") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "smoke-image",
        status: "completed",
        unsigned_urls: ["https://cdn.example.test/tiger.png"],
      }));
      return;
    }

    if (request.method === "POST" && request.url === "/v1/messages") {
      const parsed = JSON.parse(body);
      if (parsed.model === "claude-opus-4-7") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          id: "msg_smoke",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Claude text only" }],
          stop_reason: "end_turn",
        }));
        return;
      }
      assert.equal(request.headers["anthropic-user-profile-id"], "profile-smoke");
      assert.equal(request.headers["anthropic-workspace-id"], "workspace-smoke");
      assert.equal(parsed.max_tokens, 64);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "smoke-message" }));
      return;
    }

    if (request.method === "POST" && request.url === "/v1/images/edits") {
      assert.match(request.headers["content-type"], /^application\/json/);
      const parsed = JSON.parse(body);
      assert.deepEqual(parsed.images, [{ image_url: "https://example.test/image.png" }]);
      assert.equal(parsed.prompt, "edit it");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "smoke-image-edit" }));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ error: { message: "not found", code: "NOT_FOUND" } }),
    );
  });
});

function runCli(port, args) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["dist/index.js", ...args],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          GPTPROTO_API_BASE_URL: `http://127.0.0.1:${port}`,
          GPTPROTO_API_KEY: "smoke-test-key",
          GPTPROTO_POLL_INTERVAL_MS: "1",
          GPTPROTO_MAX_POLL_SECONDS: "5",
        },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

try {
  const modelResult = await runCli(port, ["model", "openai/gpt-4.1"]);
  assert.equal(modelResult.code, 0, modelResult.stderr);
  assert.match(modelResult.stdout, /Model: openai\/gpt-4\.1/);
  assert.match(modelResult.stdout, /POST \/v1\/responses/);
  assert.match(modelResult.stdout, /input: array required/);
  assert.match(modelResult.stdout, /input_references: array/);
  assert.match(modelResult.stdout, /items: object/);
  assert.match(modelResult.stdout, /image_url: object required/);
  assert.match(modelResult.stdout, /url: string required/);
  assert.match(modelResult.stdout, /truncation: string; enum: auto \| disabled; default: "auto"/);
  assert.match(modelResult.stdout, /Streaming: supported with --stream/);

  const modelJsonResult = await runCli(port, ["model", "openai/gpt-4.1", "--json"]);
  assert.equal(modelJsonResult.code, 0, modelJsonResult.stderr);
  assert.equal(JSON.parse(modelJsonResult.stdout).id, "openai/gpt-4.1");

  const removedInterfacesResult = await runCli(port, ["interfaces", "list"]);
  assert.notEqual(removedInterfacesResult.code, 0);
  assert.match(removedInterfacesResult.stderr, /Unknown command: interfaces/);

  const asyncResult = await runCli(port, [
    "custom",
    "create",
    "video",
    "--json",
    '{"model":"provider/model","prompt":"smoke"}',
    "--wait",
  ]);
  assert.equal(asyncResult.code, 0, asyncResult.stderr);
  assert.equal(JSON.parse(asyncResult.stdout).status, "completed");

  const chatResult = await runCli(port, [
    "request",
    "POST",
    "/v1/chat/completions",
    "--json",
    '{"model":"openai/gpt-4.1","messages":[{"role":"user","content":"hello"}]}',
  ]);
  assert.equal(chatResult.code, 0, chatResult.stderr);
  assert.equal(chatResult.stdout, "Chat text only\n");

  const streamResult = await runCli(port, [
    "request",
    "POST",
    "/v1/responses",
    "--json",
    '{"model":"openai/gpt-4.1","input":"hello","stream":true}',
    "--stream",
  ]);
  assert.equal(streamResult.code, 0, streamResult.stderr);
  assert.equal(streamResult.stdout, "Hello world\n");

  const responsesTextResult = await runCli(port, [
    "request", "POST", "/v1/responses", "--json",
    '{"model":"openai/gpt-4.1","input":"hello"}',
  ]);
  assert.equal(responsesTextResult.code, 0, responsesTextResult.stderr);
  assert.equal(responsesTextResult.stdout, "Responses text only\n");

  const claudeTextResult = await runCli(port, [
    "request", "POST", "/v1/messages", "--json",
    '{"model":"claude-opus-4-7","max_tokens":64,"messages":[{"role":"user","content":"hello"}]}',
  ]);
  assert.equal(claudeTextResult.code, 0, claudeTextResult.stderr);
  assert.equal(claudeTextResult.stdout, "Claude text only\n");

  const rawResult = await runCli(port, [
    "request", "POST", "/v1/responses", "--json",
    '{"model":"openai/gpt-4.1","input":"hello"}', "--output-json",
  ]);
  assert.equal(rawResult.code, 0, rawResult.stderr);
  assert.equal(JSON.parse(rawResult.stdout).id, "resp_smoke");

  const imageResult = await runCli(port, [
    "request", "POST", "/api/v3/images", "--json",
    '{"model":"openai/gpt-image-2","prompt":"a tiger"}', "--wait",
  ]);
  assert.equal(imageResult.code, 0, imageResult.stderr);
  assert.equal(imageResult.stdout, "https://cdn.example.test/tiger.png\n");

  const removedCommand = await runCli(port, ["text", "openai/gpt-4.1", "hello"]);
  assert.notEqual(removedCommand.code, 0);
  assert.match(removedCommand.stderr, /Unknown command: text/);

  const rejectedResult = await runCli(port, [
    "request",
    "GET",
    "/v1/not-listed",
  ]);
  assert.equal(rejectedResult.code, 2);
  assert.match(rejectedResult.stderr, /Unlisted route/);

  console.log("gptproto-cli smoke test passed");
} finally {
  server.close();
}
