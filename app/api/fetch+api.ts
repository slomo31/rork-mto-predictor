export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return Response.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MTO-Predictor/1.0',
      },
    });

    if (!response.ok) {
      return Response.json(
        { error: `Upstream error: ${response.statusText}`, status: response.status },
        { status: 502 }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('Proxy fetch error:', error);
    return Response.json(
      { error: 'Failed to fetch from upstream', details: String(error) },
      { status: 502 }
    );
  }
}
