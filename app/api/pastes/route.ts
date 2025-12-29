import { NextRequest, NextResponse } from 'next/server';
import { savePaste } from '@/src/lib/store';
import { randomBytes } from 'crypto';

interface CreatePasteRequest {
  content?: unknown;
  ttl_seconds?: unknown;
  max_views?: unknown;
}

/**
 * Generate a unique ID for a paste
 */
function generateId(): string {
  return randomBytes(6).toString('hex');
}

/**
 * Get the base URL from request headers
 */
function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host') || '';
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  return `${protocol}://${host}`;
}

/**
 * Validate POST request body
 */
function validateRequest(body: CreatePasteRequest): {
  valid: boolean;
  error?: string;
  content?: string;
  ttlSeconds?: number;
  maxViews?: number;
} {
  // Validate content
  if (typeof body.content !== 'string' || body.content.trim() === '') {
    return { valid: false, error: 'content is required and must be a non-empty string' };
  }

  // Validate ttl_seconds if provided
  if (body.ttl_seconds !== undefined) {
    const ttl = Number(body.ttl_seconds);
    if (!Number.isInteger(ttl) || ttl < 1) {
      return { valid: false, error: 'ttl_seconds must be an integer >= 1' };
    }
  }

  // Validate max_views if provided
  if (body.max_views !== undefined) {
    const maxViews = Number(body.max_views);
    if (!Number.isInteger(maxViews) || maxViews < 1) {
      return { valid: false, error: 'max_views must be an integer >= 1' };
    }
  }

  return {
    valid: true,
    content: body.content,
    ttlSeconds: body.ttl_seconds ? Number(body.ttl_seconds) : undefined,
    maxViews: body.max_views ? Number(body.max_views) : undefined,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: CreatePasteRequest = await request.json();
    const validation = validateRequest(body);

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const { content, ttlSeconds, maxViews } = validation;

    // Generate unique ID
    const id = generateId();

    // Calculate expiry timestamp
    const now = Date.now();
    const expiresAt = ttlSeconds ? now + ttlSeconds * 1000 : null;

    // Store paste
    await savePaste(id, {
      content: content!,
      expiresAt,
      remainingViews: maxViews ?? null,
    });

    // Get base URL
    const baseUrl = getBaseUrl(request);

    return NextResponse.json(
      {
        id,
        url: `${baseUrl}/p/${id}`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating paste:', error);
    return NextResponse.json(
      { error: 'Failed to create paste' },
      { status: 500 }
    );
  }
}
