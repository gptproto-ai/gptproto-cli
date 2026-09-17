# GPTProto Public Client Contract

## Version

This project is bound to API contract version `v0.4.0`.

The version describes the public GPTProto client contract. It is independent
from an upstream provider version and from the package version, although a
client release must record which contract version it implements.

## API Shape

- Custom unified requests use the GPTProto `/api/v3` paths and fields.
- Native-compatible requests use the documented provider-shaped path and body
  without silent field conversion.
- The public API base URL defaults to `https://gptproto.com`.
- `GPTPROTO_API_BASE_URL` may override the base URL for local or test servers.
- `GPTPROTO_API_KEY` supplies the bearer token at runtime.

## Route Gate

The CLI can call only a method and path present in its versioned API manifest.
It refuses arbitrary absolute URLs and refuses routes that are blocked or
excluded. A route under contract review requires explicit local-debug approval.

Each official-compatible route is checked against the provider's current
official API reference or machine-readable schema at release time. The CLI
release then snapshots the reviewed request fields, types, enums, headers, and
request modes in `src/definitions.ts`, together with the official link. The
CLI does not parse documentation or discover routes from the server at runtime.

This release records the current baseline used for the official fields:

- OpenAI OpenAPI `2.3.0` for the OpenAI-compatible request families.
- Anthropic TypeScript SDK `0.125.0` for `/v1/messages`.
- Google Gemini `v1beta` API reference for `generateContent` and streaming.
- Alibaba Cloud Model Studio legacy async image APIs for the routes exposed by
  GPTProto.
- Vidu API reference for `POST /ent/v2/reference2image`.

Provider changes are handled by a new contract version and a fresh official
reference check; they are not silently applied at runtime.

## Async Gate

An asynchronous request must return a task or operation identifier. Polling
uses the returned polling path when present, otherwise the documented fallback
path. A polling URL must remain on the configured API origin.

## Change Gate

Any new public endpoint requires:

1. A new method/path interface definition and request/response documentation.
2. An inventory update.
3. A contract version update.
4. A changelog entry.
5. Local CLI verification before MCP exposure.

Use `MINOR` for additive interfaces and `MAJOR` for breaking wire changes.
Use `PATCH` only for documentation corrections that do not change behavior.

## Local-First Release

The package is tested locally before it is published:

```sh
npm install
npm run typecheck
npm run build
npm link
gptproto --version
npm pack --dry-run
```

`npm link` is a local installation link and does not publish anything.
Publication is a later release step after API verification and a complete
repository/history sensitive-data review.
