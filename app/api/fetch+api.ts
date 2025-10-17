async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 8000) {
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return Response.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  console.log(`[Proxy] Fetching: ${targetUrl}`);

  try {
    const response = await fetchWithTimeout(targetUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.espn.com/',
        'Origin': 'https://www.espn.com',
      },
      cache: 'no-store',
    }, 10000);

    console.log(`[Proxy] Response status: ${response.status}`);

    const contentType = response.headers.get('content-type');
    console.log(`[Proxy] Content-Type: ${contentType}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Proxy] Upstream error ${response.status}:`, errorText.substring(0, 500));
      return Response.json(
        { error: `ESPN API returned ${response.status}: ${response.statusText}`, status: response.status, details: errorText.substring(0, 200) },
        { status: 502 }
      );
    }

    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error(`[Proxy] Non-JSON response:`, text.substring(0, 500));
      return Response.json(
        { error: 'Non-JSON response from upstream', contentType, preview: text.substring(0, 200) },
        { status: 502 }
      );
    }

    const data = await response.json();
    const eventCount = data.events?.length || 0;
    console.log(`[Proxy] Success - returned ${eventCount} events`);
    return Response.json(data);
  } catch (error: any) {
    console.error('[Proxy] Fetch error:', error);
    if (error.name === 'AbortError') {
      return Response.json(
        { error: 'Request timeout', details: 'ESPN API took too long to respond' },
        { status: 504 }
      );
    }
    return Response.json(
      { error: 'Failed to fetch from upstream', details: String(error) },
      { status: 502 }
    );
  }
}
