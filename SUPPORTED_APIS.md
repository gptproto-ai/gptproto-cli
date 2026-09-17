# Supported APIs

The public discovery unit is a **model**, not a global endpoint list. The model descriptor is supplied live by GPTProto and includes its available calls, native request parameters, asynchronous polling fields, and response metadata.

Choose a model and inspect it:

```bash
gptproto models list --capability text
gptproto model <provider/model>
gptproto model <provider/model> --json
```

Use the method and path reported for that model directly with `gptproto request`. The CLI excludes administrative APIs, billing, pricing, channel management, callbacks, and undocumented routes. A route that requires contract review is callable only with `--allow-review`.
