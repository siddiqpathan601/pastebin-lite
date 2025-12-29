import { createClient } from "redis";

export interface PasteData {
  content: string;
  expiresAt: number | null;
  remainingViews: number | null;
}

const redis = createClient({
  url: process.env.REDIS_URL,
});

redis.on("error", (err) => {
  console.error("Redis Client Error", err);
});

if (!redis.isOpen) {
  await redis.connect();
}

/**
 * Save a paste
 */
export async function savePaste(
  id: string,
  data: PasteData
): Promise<void> {
  const ttl = data.expiresAt
    ? Math.ceil((data.expiresAt - Date.now()) / 1000)
    : 7 * 24 * 60 * 60;

  await redis.set(
    `paste:${id}`,
    JSON.stringify(data),
    {
      EX: Math.max(1, ttl),
    }
  );
}

/**
 * Get a paste
 */
export async function getPaste(
  id: string
): Promise<PasteData | null> {
  const data = await redis.get(`paste:${id}`);
  if (!data) return null;
  return JSON.parse(data) as PasteData;
}

/**
 * Delete a paste
 */
export async function deletePaste(
  id: string
): Promise<void> {
  await redis.del(`paste:${id}`);
}
