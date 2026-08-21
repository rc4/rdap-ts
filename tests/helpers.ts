export interface FetchCall {
  url: URL;
  init: RequestInit | undefined;
}

export type BootstrapServices = readonly (readonly [readonly string[], readonly string[]])[];

export const jsonResponse = (body: unknown, init: ResponseInit = {}): Response => {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/rdap+json');
  }
  return new Response(JSON.stringify(body), { ...init, headers });
};

export const fetchHarness = (
  handler: (call: FetchCall, index: number) => Response | Promise<Response>
): { fetch: typeof globalThis.fetch; calls: FetchCall[] } => {
  const calls: FetchCall[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const call = { url, init };
    calls.push(call);
    return handler(call, calls.length - 1);
  };
  return { fetch, calls };
};

export const rdapObject = (objectClassName: string, extra: Record<string, unknown> = {}) => ({
  rdapConformance: ['rdap_level_0'],
  objectClassName,
  ...extra,
});

export const domainResponse = (extra: Record<string, unknown> = {}) => rdapObject('domain', extra);

export const rdapResponse = (objectClassName: string, extra: Record<string, unknown> = {}) =>
  jsonResponse(rdapObject(objectClassName, extra));

export const bootstrap = (services: BootstrapServices, extra: Record<string, unknown> = {}) => ({
  version: '1.0',
  publication: '2026-08-20T00:00:00Z',
  services,
  ...extra,
});

export const freshHeaders = {
  'cache-control': 'max-age=3600',
  'content-type': 'application/json',
};

export const ianaJson = (body: unknown, headers: HeadersInit = freshHeaders): Response =>
  jsonResponse(body, { headers });

export const ianaHarness = (
  iana: BootstrapServices | ((call: FetchCall, index: number) => Response | Promise<Response>),
  lookup: (call: FetchCall, index: number) => Response | Promise<Response> = () =>
    jsonResponse(domainResponse())
) =>
  fetchHarness((call, index) => {
    if (call.url.hostname === 'data.iana.org') {
      return typeof iana === 'function' ? iana(call, index) : ianaJson(bootstrap(iana));
    }
    return lookup(call, index);
  });
