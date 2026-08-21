import * as v from 'valibot';

type ExtensibleString<Known extends string> = Known | (string & Record<never, never>);

const extensibleString = <Known extends string>() =>
  v.custom<ExtensibleString<Known>>(
    (input): input is ExtensibleString<Known> => typeof input === 'string',
    'Expected a string'
  );

const nonEmptyStrings = v.pipe(v.array(v.string()), v.minLength(1));

/** Entity role: an IANA-registered value, or an extension string. */
export type RdapEntityRole = ExtensibleString<
  | 'registrant'
  | 'technical'
  | 'administrative'
  | 'abuse'
  | 'billing'
  | 'registrar'
  | 'reseller'
  | 'sponsor'
  | 'proxy'
  | 'notifications'
  | 'noc'
>;

/** Event action: an IANA-registered value, or an extension string. */
export type RdapEventAction = ExtensibleString<
  | 'registration'
  | 'reregistration'
  | 'last changed'
  | 'expiration'
  | 'deletion'
  | 'reinstantiation'
  | 'transfer'
  | 'locked'
  | 'unlocked'
  | 'last update of RDAP database'
>;

/** Object status: an IANA-registered value, or an extension string. */
export type RdapStatus = ExtensibleString<
  | 'validated'
  | 'active'
  | 'inactive'
  | 'locked'
  | 'client hold'
  | 'server hold'
  | 'pending create'
  | 'pending renew'
  | 'pending transfer'
  | 'pending update'
  | 'pending delete'
  | 'pending restore'
>;

/** Notice or remark type: an IANA-registered value, or an extension string. */
export type RdapNoticeType = ExtensibleString<
  | 'result set truncated due to authorization'
  | 'result set truncated due to excessive load'
  | 'result set truncated due to unexplainable reasons'
  | 'object truncated due to authorization'
  | 'object truncated due to excessive load'
  | 'object truncated due to unexplainable reasons'
>;

/** Domain-variant relation: an IANA-registered value, or an extension string. */
export type RdapVariantRelation = ExtensibleString<
  'registered' | 'unregistered' | 'registration restricted' | 'open registration' | 'conjoined'
>;

/** RFC 9537 redaction method: an IANA-registered value, or an extension string. */
export type RdapRedactionMethod = ExtensibleString<
  'removal' | 'emptyValue' | 'partialValue' | 'replacementValue'
>;

/** RFC 9537 redaction path language: an IANA-registered value, or an extension string. */
export type RdapRedactionPathLanguage = ExtensibleString<'jsonpath'>;

/** RFC 9083 link object. */
export const RdapLinkSchema = v.looseObject({
  value: v.string(),
  rel: v.string(),
  href: v.string(),
  hreflang: v.optional(v.array(v.string())),
  title: v.optional(v.string()),
  media: v.optional(v.string()),
  type: v.optional(v.string()),
});

export type RdapLink = v.InferOutput<typeof RdapLinkSchema>;

/** RFC 9083 notice or remark object. */
export const RdapNoticeSchema = v.looseObject({
  title: v.optional(v.string()),
  type: v.optional(extensibleString<RdapNoticeType>()),
  description: v.array(v.string()),
  links: v.optional(v.array(RdapLinkSchema)),
});

export type RdapNotice = v.InferOutput<typeof RdapNoticeSchema>;

/** RFC 9083 event object. */
export const RdapEventSchema = v.looseObject({
  eventAction: extensibleString<RdapEventAction>(),
  eventActor: v.optional(v.string()),
  eventDate: v.string(),
  links: v.optional(v.array(RdapLinkSchema)),
});

export type RdapEvent = v.InferOutput<typeof RdapEventSchema>;

/** Event nested under `asEventActor`. The nested object must not include `eventActor`. */
export const RdapEventActorSchema = v.pipe(
  v.looseObject({
    eventAction: extensibleString<RdapEventAction>(),
    eventDate: v.string(),
    links: v.optional(v.array(RdapLinkSchema)),
  }),
  v.check(
    input => !Object.hasOwn(input, 'eventActor'),
    'asEventActor events cannot include eventActor'
  )
);

export type RdapEventActor = v.InferOutput<typeof RdapEventActorSchema>;

/** RFC 9083 public identifier. */
export const RdapPublicIdSchema = v.looseObject({
  type: v.string(),
  identifier: v.string(),
});

export type RdapPublicId = v.InferOutput<typeof RdapPublicIdSchema>;

