# Pastebin-Lite Code Reference

## 📄 Key Code Files Overview

### 1. Persistence Layer (`src/lib/store.ts`)

```typescript
import { kv } from '@vercel/kv';

export interface PasteData {
  content: string;
  expiresAt: number | null;
  remainingViews: number | null;
}

export async function savePaste(id: string, data: PasteData): Promise<void> {
  const ttl = data.expiresAt 
    ? Math.ceil((data.expiresAt - Date.now()) / 1000) 
    : 7 * 24 * 60 * 60;
  
  await kv.set(`paste:${id}`, JSON.stringify(data), { ex: Math.max(1, ttl) });
}

export async function getPaste(id: string): Promise<PasteData | null> {
  const data = await kv.get<string>(`paste:${id}`);
  return data ? JSON.parse(data) : null;
}

export async function deletePaste(id: string): Promise<void> {
  await kv.del(`paste:${id}`);
}
```

**Key Points:**
- Uses Vercel KV for persistent Redis storage
- Automatic TTL management
- Type-safe with TypeScript interfaces

---

### 2. Health Check API (`app/api/healthz/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest): Promise<NextResponse> {
  return NextResponse.json({ ok: true }, { status: 200 });
}
```

**Key Points:**
- Super fast (no I/O)
- Used for monitoring/uptime checks

---

### 3. Create Paste API (`app/api/pastes/route.ts`)

Key sections:

**ID Generation:**
```typescript
function generateId(): string {
  return randomBytes(6).toString('hex');
}
```

**Base URL Detection:**
```typescript
function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host') || '';
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  return `${protocol}://${host}`;
}
```

**Input Validation:**
```typescript
function validateRequest(body: CreatePasteRequest) {
  if (typeof body.content !== 'string' || body.content.trim() === '') {
    return { valid: false, error: 'content is required and must be a non-empty string' };
  }
  
  if (body.ttl_seconds !== undefined) {
    const ttl = Number(body.ttl_seconds);
    if (!Number.isInteger(ttl) || ttl < 1) {
      return { valid: false, error: 'ttl_seconds must be an integer >= 1' };
    }
  }
  
  // Similar for max_views...
  
  return { valid: true, content, ttlSeconds, maxViews };
}
```

**POST Handler:**
```typescript
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const validation = validateRequest(body);
  
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  
  const id = generateId();
  const now = Date.now();
  const expiresAt = validation.ttlSeconds ? now + validation.ttlSeconds * 1000 : null;
  
  await savePaste(id, {
    content: validation.content!,
    expiresAt,
    remainingViews: validation.maxViews ?? null,
  });
  
  const baseUrl = getBaseUrl(request);
  
  return NextResponse.json(
    { id, url: `${baseUrl}/p/${id}` },
    { status: 201 }
  );
}
```

**Key Points:**
- Comprehensive input validation
- Dynamic URL construction (no hardcoding)
- HTTP 201 for resource creation
- Proper error responses

---

### 4. Retrieve Paste API (`app/api/pastes/[id]/route.ts`)

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
): Promise<NextResponse> {
  const { id } = await params;
  
  // Support TEST_MODE for deterministic testing
  let currentTime = Date.now();
  const testNowHeader = request.headers.get('x-test-now-ms');
  if (process.env.TEST_MODE === '1' && testNowHeader) {
    const testNow = parseInt(testNowHeader, 10);
    if (!isNaN(testNow)) {
      currentTime = testNow;
    }
  }
  
  const paste = await getPaste(id);
  
  if (!paste) {
    return NextResponse.json({ error: 'Paste not found' }, { status: 404 });
  }
  
  // Check expiration
  if (paste.expiresAt !== null && currentTime > paste.expiresAt) {
    return NextResponse.json({ error: 'Paste has expired' }, { status: 404 });
  }
  
  // Check view limit
  if (paste.remainingViews !== null && paste.remainingViews <= 0) {
    return NextResponse.json({ error: 'View limit exceeded' }, { status: 404 });
  }
  
  // Decrement views
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
}
```

**Key Points:**
- Expiry checking with current time
- View limit enforcement
- Decrement never goes negative
- TEST_MODE support for deterministic testing

---

### 5. Paste View Page (`app/p/[id]/page.tsx`)

```typescript
async function checkPasteAvailability(id: string) {
  const paste = await getPaste(id);
  
  if (!paste) {
    return { available: false, paste: null };
  }
  
  const now = Date.now();
  if (paste.expiresAt !== null && now > paste.expiresAt) {
    return { available: false, paste: null };
  }
  
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
            <Link href="/" className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Create New Paste
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
```

**Key Points:**
- Server-side rendering for SEO
- XSS protection via `<pre>` text rendering
- 404 on unavailable pastes
- Shows metadata
- Link to create new paste

---

### 6. Home Page (`app/page.tsx` - Client Component)

Key sections:

**State Management:**
```typescript
'use client';

const [content, setContent] = useState('');
const [ttlSeconds, setTtlSeconds] = useState('');
const [maxViews, setMaxViews] = useState('');
const [loading, setLoading] = useState(false);
const [error, setError] = useState('');
const [pasteUrl, setPasteUrl] = useState('');
```

