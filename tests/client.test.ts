import { describe, expect, test } from '@rstest/core';
import * as v from 'valibot';
import {
  createRdapClient,
  RdapError,
  RdapHttpError,
  RdapValidationError,
  type RdapClient,
} from '../src/index';
import { bootstrap, domainResponse, fetchHarness, freshHeaders, jsonResponse } from './helpers';

const searchCases: readonly [
  path: string,
  search: (client: RdapClient) => Promise<unknown>,
  query: string,
  resultKey: string,
][] = [
  [
    'domains',
    client => client.searchDomains({ name: 'exam*' }),
    'name=exam*',
    'domainSearchResults',
  ],
  [
    'domains',
    client => client.searchDomains({ nsLdhName: 'ns1.example*' }),
    'nsLdhName=ns1.example*',
    'domainSearchResults',
  ],
  [
    'domains',
    client => client.searchDomains({ nsIp: '192.0.2.1' }),
    'nsIp=192.0.2.1',
    'domainSearchResults',
  ],
  [
    'nameservers',
    client => client.searchNameservers({ name: 'ns*' }),
    'name=ns*',
    'nameserverSearchResults',
  ],
  [
    'nameservers',
    client => client.searchNameservers({ ip: '192.0.2.1' }),
    'ip=192.0.2.1',
    'nameserverSearchResults',
  ],
  [
    'entities',
    client => client.searchEntities({ fn: 'Bobby Joe*' }),
    'fn=Bobby+Joe*',
    'entitySearchResults',
  ],
  [
    'entities',
    client => client.searchEntities({ handle: 'ABC*' }),
    'handle=ABC*',
    'entitySearchResults',
  ],
];

