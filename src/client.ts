import * as v from 'valibot';
import { BootstrapResolver, normalizeAutnum, normalizeDomain } from './bootstrap';
import { isAbortError, RdapError, RdapHttpError, RdapValidationError } from './errors';
import { parseIpResource } from './ip';
import {
  RdapAutnumSchema,
  RdapDomainSchema,
  RdapDomainSearchResultsSchema,
  RdapEntitySchema,
  RdapEntitySearchResultsSchema,
  RdapErrorResponseSchema,
  RdapHelpSchema,
  RdapIpNetworkSchema,
  RdapNameserverSchema,
  RdapNameserverSearchResultsSchema,
  RdapResponseSchema,
  type RdapAutnum,
  type RdapDomain,
  type RdapDomainSearchResults,
  type RdapEntity,
  type RdapEntitySearchResults,
  type RdapHelp,
  type RdapIpNetwork,
  type RdapNameserver,
  type RdapNameserverSearchResults,
} from './schemas';

/** Defaults applied to every request from this client. */
export interface RdapClientOptions {
  /** Fetch implementation. Defaults to {@link globalThis.fetch}. */
  fetch?: typeof globalThis.fetch;
  /** Default RDAP server when a call does not pass `baseUrl`. */
  baseUrl?: string | URL;
  /** Headers included on every request. Per-call headers override these. */
  headers?: HeadersInit;
}

/** Overrides for a single operation. */
export interface RdapRequestOptions {
  /** Server for this call. Takes precedence over the client default. */
  baseUrl?: string | URL;
  /** Extra headers for this call. */
  headers?: HeadersInit;
  /** Cancels IANA bootstrap and the RDAP request. */
  signal?: AbortSignal;
}

/** Options for {@link RdapClient.request} against an already-built URL. */
export interface RdapDirectRequestOptions<
  Schema extends v.GenericSchema = typeof RdapResponseSchema,
> {
  /** Extra headers for this call. */
  headers?: HeadersInit;
  /** Cancels the request. */
  signal?: AbortSignal;
  /** Schema used to validate the JSON body. Defaults to {@link RdapResponseSchema}. */
  schema?: Schema;
}

/** Validated RDAP data together with the Fetch `Response` it came from. */
export interface RdapResult<Data> {
  /** Parsed and validated JSON body. */
  data: Data;
  /** Final Fetch `Response`, after redirects. */
  response: Response;
}

/** Exactly one domain-search criterion. */
export type RdapDomainSearch =
  | { name: string; nsLdhName?: never; nsIp?: never }
  | { name?: never; nsLdhName: string; nsIp?: never }
  | { name?: never; nsLdhName?: never; nsIp: string };

/** Exactly one nameserver-search criterion. */
export type RdapNameserverSearch = { name: string; ip?: never } | { name?: never; ip: string };

/** Exactly one entity-search criterion. */
export type RdapEntitySearch = { fn: string; handle?: never } | { fn?: never; handle: string };

/** Resource class for lookup and {@link RdapClient.exists}. */
export type RdapLookupType = 'domain' | 'ip' | 'autnum' | 'nameserver' | 'entity';

type LookupValue = string | number;

/**
 * Fetch-based RDAP client.
 *
 * Server selection is per-call `baseUrl`, then the client default, then IANA
 * bootstrap. Nameserver lookups, searches, and help always need an explicit
 * server. Methods reject with {@link RdapError}, {@link RdapHttpError}, or
 * {@link RdapValidationError}.
 */