/** jCard property tuple. */
export const RdapJcardPropertySchema = v.tupleWithRest(
  [
    v.string(),
    v.looseObject({}),
    v.string(),
    v.custom(input => input !== undefined, 'Expected a jCard value'),
  ],
  v.unknown()
);

export type RdapJcardProperty = v.InferOutput<typeof RdapJcardPropertySchema>;

/** jCard used on RDAP entities. */
export const RdapJcardSchema = v.tuple([v.literal('vcard'), v.array(RdapJcardPropertySchema)]);

export type RdapJcard = v.InferOutput<typeof RdapJcardSchema>;

/** RFC 9537 redaction name. At least one of `type` or `description` is required. */
export const RdapRedactedNameSchema = v.union([
  v.looseObject({ type: v.string(), description: v.optional(v.string()) }),
  v.looseObject({ type: v.optional(v.string()), description: v.string() }),
]);

export type RdapRedactedName = v.InferOutput<typeof RdapRedactedNameSchema>;

/** RFC 9537 redaction reason. */
export const RdapRedactedReasonSchema = v.looseObject({
  type: v.optional(v.string()),
  description: v.optional(v.string()),
});

export type RdapRedactedReason = v.InferOutput<typeof RdapRedactedReasonSchema>;

/** RFC 9537 redaction record. */
export const RdapRedactedSchema = v.pipe(
  v.looseObject({
    name: RdapRedactedNameSchema,
    prePath: v.optional(v.string()),
    postPath: v.optional(v.string()),
    replacementPath: v.optional(v.string()),
    pathLang: v.optional(extensibleString<RdapRedactionPathLanguage>()),
    method: v.optional(extensibleString<RdapRedactionMethod>()),
    reason: v.optional(RdapRedactedReasonSchema),
  }),
  v.check(
    input => input.prePath === undefined || input.postPath === undefined,
    'Redaction cannot include both prePath and postPath'
  )
);

export type RdapRedacted = v.InferOutput<typeof RdapRedactedSchema>;

const responseEntries = {
  rdapConformance: nonEmptyStrings,
  lang: v.optional(v.string()),
  notices: v.optional(v.array(RdapNoticeSchema)),
};

const objectEntries = {
  handle: v.optional(v.string()),
  status: v.optional(v.array(extensibleString<RdapStatus>())),
  port43: v.optional(v.string()),
  publicIds: v.optional(v.array(RdapPublicIdSchema)),
  events: v.optional(v.array(RdapEventSchema)),
  remarks: v.optional(v.array(RdapNoticeSchema)),
  links: v.optional(v.array(RdapLinkSchema)),
  redacted: v.optional(v.array(RdapRedactedSchema)),
};

interface EmbeddedObjectCommon {
  [key: string]: unknown;
  handle?: string | undefined;
  status?: RdapStatus[] | undefined;
  port43?: string | undefined;
  publicIds?: RdapPublicId[] | undefined;
  events?: RdapEvent[] | undefined;
  remarks?: RdapNotice[] | undefined;
  links?: RdapLink[] | undefined;
  redacted?: RdapRedacted[] | undefined;
}

interface EmbeddedEntity extends EmbeddedObjectCommon {
  objectClassName: 'entity';
  vcardArray?: RdapJcard | undefined;
  roles?: RdapEntityRole[] | undefined;
  entities?: EmbeddedEntity[] | undefined;
  asEventActor?: RdapEventActor[] | undefined;
  networks?: EmbeddedIpNetwork[] | undefined;
  autnums?: EmbeddedAutnum[] | undefined;
}

interface EmbeddedIpNetwork extends EmbeddedObjectCommon {
  objectClassName: 'ip network';
  startAddress?: string | undefined;
  endAddress?: string | undefined;
  ipVersion?: ExtensibleString<'v4' | 'v6'> | undefined;
  name?: string | undefined;
  type?: string | undefined;
  country?: string | undefined;
  parentHandle?: string | undefined;
  entities?: EmbeddedEntity[] | undefined;
}

interface EmbeddedAutnum extends EmbeddedObjectCommon {
  objectClassName: 'autnum';
  startAutnum?: number | undefined;
  endAutnum?: number | undefined;
  name?: string | undefined;
  type?: string | undefined;
  country?: string | undefined;
  entities?: EmbeddedEntity[] | undefined;
}

