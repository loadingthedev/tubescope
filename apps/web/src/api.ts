export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { signal });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : response.statusText;
    throw new Error(message || `Request failed (${response.status})`);
  }
  return body as T;
}

export async function mutateJson(path: string, method: 'POST' | 'DELETE', body?: unknown): Promise<void> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const data: unknown = await response.json();
    throw new Error(data && typeof data === 'object' && 'error' in data ? String(data.error) : response.statusText);
  }
}
