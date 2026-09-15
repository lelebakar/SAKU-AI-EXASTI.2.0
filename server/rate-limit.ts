import { eq, lt, sql } from "drizzle-orm";
import { sakuRateLimitBuckets } from "../drizzle/schema";
import { getDb } from "./db";

type Bucket = { count: number; resetAt: number };
export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };
export type RateLimitStore = {
  consume: (key: string, limit: number, windowMs: number, now: number) => Promise<RateLimitResult>;
  reset: () => Promise<void>;
};

function resultFor(bucket: Bucket, limit: number, now: number): RateLimitResult {
  const allowed = bucket.count <= limit;
  return {
    allowed,
    remaining: allowed ? Math.max(0, limit - bucket.count) : 0,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function createMemoryRateLimitStore(): RateLimitStore {
  const buckets = new Map<string, Bucket>();
  return {
    async consume(key, limit, windowMs, now) {
      for (const [bucketKey, bucket] of Array.from(buckets.entries())) {
        if (bucket.resetAt <= now) buckets.delete(bucketKey);
      }
      const current = buckets.get(key);
      if (!current || current.resetAt <= now) {
        const bucket = { count: 1, resetAt: now + windowMs };
        buckets.set(key, bucket);
        return resultFor(bucket, limit, now);
      }
      current.count = Math.min(limit + 1, current.count + 1);
      return resultFor(current, limit, now);
    },
    async reset() {
      buckets.clear();
    },
  };
}

const fallbackMemoryStore = createMemoryRateLimitStore();

export function createDatabaseRateLimitStore(): RateLimitStore {
  return {
  async consume(key, limit, windowMs, now) {
    const db = await getDb();
    if (!db) return fallbackMemoryStore.consume(key, limit, windowMs, now);
    try {
      await db.execute(sql`INSERT INTO \`saku_rate_limit_buckets\` (\`bucketKey\`, \`count\`, \`resetAt\`) VALUES (${key}, 1, ${now + windowMs}) ON DUPLICATE KEY UPDATE \`count\` = IF(\`resetAt\` <= ${now}, 1, LEAST(\`count\` + 1, ${limit + 1})), \`resetAt\` = IF(\`resetAt\` <= ${now}, ${now + windowMs}, \`resetAt\`)`);
      const rows = await db.select().from(sakuRateLimitBuckets).where(eq(sakuRateLimitBuckets.bucketKey, key)).limit(1);
      const bucket = rows[0];
      if (!bucket) return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)) };
      return resultFor(bucket, limit, now);
    } catch (error) {
      console.error("[Rate limit] Persistent bucket unavailable; using temporary fallback:", error);
      return fallbackMemoryStore.consume(key, limit, windowMs, now);
    }
  },
  async reset() {
    const db = await getDb();
    if (!db) return fallbackMemoryStore.reset();
    await db.delete(sakuRateLimitBuckets).where(lt(sakuRateLimitBuckets.resetAt, Date.now()));
    return fallbackMemoryStore.reset();
  },
  };
}

const databaseRateLimitStore = createDatabaseRateLimitStore();

export async function consumeRateLimit(key: string, limit: number, windowMs: number, now = Date.now(), store = databaseRateLimitStore) {
  return store.consume(key, limit, windowMs, now);
}

export async function resetRateLimits(store = databaseRateLimitStore) {
  return store.reset();
}
