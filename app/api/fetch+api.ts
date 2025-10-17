const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { ts: number; data: any; status: number }>();

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return Response.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  const cacheKey = cleanUrl(targetUrl);
  const now = Date.now();
  const cached = cache.get(cacheKey);
  
  if (cached && (now - cached.ts) < CACHE_TTL_MS) {
    console.log(`[Proxy] Cache HIT for ${cacheKey.substring(0, 80)}`);
    return Response.json(cached.data, { 
      status: cached.status,
      headers: { 'X-Cache': 'HIT' }
    });
  }

  console.log(`[Proxy] Fetching: ${targetUrl}`);

  try {
    const response = await fetchWithTimeout(targetUrl, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      cache: 'no-store',
    }, 15000);

    console.log(`[Proxy] Response status: ${response.status}`);

    const contentType = response.headers.get('content-type') || '';
    console.log(`[Proxy] Content-Type: ${contentType}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Proxy] Upstream error ${response.status}:`, errorText.substring(0, 300));
      
      const errorData = {
        error: `Upstream returned ${response.status}`,
        status: response.status,
        statusText: response.statusText,
        preview: errorText.substring(0, 150)
      };
      
      cache.set(cacheKey, { ts: now, data: errorData, status: 502 });
      
      return Response.json(errorData, { status: 502 });
    }

    const text = await response.text();
    
    if (!contentType.includes('application/json') && !contentType.includes('text/json')) {
      console.error(`[Proxy] Non-JSON response (${contentType}):`, text.substring(0, 300));
      
      const errorData = {
        error: 'Non-JSON response from upstream',
        contentType,
        preview: text.substring(0, 150)
      };
      
      cache.set(cacheKey, { ts: now, data: errorData, status: 502 });
      
      return Response.json(errorData, { status: 502 });
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error('[Proxy] JSON parse failed:', parseError);
      
      const errorData = {
        error: 'Invalid JSON from upstream',
        preview: text.substring(0, 150)
      };
      
      cache.set(cacheKey, { ts: now, data: errorData, status: 502 });
      
      return Response.json(errorData, { status: 502 });
    }

    const eventCount = data.events?.length || 0;
    console.log(`[Proxy] Success - returned ${eventCount} events`);
    
    cache.set(cacheKey, { ts: now, data, status: 200 });
    
    return Response.json(data, {
      headers: { 'X-Cache': 'MISS' }
    });
  } catch (error: any) {
    console.error('[Proxy] Fetch error:', error.message || error);
    
    const errorData = {
      error: error.name === 'AbortError' ? 'Request timeout' : 'Network error',
      details: error.message || String(error),
      type: error.name || 'Unknown'
    };
    
    if (error.name !== 'AbortError') {
      cache.set(cacheKey, { ts: now, data: errorData, status: 502 });
    }
    
    return Response.json(
      errorData,
      { status: error.name === 'AbortError' ? 504 : 502 }
    );
  }
}
