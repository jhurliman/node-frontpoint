# Changelog

## 2.0.0 — Unreleased; live service validation required

- Require Node.js 22+ and replace node-fetch 1 with native Fetch; no runtime dependencies remain.
- Add createClient(), per-request timeouts, AbortSignal support, and sanitized structured errors.
- Fix the missing-token ReferenceError, final-position afg cookie parsing, nullable identity relationships, optional arming arguments, URL encoding, and auth-object mutation.
- Handle successful 2xx/empty responses and malformed JSON explicitly; constrain SSO URLs to HTTPS Alarm.com hosts.
- Add declarations, deterministic tests, explicit package contents, GitHub Actions, and complete documentation/examples.
- Preserve the legacy endpoints. HTTP 403 login issue #3 remains unverified and open.

## 1.2.0

- Previous published release.
