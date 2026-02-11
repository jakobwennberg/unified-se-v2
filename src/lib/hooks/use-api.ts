interface ApiClient {
  baseUrl: string;
  headers: Record<string, string>;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body: unknown, etag?: string): Promise<T>;
  delete(path: string): Promise<void>;
}

export function createApiClient(baseUrl: string, apiKey?: string): ApiClient {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return {
    baseUrl,
    headers,
    async get<T>(path: string): Promise<T> {
      const res = await fetch(`${baseUrl}${path}`, { headers });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    },
    async post<T>(path: string, body?: unknown): Promise<T> {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    },
    async patch<T>(path: string, body: unknown, etag?: string): Promise<T> {
      const patchHeaders = { ...headers };
      if (etag) patchHeaders['If-Match'] = etag;
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'PATCH',
        headers: patchHeaders,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    },
    async delete(path: string): Promise<void> {
      const res = await fetch(`${baseUrl}${path}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
    },
  };
}