const RdapEntityObjectSchema: v.GenericSchema<EmbeddedEntity> = v.looseObject({
  ...objectEntries,
  objectClassName: v.literal('entity'),
  vcardArray: v.optional(RdapJcardSchema),
  roles: v.optional(v.array(extensibleString<RdapEntityRole>())),
  entities: v.optional(v.array(v.lazy(() => RdapEntityObjectSchema))),
  asEventActor: v.optional(v.array(RdapEventActorSchema)),
  networks: v.optional(v.array(v.lazy(() => RdapIpNetworkObjectSchema))),
  autnums: v.optional(v.array(v.lazy(() => RdapAutnumObjectSchema))),
});

const RdapNameserverObjectSchema = v.looseObject({
  ...objectEntries,
  objectClassName: v.literal('nameserver'),
  ldhName: v.optional(v.string()),
  unicodeName: v.optional(v.string()),
  ipAddresses: v.optional(
    v.looseObject({
      v4: v.optional(v.array(v.string())),
      v6: v.optional(v.array(v.string())),
    })
  ),
  entities: v.optional(v.array(RdapEntityObjectSchema)),
});

const RdapIpNetworkObjectSchema: v.GenericSchema<EmbeddedIpNetwork> = v.looseObject({
  ...objectEntries,
  objectClassName: v.literal('ip network'),
  startAddress: v.optional(v.string()),
  endAddress: v.optional(v.string()),
  ipVersion: v.optional(extensibleString<'v4' | 'v6'>()),
  name: v.optional(v.string()),
  type: v.optional(v.string()),
  country: v.optional(v.string()),
  parentHandle: v.optional(v.string()),
  entities: v.optional(v.array(RdapEntityObjectSchema)),
});

const RdapAutnumObjectSchema: v.GenericSchema<EmbeddedAutnum> = v.looseObject({
  ...objectEntries,
  objectClassName: v.literal('autnum'),
  startAutnum: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(0xffff_ffff))),
  endAutnum: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(0xffff_ffff))),
  name: v.optional(v.string()),
  type: v.optional(v.string()),
  country: v.optional(v.string()),
  entities: v.optional(v.array(RdapEntityObjectSchema)),
});

/** Delegation-signer (DS) data on a domain. */
export const RdapDsDataSchema = v.looseObject({
  keyTag: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  algorithm: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  digest: v.optional(v.string()),
  digestType: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  events: v.optional(v.array(RdapEventSchema)),
  links: v.optional(v.array(RdapLinkSchema)),
});

export type RdapDsData = v.InferOutput<typeof RdapDsDataSchema>;

/** DNSKEY data on a domain. */
export const RdapKeyDataSchema = v.looseObject({
  flags: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  protocol: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  publicKey: v.optional(v.string()),
  algorithm: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  events: v.optional(v.array(RdapEventSchema)),
  links: v.optional(v.array(RdapLinkSchema)),
});

export type RdapKeyData = v.InferOutput<typeof RdapKeyDataSchema>;

/** RFC 9083 `secureDNS` object. */
export const RdapSecureDnsSchema = v.looseObject({
  zoneSigned: v.optional(v.boolean()),
  delegationSigned: v.optional(v.boolean()),
  maxSigLife: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  dsData: v.optional(v.array(RdapDsDataSchema)),
  keyData: v.optional(v.array(RdapKeyDataSchema)),
});

export type RdapSecureDns = v.InferOutput<typeof RdapSecureDnsSchema>;

const RdapDomainObjectSchema = v.looseObject({
  ...objectEntries,
  objectClassName: v.literal('domain'),
  ldhName: v.optional(v.string()),
  unicodeName: v.optional(v.string()),
  variants: v.optional(
    v.array(
      v.looseObject({
        relation: v.optional(v.array(extensibleString<RdapVariantRelation>())),
        idnTable: v.optional(v.string()),
        variantNames: v.optional(
          v.array(
            v.looseObject({
              ldhName: v.optional(v.string()),
              unicodeName: v.optional(v.string()),
            })
          )
        ),
      })
    )
  ),
  nameservers: v.optional(v.array(RdapNameserverObjectSchema)),
  secureDNS: v.optional(RdapSecureDnsSchema),
  entities: v.optional(v.array(RdapEntityObjectSchema)),
  network: v.optional(RdapIpNetworkObjectSchema),
});

/** Successful domain response. */
export const RdapDomainSchema = v.looseObject({
  ...responseEntries,
  ...RdapDomainObjectSchema.entries,
});

export type RdapDomain = v.InferOutput<typeof RdapDomainSchema>;

/** Successful nameserver response. */
export const RdapNameserverSchema = v.looseObject({
  ...responseEntries,
  ...RdapNameserverObjectSchema.entries,
});

