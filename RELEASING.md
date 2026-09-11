# Releasing frontpoint

The maintainer no longer has the required account or hardware. Releases may proceed after automated checks, with the README and release notes explicitly stating that live compatibility is unverified. Do not describe simulated tests as hardware or service validation. Invite active users to test and take over maintenance.

Run `npm ci`, `npm test`, `npm run test:types`, and `npm pack` before publishing.

## Community service validation

Run `node examples/list.js` with credentials in `FRONTPOINT_USERNAME` and `FRONTPOINT_PASSWORD`. Do not paste credentials, cookies, tokens, SSO URLs, or complete identity responses into issue reports. Record the package commit, Node version, HTTP status, and whether the service's normal website login succeeds. If the current flow differs, capture a sanitized protocol description and add fixtures before changing endpoints.

Issue #3 remains the tracking issue for the reported HTTP 403. Do not close it solely because local tests pass. Control-command validation, if performed separately by an account holder, must target a deliberately selected partition and verify the resulting panel state.
