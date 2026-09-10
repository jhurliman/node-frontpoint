# frontpoint

[![CI](https://github.com/jhurliman/node-frontpoint/actions/workflows/ci.yml/badge.svg)](https://github.com/jhurliman/node-frontpoint/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/frontpoint.svg)](https://www.npmjs.com/package/frontpoint)

An unofficial Node.js client for the **legacy Frontpoint → Alarm.com single
sign-on flow**. It groups system, partition, and sensor information behind a
small Promise API and exposes partition arming/disarming commands.

**Service compatibility is not yet revalidated.** [Issue #3](https://github.com/jhurliman/node-frontpoint/issues/3)
reports HTTP 403 during login. The modernization tests verify client behavior
with simulated responses; they do not establish that today's service accepts
this older login flow. Account-level verification is required before publishing
2.0 as a working service integration. MFA and newer authentication flows are not
implemented.

## Install

```sh
npm install frontpoint
```

The upcoming 2.0 release requires Node.js 22+ and uses built-in `fetch`, with no
runtime dependencies. This README describes that release candidate; see the
[release notes](CHANGELOG.md) for changes from 1.2.

## Query a system

Set `FRONTPOINT_USERNAME` and `FRONTPOINT_PASSWORD` in your local environment,
then save this as `example.mjs` and run `node example.mjs`:

```js
import { createClient } from 'frontpoint';

const frontpoint = createClient({ timeout: 60000 });
const auth = await frontpoint.login(
  process.env.FRONTPOINT_USERNAME,
  process.env.FRONTPOINT_PASSWORD,
);

if (!auth.systems.length) throw new Error('No systems returned for this account');
const state = await frontpoint.getCurrentState(auth.systems[0], auth);

for (const partition of state.partitions) {
  console.log(partition.id, partition.attributes.description, partition.attributes.state);
}
for (const sensor of state.sensors) {
  console.log(sensor.id, sensor.attributes.description, sensor.attributes.stateText);
}
```

For CommonJS, use `const frontpoint = require('frontpoint')` for the default
client, or `const { createClient } = require('frontpoint')`. Existing module-level
methods remain supported.

`login()` returns `{ cookie, ajaxKey, systems, identities }`. Keep that object
private and pass it to subsequent methods. It is not mutated by requests.
Sessions are not persisted or automatically renewed.

## API

| Method | Result |
| --- | --- |
| `login(username, password, options?)` | Authentication object and available system IDs |
| `getCurrentState(systemID, auth)` | System attributes, partitions, sensors, and relationships |
| `getPartition(partitionID, auth)` | Partition resource in `{ data }` |
| `getSensors(sensorIDs, auth)` | Sensor resources in `{ data }`; accepts one ID or an array |
| `armStay(partitionID, auth, options?)` | Service response for stay-mode arming |
| `armAway(partitionID, auth, options?)` | Service response for away-mode arming |
| `disarm(partitionID, auth)` | Service response for disarming |

All methods return Promises. Use the partition ID returned in system data for a
command. Arming options are `noEntryDelay` and `silentArming`, both defaulting to
`false`. Command response completion does not prove that the panel reached its
target state; query current state afterward.

The [read-only listing example](examples/list.js) uses environment credentials.
The [command example](examples/arm.js) additionally requires an explicit
`FRONTPOINT_PARTITION_ID` and a `stay`, `away`, or `disarm` argument.

| System state | Value |
| --- | --- |
| `SYSTEM_STATES.UNKNOWN` | `0` |
| `SYSTEM_STATES.DISARMED` | `1` |
| `SYSTEM_STATES.ARMED_STAY` | `2` |
| `SYSTEM_STATES.ARMED_AWAY` | `3` |
| `SYSTEM_STATES.ARMED_NIGHT` | `4` |

`SENSOR_STATES` exports `UNKNOWN`, `CLOSED`, `OPEN`, `IDLE`, `ACTIVE`, `DRY`, and
`WET` with values 0 through 6. These are the legacy client's constants; interpret
unrecognized service values explicitly in your application.

## Timeouts, cancellation, and errors

`createClient({ timeout })` sets a per-request timeout in milliseconds (default
60,000). A login or state lookup may involve several requests. Pass an
`AbortSignal` in the third argument to `login()`, or in a copy of the authentication
object for later requests:

```js
const controller = new AbortController();
const pending = frontpoint.getCurrentState(auth.systems[0], {
  ...auth,
  signal: controller.signal,
});
controller.abort();
await pending.catch(error => console.log(error.message));
```

This snippet uses `frontpoint` and `auth` from the first example. Requests are not
automatically retried, including control commands whose server-side outcome
might be unknown after a timeout.

`FrontpointError` exposes an optional HTTP `status`. Error messages deliberately
omit response bodies, credentials, cookies, and SSO query parameters. Invalid
arguments reject with `TypeError`; client configuration errors throw immediately.
A 401/403 is not treated as successful authentication or silently retried.

## Testing without an alarm account

`createClient({ fetch })` accepts a Fetch-compatible transport. Tests exercise
the full legacy SSO exchange, cookie parsing, nullable identities, URL encoding,
arming defaults, response validation, cancellation, and error redaction using
in-memory responses. No test logs in to a real account or changes an alarm.

```sh
npm ci
npm test
npm run test:types
npm pack --dry-run
```

GitHub Actions runs on Node.js 22, 24, and 26. TypeScript declarations describe the
stable wrapper shape; service-specific attributes remain `unknown` until the
application validates them. TypeScript consumers should install `@types/node`.

## Upgrading from 1.2

- Node.js 22+ replaces the old node-fetch dependency; native Fetch transports use
  `Headers.getSetCookie()`.
- Missing tokens/cookies produce useful errors instead of a ReferenceError or
  a cookie dump. An `afg` cookie in the final position is handled correctly.
- Optional arming options work when omitted. Sensor/partition IDs are encoded,
  and concurrent requests do not mutate the authentication headers.
- Successful 2xx responses, empty bodies, malformed JSON, timeouts, and nullable
  identity relationships are handled explicitly.
- Example scripts use environment credentials and Node's built-in facilities;
  the old yargs development dependency is removed.

The legacy endpoints are unchanged. These fixes do not claim to resolve service
login issue #3; [RELEASING.md](RELEASING.md) records the outstanding account check.

## License

[MIT](LICENSE).
