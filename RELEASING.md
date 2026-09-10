# Remaining service validation

Before publishing 2.0 as a working Frontpoint integration, an account holder must validate read-only login and system/partition/sensor retrieval against the current service. CI uses simulated responses and cannot establish account, SSO, or MFA compatibility.

Run `node examples/list.js` with credentials in `FRONTPOINT_USERNAME` and `FRONTPOINT_PASSWORD`. Do not paste credentials, cookies, tokens, SSO URLs, or complete identity responses into issue reports. Record the package commit, Node version, HTTP status, and whether the service's normal website login succeeds. If the current flow differs, capture a sanitized protocol description and add fixtures before changing endpoints.

Issue #3 remains the tracking issue for the reported HTTP 403. Do not close it solely because local tests pass. Control-command validation, if performed separately by an account holder, must target a deliberately selected partition and verify the resulting panel state.
