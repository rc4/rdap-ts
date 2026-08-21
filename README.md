# rdap-ts

A TypeScript client for the Registration Data Access Protocol (RDAP). It uses
Fetch, validates responses with [Valibot](https://valibot.dev/), and runs in
Node, browsers, Workers, Deno, and Bun.

## Install

```sh
pnpm add rdap-ts
```

## Client

```ts
import { createRdapClient } from 'rdap-ts';

const rdap = createRdapClient();

const domain = await rdap.lookupDomain('example.com');
const network = await rdap.lookupIp('2001:db8::/32');
const autnum = await rdap.lookupAutnum('AS64496');
```

Domain names are converted to lowercase A-labels and may include a trailing
dot. IP lookups accept IPv4, IPv6, or CIDR. ASNs accept an unsigned 32-bit
number, an asplain string, or a case-insensitive `AS`-prefixed string.

Each client has its own bootstrap cache. You may inject your own custom fetch
to further customize the client, for example:

```ts
const rdap = createRdapClient({
  fetch: instrumentedFetch,
  headers: { authorization: `Bearer ${token}` },
});
```

## Convenience functions

Every client method is also exported as a top-level function. Those functions
share one lazily created client and bootstrap cache:

```ts
import { lookupDomain, lookupIp } from 'rdap-ts';

const [domain, network] = await Promise.all([lookupDomain('example.com'), lookupIp('192.0.2.1')]);
```

## Explicit bootstrapping

Initialize the client with custom bootstrap base URL:

```ts
const rdap = createRdapClient({ baseUrl: 'https://rdap.example/rdap/' });

const nameserver = await rdap.lookupNameserver('ns1.example.com');
const domains = await rdap.searchDomains({ name: 'example*' });
const help = await rdap.getHelp();
```

Or override it per call:

```ts
const entity = await rdap.lookupEntity('ABC-123', {
  baseUrl: 'https://rdap.example/',
  headers: { 'x-request-id': crypto.randomUUID() },
});
```

Search criteria are mutually exclusive, pass exactly one:

```ts
await rdap.searchDomains({ name: 'example*' });
await rdap.searchDomains({ nsLdhName: 'ns1.example*' });
await rdap.searchDomains({ nsIp: '192.0.2.1' });

await rdap.searchNameservers({ name: 'ns1*' });
await rdap.searchNameservers({ ip: '192.0.2.1' });

await rdap.searchEntities({ fn: 'Example Person*' });
await rdap.searchEntities({ handle: 'ABC*' });
```

## Cancellation and direct requests

There is no default timeout; if you would like one, you can provide an AbortSignal:

```ts
const domain = await rdap.lookupDomain('example.com', {
  signal: AbortSignal.timeout(5_000), // 5000ms
});
```

Lookups return the parsed RDAP object. Use `request` when you also need the
Fetch `Response`, or if you want to validate the body with a custom schema:

```ts
import * as v from 'valibot';

const { data, response } = await rdap.request('https://rdap.example/custom/resource', {
  schema: v.looseObject({ answer: v.number() }),
});

console.log(data.answer, response.url, response.status);
```

## Errors

```ts
import { RdapError, RdapHttpError, RdapValidationError } from 'rdap-ts';

try {
  await rdap.lookupDomain('example.com');
} catch (error) {
  if (error instanceof RdapHttpError) {
    console.error(error.response.status, error.body, error.retryAfter);
  } else if (error instanceof RdapValidationError) {
    console.error(error.issues, error.response.url);
  } else if (error instanceof RdapError) {
    console.error(error.code, error.message);
  }
}
```

## Runtimes

The package ships ESM and CommonJS builds targeting ES2022. Node.js 20+ is
supported. Recent browsers, Cloudflare Workers, Deno, and Bun should work.

> [!NOTE]
> In a browser, each RDAP server's CORS policy still applies.

## Standards

| Standard                                                | Coverage                                                |
| ------------------------------------------------------- | ------------------------------------------------------- |
| [RFC 7480](https://www.rfc-editor.org/rfc/rfc7480.html) | HTTP, media types, redirects, errors                    |
| [RFC 8521](https://www.rfc-editor.org/rfc/rfc8521.html) | Provider tags on entity handles                         |
| [RFC 9082](https://www.rfc-editor.org/rfc/rfc9082.html) | Lookup paths, search, help, query encoding              |
| [RFC 9083](https://www.rfc-editor.org/rfc/rfc9083.html) | Response objects, common structures, errors, extensions |
| [RFC 9224](https://www.rfc-editor.org/rfc/rfc9224.html) | IANA bootstrap for domains, IPs, and ASNs               |
| [RFC 9537](https://www.rfc-editor.org/rfc/rfc9537.html) | Redacted data                                           |
