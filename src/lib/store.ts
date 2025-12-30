import { kv } from "@vercel/kv";

export interface PasteData {
  content: string;
  expiresAt: number | null;
  remainingViews: number | null;
}

/**
 * Save a paste
 */
export async function savePaste(id: string, data: PasteData): Promise<void> {
  const key = `paste:${id}`;

  const ttl =
    data.expiresAt != null
      ? Math.max(1, Math.floor((data.expiresAt - Date.now()) / 1000))
      : undefined;

  await kv.set(key, data);

  if (ttl) {
    await kv.expire(key, ttl);
  }
}

/**
 * Get a paste
 */
export async function getPaste(id: string): Promise<PasteData | null> {
  const key = `paste:${id}`;
  const data = await kv.get<PasteData>(key);
  return data ?? null;
}

/**
 * Delete a paste
 */
export async function deletePaste(id: string): Promise<void> {
  await kv.del(`paste:${id}`);
}
