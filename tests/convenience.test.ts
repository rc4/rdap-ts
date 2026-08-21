import { afterAll, beforeAll, describe, expect, test } from '@rstest/core';
import * as v from 'valibot';
import {
  exists,
  getHelp,
  lookupAutnum,
  lookupDomain,
  lookupEntity,
  lookupIp,
  lookupNameserver,
  request,
  searchDomains,
  searchEntities,
  searchNameservers,
} from '../src/index';
import { bootstrap, fetchHarness, ianaJson, jsonResponse, rdapObject } from './helpers';

const originalFetch = globalThis.fetch;
let bootstrapRequests = 0;

const searchBodies: Record<string, unknown> = {
  '/custom': { ok: true },
  '/help': { rdapConformance: ['rdap_level_0'] },
  '/domains': { rdapConformance: ['rdap_level_0'], domainSearchResults: [] },
  '/nameservers': { rdapConformance: ['rdap_level_0'], nameserverSearchResults: [] },
  '/entities': { rdapConformance: ['rdap_level_0'], entitySearchResults: [] },
};

const objectClassForPath = (path: string): string => {
  if (path.includes('/domain/')) return 'domain';
  if (path.includes('/ip/')) return 'ip network';
  if (path.includes('/autnum/')) return 'autnum';
  if (path.includes('/nameserver/')) return 'nameserver';
  return 'entity';
};

const harness = fetchHarness(call => {
  if (call.url.hostname === 'data.iana.org') {
    bootstrapRequests += 1;
    return ianaJson(bootstrap([[['test'], ['https://rdap.test/']]]));
  }
  if (call.init?.method === 'HEAD') return new Response(null, { status: 200 });
  const path = call.url.pathname;
  const body = Object.entries(searchBodies).find(([suffix]) => path.endsWith(suffix))?.[1];
  if (body !== undefined) return jsonResponse(body);
  return jsonResponse(rdapObject(objectClassForPath(path)));
});

beforeAll(() => {
  globalThis.fetch = harness.fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('module-level convenience API', () => {
  const baseUrl = 'https://rdap.example.test/';

  test('shares one lazily created client and bootstrap cache', async () => {
    await expect(lookupDomain('one.test')).resolves.toMatchObject({ objectClassName: 'domain' });
    await expect(lookupDomain('two.test')).resolves.toMatchObject({ objectClassName: 'domain' });
    expect(bootstrapRequests).toBe(1);
  });

  test('exposes every high-level operation', async () => {
    await expect(lookupDomain('example.test', { baseUrl })).resolves.toMatchObject({
      objectClassName: 'domain',
    });
    await expect(lookupIp('192.0.2.1', { baseUrl })).resolves.toMatchObject({
      objectClassName: 'ip network',
    });
    await expect(lookupAutnum(64496, { baseUrl })).resolves.toMatchObject({
      objectClassName: 'autnum',
    });
    await expect(lookupNameserver('ns1.example.test', { baseUrl })).resolves.toMatchObject({
      objectClassName: 'nameserver',
    });
    await expect(lookupEntity('ABC', { baseUrl })).resolves.toMatchObject({
      objectClassName: 'entity',
    });
    await expect(searchDomains({ name: 'example*' }, { baseUrl })).resolves.toMatchObject({
      domainSearchResults: [],
    });
    await expect(searchNameservers({ name: 'ns*' }, { baseUrl })).resolves.toMatchObject({
      nameserverSearchResults: [],
    });
    await expect(searchEntities({ handle: 'ABC*' }, { baseUrl })).resolves.toMatchObject({
      entitySearchResults: [],
    });
    await expect(getHelp({ baseUrl })).resolves.toMatchObject({
      rdapConformance: ['rdap_level_0'],
    });
    await expect(exists('entity', 'ABC', { baseUrl })).resolves.toBe(true);
  });

  test('supports direct requests with an inferred custom schema', async () => {
    const result = await request('https://rdap.example.test/custom', {
      schema: v.object({ ok: v.boolean() }),
    });
    expect(result.data.ok).toBe(true);
  });
});
