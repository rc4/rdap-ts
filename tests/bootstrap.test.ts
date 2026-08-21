import { describe, expect, test } from '@rstest/core';
import { createRdapClient, RdapHttpError } from '../src/index';
import {
  bootstrap,
  fetchHarness,
  ianaHarness,
  ianaJson,
  jsonResponse,
  rdapResponse,
} from './helpers';

const hostLookup = (objectClassName: string) => (call: { url: URL }) =>
  rdapResponse(objectClassName, { server: call.url.hostname });

describe('IANA bootstrap discovery', () => {
  test('uses the longest domain match and prefers HTTPS candidates', async () => {
    const harness = ianaHarness(
      [
        [['test'], ['http://tld.test/rdap', 'https://secure-tld.test/rdap']],
        [
          ['example.test'],
          [
            'http://specific-a.test/root',
            'https://specific-a.test/root',
            'https://specific-b.test/root',
          ],
        ],
      ],
      hostLookup('domain')
    );

    const result = await createRdapClient({
      fetch: harness.fetch,
    }).lookupDomain('WWW.Example.Test.');

    expect(result.server).toBe('specific-a.test');
    expect(harness.calls.map(call => call.url.hostname)).toEqual([
      'data.iana.org',
      'specific-a.test',
    ]);
    expect(harness.calls[1]?.url.pathname).toBe('/root/domain/www.example.test');
  });

  test('deduplicates concurrent registry loads and honors fresh cache entries', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let bootstrapRequests = 0;
    const harness = ianaHarness(async () => {
      bootstrapRequests += 1;
      await gate;
      return ianaJson(bootstrap([[['test'], ['https://rdap.test/']]]));
    });
    const client = createRdapClient({ fetch: harness.fetch });

    const first = client.lookupDomain('first.test');
    const second = client.lookupDomain('second.test');
    release?.();
    await Promise.all([first, second]);
    await client.lookupDomain('third.test');

    expect(bootstrapRequests).toBe(1);
    expect(harness.calls.filter(call => call.url.hostname === 'rdap.test')).toHaveLength(3);
  });

  test('conditionally revalidates stale registries and reuses 304 data', async () => {
    let bootstrapRequests = 0;
    const harness = ianaHarness(call => {
      bootstrapRequests += 1;
      if (bootstrapRequests === 1) {
        return ianaJson(bootstrap([[['test'], ['https://rdap.test/']]]), {
          'cache-control': 'max-age=0',
          'etag': '"dns-v1"',
        });
      }
      expect(new Headers(call.init?.headers).get('if-none-match')).toBe('"dns-v1"');
      return new Response(null, {
        status: 304,
        headers: {
          'cache-control': 'max-age=3600',
          'etag': '"dns-v1"',
        },
      });
    });
    const client = createRdapClient({ fetch: harness.fetch });

    await client.lookupDomain('one.test');
    await client.lookupDomain('two.test');
    await client.lookupDomain('three.test');

    expect(bootstrapRequests).toBe(2);
  });

  test('does not store registries forbidden by Cache-Control', async () => {
    let bootstrapRequests = 0;
    const harness = ianaHarness(() => {
      bootstrapRequests += 1;
      return ianaJson(bootstrap([[['test'], ['https://rdap.test/']]]), {
        'cache-control': 'no-store',
      });
    });
    const client = createRdapClient({ fetch: harness.fetch });

    await client.lookupDomain('one.test');
    await client.lookupDomain('two.test');

    expect(bootstrapRequests).toBe(2);
  });

  test('retries unconditionally when a 304 cannot be used', async () => {
    let bootstrapRequests = 0;
    const harness = ianaHarness(call => {
      bootstrapRequests += 1;
      if (bootstrapRequests === 1) {
        return ianaJson(bootstrap([[['test'], ['https://rdap.test/']]]), {
          'cache-control': 'max-age=0',
          'etag': '"dns-v1"',
        });
      }
      if (bootstrapRequests === 2) {
        expect(new Headers(call.init?.headers).get('if-none-match')).toBe('"dns-v1"');
        return new Response(null, {
          status: 304,
          headers: { 'cache-control': 'max-age=3600' },
        });
      }
      expect(new Headers(call.init?.headers).has('if-none-match')).toBe(false);
      return ianaJson(bootstrap([[['test'], ['https://rdap.test/']]]));
    });
    const client = createRdapClient({ fetch: harness.fetch });

    await client.lookupDomain('one.test');
    await client.lookupDomain('two.test');

    expect(bootstrapRequests).toBe(3);
  });

  test('uses the empty-string DNS catch-all when no suffix matches', async () => {
    const harness = ianaHarness(
      [
        [[''], ['https://iana.test/']],
        [['test'], ['https://tld.test/']],
      ],
      hostLookup('domain')
    );
    const client = createRdapClient({ fetch: harness.fetch });

    await expect(client.lookupDomain('example.test')).resolves.toMatchObject({
      server: 'tld.test',
    });
    await expect(client.lookupDomain('example.com')).resolves.toMatchObject({
      server: 'iana.test',
    });
  });

  test('combines equal-specificity services in registry order', async () => {
    const harness = ianaHarness(
      [
        [['test'], ['https://unavailable.test/']],
        [['test'], ['https://available.test/']],
      ],
      call => {
        if (call.url.hostname === 'unavailable.test') throw new TypeError('offline');
        return rdapResponse('domain', { server: call.url.hostname });
      }
    );
    await expect(
      createRdapClient({ fetch: harness.fetch }).lookupDomain('example.test')
    ).resolves.toMatchObject({ server: 'available.test' });
  });

  test.each([
    [
      'IPv4',
      '10.1.2.7',
      [
        [['10.0.0.0/8'], ['https://broad.test/']],
        [['10.1.2.0/24'], ['https://specific.test/']],
      ],
      'specific.test',
    ],
    [
      'compressed IPv6 CIDR',
      '2001:db8:1234::/48',
      [
        [['2001:db8::/32'], ['https://v6.test/']],
        [['2001::/16'], ['https://broad.test/']],
      ],
      'v6.test',
    ],
  ] as const)(
    'uses the longest containing %s prefix',
    async (_label, input, services, expectedHost) => {
      const harness = ianaHarness(services, hostLookup('ip network'));
      const result = await createRdapClient({ fetch: harness.fetch }).lookupIp(input);
      expect(result.server).toBe(expectedHost);
    }
  );

  test.each(['AS64500', '64510', 64520])(
    'matches inclusive ASN range boundaries for %s',
    async autnum => {
      const harness = ianaHarness([[['64500-64520'], ['https://asn.test/']]], () =>
        rdapResponse('autnum', { handle: String(autnum) })
      );

      await expect(
        createRdapClient({ fetch: harness.fetch }).lookupAutnum(autnum)
      ).resolves.toMatchObject({ objectClassName: 'autnum' });
    }
  );

  test.each(['AS', 'AS 64500', '1e3', '0x10', '', -1, 0x1_0000_0000])(
    'rejects malformed ASN input %s before discovery',
    async autnum => {
      const harness = fetchHarness(() => {
        throw new Error('fetch should not run');
      });
      await expect(
        createRdapClient({ fetch: harness.fetch }).lookupAutnum(autnum)
      ).rejects.toMatchObject({ code: 'invalid-input' });
      expect(harness.calls).toHaveLength(0);
    }
  );

  test.each([
    'foo..test',
    '-foo.test',
    'foo-.test',
    'foo_bar.test',
    'example.test..',
    'example.test:8443',
    `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}`,
  ])('rejects malformed domain input %s before discovery', async domain => {
    const harness = fetchHarness(() => {
      throw new Error('fetch should not run');
    });
    await expect(
      createRdapClient({ fetch: harness.fetch }).lookupDomain(domain)
    ).rejects.toMatchObject({ code: 'invalid-input' });
    expect(harness.calls).toHaveLength(0);
  });

  test('matches the final tagged-handle suffix case-insensitively', async () => {
    const harness = ianaHarness(
      () =>
        ianaJson({
          ...bootstrap([]),
          services: [
            [['American Registry for Internet Numbers'], ['ARIN'], ['https://entities.test/rdap']],
          ],
        }),
      () => rdapResponse('entity', { handle: 'NET-ABC-123-arin' })
    );

    const client = createRdapClient({ fetch: harness.fetch });
    await expect(client.lookupEntity('NET-ABC-123-arin')).resolves.toMatchObject({
      handle: 'NET-ABC-123-arin',
    });
    expect(harness.calls[1]?.url.pathname).toBe('/rdap/entity/NET-ABC-123-arin');
  });

  test('combines equal IP prefixes and skips malformed registry ranges', async () => {
    const harness = ianaHarness(
      [
        [['not-a-prefix', '192.0.2.0/24'], ['https://unavailable.test/']],
        [['192.0.2.0/24'], ['https://available.test/']],
      ],
      call => {
        if (call.url.hostname === 'unavailable.test') throw new TypeError('offline');
        return rdapResponse('ip network', { server: call.url.hostname });
      }
    );
    await expect(
      createRdapClient({ fetch: harness.fetch }).lookupIp('192.0.2.7')
    ).resolves.toMatchObject({ server: 'available.test' });
  });

  test('reports missing matches and avoids discovery for untagged entities', async () => {
    const harness = ianaHarness([[['com'], ['https://rdap.test/']]], () => jsonResponse({}));
    const client = createRdapClient({ fetch: harness.fetch });

    await expect(client.lookupDomain('example.test')).rejects.toMatchObject({
      code: 'bootstrap-not-found',
    });
    await expect(client.lookupEntity('UNTAGGED')).rejects.toMatchObject({
      code: 'base-url-required',
    });
    expect(harness.calls).toHaveLength(1);
  });
});

