import { API_CONTRACTS, type ApiContract } from "./contracts.js";

export type ParameterLocation = "path" | "query" | "header" | "body" | "form" | "file";
export type ParameterType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "json";

export interface ParameterDefinition {
  readonly name: string;
  readonly location: ParameterLocation;
  readonly type: ParameterType;
  readonly required?: boolean;
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly deprecated?: boolean;
  readonly defaultValue?: string | number | boolean;
  readonly schemaRef?: string;
  readonly wireName?: string;
}

export interface PollDefinition {
  readonly method: "GET";
  readonly path: string;
  readonly description: string;
}

export interface ApiDefinition extends ApiContract {
  readonly operationId: string;
  readonly requestStyle: "none" | "json" | "multipart" | "json-or-multipart";
  readonly parameters: readonly ParameterDefinition[];
  readonly async?: boolean;
  readonly autoStream?: boolean;
  readonly poll?: PollDefinition;
  readonly officialDocs?: string;
}

type ParameterOptions = Omit<ParameterDefinition, "name" | "location" | "type"> & {
  readonly location?: ParameterLocation;
};

function parameter(
  name: string,
  type: ParameterType,
  options: ParameterOptions = {},
): ParameterDefinition {
  return { name, type, location: "body", ...options };
}

const path = (name: string, description?: string): ParameterDefinition =>
  parameter(name, "string", { location: "path", required: true, description });

const query = (
  name: string,
  type: ParameterType = "string",
  description?: string,
): ParameterDefinition => parameter(name, type, { location: "query", description });

const header = (
  name: string,
  type: ParameterType = "string",
  options: ParameterOptions = {},
): ParameterDefinition => parameter(name, type, { location: "header", ...options });

const body = (
  name: string,
  type: ParameterType,
  options: ParameterOptions = {},
): ParameterDefinition => parameter(name, type, options);

const requiredBodyString = (name: string, description?: string): ParameterDefinition =>
  body(name, "string", { required: true, description });

const requiredBodyInteger = (name: string, description?: string): ParameterDefinition =>
  body(name, "integer", { required: true, description });

const jsonBody = (name: string, description?: string): ParameterDefinition =>
  body(name, "json", { description });

const requiredJsonBody = (name: string, description?: string): ParameterDefinition =>
  body(name, "json", { required: true, description });

const form = (
  name: string,
  type: ParameterType = "string",
  options: ParameterOptions = {},
): ParameterDefinition => parameter(name, type, { location: "form", ...options });

const file = (name: string, required = false, description?: string): ParameterDefinition =>
  parameter(name, "string", { location: "file", required, description });

const commonProvider = jsonBody("provider", "GPTProto provider.options object");

