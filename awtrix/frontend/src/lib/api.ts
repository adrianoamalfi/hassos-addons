export const basePath = new URL(document.baseURI).pathname.replace(/\/$/, "");

export async function api<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = `${basePath}/api${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}

export async function apiRaw(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = `${basePath}/api${path}`;
  return fetch(url, init);
}
