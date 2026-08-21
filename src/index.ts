export { RdapError, RdapHttpError, RdapValidationError, type RdapErrorCode } from './errors';
export * from './schemas';
export * from './client';

import { createRdapClient, type RdapClient } from './client';

let sharedClient: RdapClient | undefined;

const client = () => (sharedClient ??= createRdapClient());

/**
 * Look up a domain using the shared client.
 * @see {@link RdapClient.lookupDomain}
 * @param name Domain name. Converted to a lowercase A-label; one trailing dot is allowed.
 * @param options Per-request overrides and abort signal.
 * @returns The parsed domain object.
 */
export const lookupDomain: RdapClient['lookupDomain'] = (name, options) =>
  client().lookupDomain(name, options);

/**
 * Look up an IP address or CIDR using the shared client.
 * @see {@link RdapClient.lookupIp}
 * @param addressOrCidr Address or CIDR to look up.
 * @param options Per-request overrides and abort signal.
 * @returns The parsed IP network object.
 */
export const lookupIp: RdapClient['lookupIp'] = (addressOrCidr, options) =>
  client().lookupIp(addressOrCidr, options);

/**
 * Look up an autonomous system using the shared client.
 * @see {@link RdapClient.lookupAutnum}
 * @param autnum Unsigned 32-bit number, asplain string, or `AS`-prefixed string.
 * @param options Per-request overrides and abort signal.
 * @returns The parsed autnum object.
 */
export const lookupAutnum: RdapClient['lookupAutnum'] = (autnum, options) =>
  client().lookupAutnum(autnum, options);

/**
 * Look up a nameserver using the shared client. Requires an explicit `baseUrl`.
 * @see {@link RdapClient.lookupNameserver}
 * @param name Nameserver domain name.
 * @param options Per-request overrides, including the server.
 * @returns The parsed nameserver object.
 */
export const lookupNameserver: RdapClient['lookupNameserver'] = (name, options) =>
  client().lookupNameserver(name, options);

/**
 * Look up an entity using the shared client.
 * @see {@link RdapClient.lookupEntity}
 * @param handle Entity handle. Registered provider tags can be bootstrapped.
 * @param options Per-request overrides and abort signal.
 * @returns The parsed entity object.
 */
export const lookupEntity: RdapClient['lookupEntity'] = (handle, options) =>
  client().lookupEntity(handle, options);

/**
 * Search domains using the shared client. Requires an explicit `baseUrl`.
 * @see {@link RdapClient.searchDomains}
 * @param search Exactly one search criterion.
 * @param options Per-request overrides, including the server.
 * @returns Domain search results.
 */
export const searchDomains: RdapClient['searchDomains'] = (search, options) =>
  client().searchDomains(search, options);

/**
 * Search nameservers using the shared client. Requires an explicit `baseUrl`.
 * @see {@link RdapClient.searchNameservers}
 * @param search Exactly one search criterion.
 * @param options Per-request overrides, including the server.
 * @returns Nameserver search results.
 */
export const searchNameservers: RdapClient['searchNameservers'] = (search, options) =>
  client().searchNameservers(search, options);

/**
 * Search entities using the shared client. Requires an explicit `baseUrl`.
 * @see {@link RdapClient.searchEntities}
 * @param search Exactly one search criterion.
 * @param options Per-request overrides, including the server.
 * @returns Entity search results.
 */
export const searchEntities: RdapClient['searchEntities'] = (search, options) =>
  client().searchEntities(search, options);

/**
 * Fetch help using the shared client. Requires an explicit `baseUrl`.
 * @see {@link RdapClient.getHelp}
 * @param options Per-request overrides, including the server.
 * @returns The parsed help object.
 */
export const getHelp: RdapClient['getHelp'] = options => client().getHelp(options);

/**
 * Check whether a resource exists (`HEAD`) using the shared client.
 * @see {@link RdapClient.exists}
 * @param type RDAP resource class.
 * @param value Identifier appropriate for `type`.
 * @param options Per-request overrides and abort signal.
 * @returns `true` on success, `false` only for HTTP 404.
 */
export const exists: RdapClient['exists'] = (type, value, options) =>
  client().exists(type, value, options);

/**
 * GET an absolute HTTP or HTTPS URL using the shared client.
 * @see {@link RdapClient.request}
 * @template Schema Schema used to type `data`.
 * @param url Absolute HTTP or HTTPS URL.
 * @param options Headers, abort signal, and optional schema.
 * @returns Parsed body and the originating Fetch `Response`.
 */
export const request: RdapClient['request'] = (url, options) => client().request(url, options);
