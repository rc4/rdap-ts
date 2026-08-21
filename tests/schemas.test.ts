import { describe, expect, test } from '@rstest/core';
import * as v from 'valibot';
import {
  RdapAutnumSchema,
  RdapDomainSchema,
  RdapDomainSearchResultsSchema,
  RdapEntitySchema,
  RdapErrorResponseSchema,
  RdapEventActorSchema,
  RdapHelpSchema,
  RdapJcardSchema,
  RdapLinkSchema,
  RdapRedactedSchema,
  RdapResponseSchema,
  RdapSecureDnsSchema,
} from '../src/index';

describe('RDAP schemas', () => {
  test('preserve extensions and registered future string values', () => {
    const result = v.parse(RdapDomainSchema, {
      rdapConformance: ['rdap_level_0', 'future_extension'],
      objectClassName: 'domain',
      handle: 'EXAMPLE',
      status: ['future status'],
      future_extension_value: { enabled: true },
    });

    expect(result).toMatchObject({
      status: ['future status'],
      future_extension_value: { enabled: true },
    });
  });

  test('validate recursive embedded entities and jCard tuples', () => {
    const result = v.parse(RdapEntitySchema, {
      rdapConformance: ['rdap_level_0'],
      objectClassName: 'entity',
      handle: 'PARENT-ARIN',
      vcardArray: ['vcard', [['fn', {}, 'text', 'Example Person']]],
      entities: [
        {
          objectClassName: 'entity',
          handle: 'CHILD-ARIN',
          entities: [{ objectClassName: 'entity', handle: 'GRANDCHILD-ARIN' }],
        },
      ],
      networks: [{ objectClassName: 'ip network', startAddress: '192.0.2.0' }],
      autnums: [{ objectClassName: 'autnum', startAutnum: 64496 }],
    });

    expect(result.entities?.[0]?.entities?.[0]?.handle).toBe('GRANDCHILD-ARIN');
    expect(result.networks?.[0]?.startAddress).toBe('192.0.2.0');
    expect(result.autnums?.[0]?.startAutnum).toBe(64496);
    expect(v.is(RdapJcardSchema, ['vcard', [['email', {}, 'text', 'a@example.test']]])).toBe(true);
    expect(v.is(RdapJcardSchema, ['vcard', [['fn', {}, 'text']]])).toBe(false);
    expect(
      v.safeParse(RdapEntitySchema, {
        rdapConformance: ['rdap_level_0'],
        objectClassName: 'entity',
        networks: [{}],
      }).success
    ).toBe(false);
  });

  test('validate RFC 9537 redaction records', () => {
    expect(
      v.parse(RdapRedactedSchema, {
        name: { description: 'Registrant Name' },
        postPath: '$.entities[0].vcardArray[1][0][3]',
        pathLang: 'jsonpath',
        method: 'emptyValue',
        extensionNote: 'preserved',
      })
    ).toMatchObject({ extensionNote: 'preserved', method: 'emptyValue' });
    expect(v.is(RdapRedactedSchema, { name: {} })).toBe(false);
    expect(
      v.is(RdapRedactedSchema, {
        name: { type: 'Registrant Name' },
        prePath: '$.before',
        postPath: '$.after',
      })
    ).toBe(false);
  });

  test('enforces required link members and asEventActor shape', () => {
    expect(
      v.is(RdapLinkSchema, {
        value: 'https://rdap.example/domain/example.test',
        rel: 'self',
        href: 'https://rdap.example/domain/example.test',
      })
    ).toBe(true);
    expect(v.is(RdapLinkSchema, { href: 'https://rdap.example/' })).toBe(false);
    expect(
      v.is(RdapEventActorSchema, {
        eventAction: 'registration',
        eventDate: '2026-08-20T00:00:00Z',
        eventActor: 'ABC',
      })
    ).toBe(false);
  });

  test('validates Secure DNS structures', () => {
    expect(
      v.parse(RdapSecureDnsSchema, {
        delegationSigned: true,
        dsData: [{ keyTag: 25345, algorithm: 8, digestType: 2, digest: 'ABCD' }],
        keyData: [{ flags: 257, protocol: 3, algorithm: 8, publicKey: 'AAAA' }],
      })
    ).toMatchObject({ delegationSigned: true });
  });

  test('require top-level conformance and object discriminators', () => {
    expect(v.safeParse(RdapDomainSchema, { objectClassName: 'domain' }).success).toBe(false);
    expect(
      v.safeParse(RdapDomainSchema, {
        rdapConformance: ['rdap_level_0'],
        objectClassName: 'entity',
      }).success
    ).toBe(false);
  });

  test('validate typed search arrays', () => {
    const result = v.parse(RdapDomainSearchResultsSchema, {
      rdapConformance: ['rdap_level_0'],
      domainSearchResults: [{ objectClassName: 'domain', ldhName: 'example.test' }],
    });
    expect(result.domainSearchResults[0]?.ldhName).toBe('example.test');
  });

  test('limits autnum fields to unsigned 32-bit integers', () => {
    expect(
      v.safeParse(RdapAutnumSchema, {
        rdapConformance: ['rdap_level_0'],
        objectClassName: 'autnum',
        startAutnum: 4_294_967_296,
      }).success
    ).toBe(false);
  });

  test('allow optional RDAP metadata on error bodies', () => {
    expect(v.parse(RdapErrorResponseSchema, { errorCode: 404 })).toEqual({
      errorCode: 404,
    });
    expect(v.safeParse(RdapErrorResponseSchema, { title: 'missing code' }).success).toBe(false);
  });

  test('rejects invalid objects and search bodies from the general response union', () => {
    expect(v.parse(RdapHelpSchema, { rdapConformance: ['rdap_level_0'] })).toMatchObject({
      rdapConformance: ['rdap_level_0'],
    });
    expect(
      v.safeParse(RdapResponseSchema, {
        rdapConformance: ['rdap_level_0'],
        objectClassName: 'domain',
        nameservers: 'oops',
      }).success
    ).toBe(false);
    expect(
      v.safeParse(RdapResponseSchema, {
        rdapConformance: ['rdap_level_0'],
        domainSearchResults: 'oops',
      }).success
    ).toBe(false);
    expect(v.safeParse(RdapResponseSchema, { rdapConformance: ['rdap_level_0'] }).success).toBe(
      true
    );
  });
});
