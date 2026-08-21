import { describe, expect, test } from '@rstest/core';
import { containsIpResource, parseIpResource } from '../src/ip';

describe('IP resource parsing', () => {
  test.each([
    ['192.0.2.1', 4, 32, '192.0.2.1'],
    [' 192.0.2.0/24 ', 4, 24, '192.0.2.0/24'],
    ['2001:db8::1', 6, 128, '2001:db8::1'],
    ['2001:db8::/32', 6, 32, '2001:db8::/32'],
    ['::', 6, 128, '::'],
    ['::ffff:192.0.2.1', 6, 128, '::ffff:192.0.2.1'],
    ['2001:db8:0:0:0:0:0:1', 6, 128, '2001:db8:0:0:0:0:0:1'],
  ] as const)('parses %s', (input, version, prefixLength, value) => {
    expect(parseIpResource(input)).toMatchObject({ version, prefixLength, value });
  });

  test.each([
    '',
    '/24',
    '192.0.2.1/',
    '192.0.2.1/abc',
    '192.0.2.1/+24',
    '192.0.2.1/2e1',
    '192.0.2.1/0x10',
    '001.2.3.4',
    '001.2.3.4/24',
    '1.2.3',
    '01x.2.3.4',
    '2001:db8::1::2',
    '2001:db8::1%eth0',
    '1:2:3:4:5:6:7',
    '1:2:3:4:5:6:7:8::',
    '::ffff:999.0.0.1',
  ])('rejects %s', input => {
    expect(() => parseIpResource(input)).toThrow();
  });

  test('a range contains only same-version addresses covered by its prefix', () => {
    expect(
      containsIpResource(parseIpResource('192.0.2.0/25'), parseIpResource('192.0.2.127'))
    ).toBe(true);
    expect(
      containsIpResource(parseIpResource('192.0.2.0/25'), parseIpResource('192.0.2.128'))
    ).toBe(false);
    expect(
      containsIpResource(parseIpResource('192.0.2.0/24'), parseIpResource('2001:db8::1'))
    ).toBe(false);
    expect(containsIpResource(parseIpResource('192.0.2.1'), parseIpResource('192.0.2.0/24'))).toBe(
      false
    );
  });
});