describe('explicit-server client operations', () => {
  test('normalizes IDNs, merges headers, propagates signals, and preserves data', async () => {
    const harness = fetchHarness(() => jsonResponse(domainResponse({ extension: { answer: 42 } })));
    const signal = new AbortController().signal;
    const client = createRdapClient({
      baseUrl: 'https://rdap.example.test/root',
      headers: { authorization: 'Bearer token' },
      fetch: harness.fetch,
    });

    await expect(
      client.lookupDomain('FÓO.Example.', {
        headers: { 'x-request': 'yes' },
        signal,
      })
    ).resolves.toMatchObject({ extension: { answer: 42 } });

    const call = harness.calls[0];
    expect(call?.url.href).toBe('https://rdap.example.test/root/domain/xn--fo-5ja.example');
    const headers = new Headers(call?.init?.headers);
    expect(headers.get('accept')).toBe('application/rdap+json, application/json');
    expect(headers.get('authorization')).toBe('Bearer token');
    expect(headers.get('x-request')).toBe('yes');
    expect(call?.init?.signal).toBe(signal);
    expect(call?.init?.method).toBeUndefined();
  });

  test('honors a caller-provided Accept header', async () => {
    const harness = fetchHarness(() => jsonResponse(domainResponse()));
    const client = createRdapClient({ fetch: harness.fetch });
    await client.lookupDomain('example.test', {
      baseUrl: 'https://rdap.example.test/',
      headers: { accept: 'application/rdap+json' },
    });
    expect(new Headers(harness.calls[0]?.init?.headers).get('accept')).toBe(
      'application/rdap+json'
    );
  });

  test('gives a per-request base URL precedence over the client default', async () => {
    const harness = fetchHarness(() => jsonResponse(domainResponse()));
    const client = createRdapClient({
      baseUrl: 'https://client.test/',
      fetch: harness.fetch,
    });
    await client.lookupDomain('example.test', {
      baseUrl: 'https://request.test/root',
    });
    expect(harness.calls[0]?.url.href).toBe('https://request.test/root/domain/example.test');
  });

  test.each([
    ['ip', '2001:db8::/32', '/ip/2001:db8::/32', 'ip network'],
    ['autnum', 'AS65536', '/autnum/65536', 'autnum'],
    ['nameserver', 'NS1.Example.', '/nameserver/ns1.example', 'nameserver'],
    ['entity', 'ABC/123', '/entity/ABC%2F123', 'entity'],
  ])('builds %s lookup paths', async (kind, input, suffix, objectClassName) => {
    const harness = fetchHarness(() =>
      jsonResponse({ rdapConformance: ['rdap_level_0'], objectClassName })
    );
    const client = createRdapClient({
      baseUrl: 'https://rdap.example.test/',
      fetch: harness.fetch,
    });

    if (kind === 'ip') await client.lookupIp(input);
    else if (kind === 'autnum') await client.lookupAutnum(input);
    else if (kind === 'nameserver') await client.lookupNameserver(input);
    else await client.lookupEntity(input);

    expect(harness.calls[0]?.url.pathname).toBe(suffix);
  });

  test.each(searchCases)('builds %s search URLs', async (path, search, query, resultKey) => {
    const harness = fetchHarness(() =>
      jsonResponse({
        rdapConformance: ['rdap_level_0'],
        [resultKey]: [],
      })
    );
    const client = createRdapClient({
      baseUrl: 'https://rdap.example.test/',
      fetch: harness.fetch,
    });

    await search(client);

    expect(harness.calls[0]?.url.pathname).toBe(`/${path}`);
    expect(harness.calls[0]?.url.search.slice(1)).toBe(query);
  });

  test('gets server help', async () => {
    const harness = fetchHarness(() =>
      jsonResponse({ rdapConformance: ['rdap_level_0'], notices: [] })
    );
    const client = createRdapClient({ fetch: harness.fetch });
    await expect(
      client.getHelp({ baseUrl: 'https://rdap.example.test/root/' })
    ).resolves.toMatchObject({ rdapConformance: ['rdap_level_0'] });
    expect(harness.calls[0]?.url.pathname).toBe('/root/help');
  });

  test('requires server context for contextual operations', async () => {
    const client = createRdapClient({
      fetch: fetchHarness(() => jsonResponse({})).fetch,
    });
    await expect(client.lookupNameserver('ns.example')).rejects.toMatchObject({
      code: 'base-url-required',
    });
    await expect(client.getHelp()).rejects.toBeInstanceOf(RdapError);
    await expect(client.searchEntities({ handle: 'ABC*' })).rejects.toMatchObject({
      code: 'base-url-required',
    });
    await expect(client.lookupEntity('UNTAGGED')).rejects.toMatchObject({
      code: 'base-url-required',
    });
    await expect(client.exists('entity', 'UNTAGGED')).rejects.toMatchObject({
      code: 'base-url-required',
    });
    await expect(client.exists('nameserver', 'ns.example')).rejects.toMatchObject({
      code: 'base-url-required',
    });
  });

  test('rejects non-HTTP server URLs and unavailable native fetch', () => {
    expect(() => createRdapClient({ baseUrl: 'file:///tmp/rdap' })).toThrow(
      'must use HTTP or HTTPS'
    );

    const fetchImplementation = globalThis.fetch;
    Reflect.deleteProperty(globalThis, 'fetch');
    try {
      expect(() => createRdapClient()).toThrow('No Fetch implementation');
    } finally {
      globalThis.fetch = fetchImplementation;
    }
  });

  test('uses HEAD and maps only 404 to false', async () => {
    const statuses = [200, 404, 429];
    const harness = fetchHarness(() => {
      const status = statuses.shift() ?? 500;
      return jsonResponse(status === 429 ? { errorCode: 429, title: 'Slow down' } : {}, {
        status,
        ...(status === 429 ? { headers: { 'retry-after': '60' } } : {}),
      });
    });
    const client = createRdapClient({
      baseUrl: 'https://rdap.example.test/',
      fetch: harness.fetch,
    });

    await expect(client.exists('domain', 'example.test')).resolves.toBe(true);
    await expect(client.exists('domain', 'missing.test')).resolves.toBe(false);
    await expect(client.exists('domain', 'limited.test')).rejects.toMatchObject({
      retryAfter: '60',
      body: { errorCode: 429 },
    });
    expect(harness.calls.every(call => call.init?.method === 'HEAD')).toBe(true);
  });

  test('returns response metadata from direct requests with custom schemas', async () => {
    const harness = fetchHarness(() =>
      jsonResponse({ ok: true }, { headers: { 'x-rdap': 'yes' } })
    );
    const client = createRdapClient({ fetch: harness.fetch });
    const result = await client.request('https://rdap.example.test/custom', {
      schema: v.looseObject({ ok: v.boolean() }),
    });
    expect(result.data.ok).toBe(true);
    expect(result.response.headers.get('x-rdap')).toBe('yes');
  });

  test('uses the general RDAP schema for direct requests by default', async () => {
    const harness = fetchHarness(() => jsonResponse(domainResponse()));
    const result = await createRdapClient({ fetch: harness.fetch }).request(
      'https://rdap.example.test/domain/example.test'
    );
    expect(result.data).toMatchObject({ objectClassName: 'domain' });
    expect(harness.calls[0]?.init?.redirect).toBeUndefined();
  });

  test('exposes parsed HTTP errors and Retry-After without retrying', async () => {
    const harness = fetchHarness(() =>
      jsonResponse(
        { errorCode: 429, title: 'Rate limited' },
        {
          status: 429,
          headers: { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' },
        }
      )
    );
    const client = createRdapClient({
      baseUrl: 'https://rdap.example.test/',
      fetch: harness.fetch,
    });

    await expect(client.lookupDomain('example.test')).rejects.toBeInstanceOf(RdapHttpError);
    await expect(client.lookupDomain('example.test')).rejects.toMatchObject({
      body: { errorCode: 429, title: 'Rate limited' },
      retryAfter: 'Wed, 21 Oct 2026 07:28:00 GMT',
    });
    expect(harness.calls).toHaveLength(2);
  });

  test('supports HTTP errors without an RDAP body', async () => {
    const harness = fetchHarness(() => new Response('no details', { status: 403 }));
    const client = createRdapClient({
      baseUrl: 'https://rdap.example.test/',
      fetch: harness.fetch,
    });
    await expect(client.lookupDomain('example.test')).rejects.toMatchObject({
      body: undefined,
      response: { status: 403 },
    });
  });

  test('reports invalid JSON and invalid successful responses', async () => {
    const responses = [
      new Response('{', { status: 200 }),
      jsonResponse({ rdapConformance: ['rdap_level_0'] }),
    ];
    const harness = fetchHarness(() => responses.shift() ?? new Response());
    const client = createRdapClient({
      baseUrl: 'https://rdap.example.test/',
      fetch: harness.fetch,
    });
    await expect(client.lookupDomain('example.test')).rejects.toBeInstanceOf(RdapValidationError);
    await expect(client.lookupDomain('example.test')).rejects.toMatchObject({
      code: 'invalid-response',
    });
  });

  test('rejects malformed inputs before fetching', async () => {
    const harness = fetchHarness(() => jsonResponse(domainResponse()));
    const client = createRdapClient({
      baseUrl: 'https://rdap.example.test/',
      fetch: harness.fetch,
    });
    await expect(client.lookupIp('999.0.0.1')).rejects.toMatchObject({
      code: 'invalid-input',
    });
    await expect(client.lookupIp('192.0.2.1/33')).rejects.toMatchObject({
      code: 'invalid-input',
    });
    await expect(client.lookupAutnum('AS4294967296')).rejects.toMatchObject({
      code: 'invalid-input',
    });
    await expect(client.lookupEntity('   ')).rejects.toMatchObject({
      code: 'invalid-input',
    });
    await expect(client.lookupDomain('bad/name')).rejects.toMatchObject({
      code: 'invalid-input',
    });
    await expect(client.lookupDomain('[')).rejects.toMatchObject({
      code: 'invalid-input',
    });
    await expect(client.searchDomains({ name: '' })).rejects.toMatchObject({
      code: 'invalid-input',
    });
    // @ts-expect-error JS callers can still pass more than one field.
    await expect(client.searchDomains({ name: 'a*', nsIp: '192.0.2.1' })).rejects.toMatchObject({
      code: 'invalid-input',
    });
    expect(harness.calls).toHaveLength(0);
  });

  test.each([
    ['ip', '192.0.2.1'],
    ['autnum', 'AS64496'],
  ] as const)('normalizes %s values for HEAD requests', async (type, value) => {
    const harness = fetchHarness(() => new Response(null, { status: 200 }));
    const client = createRdapClient({
      baseUrl: 'https://rdap.example.test/',
      fetch: harness.fetch,
    });
    await expect(client.exists(type, value)).resolves.toBe(true);
  });

  test('rejects empty entity handles in HEAD requests', async () => {
    const client = createRdapClient({
      baseUrl: 'https://rdap.example.test/',
      fetch: fetchHarness(() => new Response()).fetch,
    });
    await expect(client.exists('entity', ' ')).rejects.toMatchObject({
      code: 'invalid-input',
    });
  });

  test('does not fail over an aborted lookup', async () => {
    const controller = new AbortController();
    const harness = fetchHarness(call => {
      if (call.url.hostname === 'data.iana.org') {
        return jsonResponse(
          bootstrap([[['test'], ['https://first.test/', 'https://second.test/']]]),
          { headers: freshHeaders }
        );
      }
      if (call.url.hostname === 'first.test') {
        controller.abort();
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      throw new Error('second candidate must not be requested');
    });
    const client = createRdapClient({ fetch: harness.fetch });
    await expect(
      client.lookupDomain('example.test', { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(harness.calls.map(call => call.url.hostname)).toEqual(['data.iana.org', 'first.test']);
  });

  test('does not start bootstrap when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const harness = fetchHarness(() => {
      throw new Error('fetch should not run');
    });
    await expect(
      createRdapClient({ fetch: harness.fetch }).lookupDomain('example.test', {
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(harness.calls).toHaveLength(0);
  });

  test('aborting one waiter does not cancel a shared bootstrap load', async () => {
    const controller = new AbortController();
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let started: (() => void) | undefined;
    const startedPromise = new Promise<void>(resolve => {
      started = resolve;
    });
    let bootstrapRequests = 0;
    const harness = fetchHarness(async call => {
      if (call.url.hostname === 'data.iana.org') {
        bootstrapRequests += 1;
        started?.();
        await gate;
        return jsonResponse(bootstrap([[['test'], ['https://rdap.test/']]]), {
          headers: freshHeaders,
        });
      }
      return jsonResponse(domainResponse());
    });
    const client = createRdapClient({ fetch: harness.fetch });
    const first = client.lookupDomain('one.test');
    await startedPromise;
    const second = client.lookupDomain('two.test', { signal: controller.signal });
    controller.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    release?.();
    await expect(first).resolves.toMatchObject({ objectClassName: 'domain' });
    expect(bootstrapRequests).toBe(1);
  });

  test('cancels an in-flight bootstrap fetch', async () => {
    const controller = new AbortController();
    let started: (() => void) | undefined;
    const startedPromise = new Promise<void>(resolve => {
      started = resolve;
    });
    const harness = fetchHarness(call => {
      const signal = call.init?.signal;
      started?.();
      if (signal == null) throw new Error('expected an abort signal');
      return new Promise<Response>((_, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            reject(
              signal.reason instanceof Error
                ? signal.reason
                : new DOMException('The operation was aborted.', 'AbortError')
            );
          },
          { once: true }
        );
      });
    });
    const lookup = createRdapClient({ fetch: harness.fetch }).lookupDomain('example.test', {
      signal: controller.signal,
    });
    await startedPromise;
    controller.abort();
    await expect(lookup).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('rejects non-HTTP direct request URLs', async () => {
    const harness = fetchHarness(() => jsonResponse(domainResponse()));
    const client = createRdapClient({ fetch: harness.fetch });
    await expect(client.request('file:///tmp/rdap')).rejects.toMatchObject({
      code: 'invalid-input',
    });
    await expect(client.request('/relative')).rejects.toMatchObject({
      code: 'invalid-input',
    });
    expect(harness.calls).toHaveLength(0);
  });
});