export interface RdapClient {
  /**
   * Look up a domain after converting it to a lowercase A-label.
   * @param name Domain name. One trailing dot is allowed.
   * @param options Per-request overrides and abort signal.
   * @returns The parsed domain object.
   */
  lookupDomain(name: string, options?: RdapRequestOptions): Promise<RdapDomain>;
  /**
   * Look up an IPv4 address, IPv6 address, or CIDR prefix.
   * @param addressOrCidr Address or CIDR to look up.
   * @param options Per-request overrides and abort signal.
   * @returns The parsed IP network object.
   */
  lookupIp(addressOrCidr: string, options?: RdapRequestOptions): Promise<RdapIpNetwork>;
  /**
   * Look up an autonomous system number in asplain form.
   * @param autnum Unsigned 32-bit number, asplain string, or `AS`-prefixed string.
   * @param options Per-request overrides and abort signal.
   * @returns The parsed autnum object.
   */
  lookupAutnum(autnum: number | string, options?: RdapRequestOptions): Promise<RdapAutnum>;
  /**
   * Look up a nameserver. Requires an explicit `baseUrl`.
   * @param name Nameserver domain name.
   * @param options Per-request overrides, including the server.
   * @returns The parsed nameserver object.
   */
  lookupNameserver(name: string, options?: RdapRequestOptions): Promise<RdapNameserver>;
  /**
   * Look up an entity by handle. Registered provider tags can be bootstrapped.
   * @param handle Entity handle.
   * @param options Per-request overrides and abort signal.
   * @returns The parsed entity object.
   */
  lookupEntity(handle: string, options?: RdapRequestOptions): Promise<RdapEntity>;
  /**
   * Search domains on an explicit RDAP server.
   * @param search Exactly one search criterion.
   * @param options Per-request overrides, including the server.
   * @returns Domain search results.
   */
  searchDomains(
    search: RdapDomainSearch,
    options?: RdapRequestOptions
  ): Promise<RdapDomainSearchResults>;
  /**
   * Search nameservers on an explicit RDAP server.
   * @param search Exactly one search criterion.
   * @param options Per-request overrides, including the server.
   * @returns Nameserver search results.
   */
  searchNameservers(
    search: RdapNameserverSearch,
    options?: RdapRequestOptions
  ): Promise<RdapNameserverSearchResults>;
  /**
   * Search entities on an explicit RDAP server.
   * @param search Exactly one search criterion.
   * @param options Per-request overrides, including the server.
   * @returns Entity search results.
   */
  searchEntities(
    search: RdapEntitySearch,
    options?: RdapRequestOptions
  ): Promise<RdapEntitySearchResults>;
  /**
   * Fetch help from an explicit RDAP server.
   * @param options Per-request overrides, including the server.
   * @returns The parsed help object.
   */
  getHelp(options?: RdapRequestOptions): Promise<RdapHelp>;
  /**
   * Check whether a resource exists by sending `HEAD`.
   * @param type RDAP resource class.
   * @param value Identifier appropriate for `type`.
   * @param options Per-request overrides and abort signal.
   * @returns `true` on success, `false` only for HTTP 404.
   */
  exists(type: RdapLookupType, value: LookupValue, options?: RdapRequestOptions): Promise<boolean>;
  /**
   * GET an absolute HTTP or HTTPS URL and validate the JSON body.
   * @template Schema Schema used to type `data`.
   * @param url Absolute HTTP or HTTPS URL.
   * @param options Headers, abort signal, and optional schema.
   * @returns Parsed body and the originating Fetch `Response`.
   */
  request<Schema extends v.GenericSchema = typeof RdapResponseSchema>(
    url: string | URL,
    options?: RdapDirectRequestOptions<Schema>
  ): Promise<RdapResult<v.InferOutput<Schema>>>;
}

const parseHttpUrl = (input: string | URL, what: string): URL => {
  let url: URL;
  try {
    url = new URL(input);
  } catch (cause) {
    throw new RdapError('invalid-input', `${what} must be an absolute HTTP or HTTPS URL`, {
      cause,
    });
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new RdapError('invalid-input', `${what} must use HTTP or HTTPS`);
  }
  return url;
};

const normalizedBaseUrl = (input: string | URL): URL => {
  const url = parseHttpUrl(input, 'RDAP base URL');
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
};

