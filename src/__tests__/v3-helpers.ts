// Shared helpers for tests that look at a stored v3 page object directly.
import { env, SELF } from "cloudflare:test";
import { expect } from "vitest";
import {
  type StoredPageV3,
  derivePageKey,
  openPageV3Bytes,
  parseV3Header,
} from "../envelope";
import { RAW_CONTENT_TYPE } from "../upload";

export async function storedObject(id: string): Promise<Uint8Array> {
  const obj = await env.BUCKET.get(`page:${id}`);
  expect(obj).not.toBeNull();
  return new Uint8Array(await obj!.arrayBuffer());
}

export function headerOf(object: Uint8Array): StoredPageV3 {
  const parsed = parseV3Header(object);
  expect(parsed).not.toBeNull();
  return parsed!.header;
}

export async function storedHeader(id: string): Promise<StoredPageV3> {
  return headerOf(await storedObject(id));
}

// Decrypt a stored v3 page the way the Worker does, given the link password.
export async function openStored(id: string, password: string) {
  const object = await storedObject(id);
  const header = headerOf(object);
  const { key } = await derivePageKey(id, password);
  const opened = await openPageV3Bytes(key, id, object);
  return {
    header,
    payload: opened ? { html: new TextDecoder().decode(opened.html), filename: opened.filename } : null,
  };
}

// Rewrite the object with header fields patched (frames untouched), the way
// someone with bucket access but no key would.
export async function tamperHeader(id: string, patch: Record<string, unknown>): Promise<void> {
  const object = await storedObject(id);
  const parsed = parseV3Header(object)!;
  const header: Record<string, unknown> = { ...parsed.header, ...patch };
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete header[k];
  await env.BUCKET.put(`page:${id}`, encodeObject(header, object.subarray(parsed.end)));
}

export function encodeObject(header: unknown, frames: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(8 + json.length + frames.length);
  out.set([0x48, 0x44, 0x50, 0x33], 0);
  out[4] = (json.length >>> 24) & 0xff;
  out[5] = (json.length >>> 16) & 0xff;
  out[6] = (json.length >>> 8) & 0xff;
  out[7] = json.length & 0xff;
  out.set(json, 8);
  out.set(frames, 8 + json.length);
  return out;
}

// Build a streaming-shape upload: one JSON line of metadata, a newline, the page.
export function rawBody(meta: Record<string, unknown>, page: Uint8Array | string): Uint8Array {
  const pageBytes = typeof page === "string" ? new TextEncoder().encode(page) : page;
  const head = new TextEncoder().encode(`${JSON.stringify({ bytes: pageBytes.length, ...meta })}\n`);
  const out = new Uint8Array(head.length + pageBytes.length);
  out.set(head, 0);
  out.set(pageBytes, head.length);
  return out;
}

export async function rawUpload(
  meta: Record<string, unknown>,
  page: Uint8Array | string,
  init: { stream?: boolean; contentType?: string } = {},
): Promise<Response> {
  const body = rawBody(meta, page);
  return SELF.fetch("http://localhost/api/upload", {
    method: "POST",
    headers: { "Content-Type": init.contentType ?? RAW_CONTENT_TYPE },
    // A ReadableStream body goes out without Content-Length.
    body: init.stream ? chunked(body, 64 * 1024) : body,
    ...(init.stream ? { duplex: "half" } : {}),
  } as RequestInit);
}

export function chunked(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream({
    pull(controller) {
      if (at >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(at, Math.min(at + size, bytes.length)));
      at += size;
    },
  });
}