export type RdapNameserver = v.InferOutput<typeof RdapNameserverSchema>;

/** Successful entity response. */
export const RdapEntitySchema = v.intersect([
  v.looseObject(responseEntries),
  RdapEntityObjectSchema,
]);

export type RdapEntity = v.InferOutput<typeof RdapEntitySchema>;

/** Successful IP network response. */
export const RdapIpNetworkSchema = v.intersect([
  v.looseObject(responseEntries),
  RdapIpNetworkObjectSchema,
]);

export type RdapIpNetwork = v.InferOutput<typeof RdapIpNetworkSchema>;

/** Successful autonomous-system response. */
export const RdapAutnumSchema = v.intersect([
  v.looseObject(responseEntries),
  RdapAutnumObjectSchema,
]);

export type RdapAutnum = v.InferOutput<typeof RdapAutnumSchema>;

const helpExclusiveKeys = [
  'objectClassName',
  'domainSearchResults',
  'nameserverSearchResults',
  'entitySearchResults',
] as const;

/** Successful help response. Must not include `objectClassName` or search-result members. */
export const RdapHelpSchema = v.pipe(
  v.looseObject({
    ...responseEntries,
  }),
  v.check(
    input => helpExclusiveKeys.every(key => !Object.hasOwn(input, key)),
    'Help cannot include objectClassName or search results'
  )
);

export type RdapHelp = v.InferOutput<typeof RdapHelpSchema>;

/** Domain search response. */
export const RdapDomainSearchResultsSchema = v.looseObject({
  ...responseEntries,
  domainSearchResults: v.array(RdapDomainObjectSchema),
});

export type RdapDomainSearchResults = v.InferOutput<typeof RdapDomainSearchResultsSchema>;

/** Nameserver search response. */
export const RdapNameserverSearchResultsSchema = v.looseObject({
  ...responseEntries,
  nameserverSearchResults: v.array(RdapNameserverObjectSchema),
});

export type RdapNameserverSearchResults = v.InferOutput<typeof RdapNameserverSearchResultsSchema>;

/** Entity search response. */
export const RdapEntitySearchResultsSchema = v.looseObject({
  ...responseEntries,
  entitySearchResults: v.array(RdapEntityObjectSchema),
});

export type RdapEntitySearchResults = v.InferOutput<typeof RdapEntitySearchResultsSchema>;

/** Optional RDAP body on an HTTP error response. */
export const RdapErrorResponseSchema = v.looseObject({
  errorCode: v.pipe(v.number(), v.integer(), v.minValue(1)),
  title: v.optional(v.string()),
  description: v.optional(v.array(v.string())),
  rdapConformance: v.optional(nonEmptyStrings),
  lang: v.optional(v.string()),
  notices: v.optional(v.array(RdapNoticeSchema)),
});

export type RdapErrorResponse = v.InferOutput<typeof RdapErrorResponseSchema>;

/** Union of successful core RDAP responses. Unknown members are retained. */
export const RdapResponseSchema = v.union([
  RdapDomainSchema,
  RdapNameserverSchema,
  RdapEntitySchema,
  RdapIpNetworkSchema,
  RdapAutnumSchema,
  RdapDomainSearchResultsSchema,
  RdapNameserverSearchResultsSchema,
  RdapEntitySearchResultsSchema,
  RdapHelpSchema,
]);

export type RdapResponse = v.InferOutput<typeof RdapResponseSchema>;

const BootstrapServiceSchema = v.tuple([v.array(v.string()), v.array(v.string())]);

/** RFC 9224 IANA bootstrap registry. */
export const RdapBootstrapRegistrySchema = v.looseObject({
  version: v.string(),
  publication: v.string(),
  description: v.optional(v.string()),
  services: v.array(BootstrapServiceSchema),
});

export type RdapBootstrapRegistry = v.InferOutput<typeof RdapBootstrapRegistrySchema>;

const ObjectTagBootstrapServiceSchema = v.tuple([
  v.array(v.string()),
  v.array(v.string()),
  v.array(v.string()),
]);

/** RFC 8521 object-tag registry. */
export const RdapObjectTagBootstrapRegistrySchema = v.looseObject({
  version: v.string(),
  publication: v.string(),
  description: v.optional(v.string()),
  services: v.array(ObjectTagBootstrapServiceSchema),
});

export type RdapObjectTagBootstrapRegistry = v.InferOutput<
  typeof RdapObjectTagBootstrapRegistrySchema
>;
