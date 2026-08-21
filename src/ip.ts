import ipaddr from 'ipaddr.js';
import { RdapError } from './errors';

interface ParsedIpResource {
  version: 4 | 6;
  address: ipaddr.IPv4 | ipaddr.IPv6;
  prefixLength: number;
  value: string;
}

const invalidIpResource = (input: string): never => {
  throw new RdapError('invalid-input', `Invalid IP resource: ${input}`);
};

export const parseIpResource = (input: string): ParsedIpResource => {
  const value = input.trim();
  if (value === '' || value.includes('%')) invalidIpResource(input);

  const hasPrefix = value.includes('/');
  let address: ipaddr.IPv4 | ipaddr.IPv6;
  let prefixLength: number;

  if (hasPrefix) {
    if (ipaddr.IPv4.isValidCIDRFourPartDecimal(value)) {
      [address, prefixLength] = ipaddr.IPv4.parseCIDR(value);
    } else if (ipaddr.IPv6.isValidCIDR(value)) {
      [address, prefixLength] = ipaddr.IPv6.parseCIDR(value);
    } else {
      return invalidIpResource(input);
    }
  } else if (ipaddr.IPv4.isValidFourPartDecimal(value)) {
    address = ipaddr.IPv4.parse(value);
    prefixLength = 32;
  } else if (ipaddr.IPv6.isValid(value)) {
    address = ipaddr.IPv6.parse(value);
    prefixLength = 128;
  } else {
    return invalidIpResource(input);
  }

  const version = address.kind() === 'ipv4' ? 4 : 6;
  return {
    version,
    address,
    prefixLength,
    value,
  };
};

export const containsIpResource = (range: ParsedIpResource, target: ParsedIpResource): boolean =>
  range.version === target.version
  && range.prefixLength <= target.prefixLength
  && target.address.match(range.address, range.prefixLength);
