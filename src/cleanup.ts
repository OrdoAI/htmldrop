import { isExpired } from "./auth";
import { V3_PREFIX_BYTES, isV3Prefix, parseV3Header } from "./envelope";

// Expired pages are purged on read, so a page nobody opens again lingers until
// something sweeps it. The daily cron in wrangler.toml calls purgeExpired to
// delete those pages and any comment whose page is gone. It never decrypts:
// only the plaintext createdAt / pinned metadata is consulted.

// A v3 object (see envelope.ts) is described entirely by its header, which
// the first V3_PREFIX_BYTES always cover; a corrupt one is left alone rather
// than swept. v2 records put createdAt, version and pinned before the
// ciphertext, so the same prefix is enough to decide; anything else falls
// back to a full parse.
const HEAD_BYTES = V3_PREFIX_BYTES;

export interface PurgeResult {
  scanned: number;
  purgedPages: number;
  purgedComments: number;
}

interface ExpiryMeta {
  createdAt: string;
  ttlDays: number | undefined;
  pinned: boolean;
}

async function listAll(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, limit: 1000, cursor });
    for (const obj of page.objects) keys.push(obj.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

async function readExpiryMeta(bucket: R2Bucket, key: string): Promise<ExpiryMeta | null> {
  let bytes: Uint8Array;
  let etag: string;
  try {
    const head = await bucket.get(key, { range: { offset: 0, length: HEAD_BYTES } });
    if (!head) return null;
    etag = head.etag;
    bytes = new Uint8Array(await head.arrayBuffer());
  } catch {
    return null; // a read failure is not a legacy record; leave it for a human
  }
  if (isV3Prefix(bytes)) {
    const parsed = parseV3Header(bytes);
    if (!parsed) return null;
    const { createdAt, ttlDays, pinned } = parsed.header;
    return { createdAt, ttlDays, pinned: pinned === true };
  }
  const text = new TextDecoder().decode(bytes);
  const created = text.match(/"createdAt":"([^"]+)"/);
  // `pinned` precedes `iv` in a sealed record, so seeing `iv` means the
  // head covered the pin flag.
  if (created && text.includes('"iv":')) {
    const ttl = text.match(/"ttlDays":(\d+)/);
    return {
      createdAt: created[1],
      ttlDays: ttl ? Number(ttl[1]) : undefined,
      pinned: text.includes('"pinned":true'),
    };
  }
  // A JSON record longer than the prefix: read it whole, conditional on it
  // being the object the prefix came from; a page rewritten as v3 in between
  // is left for the next sweep rather than read whole.
  let full: R2ObjectBody | R2Object | null;
  try {
    full = await bucket.get(key, { onlyIf: { etagMatches: etag } });
    if (!full || !("body" in full)) return null;
    const parsed: unknown = JSON.parse(await full.text());
    if (!parsed || typeof parsed !== "object") return null;
    const r = parsed as Record<string, unknown>;
    if (typeof r.createdAt !== "string") return null;
    return {
      createdAt: r.createdAt,
      ttlDays: typeof r.ttlDays === "number" ? r.ttlDays : undefined,
      pinned: r.pinned === true,
    };
  } catch {
    return null;
  }
}

export async function purgeExpired(
  bucket: R2Bucket,
  now: number = Date.now(),
): Promise<PurgeResult> {
  const result: PurgeResult = { scanned: 0, purgedPages: 0, purgedComments: 0 };

  const live = new Set<string>();
  for (const key of await listAll(bucket, "page:")) {
    result.scanned++;
    const id = key.slice("page:".length);
    const meta = await readExpiryMeta(bucket, key);
    if (!meta) continue; // unreadable: leave it for a human
    if (!isExpired(meta.createdAt, meta.ttlDays, meta.pinned, now)) {
      live.add(id);
      continue;
    }
    await bucket.delete(key);
    result.purgedPages++;
  }

  // Comments whose page is gone, whether purged just now or on an earlier
  // read. A page created after the listing above is confirmed with a head()
  // so its fresh comments are never swept by mistake.
  const present = new Map<string, boolean>();
  for (const key of await listAll(bucket, "comment:")) {
    const id = key.slice("comment:".length, key.indexOf(":", "comment:".length));
    if (live.has(id)) continue;
    let exists = present.get(id);
    if (exists === undefined) {
      exists = (await bucket.head(`page:${id}`)) !== null;
      present.set(id, exists);
    }
    if (exists) continue;
    await bucket.delete(key);
    result.purgedComments++;
  }

  return result;
}
