import { kv } from '@vercel/kv';

export interface PasteData {
  content: string;
  expiresAt: number | null;
  remainingViews: number | null;
}

/**
 * Save a paste to KV storage
 */
export async function savePaste(id: string, data: PasteData): Promise<void> {
  // Use expireAt if available, otherwise set a default TTL of 7 days
  const ttl = data.expiresAt ? Math.ceil((data.expiresAt - Date.now()) / 1000) : 7 * 24 * 60 * 60;
  
  await kv.set(
    `paste:${id}`,
    JSON.stringify(data),
    { ex: Math.max(1, ttl) } // Ensure at least 1 second TTL
  );
}

/**
 * Get a paste from KV storage
 */
export async function getPaste(id: string): Promise<PasteData | null> {
  const data = await kv.get<string>(`paste:${id}`);
  
  if (!data) {
    return null;
  }
  
  return JSON.parse(data);
}

/**
 * Delete a paste from KV storage
 */
export async function deletePaste(id: string): Promise<void> {
  await kv.del(`paste:${id}`);
}
