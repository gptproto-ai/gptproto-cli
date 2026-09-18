# GPTProto CLI

GPTProto CLI is a transparent executor for documented GPTProto and official-compatible APIs. It does not convert one provider's request schema into another provider's schema.

The service supplies the live model catalog and model-to-interface mapping. The CLI shows a selected model's calls, executes JSON and multipart requests, streams output, polls asynchronous tasks, and extracts results.

## Install and configure

```bash
npm install -g @gptproto-ai/cli
gptproto key set --key YOUR_API_KEY
gptproto config
```

The CLI uses a GPTProto API key. Browser sign-in is not required.

To check the installed version and npm releases, or install a published release:

```bash
gptproto --version          # installed version, no network request
gptproto version            # installed, npm latest, and newer versions
gptproto version --json     # same information for automation
gptproto update             # install npm's latest release globally
gptproto update 0.5.0       # install a specific published version
```

`gptproto update` uses the official npm registry. Until this package is published,
`gptproto version` reports that no npm release exists and `gptproto update`
does not change the local installation. A CLI installed with `npm link` can
instead be refreshed from its GitHub checkout with `git pull`, `npm ci`, and
`npm run build`.

Set a different GPTProto server only when needed:

```bash
gptproto config --base-url https://YOUR_GPTPROTO_SERVER
```

## Discover a model and its call format

```bash
gptproto models list --capability text
gptproto model openai/gpt-4.1
gptproto model openai/gpt-4.1 --json
```

`gptproto model` is the entry point. Its normal output is readable: method, path, native model value, request type, parameters, streaming support, asynchronous polling, and response type. `--json` returns the same live descriptor for automation or an AI Skill.

For an official-compatible route, pass the catalog model ID (`provider/model`) in the JSON or multipart `model` field. The CLI sends the native value without the provider prefix: `openai/gpt-4.1` becomes `gpt-4.1`. GPTProto custom routes retain the complete `provider/model` value.

## Execute documented APIs

Pass the native request object with `--json`, or read it from a file with `--body`.

```bash
gptproto request POST /v1/responses \
  --json '{"model":"openai/gpt-4.1","input":"Write a welcome message"}'

gptproto request POST /v1/messages \
  --json '{"model":"claude/claude-opus-4-7","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}'

gptproto request POST '/v1beta/models/gemini-2.5-flash:generateContent' \
  --json '{"contents":[{"role":"user","parts":[{"text":"Hello"}]}]}'

gptproto request POST /v1/audio/transcriptions \
  --form model=openai/whisper-1 --file file=audio.mp3
```

Only documented routes from the selected model can be called. Routes marked `CONTRACT_REVIEW` require `--allow-review`.

## Output behavior

Normal calls extract the final result when the documented interface has a known result type:

- text APIs print generated text;
- image, video, and audio APIs print result URLs, one per line;
- binary APIs require `--output FILE`;
- other APIs print the original JSON response.

Use `--output-json` to always print the unprocessed JSON response. Use `--stream` to extract text deltas from SSE; use `--raw` with `--stream` for raw SSE events.

For an asynchronous media task, save the printed URL immediately and download it yourself when the source service returns only a delivery URL:

```bash
gptproto custom create image --json '{"model":"openai/gpt-image-2","prompt":"A tiger"}' --wait > result-urls.txt
curl -L "$(head -n 1 result-urls.txt)" -o result
```

The CLI does not guess a file extension or expiry time from a URL. Those values are only authoritative when a task result includes explicit media metadata; signed delivery URLs may expire.

```bash
gptproto request POST /v1/responses \
  --json '{"model":"openai/gpt-4.1","input":"Hello","stream":true}' --stream

gptproto request POST /v1/responses \
  --json '{"model":"openai/gpt-4.1","input":"Hello"}' --output-json

gptproto request POST /v1/audio/speech \
  --json '{"model":"openai/tts-1","input":"Hello","voice":"alloy"}' \
  --output speech.mp3
```

## GPTProto custom APIs

The custom API format remains available. Use complete JSON bodies for new parameters; named options are convenience forms for the existing custom schema.

```bash
gptproto custom create image \
  --json '{"model":"openai/gpt-image-2","prompt":"A tiger","size":"1024x1024"}' \
  --wait

gptproto custom create video \
  --json '{"model":"kling/kling-v3","prompt":"A city at night"}' \
  --wait

# Image-to-image: references are structured URL objects, not a URL string array.
gptproto custom create image \
  --json '{"model":"openai/gpt-image-2","prompt":"Keep the subject and change the background to autumn","input_references":[{"type":"image_url","image_url":{"url":"https://example.com/source.png"}}]}' \
  --wait

# Image-to-video: first/last frames use frame_images. Use only URLs the provider can reach.
gptproto custom create video \
  --json '{"model":"bytedance/dreamina-seedance-2-0-mini-260615","prompt":"The rabbit salutes","duration":5,"frame_images":[{"type":"image_url","image_url":{"url":"https://example.com/first.png"},"frame_type":"first_frame"}]}' \
  --wait

gptproto task get TASK_ID
gptproto task wait TASK_ID --video
```

`--wait` polls an asynchronous custom or documented API operation. The default request timeout and polling limit are both 600 seconds. Do not resubmit after a timeout; query the returned task ID first.

## AI Skill integration

The companion GPTProto Skill uses `models list` and `model <provider/model> --json` to discover the current call format, then sends the native body through `gptproto request`. It does not need model-specific command wrappers or a duplicate provider SDK.