const definitions: Readonly<Record<string, Omit<ApiDefinition, keyof ApiContract>>> = {
  "CUST-001": {
    operationId: "createVideo",
    requestStyle: "json",
    async: true,
    poll: { method: "GET", path: "/api/v3/videos/{id}", description: "Query the created video task" },
    parameters: [
      requiredBodyString("model", "GPTProto provider/model slug"),
      requiredBodyString("prompt"),
      body("mode", "string"), body("duration", "integer", { minimum: 1 }),
      body("resolution", "string"), body("aspect_ratio", "string"), body("size", "string"),
      jsonBody("frame_images"), jsonBody("input_references"), body("generate_audio", "boolean"),
      body("seed", "integer"), body("negative_prompt", "string"), commonProvider,
    ],
  },
  "CUST-002": {
    operationId: "getVideoTask",
    requestStyle: "none",
    parameters: [path("id", "Video task ID")],
  },
  "CUST-003": {
    operationId: "getTask",
    requestStyle: "none",
    parameters: [path("id", "Task ID")],
  },
  "CUST-004": {
    operationId: "createImage",
    requestStyle: "json",
    async: true,
    poll: { method: "GET", path: "/api/v3/tasks/result/{id}", description: "Query the created image task" },
    parameters: [
      requiredBodyString("model", "GPTProto provider/model slug"), requiredBodyString("prompt"),
      body("aspect_ratio", "string"), body("resolution", "string"), body("size", "string"),
      body("n", "integer", { minimum: 1, maximum: 10 }), body("quality", "string", { enum: ["auto", "low", "medium", "high"] }),
      body("output_format", "string", { enum: ["png", "jpeg", "webp", "svg"] }),
      body("background", "string", { enum: ["auto", "transparent", "opaque"] }), body("seed", "integer"),
      jsonBody("input_references"), commonProvider,
    ],
  },
  "CUST-005": {
    operationId: "createSpeech",
    requestStyle: "json",
    async: true,
    poll: { method: "GET", path: "/api/v3/tasks/result/{id}", description: "Query the created speech task" },
    parameters: [requiredBodyString("model"), requiredBodyString("input"), requiredBodyString("voice"), body("speed", "number"), commonProvider],
  },
  "CUST-006": {
    operationId: "createVoiceClone",
    requestStyle: "json",
    async: true,
    poll: { method: "GET", path: "/api/v3/tasks/result/{id}", description: "Query the created voice task" },
    parameters: [requiredBodyString("model"), requiredBodyString("audio"), body("text", "string"), body("custom_voice_id", "string"), body("accuracy", "number"), body("need_noise_reduction", "boolean"), body("need_volume_normalization", "boolean"), commonProvider],
  },
  "CUST-007": {
    operationId: "createLipSync",
    requestStyle: "json",
    async: true,
    poll: { method: "GET", path: "/api/v3/tasks/result/{id}", description: "Query the created lip-sync task" },
    parameters: [requiredBodyString("model"), requiredBodyString("video"), requiredBodyString("audio"), commonProvider],
  },
  "CUST-008": {
    operationId: "create3D",
    requestStyle: "json",
    async: true,
    poll: { method: "GET", path: "/api/v3/tasks/result/{id}", description: "Query the created 3D task" },
    parameters: [requiredBodyString("model"), requiredBodyString("image"), body("mode", "string"), body("front_image_url", "string"), body("back_image_url", "string"), body("left_image_url", "string"), body("right_image_url", "string"), commonProvider],
  },
  "CUST-009": {
    operationId: "createImageTool",
    requestStyle: "json",
    async: true,
    poll: { method: "GET", path: "/api/v3/tasks/result/{id}", description: "Query the created image tool task" },
    parameters: [requiredBodyString("model"), body("mode", "string"), body("image", "string"), body("video", "string"), body("creativity", "integer"), body("target_resolution", "string"), body("size", "string"), body("output_format", "string", { enum: ["png", "jpeg", "webp", "svg"] }), body("enable_base64_output", "boolean"), body("enable_sync_mode", "boolean"), commonProvider],
  },

  "OPENAI-001": {
    operationId: "listModels",
    requestStyle: "none",
    parameters: [],
    officialDocs: "https://platform.openai.com/docs/api-reference/models/list",
  },
  "OPENAI-002": {
    operationId: "createSpeech",
    requestStyle: "json",
    parameters: [requiredBodyString("model"), requiredBodyString("input"), requiredJsonBody("voice", "Voice ID or custom voice object"), body("response_format", "string", { enum: ["mp3", "opus", "aac", "flac", "wav", "pcm"] }), body("speed", "number"), body("instructions", "string"), body("stream_format", "string", { enum: ["sse", "audio"] })],
    officialDocs: "https://platform.openai.com/docs/api-reference/audio/createSpeech",
  },
  "OPENAI-003": {
    operationId: "createTranscription",
    requestStyle: "multipart",
    parameters: [form("model", "string", { required: true }), file("file", true, "Audio file"), form("language"), form("languages", "json"), form("keywords", "json"), form("prompt"), form("response_format", "json"), form("temperature", "number"), form("include", "json"), form("timestamp_granularities", "json"), form("stream", "boolean"), form("chunking_strategy", "json"), form("known_speaker_names", "json"), form("known_speaker_references", "json")],
    officialDocs: "https://platform.openai.com/docs/api-reference/audio/createTranscription",
  },
  "OPENAI-004": {
    operationId: "createImage",
    requestStyle: "json",
    parameters: [requiredBodyString("prompt"), body("model", "string", { defaultValue: "dall-e-2" }), body("n", "integer", { minimum: 1, maximum: 10, defaultValue: 1 }), body("quality", "string", { enum: ["standard", "hd", "low", "medium", "high", "xhigh", "max", "auto"], defaultValue: "auto" }), body("response_format", "string", { enum: ["url", "b64_json"], defaultValue: "url" }), body("output_format", "string", { enum: ["png", "jpeg", "webp"], defaultValue: "png" }), body("output_compression", "integer", { minimum: 0, maximum: 100, defaultValue: 100 }), body("stream", "boolean", { defaultValue: false }), body("partial_images", "integer", { minimum: 0, maximum: 3, defaultValue: 0 }), body("size", "string", { defaultValue: "auto" }), body("moderation", "string", { enum: ["low", "auto"], defaultValue: "auto" }), body("background", "string", { enum: ["transparent", "opaque", "auto"], defaultValue: "auto" }), body("style", "string", { enum: ["vivid", "natural"], defaultValue: "vivid" }), body("user", "string")],
    officialDocs: "https://platform.openai.com/docs/api-reference/images/create",
  },
  "OPENAI-005": {
    operationId: "editImage",
    requestStyle: "json-or-multipart",
    parameters: [form("model", "string"), form("prompt"), file("image", false, "Multipart image file"), file("mask"), form("n", "integer"), form("size"), form("response_format", "string", { enum: ["url", "b64_json"] }), form("user"), form("background", "string", { enum: ["transparent", "opaque", "auto"] }), form("quality", "string", { enum: ["standard", "low", "medium", "high", "xhigh", "max", "auto"] }), form("input_fidelity"), form("output_format", "string", { enum: ["png", "jpeg", "webp"] }), form("output_compression", "integer"), form("stream", "boolean"), form("partial_images", "integer", { minimum: 0, maximum: 3 }), jsonBody("model", "Native JSON image edit model"), jsonBody("images", "JSON image references for the native JSON edit form"), jsonBody("mask", "Native JSON image edit mask reference"), jsonBody("prompt", "Native JSON image edit prompt"), jsonBody("n", "Native JSON image count"), jsonBody("quality", "Native JSON image quality"), jsonBody("input_fidelity", "Native JSON input fidelity"), jsonBody("size", "Native JSON image size"), jsonBody("user", "Native JSON user identifier"), jsonBody("output_format", "Native JSON output format"), jsonBody("output_compression", "Native JSON output compression"), jsonBody("background", "Native JSON background"), jsonBody("stream", "boolean"), jsonBody("partial_images", "Native JSON partial image count"), jsonBody("moderation", "Native JSON image edit moderation")],
    officialDocs: "https://platform.openai.com/docs/api-reference/images/createEdit",
  },
  "OPENAI-006": {
    operationId: "createEmbedding",
    requestStyle: "json",
    parameters: [requiredBodyString("model"), requiredJsonBody("input", "String, token array, or array of inputs"), body("encoding_format", "string"), body("dimensions", "integer"), body("user", "string")],
    officialDocs: "https://platform.openai.com/docs/api-reference/embeddings/create",
  },
  "OPENAI-007": {
    operationId: "createChatCompletion",
    requestStyle: "json",
    parameters: [requiredBodyString("model"), requiredJsonBody("messages", "Official chat message array"), jsonBody("metadata"), body("top_logprobs", "integer"), body("temperature", "number"), body("top_p", "number"), body("user", "string"), body("safety_identifier", "string"), body("prompt_cache_key", "string"), body("prompt_cache_retention", "string"), jsonBody("prompt_cache_options"), body("service_tier", "string"), jsonBody("modalities"), body("verbosity", "string"), body("reasoning_effort", "string"), body("max_completion_tokens", "integer"), body("frequency_penalty", "number"), body("presence_penalty", "number"), jsonBody("web_search_options"), jsonBody("response_format"), jsonBody("audio"), body("store", "boolean"), jsonBody("moderation"), body("stream", "boolean"), jsonBody("stop"), jsonBody("logit_bias"), body("logprobs", "boolean"), body("max_tokens", "integer"), body("n", "integer"), jsonBody("prediction"), body("seed", "integer"), jsonBody("stream_options"), jsonBody("tools"), jsonBody("tool_choice"), body("parallel_tool_calls", "boolean"), jsonBody("function_call"), jsonBody("functions")],
    officialDocs: "https://platform.openai.com/docs/api-reference/chat/create",
  },
  "OPENAI-008": {
    operationId: "createResponse",
    requestStyle: "json",
    parameters: [body("model", "string"), body("background", "string"), body("max_tool_calls", "integer"), jsonBody("text"), jsonBody("tools"), jsonBody("tool_choice"), jsonBody("prompt"), body("service_tier", "string"), body("truncation", "string"), jsonBody("reasoning"), jsonBody("input", "Text or official Responses input items"), jsonBody("include"), body("parallel_tool_calls", "boolean"), body("store", "boolean"), body("instructions", "string"), body("stream", "boolean"), jsonBody("stream_options"), jsonBody("conversation"), jsonBody("context_management"), body("max_output_tokens", "integer"), body("previous_response_id", "string"), jsonBody("metadata"), body("temperature", "number"), body("top_p", "number"), body("user", "string"), body("safety_identifier", "string"), body("prompt_cache_key", "string"), body("prompt_cache_retention", "string"), jsonBody("prompt_cache_options"), jsonBody("moderation")],
    officialDocs: "https://platform.openai.com/docs/api-reference/responses/create",
  },
  "OPENAI-009": {
    operationId: "createCompletion",
    requestStyle: "json",
    parameters: [requiredBodyString("model"), requiredJsonBody("prompt"), body("best_of", "integer"), body("echo", "boolean"), body("frequency_penalty", "number"), jsonBody("logit_bias"), body("logprobs", "integer"), body("max_tokens", "integer"), body("n", "integer"), body("presence_penalty", "number"), body("seed", "integer"), body("stop", "json"), body("stream", "boolean"), jsonBody("stream_options"), body("suffix", "string"), body("temperature", "number"), body("top_p", "number"), body("user", "string")],
    officialDocs: "https://platform.openai.com/docs/api-reference/completions/create",
  },
  "OPENAI-010": {
    operationId: "createModeration",
    requestStyle: "json",
    parameters: [requiredJsonBody("input", "Text or array of text inputs"), body("model", "string")],
    officialDocs: "https://platform.openai.com/docs/api-reference/moderations/create",
  },
  "CLAUDE-001": {
    operationId: "createMessage",
    requestStyle: "json",
    parameters: [requiredBodyString("model"), requiredJsonBody("messages", "Official Claude message array"), requiredBodyInteger("max_tokens"), jsonBody("cache_control"), jsonBody("container"), body("inference_geo", "string"), jsonBody("metadata"), jsonBody("output_config"), body("service_tier", "string", { enum: ["auto", "standard_only"] }), jsonBody("stop_sequences"), body("stream", "boolean"), jsonBody("system"), body("temperature", "number", { deprecated: true }), jsonBody("thinking"), jsonBody("tool_choice"), jsonBody("tools"), body("top_k", "integer", { deprecated: true }), body("top_p", "number", { deprecated: true }), header("user_profile_id", "string", { wireName: "anthropic-user-profile-id" }), header("workspace_id", "string", { wireName: "anthropic-workspace-id" })],
    officialDocs: "https://docs.anthropic.com/en/api/messages",
  },

  "GOOGLE-001": {
    operationId: "generateContent",
    requestStyle: "json",
    parameters: [path("model", "Gemini model ID without the models/ prefix"), requiredJsonBody("contents", "Official Gemini Content array"), jsonBody("tools"), jsonBody("toolConfig"), jsonBody("safetySettings"), jsonBody("systemInstruction"), jsonBody("generationConfig"), body("cachedContent", "string"), body("serviceTier", "string"), body("store", "boolean"), jsonBody("labels")],
    officialDocs: "https://ai.google.dev/api/generate-content",
  },
  "GOOGLE-002": {
    operationId: "streamGenerateContent",
    requestStyle: "json",
    autoStream: true,
    parameters: [path("model", "Gemini model ID without the models/ prefix"), requiredJsonBody("contents", "Official Gemini Content array"), jsonBody("tools"), jsonBody("toolConfig"), jsonBody("safetySettings"), jsonBody("systemInstruction"), jsonBody("generationConfig"), body("cachedContent", "string"), body("serviceTier", "string"), body("store", "boolean"), jsonBody("labels")],
    officialDocs: "https://ai.google.dev/api/generate-content",
  },
  "GOOGLE-003": {
    operationId: "createGoogleOpenAIChatCompletion",
    requestStyle: "json",
    parameters: [requiredBodyString("model"), jsonBody("messages", "OpenAI-compatible chat message array"), body("temperature", "number"), body("top_p", "number"), body("max_tokens", "integer"), body("stream", "boolean"), jsonBody("tools"), jsonBody("tool_choice"), body("stop", "json")],
    officialDocs: "https://ai.google.dev/gemini-api/docs/openai",
  },
  "GOOGLE-004": {
    operationId: "uploadFile",
    requestStyle: "multipart",
    parameters: [file("file", true, "File to upload"), form("displayName")],
    officialDocs: "https://ai.google.dev/api/files",
  },
  "GOOGLE-005": {
    operationId: "getFile",
    requestStyle: "none",
    parameters: [path("fileId", "Uploaded Gemini file ID")],
    officialDocs: "https://ai.google.dev/api/files",
  },
  "VEO-001": {
    operationId: "predictLongRunning",
    requestStyle: "json",
    async: true,
    parameters: [path("model", "Veo model ID"), requiredJsonBody("instances", "Official Veo instances array or object"), jsonBody("config"), jsonBody("parameters")],
    officialDocs: "https://ai.google.dev/gemini-api/docs/video",
  },
  "VEO-002": {
    operationId: "getVeoOperation",
    requestStyle: "none",
    parameters: [path("model", "Veo model ID"), path("operation_id", "Veo operation ID")],
    officialDocs: "https://ai.google.dev/gemini-api/docs/video",
  },
  "VEO-003": {
    operationId: "downloadVeoContent",
    requestStyle: "none",
    parameters: [path("operation_id", "Veo file or operation ID")],
    officialDocs: "https://ai.google.dev/gemini-api/docs/video",
  },

  "WAN-001": {
    operationId: "createWanTextToImage",
    requestStyle: "json",
    async: true,
    poll: { method: "GET", path: "/api/v1/tasks/{task_id}", description: "Query the Wan task" },
    parameters: [requiredBodyString("model"), requiredBodyString("input.prompt", "Positive prompt"), body("input.negative_prompt", "string"), body("parameters.size", "string"), body("parameters.n", "integer", { minimum: 1, maximum: 4 }), body("parameters.prompt_extend", "boolean"), body("parameters.watermark", "boolean"), body("parameters.seed", "integer", { minimum: 0, maximum: 2147483647 }), header("X-DashScope-Async", "string", { wireName: "X-DashScope-Async", required: true, defaultValue: "enable" })],
    officialDocs: "https://www.alibabacloud.com/help/en/model-studio/text-to-image",
  },
  "WAN-002": {
    operationId: "createWanImageToImage",
    requestStyle: "json",
    async: true,
    poll: { method: "GET", path: "/api/v1/tasks/{task_id}", description: "Query the Wan task" },
    parameters: [requiredBodyString("model"), jsonBody("input.prompt"), jsonBody("input.media"), jsonBody("input.images"), body("input.img_url", "string"), body("input.first_frame_url", "string"), body("input.last_frame_url", "string"), body("input.negative_prompt", "string"), body("input.audio_url", "string"), jsonBody("input.reference_video_urls"), body("parameters.size", "string"), body("parameters.ratio", "string"), body("parameters.n", "integer"), body("parameters.resolution", "string"), body("parameters.duration", "integer"), body("parameters.watermark", "boolean"), body("parameters.prompt_extend", "boolean"), body("parameters.audio", "boolean"), jsonBody("parameters.audio_setting"), body("parameters.seed", "integer"), body("parameters.shot_type", "string")],
    officialDocs: "https://www.alibabacloud.com/help/en/model-studio/image-to-image",
  },
  "WAN-003": {
    operationId: "getWanTask",
    requestStyle: "none",
    parameters: [path("task_id", "Wan task ID")],
    officialDocs: "https://www.alibabacloud.com/help/en/model-studio/text-to-image",
  },
  "VIDU-001": {
    operationId: "createViduReferenceImage",
    requestStyle: "json",
    async: true,
    poll: { method: "GET", path: "/ent/v2/tasks/{taskId}/creations", description: "Query Vidu task creations" },
    parameters: [
      body("model", "string", { required: true, enum: ["viduq2", "viduq1"] }),
      jsonBody("images", "Array of public image URLs or data URLs; model-dependent, up to 7"),
      requiredBodyString("prompt", "Text prompt; maximum 2,000 characters"),
      body("seed", "integer"),
      body("aspect_ratio", "string", { enum: ["16:9", "9:16", "1:1", "3:4", "4:3", "21:9", "2:3", "3:2", "auto"] }),
      body("resolution", "string", { enum: ["1080p", "2K", "4K"] }),
      body("payload", "string", { description: "Transparent pass-through payload" }),
      body("callback_url", "string", { description: "Callback URL" }),
    ],
    officialDocs: "https://platform.vidu.com/docs/reference-to-image",
  },
  "VIDU-002": {
    operationId: "getViduTaskCreations",
    requestStyle: "none",
    parameters: [path("taskId", "Vidu task ID")],
    officialDocs: "https://platform.vidu.com/docs",
  },
  "KLING-001": {
    operationId: "createKlingTextToVideo",
    requestStyle: "json",
    async: true,
    parameters: [body("model_name", "string"), requiredBodyString("prompt"), body("negative_prompt", "string"), body("cfg_scale", "number"), body("callback_url", "string"), jsonBody("camera_control"), body("aspect_ratio", "string"), body("duration", "string"), body("mode", "string"), jsonBody("multi_prompt"), body("multi_shot", "boolean"), body("shot_type", "string"), jsonBody("voice_list"), jsonBody("element_list")],
    officialDocs: "https://app.klingai.com/global/dev/document-api",
  },
  "KLING-002": {
    operationId: "createKlingImageToVideo",
    requestStyle: "json",
    async: true,
    parameters: [body("model_name", "string"), requiredBodyString("image"), body("image_tail", "string"), body("prompt", "string"), body("negative_prompt", "string"), body("cfg_scale", "number"), body("callback_url", "string"), jsonBody("camera_control"), body("aspect_ratio", "string"), body("duration", "string"), body("mode", "string"), jsonBody("multi_prompt"), body("multi_shot", "boolean"), body("shot_type", "string"), jsonBody("voice_list"), jsonBody("element_list")],
    officialDocs: "https://app.klingai.com/global/dev/document-api",
  },
  "KLING-003": {
    operationId: "createKlingVideoExtend",
    requestStyle: "json",
    async: true,
    parameters: [body("model_name", "string"), requiredBodyString("video_id"), body("prompt", "string"), body("negative_prompt", "string"), body("cfg_scale", "number"), body("callback_url", "string"), body("duration", "string"), body("mode", "string")],
    officialDocs: "https://app.klingai.com/global/dev/document-api",
  },
  "KLING-004": {
    operationId: "createKlingImage",
    requestStyle: "json",
    async: true,
    parameters: [body("model_name", "string"), requiredBodyString("prompt"), body("negative_prompt", "string"), body("cfg_scale", "number"), body("callback_url", "string"), body("aspect_ratio", "string"), body("n", "integer"), body("mode", "string")],
    officialDocs: "https://app.klingai.com/global/dev/document-api",
  },
  "KLING-005": {
    operationId: "getKlingTask",
    requestStyle: "none",
    parameters: [path("action", "videos or images"), path("action2", "text2video, image2video, or generations"), path("task_id", "Kling task ID")],
    officialDocs: "https://app.klingai.com/global/dev/document-api",
  },
  "RUNWAY-001": {
    operationId: "createRunwayActOne",
    requestStyle: "json",
    async: true,
    parameters: [body("model", "string"), body("video", "string"), body("image", "string"), body("character_video", "string"), body("options.motion_multiplier", "number"), body("options.flip", "boolean"), body("options.expression_intensity", "number"), body("options.body_control", "boolean")],
    officialDocs: "https://docs.dev.runwayml.com/api",
  },
  "RUNWAY-002": {
    operationId: "createRunwayActTwo",
    requestStyle: "json",
    async: true,
    parameters: [body("model", "string"), body("video", "string"), body("image", "string"), body("character_video", "string"), body("options.motion_multiplier", "number"), body("options.flip", "boolean"), body("options.expression_intensity", "number"), body("options.body_control", "boolean")],
    officialDocs: "https://docs.dev.runwayml.com/api",
  },
  "RUNWAY-003": {
    operationId: "createRunwayGeneration",
    requestStyle: "json",
    async: true,
    parameters: [body("model", "string"), body("ratio", "string"), requiredBodyString("prompt"), body("style", "string"), body("image", "string"), body("callback_url", "string"), body("options.seconds", "integer"), body("options.motion_vector.x", "integer"), body("options.motion_vector.y", "integer"), body("options.motion_vector.z", "integer"), body("options.motion_vector.r", "integer"), body("options.motion_vector.bg_x_pan", "integer"), body("options.motion_vector.bg_y_pan", "integer")],
    officialDocs: "https://docs.dev.runwayml.com/api",
  },
  "RUNWAY-004": {
    operationId: "createRunwayVideoToVideo",
    requestStyle: "json",
    async: true,
    parameters: [body("model", "string"), requiredBodyString("video"), body("prompt", "string"), body("options.flip", "boolean"), body("options.structure_transformation", "number")],
    officialDocs: "https://docs.dev.runwayml.com/api",
  },
  "RUNWAY-005": {
    operationId: "createRunwayImageToVideo",
    requestStyle: "json",
    async: true,
    parameters: [body("model", "string"), body("promptText", "string"), body("promptImage", "string"), body("seed", "integer"), body("watermark", "boolean"), body("duration", "integer"), body("ratio", "string")],
    officialDocs: "https://docs.dev.runwayml.com/api",
  },
  "RUNWAY-006": {
    operationId: "getRunwayTask",
    requestStyle: "none",
    parameters: [path("id", "Runway task ID")],
    officialDocs: "https://docs.dev.runwayml.com/api",
  },
  "SORA-001": {
    operationId: "createSoraVideo",
    requestStyle: "json-or-multipart",
    async: true,
    poll: { method: "GET", path: "/v1/videos/{video_id}", description: "Query the Sora video task" },
    parameters: [form("model", "string"), form("prompt"), form("size", "string", { enum: ["720x1280", "1280x720", "1024x1792", "1792x1024"] }), form("seconds", "string", { enum: ["4", "8", "12"] }), file("input_reference"), jsonBody("input_reference", "JSON input reference object")],
    officialDocs: "https://platform.openai.com/docs/api-reference/videos/create",
  },
  "SORA-002": {
    operationId: "getSoraVideo",
    requestStyle: "none",
    parameters: [path("video_id", "Sora video ID"), query("variant", "string", "Optional content variant")],
    officialDocs: "https://platform.openai.com/docs/api-reference/videos/get",
  },
  "SORA-003": {
    operationId: "remixSoraVideo",
    requestStyle: "json",
    async: true,
    poll: { method: "GET", path: "/v1/videos/{video_id}", description: "Query the remixed Sora task" },
    parameters: [path("video_id", "Source Sora video ID"), requiredBodyString("prompt")],
    officialDocs: "https://platform.openai.com/docs/api-reference/videos/createRemix",
  },
  "SORA-004": {
    operationId: "downloadSoraVideoContent",
    requestStyle: "none",
    parameters: [path("video_id", "Sora video ID")],
    officialDocs: "https://platform.openai.com/docs/api-reference/videos/downloadContent",
  },
};

export function getApiDefinition(id: string): ApiDefinition | undefined {
  const contract = API_CONTRACTS.find((item) => item.id === id.toUpperCase());
  const detail = definitions[id.toUpperCase()];
  if (!contract || !detail) {
    return undefined;
  }
  return { ...contract, ...detail };
}

export function getAllApiDefinitions(): readonly ApiDefinition[] {
  return API_CONTRACTS.map((contract) => getApiDefinition(contract.id)).filter(
    (definition): definition is ApiDefinition => definition !== undefined,
  );
}