describe('bootstrap candidate handling', () => {
  test('exists failovers after a 5xx response', async () => {
    const harness = ianaHarness(
      [[['test'], ['https://first.test/', 'https://second.test/']]],
      call =>
        call.url.hostname === 'first.test'
          ? new Response(null, { status: 503 })
          : new Response(null, { status: 200 })
    );

    await expect(
      createRdapClient({ fetch: harness.fetch }).exists('domain', 'example.test')
    ).resolves.toBe(true);
    expect(harness.calls.map(call => call.url.hostname)).toEqual([
      'data.iana.org',
      'first.test',
      'second.test',
    ]);
    expect(harness.calls.slice(1).every(call => call.init?.method === 'HEAD')).toBe(true);
  });

  test.each(['network', 'server'])('fails over after a %s failure', async kind => {
    const harness = ianaHarness(
      [[['test'], ['https://first.test/', 'https://second.test/']]],
      call => {
        if (call.url.hostname === 'first.test') {
          if (kind === 'network') throw new TypeError('connection reset');
          return jsonResponse({ errorCode: 503 }, { status: 503 });
        }
        return rdapResponse('domain', { server: call.url.hostname });
      }
    );

    await expect(
      createRdapClient({ fetch: harness.fetch }).lookupDomain('example.test')
    ).resolves.toMatchObject({ server: 'second.test' });
  });

  test('surfaces 4xx responses without trying another candidate', async () => {
    const harness = ianaHarness([[['test'], ['https://first.test/', 'https://second.test/']]], () =>
      jsonResponse({ errorCode: 429 }, { status: 429 })
    );

    await expect(
      createRdapClient({ fetch: harness.fetch }).lookupDomain('example.test')
    ).rejects.toBeInstanceOf(RdapHttpError);
    expect(harness.calls.map(call => call.url.hostname)).toEqual(['data.iana.org', 'first.test']);
  });

  test('keeps bootstrap caches isolated between client instances', async () => {
    let bootstrapRequests = 0;
    const harness = ianaHarness(() => {
      bootstrapRequests += 1;
      return ianaJson(bootstrap([[['test'], ['https://rdap.test/']]]));
    });

    await createRdapClient({ fetch: harness.fetch }).lookupDomain('one.test');
    await createRdapClient({ fetch: harness.fetch }).lookupDomain('two.test');
    expect(bootstrapRequests).toBe(2);
  });

  test('turns malformed bootstrap documents into stable errors', async () => {
    const harness = fetchHarness(() => jsonResponse({ services: 'invalid' }));
    await expect(
      createRdapClient({ fetch: harness.fetch }).lookupDomain('example.test')
    ).rejects.toMatchObject({ code: 'bootstrap-failure' });
  });

  test.each([
    ['network failure', () => Promise.reject(new TypeError('offline'))],
    ['HTTP failure', () => new Response(null, { status: 503 })],
    ['invalid JSON', () => new Response('{', { status: 200 })],
  ])('reports bootstrap %s with a stable code', async (_label, response) => {
    const harness = fetchHarness(response);
    await expect(
      createRdapClient({ fetch: harness.fetch }).lookupDomain('example.test')
    ).rejects.toMatchObject({ code: 'bootstrap-failure' });
  });

  test('rejects malformed object-tag registries', async () => {
    const harness = fetchHarness(() =>
      jsonResponse({ ...bootstrap([]), services: [[['provider'], ['TAG']]] })
    );
    await expect(
      createRdapClient({ fetch: harness.fetch }).lookupEntity('ABC-TAG')
    ).rejects.toMatchObject({ code: 'bootstrap-failure' });
  });

  test('ignores malformed candidate URLs', async () => {
    const harness = ianaHarness([[['test'], ['ftp://ignored.test', 'not a URL']]]);
    await expect(
      createRdapClient({ fetch: harness.fetch }).lookupDomain('example.test')
    ).rejects.toMatchObject({ code: 'bootstrap-not-found' });
  });
});
