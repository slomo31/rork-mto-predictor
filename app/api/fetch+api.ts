export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return Response.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  console.log(`[Proxy] Fetching: ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; MTO-Predictor/1.0)',
      },
    });

    console.log(`[Proxy] Response status: ${response.status}`);

    const contentType = response.headers.get('content-type');
    console.log(`[Proxy] Content-Type: ${contentType}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Proxy] Upstream error ${response.status}:`, errorText.substring(0, 200));
      return Response.json(
        { error: `Upstream error: ${response.statusText}`, status: response.status },
        { status: 502 }
      );
    }

    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error(`[Proxy] Non-JSON response:`, text.substring(0, 200));
      return Response.json(
        { error: 'Non-JSON response from upstream', contentType },
        { status: 502 }
      );
    }

    const data = await response.json();
    console.log(`[Proxy] Success - returned data with keys:`, Object.keys(data).join(', '));
    return Response.json(data);
  } catch (error) {
    console.error('[Proxy] Fetch error:', error);
    return Response.json(
      { error: 'Failed to fetch from upstream', details: String(error) },
      { status: 502 }
    );
  }
}
