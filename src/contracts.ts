export const CLI_CONTRACT_VERSION = "v0.4.0";

export type ContractStatus =
  | "IMPLEMENTED"
  | "SCANNED"
  | "CONTRACT_REVIEW"
  | "BLOCKED"
  | "EXCLUDED";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiContract {
  readonly id: string;
  readonly family: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly status: ContractStatus;
  readonly description: string;
  readonly aliases?: readonly string[];
}

// This public manifest mirrors the reviewed GPTProto API inventory. It
// contains no controllers, private URLs, credentials, or implementation data.
export const API_CONTRACTS: readonly ApiContract[] = [
  {
    id: "CUST-001",
    family: "GPTProto custom",
    method: "POST",
    path: "/api/v3/videos",
    status: "IMPLEMENTED",
    description: "Create an asynchronous video task",
  },
  {
    id: "CUST-002",
    family: "GPTProto custom",
    method: "GET",
    path: "/api/v3/videos/{id}",
    status: "IMPLEMENTED",
    description: "Query a video task",
  },
  {
    id: "CUST-003",
    family: "GPTProto custom",
    method: "GET",
    path: "/api/v3/tasks/result/{id}",
    status: "IMPLEMENTED",
    description: "Query a non-video task",
  },
  {
    id: "CUST-004",
    family: "GPTProto custom",
    method: "POST",
    path: "/api/v3/images",
    status: "IMPLEMENTED",
    description: "Create an asynchronous image task",
  },
  {
    id: "CUST-005",
    family: "GPTProto custom",
    method: "POST",
    path: "/api/v3/audio/speech",
    status: "IMPLEMENTED",
    description: "Create a speech task",
  },
  {
    id: "CUST-006",
    family: "GPTProto custom",
    method: "POST",
    path: "/api/v3/audio/voice-clone",
    status: "IMPLEMENTED",
    description: "Create a voice clone task",
  },
  {
    id: "CUST-007",
    family: "GPTProto custom",
    method: "POST",
    path: "/api/v3/lip-sync",
    status: "IMPLEMENTED",
    description: "Create a lip sync task",
  },
  {
    id: "CUST-008",
    family: "GPTProto custom",
    method: "POST",
    path: "/api/v3/3d",
    status: "IMPLEMENTED",
    description: "Create an image-to-3D task",
  },
  {
    id: "CUST-009",
    family: "GPTProto custom",
    method: "POST",
    path: "/api/v3/images/edit",
    status: "IMPLEMENTED",
    description: "Create an image or video utility task",
  },
  {
    id: "OPENAI-001",
    family: "OpenAI-compatible",
    method: "GET",
    path: "/v1/models",
    status: "SCANNED",
    description: "List models",
  },
  {
    id: "OPENAI-002",
    family: "OpenAI-compatible",
    method: "POST",
    path: "/v1/audio/speech",
    status: "SCANNED",
    description: "Text-to-speech",
  },
  {
    id: "OPENAI-003",
    family: "OpenAI-compatible",
    method: "POST",
    path: "/v1/audio/transcriptions",
    status: "SCANNED",
    description: "Transcribe an uploaded audio file",
  },
  {
    id: "OPENAI-004",
    family: "OpenAI-compatible",
    method: "POST",
    path: "/v1/images/generations",
    status: "SCANNED",
    description: "Create images",
  },
  {
    id: "OPENAI-005",
    family: "OpenAI-compatible",
    method: "POST",
    path: "/v1/images/edits",
    status: "CONTRACT_REVIEW",
    description: "Edit images using multipart or model-specific JSON",
  },
  {
    id: "OPENAI-006",
    family: "OpenAI-compatible",
    method: "POST",
    path: "/v1/embeddings",
    status: "SCANNED",
    description: "Create embeddings",
  },
  {
    id: "OPENAI-007",
    family: "OpenAI-compatible",
    method: "POST",
    path: "/v1/chat/completions",
    status: "SCANNED",
    description: "Create a chat completion",
  },
  {
    id: "OPENAI-008",
    family: "OpenAI-compatible",
    method: "POST",
    path: "/v1/responses",
    status: "SCANNED",
    description: "Create a response",
  },
  {
    id: "OPENAI-009",
    family: "OpenAI-compatible",
    method: "POST",
    path: "/v1/completions",
    status: "SCANNED",
    description: "Create a text completion",
  },
  {
    id: "OPENAI-010",
    family: "OpenAI-compatible",
    method: "POST",
    path: "/v1/moderations",
    status: "SCANNED",
    description: "Create a moderation result",
  },
  {
    id: "CLAUDE-001",
    family: "Anthropic Claude",
    method: "POST",
    path: "/v1/messages",
    status: "SCANNED",
    description: "Create a Claude message",
  },
  {
    id: "GOOGLE-001",
    family: "Google Gemini",
    method: "POST",
    path: "/v1beta/models/{model}:generateContent",
    status: "SCANNED",
    description: "Generate Gemini content",
  },
  {
    id: "GOOGLE-002",
    family: "Google Gemini",
    method: "POST",
    path: "/v1beta/models/{model}:streamGenerateContent",
    status: "SCANNED",
    description: "Stream Gemini content",
    aliases: ["/google/v1beta/models/{model}:streamGenerateContent"],
  },
  {
    id: "GOOGLE-003",
    family: "Google-compatible",
    method: "POST",
    path: "/v1beta/openai/chat/completions",
    status: "SCANNED",
    description: "Google OpenAI-compatible chat bridge",
  },
  {
    id: "GOOGLE-004",
    family: "Google Gemini",
    method: "POST",
    path: "/upload/v1beta/files",
    status: "SCANNED",
    description: "Upload a Gemini file",
  },
  {
    id: "GOOGLE-005",
    family: "Google Gemini",
    method: "GET",
    path: "/v1beta/files/{fileId}",
    status: "SCANNED",
    description: "Get Gemini file metadata",
  },
  {
    id: "VEO-001",
    family: "Google Veo",
    method: "POST",
    path: "/v1beta/models/{model}:predictLongRunning",
    status: "SCANNED",
    description: "Start a Veo long-running operation",
  },
  {
    id: "VEO-002",
    family: "Google Veo",
    method: "GET",
    path: "/v1beta/models/{model}/operations/{operation_id}",
    status: "SCANNED",
    description: "Get a Veo operation",
  },
  {
    id: "VEO-003",
    family: "Google Veo",
    method: "GET",
    path: "/v1beta/files/{operation_id}:download",
    status: "CONTRACT_REVIEW",
    description: "Download Veo operation content",
  },
  {
    id: "WAN-001",
    family: "Alibaba Wan",
    method: "POST",
    path: "/api/v1/services/aigc/text2image/image-synthesis",
    status: "SCANNED",
    description: "Wan text-to-image task",
  },
  {
    id: "WAN-002",
    family: "Alibaba Wan",
    method: "POST",
    path: "/api/v1/services/aigc/image2image/image-synthesis",
    status: "SCANNED",
    description: "Wan image-to-image task",
  },
  {
    id: "WAN-003",
    family: "Alibaba Wan",
    method: "GET",
    path: "/api/v1/tasks/{task_id}",
    status: "SCANNED",
    description: "Get a Wan task",
  },
  {
    id: "VIDU-001",
    family: "Vidu",
    method: "POST",
    path: "/ent/v2/reference2image",
    status: "SCANNED",
    description: "Create a Vidu reference-to-image task",
  },
  {
    id: "VIDU-002",
    family: "Vidu",
    method: "GET",
    path: "/ent/v2/tasks/{taskId}/creations",
    status: "SCANNED",
    description: "Get Vidu task creations",
  },
  {
    id: "KLING-001",
    family: "Kling",
    method: "POST",
    path: "/kling/v1/videos/text2video",
    status: "SCANNED",
    description: "Kling text-to-video task",
  },
  {
    id: "KLING-002",
    family: "Kling",
    method: "POST",
    path: "/kling/v1/videos/image2video",
    status: "SCANNED",
    description: "Kling image-to-video task",
  },
  {
    id: "KLING-003",
    family: "Kling",
    method: "POST",
    path: "/kling/v1/videos/video-extend",
    status: "SCANNED",
    description: "Kling video extension task",
  },
  {
    id: "KLING-004",
    family: "Kling",
    method: "POST",
    path: "/kling/v1/images/generations",
    status: "SCANNED",
    description: "Kling image task",
  },
  {
    id: "KLING-005",
    family: "Kling",
    method: "GET",
    path: "/kling/v1/{action}/{action2}/{task_id}",
    status: "SCANNED",
    description: "Get a Kling task",
  },
  {
    id: "RUNWAY-001",
    family: "Runway",
    method: "POST",
    path: "/runway/v1/pro/act_one",
    status: "SCANNED",
    description: "Runway Act One task",
  },
  {
    id: "RUNWAY-002",
    family: "Runway",
    method: "POST",
    path: "/runway/v1/pro/act_two",
    status: "SCANNED",
    description: "Runway Act Two task",
  },
  {
    id: "RUNWAY-003",
    family: "Runway",
    method: "POST",
    path: "/runway/v1/pro/generate",
    status: "SCANNED",
    description: "Runway generation task",
  },
  {
    id: "RUNWAY-004",
    family: "Runway",
    method: "POST",
    path: "/runway/v1/pro/video2video",
    status: "SCANNED",
    description: "Runway video-to-video task",
  },
  {
    id: "RUNWAY-005",
    family: "Runway",
    method: "POST",
    path: "/runwayml/v1/image_to_video",
    status: "SCANNED",
    description: "Runway image-to-video task",
  },
  {
    id: "RUNWAY-006",
    family: "Runway",
    method: "GET",
    path: "/v1/runway/tasks/{id}",
    status: "SCANNED",
    description: "Get a Runway task",
    aliases: ["/runway/tasks/{id}", "/runway/v1/tasks/{id}"],
  },
  {
    id: "SORA-001",
    family: "OpenAI Sora",
    method: "POST",
    path: "/v1/videos",
    status: "SCANNED",
    description: "Create a Sora video task",
  },
  {
    id: "SORA-002",
    family: "OpenAI Sora",
    method: "GET",
    path: "/v1/videos/{video_id}",
    status: "SCANNED",
    description: "Get a Sora video task",
  },
  {
    id: "SORA-003",
    family: "OpenAI Sora",
    method: "POST",
    path: "/v1/videos/{video_id}/remix",
    status: "SCANNED",
    description: "Remix a Sora video",
  },
  {
    id: "SORA-004",
    family: "OpenAI Sora",
    method: "GET",
    path: "/v1/videos/{video_id}/content",
    status: "CONTRACT_REVIEW",
    description: "Download completed Sora video content",
  },
];

function pathToRegex(template: string): RegExp {
  const parts = template.split(/(\{[^}]+\})/g);
  const pattern = parts
    .map((part) => {
      if (/^\{[^}]+\}$/.test(part)) {
        return "[^/:]+";
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${pattern}$`);
}

function pathnameOf(path: string): string {
  const queryIndex = path.indexOf("?");
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}

export function findContract(
  method: string,
  path: string,
): ApiContract | undefined {
  const normalizedMethod = method.toUpperCase() as HttpMethod;
  const pathname = pathnameOf(path);
  return API_CONTRACTS.find((contract) => {
    if (contract.method !== normalizedMethod) {
      return false;
    }
    const paths = [contract.path, ...(contract.aliases ?? [])];
    return paths.some((candidate) => pathToRegex(candidate).test(pathname));
  });
}

export function normalizeContractVersion(version: string): string {
  return version.startsWith("v") ? version : `v${version}`;
}
