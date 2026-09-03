import { isExpired } from "./auth";

// Expired pages are purged on read, so a page nobody opens again lingers until
// something sweeps it. The daily cron in wrangler.toml calls purgeExpired to
// delete those pages and any comment whose page is gone. It never decrypts:
// only the plaintext createdAt / pinned metadata is consulted.

// Sealed records (see envelope.ts) put createdAt, version and pinned before
// the ciphertext, so the first KiB is enough to decide. Anything else falls
// back to a full parse.
const HEAD_BYTES = 1024;

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
  try {
    const head = await bucket.get(key, { range: { offset: 0, length: HEAD_BYTES } });
    if (!head) return null;
    const text = await head.text();
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
  } catch {
    // fall through to a full read
  }
  const full = await bucket.get(key);
  if (!full) return null;
  try {
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
