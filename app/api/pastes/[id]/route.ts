import { NextRequest, NextResponse } from 'next/server';
import { getPaste, savePaste } from '@/src/lib/store';

interface RouteParams {
  id: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // Get test time from header if in TEST_MODE
    let currentTime = Date.now();
    const testNowHeader = request.headers.get('x-test-now-ms');
    if (process.env.TEST_MODE === '1' && testNowHeader) {
      const testNow = parseInt(testNowHeader, 10);
      if (!isNaN(testNow)) {
        currentTime = testNow;
      }
    }

    // Get paste from storage
    const paste = await getPaste(id);

    if (!paste) {
      return NextResponse.json(
        { error: 'Paste not found' },
        { status: 404 }
      );
    }

    // Check if paste has expired
    if (paste.expiresAt !== null && currentTime > paste.expiresAt) {
      return NextResponse.json(
        { error: 'Paste has expired' },
        { status: 404 }
      );
    }

    // Check if view limit exceeded
    if (paste.remainingViews !== null && paste.remainingViews <= 0) {
      return NextResponse.json(
        { error: 'View limit exceeded' },
        { status: 404 }
      );
    }

    // Decrement remaining views if limited
    if (paste.remainingViews !== null) {
      paste.remainingViews = Math.max(0, paste.remainingViews - 1);
      await savePaste(id, paste);
    }

    return NextResponse.json(
      {
        content: paste.content,
        remaining_views: paste.remainingViews,
        expires_at: paste.expiresAt,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error retrieving paste:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve paste' },
      { status: 500 }
    );
  }
}