const pathSegment = (value: string): string =>
  encodeURIComponent(value).replaceAll('%3A', ':').replaceAll('%2A', '*');

const lookupUrl = (baseUrl: string | URL, type: RdapLookupType, value: string): URL => {
  const url = normalizedBaseUrl(baseUrl);
  const pieces = type === 'ip' ? value.split('/').map(pathSegment) : [pathSegment(value)];
  url.pathname += `${type}/${pieces.join('/')}`;
  return url;
};

const contextUrl = (baseUrl: string | URL, path: string): URL => {
  const url = normalizedBaseUrl(baseUrl);
  url.pathname += path;
  return url;
};

const searchEntry = (
  input: Record<string, string | undefined>,
  allowed: readonly string[]
): [string, string] => {
  const entries = Object.entries(input).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  );
  const selected = entries[0];
  if (
    entries.length !== 1
    || selected === undefined
    || !allowed.includes(selected[0])
    || selected[1].trim() === ''
  ) {
    throw new RdapError('invalid-input', 'Search needs exactly one non-empty field');
  }
  return selected;
};

class RdapClientImplementation implements RdapClient {
  readonly #fetch: typeof globalThis.fetch;
  readonly #baseUrl: URL | undefined;
  readonly #headers: Headers;
  readonly #bootstrap: BootstrapResolver;

