import { getPaste } from '@/src/lib/store';
import { notFound } from 'next/navigation';
import Link from 'next/link';

interface PageParams {
  id: string;
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }) {
  const { id } = await params;
  return {
    title: `Paste ${id} - Pastebin Lite`,
  };
}

async function checkPasteAvailability(id: string) {
  const paste = await getPaste(id);
  
  if (!paste) {
    return { available: false, paste: null };
  }

  // Check if paste has expired
  const now = Date.now();
  if (paste.expiresAt !== null && now > paste.expiresAt) {
    return { available: false, paste: null };
  }

  // Check if view limit exceeded (before decrementing)
  if (paste.remainingViews !== null && paste.remainingViews <= 0) {
    return { available: false, paste: null };
  }

  return { available: true, paste };
}

export default async function Page({ params }: { params: Promise<PageParams> }) {
  const { id } = await params;

  const { available, paste } = await checkPasteAvailability(id);

  if (!available || !paste) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Paste Content</h1>

          <div className="mb-4 p-4 bg-gray-100 rounded border border-gray-300">
            <pre className="whitespace-pre-wrap text-gray-800 font-mono text-sm">
              {paste.content}
            </pre>
          </div>

          <div className="flex justify-between items-center text-sm text-gray-600 border-t pt-4">
            <div>
              {paste.remainingViews !== null && (
                <p>Remaining views: {Math.max(0, paste.remainingViews)}</p>
              )}
              {paste.expiresAt !== null && (
                <p>Expires at: {new Date(paste.expiresAt).toLocaleString()}</p>
              )}
            </div>
            <Link
              href="/"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create New Paste
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
