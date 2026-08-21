# Admin E2E must pin fixture vendors

**As of:** 2026-08-21  
**Context:** MVP-7 `make quality` → `e2e/run.py`

## Lesson

`e2e/run.py` must set **`PLACES_VENDOR_MODE=fixture`** (process env **and** server command string).  
If only `QUANZIL_MODE=fixture` is set, Next/`loadEnvConfig` can still load `.env.local` with `PLACES_VENDOR_MODE=live`. Live Google `search_places` for `museum` may return **empty `data`**, so Playwright asserts like `assert body.get("data")` fail even when HTTP 200.

Restaurants for query `Yat` can still pass against live, which masks the misconfiguration until the places call.

## Practice

- E2E server: `PLACES_VENDOR_MODE=fixture QUANZIL_MODE=fixture NODE_ENV=development`
- Prefer asserting `isinstance(data, list) and len(data) > 0` with the response body in the message
- Ignore `.next-e2e/**` in ESLint (same class of trap as `.next/**`)