  constructor(options: RdapClientOptions) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== 'function') {
      throw new RdapError('invalid-input', 'No Fetch implementation available');
    }
    this.#baseUrl = options.baseUrl === undefined ? undefined : normalizedBaseUrl(options.baseUrl);
    this.#headers = new Headers(options.headers);
    this.#bootstrap = new BootstrapResolver(this.#fetch);
  }

  #requestHeaders(options?: RdapRequestOptions): Headers {
    const headers = new Headers(this.#headers);
    new Headers(options?.headers).forEach((value, key) => {
      headers.set(key, value);
    });
    if (!headers.has('accept')) {
      headers.set('accept', 'application/rdap+json, application/json');
    }
    return headers;
  }

  #explicitBaseUrl(options?: RdapRequestOptions): URL | undefined {
    if (options?.baseUrl !== undefined) return normalizedBaseUrl(options.baseUrl);
    return this.#baseUrl;
  }

  #requiredBaseUrl(operation: string, options?: RdapRequestOptions): URL {
    const baseUrl = this.#explicitBaseUrl(options);
    if (baseUrl === undefined) {
      throw new RdapError('base-url-required', `${operation} needs a base URL`);
    }
    return baseUrl;
  }

  async #errorFor(response: Response): Promise<RdapHttpError> {
    let body;
    try {
      const input: unknown = await response.clone().json();
      const result = v.safeParse(RdapErrorResponseSchema, input);
      if (result.success) body = result.output;
    } catch {
      // Body is optional.
    }
    return new RdapHttpError(response, body);
  }

  async #parse<Schema extends v.GenericSchema>(
    response: Response,
    schema: Schema
  ): Promise<v.InferOutput<Schema>> {
    let input: unknown;
    try {
      input = await response.json();
    } catch (cause) {
      throw new RdapValidationError(response, [], { cause });
    }

    const result = v.safeParse(schema, input);
    if (!result.success) {
      throw new RdapValidationError(response, result.issues);
    }
    return result.output;
  }

  async #fetchResponse(url: URL, options?: RdapRequestOptions, method?: 'HEAD'): Promise<Response> {
    options?.signal?.throwIfAborted();
    try {
      return await this.#fetch(url, {
        headers: this.#requestHeaders(options),
        ...(method === undefined ? {} : { method }),
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch (cause) {
      if (isAbortError(cause) || options?.signal?.aborted === true) throw cause;
      throw new RdapError('network-failure', `Unable to fetch ${url.href}`, {
        cause,
      });
    }
  }

  async #tryCandidates<T>(
    candidates: readonly string[],
    value: string,
    options: RdapRequestOptions | undefined,
    urlFor: (candidate: string) => URL,
    onResponse: (response: Response) => Promise<T>,
    method?: 'HEAD'
  ): Promise<T> {
    if (candidates.length === 0) {
      throw new RdapError(
        'bootstrap-not-found',
        `No authoritative RDAP service was found for ${value}`
      );
    }

    let lastFailure: RdapError | RdapHttpError | undefined;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (candidate === undefined) continue;
      const last = index === candidates.length - 1;
      let response: Response;
      try {
        response = await this.#fetchResponse(urlFor(candidate), options, method);
      } catch (error) {
        if (isAbortError(error) || options?.signal?.aborted === true) throw error;
        if (error instanceof RdapError) lastFailure = error;
        if (!last) continue;
        throw error;
      }

      if (response.status >= 500 && !last) {
        lastFailure = await this.#errorFor(response);
        continue;
      }
      return onResponse(response);
    }
    throw lastFailure ?? new RdapError('network-failure', 'All RDAP service candidates failed');
  }

  async #query<Schema extends v.GenericSchema>(
    candidates: readonly string[],
    type: RdapLookupType,
    value: string,
    schema: Schema,
    options?: RdapRequestOptions
  ): Promise<v.InferOutput<Schema>> {
    return this.#tryCandidates(
      candidates,
      value,
      options,
      candidate => lookupUrl(candidate, type, value),
      async response => {
        if (!response.ok) throw await this.#errorFor(response);
        return this.#parse(response, schema);
      }
    );
  }

  async #lookup<Schema extends v.GenericSchema>(
    type: RdapLookupType,
    value: string,
    schema: Schema,
    options?: RdapRequestOptions
  ): Promise<v.InferOutput<Schema>> {
    return this.#query(await this.#candidates(type, value, options), type, value, schema, options);
  }

  #requireEntityCandidates(candidates: readonly string[]): void {
    if (candidates.length === 0) {
      throw new RdapError(
        'base-url-required',
        'Untagged or unknown entity handles need a base URL'
      );
    }
  }

  async #candidates(
    type: RdapLookupType,
    value: LookupValue,
    options?: RdapRequestOptions
  ): Promise<string[]> {
    const explicit = this.#explicitBaseUrl(options);
    if (explicit !== undefined) return [explicit.href];
    switch (type) {
      case 'domain':
        return this.#bootstrap.domain(String(value), options?.signal);
      case 'ip':
        return this.#bootstrap.ip(String(value), options?.signal);
      case 'autnum':
        return this.#bootstrap.autnum(value, options?.signal);
      case 'entity':
        return this.#bootstrap.entity(String(value), options?.signal);
      case 'nameserver':
        throw new RdapError('base-url-required', 'Nameserver lookup needs a base URL');
    }
  }

  async lookupDomain(name: string, options?: RdapRequestOptions): Promise<RdapDomain> {
    return this.#lookup('domain', normalizeDomain(name), RdapDomainSchema, options);
  }

  async lookupIp(addressOrCidr: string, options?: RdapRequestOptions): Promise<RdapIpNetwork> {
    return this.#lookup('ip', parseIpResource(addressOrCidr).value, RdapIpNetworkSchema, options);
  }

  async lookupAutnum(autnum: number | string, options?: RdapRequestOptions): Promise<RdapAutnum> {
    return this.#lookup('autnum', String(normalizeAutnum(autnum)), RdapAutnumSchema, options);
  }

  async lookupNameserver(name: string, options?: RdapRequestOptions): Promise<RdapNameserver> {
    const value = normalizeDomain(name);
    return this.#query(
      [this.#requiredBaseUrl('Nameserver lookup', options).href],
      'nameserver',
      value,
      RdapNameserverSchema,
      options
    );
  }

  #entityHandle(value: LookupValue): string {
    const normalized = String(value).trim();
    if (normalized === '') {
      throw new RdapError('invalid-input', 'Entity handle cannot be empty');
    }
    return normalized;
  }

  async lookupEntity(handle: string, options?: RdapRequestOptions): Promise<RdapEntity> {
    const value = this.#entityHandle(handle);
    const candidates = await this.#candidates('entity', value, options);
    this.#requireEntityCandidates(candidates);
    return this.#query(candidates, 'entity', value, RdapEntitySchema, options);
  }

  async #search<Schema extends v.GenericSchema>(
    path: string,
    parameter: [string, string],
    schema: Schema,
    options?: RdapRequestOptions
  ): Promise<v.InferOutput<Schema>> {
    const url = contextUrl(this.#requiredBaseUrl(`${path} search`, options), path);
    url.search = new URLSearchParams([parameter]).toString();
    const response = await this.#fetchResponse(url, options);
    if (!response.ok) throw await this.#errorFor(response);
    return this.#parse(response, schema);
  }

  async searchDomains(
    search: RdapDomainSearch,
    options?: RdapRequestOptions
  ): Promise<RdapDomainSearchResults> {
    return this.#search(
      'domains',
      searchEntry(search, ['name', 'nsLdhName', 'nsIp']),
      RdapDomainSearchResultsSchema,
      options
    );
  }

  async searchNameservers(
    search: RdapNameserverSearch,
    options?: RdapRequestOptions
  ): Promise<RdapNameserverSearchResults> {
    return this.#search(
      'nameservers',
      searchEntry(search, ['name', 'ip']),
      RdapNameserverSearchResultsSchema,
      options
    );
  }

  async searchEntities(
    search: RdapEntitySearch,
    options?: RdapRequestOptions
  ): Promise<RdapEntitySearchResults> {
    return this.#search(
      'entities',
      searchEntry(search, ['fn', 'handle']),
      RdapEntitySearchResultsSchema,
      options
    );
  }

  async getHelp(options?: RdapRequestOptions): Promise<RdapHelp> {
    const url = contextUrl(this.#requiredBaseUrl('Help lookup', options), 'help');
    const response = await this.#fetchResponse(url, options);
    if (!response.ok) throw await this.#errorFor(response);
    return this.#parse(response, RdapHelpSchema);
  }

  async exists(
    type: RdapLookupType,
    value: LookupValue,
    options?: RdapRequestOptions
  ): Promise<boolean> {
    let normalized: string;
    if (type === 'domain' || type === 'nameserver') {
      normalized = normalizeDomain(String(value));
    } else if (type === 'ip') {
      normalized = parseIpResource(String(value)).value;
    } else if (type === 'autnum') {
      normalized = String(normalizeAutnum(value));
    } else {
      normalized = this.#entityHandle(value);
    }

    const candidates = await this.#candidates(type, normalized, options);
    if (type === 'entity') this.#requireEntityCandidates(candidates);

    return this.#tryCandidates(
      candidates,
      normalized,
      options,
      candidate => lookupUrl(candidate, type, normalized),
      async response => {
        if (response.status === 404) return false;
        if (!response.ok) throw await this.#errorFor(response);
        return true;
      },
      'HEAD'
    );
  }

  async request<Schema extends v.GenericSchema = typeof RdapResponseSchema>(
    input: string | URL,
    options?: RdapDirectRequestOptions<Schema>
  ): Promise<RdapResult<v.InferOutput<Schema>>> {
    const url = parseHttpUrl(input, 'RDAP request URL');
    const response = await this.#fetchResponse(url, options);
    if (!response.ok) throw await this.#errorFor(response);
    const schema = options?.schema ?? RdapResponseSchema;
    const data = await this.#parse(response, schema);
    return { data, response };
  }
}

/**
 * Create an RDAP client with its own IANA bootstrap cache.
 * @param options Client defaults and optional Fetch implementation.
 * @returns A configured client.
 */
export const createRdapClient = (options: RdapClientOptions = {}): RdapClient =>
  new RdapClientImplementation(options);
