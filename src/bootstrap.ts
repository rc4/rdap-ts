import * as v from 'valibot';
import CachePolicy from 'http-cache-semantics';
import { isAbortError, RdapError } from './errors';
import { containsIpResource, parseIpResource } from './ip';
import {
  RdapBootstrapRegistrySchema,
  RdapObjectTagBootstrapRegistrySchema,
  type RdapBootstrapRegistry,
  type RdapObjectTagBootstrapRegistry,
} from './schemas';

type BootstrapKind = 'dns' | 'ipv4' | 'ipv6' | 'asn' | 'object-tags';
type CoreBootstrapKind = Exclude<BootstrapKind, 'object-tags'>;

const IANA_BOOTSTRAP_URLS: Record<BootstrapKind, string> = {
  'dns': 'https://data.iana.org/rdap/dns.json',
  'ipv4': 'https://data.iana.org/rdap/ipv4.json',
  'ipv6': 'https://data.iana.org/rdap/ipv6.json',
  'asn': 'https://data.iana.org/rdap/asn.json',
  'object-tags': 'https://data.iana.org/rdap/object-tags.json',
};

type RegistryCacheEntry =
  | {
      kind: CoreBootstrapKind;
      data: RdapBootstrapRegistry;
      policy: CachePolicy;
    }
  | {
      kind: 'object-tags';
      data: RdapObjectTagBootstrapRegistry;
      policy: CachePolicy;
    };

const cacheHeaders = (headers: Headers): CachePolicy.Headers =>
  Object.fromEntries(headers.entries());

const bootstrapRequest = (kind: BootstrapKind): CachePolicy.HttpRequest => ({
  url: IANA_BOOTSTRAP_URLS[kind],
  method: 'GET',
  headers: { accept: 'application/json' },
});

const createCachePolicy = (request: CachePolicy.HttpRequest, response: Response): CachePolicy =>
  new CachePolicy(
    request,
    { status: response.status, headers: cacheHeaders(response.headers) },
    {
      shared: false,
      cacheHeuristic: 0,
      immutableMinTimeToLive: 0,
    }
  );

const fetchHeaders = (headers: CachePolicy.Headers): Headers => {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(name, item);
    } else if (value !== undefined) {
      result.set(name, value);
    }
  }
  return result;
};

const abortReason = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new DOMException('This operation was aborted.', 'AbortError');

const withSignal = async <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (signal === undefined) return promise;
  signal.throwIfAborted();
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        onAbort = () => {
          reject(abortReason(signal));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort !== undefined) signal.removeEventListener('abort', onAbort);
  }
};

const orderServiceUrls = (urls: readonly string[]): string[] => {
  const secure: string[] = [];
  const insecure: string[] = [];
  for (const value of urls) {
    try {
      const url = new URL(value);
      if (url.protocol === 'https:') secure.push(value);
      else if (url.protocol === 'http:') insecure.push(value);
    } catch {
      // Skip unusable registry URLs.
    }
  }
  return [...secure, ...insecure];
};

export const normalizeDomain = (input: string): string => {
  const trimmed = input.trim();
  const value = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
  if (value === '' || value.endsWith('.') || /[/?#@]/.test(value)) {
    throw new RdapError('invalid-input', `Invalid domain name: ${input}`);
  }

  try {
    const url = new URL(`https://${value}`);
    if (url.hostname === '' || url.port !== '') throw new Error('Invalid host');
    const normalized = url.hostname.toLowerCase().replace(/\.$/, '');
    const labels = normalized.split('.');
    if (
      normalized.length > 253
      || labels.some(label => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))
    ) {
      throw new Error('Invalid DNS label');
    }
    return normalized;
  } catch (cause) {
    throw new RdapError('invalid-input', `Invalid domain name: ${input}`, {
      cause,
    });
  }
};

export const normalizeAutnum = (input: number | string): number => {
  let value: number;
  if (typeof input === 'number') {
    value = input;
  } else {
    const normalized = input.trim();
    if (!/^(?:as)?\d+$/i.test(normalized)) {
      throw new RdapError('invalid-input', `Invalid autonomous system: ${input}`);
    }
    value = Number(normalized.replace(/^as/i, ''));
  }
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RdapError('invalid-input', `Invalid autonomous system: ${String(input)}`);
  }
  return value;
};

export class BootstrapResolver {
  readonly #fetch: typeof globalThis.fetch;
  readonly #cache = new Map<BootstrapKind, RegistryCacheEntry>();
  readonly #inflight = new Map<
    BootstrapKind,
    Promise<RdapBootstrapRegistry | RdapObjectTagBootstrapRegistry>
  >();

  constructor(fetchImplementation: typeof globalThis.fetch) {
    this.#fetch = fetchImplementation;
  }

  async #send(kind: BootstrapKind, headers: Headers, signal?: AbortSignal): Promise<Response> {
    signal?.throwIfAborted();
    try {
      return await this.#fetch(IANA_BOOTSTRAP_URLS[kind], {
        headers,
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (cause) {
      if (isAbortError(cause) || signal?.aborted === true) throw cause;
      throw new RdapError(
        'bootstrap-failure',
        `Unable to fetch the IANA ${kind} bootstrap registry`,
        { cause }
      );
    }
  }

