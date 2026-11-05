import fs from 'node:fs';
import path from 'node:path';

export const NOT_RUNNING = 'Lanes isn’t running. Start it with `lanes start`.';

/** A friendly error that becomes the tool's error text. */
export class LanesError extends Error {}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ status: number; text: () => Promise<string> }>;

export interface LanesClient {
  call: <T>(method: 'GET' | 'POST' | 'PATCH', pathname: string, body?: unknown) => Promise<T>;
}

/** Reads the token fresh each call, so Lanes can start (or restart) after Claude does. */
export function tokenReader(dataDir: string): () => string {
  return () => fs.readFileSync(path.join(dataDir, 'token'), 'utf8').trim();
}

export function createClient(opts: {
  url: string;
  readToken: () => string;
  fetch?: FetchLike;
  timeoutMs?: number;
}): LanesClient {
  const doFetch: FetchLike = opts.fetch ?? ((u, init) => fetch(u, init));
  return {
    async call<T>(method: string, pathname: string, body?: unknown): Promise<T> {
      let token: string;
      try {
        token = opts.readToken();
      } catch {
        // No token file: Lanes has never started with this data folder.
        throw new LanesError(NOT_RUNNING);
      }
      let res: Awaited<ReturnType<FetchLike>>;
      try {
        res = await doFetch(`${opts.url}${pathname}`, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            // Lets Settings show "Claude last connected …".
            'x-lanes-client': 'mcp',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
        });
      } catch {
        throw new LanesError(NOT_RUNNING);
      }
      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        json = undefined;
      }
      if (res.status === 401) {
        throw new LanesError(
          'Lanes didn’t accept the connector’s key. Restart Lanes and try again.',
        );
      }
      if (res.status >= 400) {
        const message = (json as { error?: { message?: string } } | undefined)?.error?.message;
        throw new LanesError(message ?? `Lanes answered with an error (${res.status}).`);
      }
      return json as T;
    },
  };
}