**Create Paste Handler:**
```typescript
const handleCreatePaste = async (e: React.FormEvent) => {
  e.preventDefault();
  setError('');
  setPasteUrl('');
  setLoading(true);
  
  try {
    const body: Record<string, unknown> = { content };
    
    if (ttlSeconds) {
      body.ttl_seconds = parseInt(ttlSeconds, 10);
    }
    if (maxViews) {
      body.max_views = parseInt(maxViews, 10);
    }
    
    const response = await fetch('/api/pastes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create paste');
    }
    
    const data = await response.json();
    setPasteUrl(data.url);
    setContent('');
    setTtlSeconds('');
    setMaxViews('');
  } catch (err) {
    setError(err instanceof Error ? err.message : 'An error occurred');
  } finally {
    setLoading(false);
  }
};
```

**UI Elements:**
```tsx
<form onSubmit={handleCreatePaste} className="w-full flex flex-col gap-4">
  {/* Content Textarea */}
  <textarea
    value={content}
    onChange={(e) => setContent(e.target.value)}
    placeholder="Enter your paste content here..."
    required
    className="w-full h-40 p-3 border rounded..."
  />
  
  {/* TTL Input */}
  <input
    type="number"
    value={ttlSeconds}
    onChange={(e) => setTtlSeconds(e.target.value)}
    placeholder="Optional, e.g. 3600"
    min="1"
  />
  
  {/* Max Views Input */}
  <input
    type="number"
    value={maxViews}
    onChange={(e) => setMaxViews(e.target.value)}
    placeholder="Optional, e.g. 5"
    min="1"
  />
  
  {/* Error Display */}
  {error && (
    <div className="p-3 bg-red-100 text-red-700 rounded text-sm">
      {error}
    </div>
  )}
  
  {/* Create Button */}
  <button type="submit" disabled={loading} className="...">
    {loading ? 'Creating...' : 'Create Paste'}
  </button>
  
  {/* Success Display */}
  {pasteUrl && (
    <div className="p-4 bg-green-100 border rounded">
      <p className="text-sm font-medium mb-2">Paste created successfully!</p>
      <div className="flex items-center gap-2">
        <input type="text" value={pasteUrl} readOnly className="..." />
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(pasteUrl)}
          className="..."
        >
          Copy
        </button>
        <a href={pasteUrl} target="_blank" rel="noopener noreferrer" className="...">
          Open
        </a>
      </div>
    </div>
  )}
</form>
```

**Key Points:**
- Client component for interactivity
- Proper form handling
- Loading state during API call
- Error display
- Success message with copy/open buttons
- Form reset after success

---

## 🔍 Important Patterns

### Error Handling Pattern
```typescript
if (!validation.valid) {
  return NextResponse.json({ error: validation.error }, { status: 400 });
}

if (!paste) {
  return NextResponse.json({ error: 'Paste not found' }, { status: 404 });
}

try {
  // API logic
} catch (error) {
  console.error('Error:', error);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
```

### Type Safety Pattern
```typescript
interface PasteData {
  content: string;
  expiresAt: number | null;
  remainingViews: number | null;
}

export async function savePaste(id: string, data: PasteData): Promise<void>
```

### Validation Pattern
```typescript
if (typeof body.content !== 'string' || body.content.trim() === '') {
  return { valid: false, error: 'Message' };
}

const ttl = Number(body.ttl_seconds);
if (!Number.isInteger(ttl) || ttl < 1) {
  return { valid: false, error: 'Message' };
}
```

### Async Server Component Pattern
```typescript
export default async function Page({ params }: { params: Promise<PageParams> }) {
  const { id } = await params;
  
  // Can use async operations directly
  const paste = await getPaste(id);
  
  if (!paste) {
    notFound();
  }
  
  return <div>{content}</div>;
}
```

---

## 📚 Testing Examples

### Test Create Paste
```bash
curl -X POST http://localhost:3000/api/pastes \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello, World!",
    "ttl_seconds": 3600,
    "max_views": 5
  }'

# Response:
# {
#   "id": "abc123def456",
#   "url": "http://localhost:3000/p/abc123def456"
# }
```

### Test Get Paste
```bash
curl http://localhost:3000/api/pastes/abc123def456

# Response:
# {
#   "content": "Hello, World!",
#   "remaining_views": 4,
#   "expires_at": 1735475400000
# }
```

### Test with View Limit
```bash
# Create with max_views=1
curl -X POST http://localhost:3000/api/pastes \
  -H "Content-Type: application/json" \
  -d '{"content":"test","max_views":1}'

# First fetch works (remaining_views: 0)
curl http://localhost:3000/api/pastes/abc123def456

# Second fetch returns 404
curl http://localhost:3000/api/pastes/abc123def456
```

### Test with TEST_MODE
```bash
# Set TEST_MODE=1 in environment, then:
curl http://localhost:3000/api/pastes/abc123def456 \
  -H "x-test-now-ms: 1735475400000"
```

---

## 🎯 Quick Reference

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Persistence | `src/lib/store.ts` | 42 | Save/Get/Delete pastes |
| Health | `app/api/healthz/route.ts` | 6 | Health check |
| Create | `app/api/pastes/route.ts` | 112 | POST to create |
| Retrieve | `app/api/pastes/[id]/route.ts` | 73 | GET to retrieve |
| View Page | `app/p/[id]/page.tsx` | 79 | Display paste |
| Home Page | `app/page.tsx` | 159 | Create UI |

**Total Implementation:** ~471 lines of production code

---

This code reference covers all key patterns and implementations used in Pastebin-Lite.