  async #fetchRegistry(
    kind: BootstrapKind,
    signal?: AbortSignal
  ): Promise<RdapBootstrapRegistry | RdapObjectTagBootstrapRegistry> {
    const previous = this.#cache.get(kind);
    const request = bootstrapRequest(kind);
    if (previous?.policy.satisfiesWithoutRevalidation(request) === true) {
      return previous.data;
    }

    const revalidationHeaders = previous?.policy.revalidationHeaders(request) ?? request.headers;
    const headers = fetchHeaders(revalidationHeaders);
    const revalidationRequest = {
      ...request,
      headers: cacheHeaders(headers),
    };

    let response = await this.#send(kind, headers, signal);

    if (response.status === 304) {
      if (previous !== undefined) {
        const { policy, matches, modified } = previous.policy.revalidatedPolicy(
          revalidationRequest,
          {
            status: response.status,
            headers: cacheHeaders(response.headers),
          }
        );
        if (matches && !modified) {
          this.#store({ ...previous, policy });
          return previous.data;
        }
      }
      response = await this.#send(kind, fetchHeaders(request.headers), signal);
    }

    if (!response.ok) {
      throw new RdapError(
        'bootstrap-failure',
        `IANA ${kind} bootstrap request failed with HTTP ${String(response.status)}`
      );
    }

    let input: unknown;
    try {
      input = await response.json();
    } catch (cause) {
      throw new RdapError(
        'bootstrap-failure',
        `IANA ${kind} bootstrap registry was not valid JSON`,
        { cause }
      );
    }

    const policy = createCachePolicy(request, response);

    if (kind === 'object-tags') {
      const result = v.safeParse(RdapObjectTagBootstrapRegistrySchema, input);
      if (!result.success) {
        throw new RdapError(
          'bootstrap-failure',
          'IANA object-tags bootstrap registry had an invalid structure'
        );
      }
      this.#store({ kind, data: result.output, policy });
      return result.output;
    }

    const result = v.safeParse(RdapBootstrapRegistrySchema, input);
    if (!result.success) {
      throw new RdapError(
        'bootstrap-failure',
        `IANA ${kind} bootstrap registry had an invalid structure`
      );
    }
    this.#store({ kind, data: result.output, policy });
    return result.output;
  }

  #store(entry: RegistryCacheEntry): void {
    if (entry.policy.storable()) this.#cache.set(entry.kind, entry);
    else this.#cache.delete(entry.kind);
  }

  async #load(kind: CoreBootstrapKind, signal?: AbortSignal): Promise<RdapBootstrapRegistry>;
  async #load(kind: 'object-tags', signal?: AbortSignal): Promise<RdapObjectTagBootstrapRegistry>;
  async #load(
    kind: BootstrapKind,
    signal?: AbortSignal
  ): Promise<RdapBootstrapRegistry | RdapObjectTagBootstrapRegistry> {
    signal?.throwIfAborted();
    const active = this.#inflight.get(kind);
    if (active !== undefined) return withSignal(active, signal);
    const request = this.#fetchRegistry(kind, signal).finally(() => {
      this.#inflight.delete(kind);
    });
    this.#inflight.set(kind, request);
    return request;
  }

  async domain(name: string, signal?: AbortSignal): Promise<string[]> {
    const domain = normalizeDomain(name);
    const registry = await this.#load('dns', signal);

    let bestLabels = -1;
    let matches: string[] = [];
    for (const [entries, urls] of registry.services) {
      for (const entry of entries) {
        const suffix = entry.toLowerCase();
        const matchesEntry = suffix === '' || domain === suffix || domain.endsWith(`.${suffix}`);
        if (!matchesEntry) continue;
        const labels = suffix === '' ? 0 : suffix.split('.').length;
        if (labels > bestLabels) {
          bestLabels = labels;
          matches = [...urls];
        } else if (labels === bestLabels) {
          matches.push(...urls);
        }
      }
    }
    return orderServiceUrls(matches);
  }

  async ip(input: string, signal?: AbortSignal): Promise<string[]> {
    const target = parseIpResource(input);
    const kind = target.version === 4 ? 'ipv4' : 'ipv6';
    const registry = await this.#load(kind, signal);

    let bestPrefix = -1;
    let matches: string[] = [];
    for (const [entries, urls] of registry.services) {
      for (const entry of entries) {
        let range;
        try {
          range = parseIpResource(entry);
        } catch {
          continue;
        }
        if (!containsIpResource(range, target)) continue;
        if (range.prefixLength > bestPrefix) {
          bestPrefix = range.prefixLength;
          matches = [...urls];
        } else if (range.prefixLength === bestPrefix) {
          matches.push(...urls);
        }
      }
    }
    return orderServiceUrls(matches);
  }

  async autnum(input: number | string, signal?: AbortSignal): Promise<string[]> {
    const autnum = normalizeAutnum(input);
    const registry = await this.#load('asn', signal);

    const matches: string[] = [];
    for (const [entries, urls] of registry.services) {
      for (const entry of entries) {
        const range = /^(\d+)-(\d+)$/.exec(entry);
        if (range === null) continue;
        const start = Number(range[1]);
        const end = Number(range[2]);
        if (autnum >= start && autnum <= end) matches.push(...urls);
      }
    }
    return orderServiceUrls(matches);
  }

  async entity(handle: string, signal?: AbortSignal): Promise<string[]> {
    const separator = handle.lastIndexOf('-');
    const tag = separator === -1 ? '' : handle.slice(separator + 1);
    if (!/^[a-z\d]{1,8}$/i.test(tag)) return [];

    const registry = await this.#load('object-tags', signal);
    const matches: string[] = [];
    for (const [, tags, urls] of registry.services) {
      if (tags.some(candidate => candidate.toUpperCase() === tag.toUpperCase())) {
        matches.push(...urls);
      }
    }
    return orderServiceUrls(matches);
  }
}
