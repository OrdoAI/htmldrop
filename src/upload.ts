import { generateId as defaultGenerateId, generatePassword, utf8ByteLength } from "./utils";
import type { PageRecord } from "./auth";

const MAX_HTML_BYTES = 10 * 1024 * 1024; // 10 MiB content limit
const MAX_BODY_BYTES = 11 * 1024 * 1024; // 11 MiB body guard (content + JSON envelope)
const MAX_RETRIES = 3;
const TTL_SECONDS = 604800; // 7 days

interface Env {
  PAGES: KVNamespace;
  AUTH_SECRET: string;
}

interface UploadBody {
  html: unknown;
  filename: unknown;
}

export interface UploadDeps {
  generateId: () => string;
}

const defaultDeps: UploadDeps = { generateId: defaultGenerateId };

export async function handleUpload(
  request: Request,
  env: Env,
  deps: UploadDeps = defaultDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    return new Response("Content-Type must be application/json", { status: 415 });
  }

  const rawBody = await request.text();
  const rawByteLength = utf8ByteLength(rawBody);
  if (rawByteLength > MAX_BODY_BYTES) {
    return new Response(
      `Request body too large: ${rawByteLength} bytes exceeds ${MAX_BODY_BYTES} byte limit`,
      { status: 413 },
    );
  }

  let body: UploadBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return new Response("Invalid body", { status: 400 });
  }

  const { html, filename } = body;

  if (typeof html !== "string" || html.length === 0) {
    return new Response("Missing or invalid 'html' field", { status: 400 });
  }

  if (typeof filename !== "string" || filename.length === 0) {
    return new Response("Missing or invalid 'filename' field", { status: 400 });
  }

  const htmlByteLength = utf8ByteLength(html);
  if (htmlByteLength > MAX_HTML_BYTES) {
    return new Response(
      `File too large: ${htmlByteLength} bytes exceeds ${MAX_HTML_BYTES} byte limit`,
      { status: 413 },
    );
  }

  const password = generatePassword();

  let id: string | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const candidate = deps.generateId();
    const existing = await env.PAGES.get(`page:${candidate}`);
    if (existing === null) {
      id = candidate;
      break;
    }
  }

  if (id === null) {
    return new Response("Failed to generate unique ID, try again", { status: 503 });
  }

  const record: PageRecord = {
    html,
    password,
    filename,
    createdAt: new Date().toISOString(),
  };

  await env.PAGES.put(`page:${id}`, JSON.stringify(record), {
    expirationTtl: TTL_SECONDS,
  });

  const url = new URL(request.url);
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();

  return Response.json({
    url: `${url.origin}/${id}?p=${password}`,
    id,
    password,
    expiresAt,
  });
}
