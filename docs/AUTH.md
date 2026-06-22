# Authentication & Authorization Design

> Full deep-dive for the AI Travel Planner auth system, covering the original design, the Phase 11 access/refresh token expansion, email verification, Google OAuth, and object-level authorization. For a summary, see the [README → Auth & Authorization Approach](../README.md#5-auth--authorization-approach).
>
> **Phase 12 note:** Email verification moved from a non-blocking reminder banner (Phase 11) to a hard gate — unverified accounts cannot receive auth tokens at all. See [§3 Non-Blocking vs. Hard-Block Decision](#non-blocking-vs-hard-block-decision) for the updated rationale.

---

## Table of Contents

1. [Original Design (Phases 1–10)](#1-original-design-phases-110)
2. [Phase 11 Expansion: Access / Refresh Token System](#2-phase-11-expansion-access--refresh-token-system)
3. [Email Verification](#3-email-verification)
4. [Google OAuth — Three-Case Upsert](#4-google-oauth--three-case-upsert)
5. [Object-Level Authorization](#5-object-level-authorization)
6. [Reference Project: What Was Kept vs. Changed](#6-reference-project-what-was-kept-vs-changed)
7. [CSRF Considerations](#7-csrf-considerations)

---

## 1. Original Design (Phases 1–10)

The original auth system used a single long-lived JWT in an `httpOnly` cookie:

- **Token type:** JWT, signed with `JWT_SECRET`
- **Expiry:** 7 days
- **Transport:** `httpOnly; Secure; SameSite=None` (production) / `SameSite=Lax` (development)
- **Revocation:** none — token could not be invalidated before expiry

**The cross-origin fix (Phase 8):** The frontend (Vercel) and backend (Render) are on different origins. Without `SameSite=None`, browsers silently dropped the cookie on cross-origin requests. Three conditions must all be met: `SameSite=None`, `Secure=true`, and `credentials: 'include'` in fetch. See the Phase 8 section in [BACKEND.md](./BACKEND.md).

**Why `httpOnly` cookies over `localStorage`:** Any script on the page — including scripts injected via XSS — can read `localStorage`. An `httpOnly` cookie is invisible to JavaScript, eliminating the XSS token theft vector. The tradeoff is more involved CORS configuration, which this project implements.

---

## 2. Phase 11 Expansion: Access / Refresh Token System

### Token Pair

The single 7-day token is replaced with two separate tokens:

| Token | Type | Expiry | Transport | Cookie path |
|---|---|---|---|---|
| Access token | JWT (signed) | 15 minutes | `httpOnly` cookie | `/` |
| Refresh token | Opaque random hex | 7 days | `httpOnly` cookie | `/api/auth` |

**Why the refresh token is opaque (not a JWT):**  
A JWT refresh token is self-verifiable — a compromised token signed by the server is valid even if the DB record is deleted. An opaque token has no value without a matching row in the `RefreshToken` collection, enabling true server-side revocation. If the DB row is gone, the token is worthless.

**Why a separate JWT for access tokens (not opaque):**  
Access tokens are read on every request by the `requireAuth` middleware. Making them JWTs means the middleware can verify them in microseconds without a DB round-trip. This is the standard split: stateful refresh tokens for revocability, stateless access tokens for speed.

### RefreshToken Collection

```
RefreshToken {
  userId:      ObjectId       — which user owns this session
  tokenHash:   String         — SHA-256(rawToken), unique index, select:false
  deviceHint:  String         — user-agent snippet (display only, not security)
  expiresAt:   Date           — TTL index: MongoDB auto-deletes expired documents
  revoked:     Boolean        — true after use (rotation) or logout
}
```

One document per active session — a user can have many simultaneous sessions across devices. `tokenHash` is a SHA-256 hex digest of the raw token. The raw token is never stored in the database. If the DB is compromised, stored hashes cannot be used directly.

### Token Rotation with Theft Detection

```
POST /api/auth/refresh
```

```
1. Read raw refreshToken from cookie
2. Hash it → tokenHash
3. Look up RefreshToken document by tokenHash
4. If not found → 401 REFRESH_INVALID (expired or never existed)
5. If found but revoked=true or expired → THEFT SIGNAL:
     └── deleteMany({ userId }) — revoke ALL sessions for this user
     └── 401 REFRESH_THEFT_DETECTED
6. If valid:
     a. Mark old document revoked:true
     b. Issue new access JWT (15min)
     c. Generate new random refresh token
     d. Create new RefreshToken document (old one remains with revoked:true)
     e. Set both cookies
     f. 200 OK
```

**Theft detection logic:** When a rotated-out token is presented again, it means either:
- The legitimate user stored an old cookie (e.g., from a restored browser snapshot), or  
- An attacker stole the original refresh token after it was rotated

Either way, the only safe response is to invalidate all sessions for that user and require re-login. This is the "nuclear option" — it's a false-positive in the first case but a security necessity.

### Silent Refresh Interceptor (Frontend)

In `frontend/src/lib/api.ts`:

```
On any API response with status 401:
  if not from /api/auth/refresh, /api/auth/login, /api/auth/register:
    → attempt POST /api/auth/refresh (once)
    → if refresh succeeds: retry the original request with new access cookie
    → if refresh fails: clear user state, redirect to /login
```

- Module-level `isRefreshing` flag prevents concurrent refresh attempts
- Module-level `hasRefreshFailed` flag prevents infinite retry loops
- The interceptor is in one place — not duplicated per call site

### Cookie Configuration

Both cookies use the same SameSite/Secure strategy as the Phase 8 fix:

```typescript
const base = {
  httpOnly: true,
  secure: NODE_ENV === 'production',           // HTTPS only in prod
  sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
};

// Access token: sent on every request
res.cookie('accessToken', accessToken, { ...base, maxAge: 15*60*1000, path: '/' });

// Refresh token: path-scoped to reduce exposure
res.cookie('refreshToken', rawToken, { ...base, maxAge: 7*24*60*60*1000, path: '/api/auth' });
```

The `path: '/api/auth'` scoping means the refresh cookie is only sent to `/api/auth/*` endpoints — the browser won't include it in requests to `/api/trips` etc.

### Logout

```
POST /api/auth/logout
```

- Reads the `refreshToken` cookie
- Deletes the specific `RefreshToken` document by hash (only this session)
- Other sessions (other devices) remain valid
- Clears both cookies with `maxAge: 0`

---

## 3. Email Verification

### Schema Fields on User

```typescript
emailVerified: boolean                  // default: false
emailVerificationTokenHash?: string     // SHA-256(rawToken), select:false
emailVerificationExpiresAt?: Date       // 24 hours after generation, select:false
```

The raw token is never stored — only its SHA-256 hex digest.

### Registration Flow

```
POST /api/auth/register
  1. Validate input fields
  2. Check for existing account:
     a. emailVerified: true  → 400 "already exists" (hard block)
     b. emailVerified: false → reuse existing record, regenerate token + resend
        (prevents duplicate records when a prior send failed)
     c. No existing user    → create new User with emailVerified: false
  3. Generate 32-byte random token, store SHA-256 hash + 24-hour expiry
  4. AWAIT emailService.sendVerificationEmail() — synchronous, not fire-and-forget
     → EMAIL_MODE=mock: logs the full URL to server console, always succeeds
     → EMAIL_MODE=live: sends via Gmail SMTP (nodemailer)
  5a. Email send succeeds  → 201 { message, email } — frontend navigates to /verify-pending
  5b. Email send fails     → 500 { error, code: 'EMAIL_SEND_FAILED', email }
       • User record still exists (not lost)
       • Frontend shows inline error + targeted "Try sending again" action
         that calls resend-verification (not the full form re-submit)
       • Real provider error logged server-side; never exposed to client
```

**Phase 12 change from Phase 11:** Registration is now atomic with respect to email delivery. The 201 response is only issued if the verification email actually dispatches. This ensures the frontend's "check your inbox" page is shown only when there is actually an email to check.

### Verification Endpoint

```
GET /api/auth/verify-email?token=<rawToken>
```

**Why GET, not POST:** The verification link appears in an email. Users click it — that's a GET. Requiring a POST would mean the link needs to open a form that the user then submits, adding friction. The token itself is the authorization credential; method semantics are less important here than UX.

```
1. Hash incoming token → tokenHash
2. Find User where emailVerificationTokenHash=tokenHash AND expiresAt > now
3. If not found → 400 VERIFY_INVALID
4. If already emailVerified → 200 (idempotent success)
5. Set emailVerified:true, clear token fields
6. Fire-and-forget welcome email
7. 200 OK
```

### Resend Endpoint

```
POST /api/auth/resend-verification
  body: { email }
```

**Phase 12 change from Phase 11:** The email send is now awaited (no longer fire-and-forget):
- On send success → `200 { message: "Verification email sent. Check your inbox." }`
- On send failure → `500 { error, code: 'EMAIL_SEND_FAILED' }` — frontend shows retry action
- Unknown or already-verified email → `200` (anti-enumeration; caller cannot distinguish)

### Login Gate

```
POST /api/auth/login — email verification check
```

**Phase 12 change from Phase 11:** The hard gate is now unconditional (previously opt-in via `EMAIL_VERIFY_REQUIRED=true`). After password verification succeeds:

- `emailVerified: true`  → issue token pair → `200`
- `emailVerified: false` → `403` with `{ error: "...", code: "EMAIL_NOT_VERIFIED" }` — NO tokens issued

**Why 403 (not 401) for unverified accounts:**
- `401` means the identity could not be confirmed — wrong credentials
- `403` means the identity IS confirmed but access is forbidden — correct credentials, just not yet verified
- Using a distinct status code and `code` field lets the frontend branch to a targeted "Resend verification" UX on the login form itself, rather than showing the confusing generic "invalid credentials" message

**Anti-enumeration strategy (preserved from Phase 11):**
- No user found OR wrong password → `401` with the SAME generic message (`"Invalid email or password."`)
- Correct password AND email IS verified → `200` with tokens
- Correct password BUT email NOT verified → `403` with `EMAIL_NOT_VERIFIED`
  (safe to distinguish: the user already knows their email is registered here)

### Non-Blocking vs. Hard-Block Decision

> **⚠️ Phase 12 supersedes the Phase 11 decision. The hard gate is now unconditional.**

**Phase 11 decision (non-blocking):** Users could log in with an unverified email and see a dismissible reminder banner. Hard block was opt-in via `EMAIL_VERIFY_REQUIRED=true`.

**Phase 12 decision (hard gate):** Unverified accounts cannot receive auth tokens under any circumstances. `EMAIL_VERIFY_REQUIRED=true` env var is removed — the gate is always on.

**Why this reversal:**
A launching product needs to guarantee email ownership before granting access. Email verification is the only proof that the person who created the account controls the inbox. Without it:
- Password reset emails go to unverified addresses the attacker may not control
- The resend-verification flow (added in Phase 11) provides a recovery path for delivery failures — users are never permanently locked out
- If the email delivery fails, the frontend shows a specific `EMAIL_SEND_FAILED` error with a targeted retry action, not a dead end

**Why the resend flow makes hard-gating safe:**
The Phase 11 concern was "what if transient email delivery fails and locks the user out?" The resend endpoint + `EMAIL_SEND_FAILED` response code solve this: the user gets an actionable error, not a silent failure, and can retry immediately without re-submitting the registration form.

---

## 4. Google OAuth — Three-Case Upsert

### Implementation Approach: GIS + Server-Side Token Verification

**Chosen approach:** Google Identity Services (GIS) frontend button → signed ID token → `POST /api/auth/google` → `google-auth-library` server-side `verifyIdToken()`.

**Why not Passport.js (the LifeLine reference approach):**  
The LifeLine reference project uses `passport-google-oauth20` with a redirect-based flow (server initiates the OAuth redirect, handles the callback URL, stores state in a server session). This works for server-rendered apps. For this project — an Express API + Next.js SPA on different origins — a redirect flow requires:
1. Cross-origin redirect handling (complex CORS for redirects)
2. A server-side session store to pass state through the redirect
3. The callback URL must be on the Express server, meaning the user is redirected to the API domain, then redirected back to the frontend

The GIS approach is cleaner for this architecture: the OAuth dialog runs in the browser, the signed ID token comes back to the frontend, and the frontend sends it to the API. The API verifies it with Google's public keys. No sessions, no redirects, no CORS complications.

### Three-Case Logic

```
POST /api/auth/google
  body: { idToken }

Server:
  1. verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })
     → extracts { sub: googleUserId, email, name }

  Case 1: User.findOne({ googleId: sub }) → found
     → Returning Google user → issue token pair → 200

  Case 2: No googleId match, but User.findOne({ email }) → found
     → Existing local account with same email → auto-link:
        User.update({ googleId: sub, emailVerified: true })
     → Issue token pair → 200

  Case 3: No match at all → new user
     → User.create({ email, name, googleId: sub, emailVerified: true })
     → Issue token pair → 201
```

### Case 2: Auto-Link Decision

**Decision: auto-link on email match (no password confirmation required).**

The alternative is to reject Case 2 and tell the user "an account with this email already exists, log in with your password first." This is what the LifeLine Passport strategy does.

**Why auto-link here:**  
Google has already verified the email address. A user who can sign in with Google to `user@gmail.com` is the same person who can receive password-reset emails at `user@gmail.com`. The security risk of auto-linking is equivalent to the existing password-reset flow — both allow someone with email access to take over the account. Since email access is already the account recovery path, auto-linking doesn't meaningfully lower the security bar.

**The trade-off:** A malicious actor who gained access to the Google account *and* knows the email is registered on this platform could link Google to the existing account. Requiring password confirmation before linking would block this scenario. If you need that additional barrier, switch to the "reject Case 2" approach and build a multi-step linking flow.

### Case 3: emailVerified: true for Google Users

Google has already verified the email — users don't need to verify it again through this platform. Creating Google users with `emailVerified: true` means they never see the verification banner.

### passwordHash: Optional

Google-only accounts have no `passwordHash` field (it's `undefined`). This is enforced at the controller layer:
- `login` checks `if (!user.passwordHash)` and returns a specific error directing the user to Google Sign-In
- `register` requires a password (via request body validation)
- The Mongoose schema no longer has `required: true` on `passwordHash` because the built-in `required` validator can't express "required unless googleId is set"

---

## 5. Object-Level Authorization

Object-level authorization is unaffected by all Phase 11 changes. The pattern:

```typescript
// Trip controller — the userId check is what provides authorization
const trip = await Trip.findOne({ _id: tripId, userId: req.user.id });
if (!trip) throw notFoundError('Trip'); // same error for "not found" and "not yours"
```

Every resource query includes both `_id` and `userId`. An authenticated user who requests someone else's trip gets the same 404 as a request for a non-existent trip. This prevents:
- Enumeration of other users' trip IDs
- IDOR (Insecure Direct Object Reference) attacks

This pattern is implemented in `trip.controller.ts` and is unchanged by the token architecture.

---

## 6. Reference Project: What Was Kept vs. Changed

The LifeLine Australia project (`~/Desktop/LifeLine Australia`) was reviewed before implementing Phase 11. Here's what was adopted vs. adapted vs. replaced:

| Pattern | LifeLine Reference | This Project | Reason |
|---|---|---|---|
| Three-case Google upsert | Two variants (Passport strategy: reject Case 2; authService: auto-link Case 2) | Auto-link (authService approach) | Google has already verified the email; security profile matches password-reset access |
| `crypto.randomBytes(32).toString('hex')` | ✅ Used | ✅ Kept identical | Proven correct pattern for opaque tokens |
| `SHA-256` hash for DB storage | ✅ Used | ✅ Kept identical | Never store raw tokens |
| Refresh token revocation on use | ✅ Implemented | ✅ Kept + extended with theft detection | Same core idea, added deleteMany on theft signal |
| Refresh token as JWT | ✅ JWT (verifiable) | ❌ Changed → opaque random hex | Opaque token has no value without DB row; true server-side revocation |
| Passport.js redirect flow | ✅ Used | ❌ Replaced → GIS + `google-auth-library` | API-only backend; redirect flow requires cross-origin session handling |
| CSRF cookie | ✅ Third cookie (JS-readable) | ❌ Not implemented | SameSite=None provides CSRF protection for cross-origin; see §7 |
| Hard-block on unverified email | ✅ (403 on login) | ✅ Phase 12: hard gate, unconditional (Phase 11 non-blocking banner is superseded) | Launching product must guarantee email ownership; resend flow provides recovery path |
| Passport sessions | ✅ Server-side session store | ❌ Replaced → stateless tokens | Stateless is simpler for API-only backend |
| `EMAIL_MODE` mock guard | Similar concept | ✅ Adapted | Same pattern as existing `WEATHER_MOCK`; same dev-safety rationale |

---

## 7. CSRF Considerations

The LifeLine reference issues a third `csrfToken` cookie (not `httpOnly`, readable by JS) to enable double-submit CSRF protection.

**This project does not implement a CSRF cookie.** Here's why:

**`SameSite=None` + `Secure` provides CSRF mitigation for cross-origin deployment.** The browser sends the cookies to any origin that matches the `credentials: 'include'` fetch — but CSRF attacks (attacker-controlled pages) cannot use `credentials: 'include'` without the CORS `Access-Control-Allow-Credentials: true` header. This project's CORS config only allows the specific `FRONTEND_URL` origins, so cross-origin CSRF requests are blocked at the CORS layer.

**The trade-off:** `SameSite=None` is weaker than `SameSite=Strict` for CSRF. A CSRF token would add a second layer of protection. If the threat model requires defense-in-depth against CSRF, add the double-submit cookie pattern:
1. On login, generate a random CSRF token, set it as a non-`httpOnly` cookie
2. Client reads it from `document.cookie` and sends it as a request header
3. Server compares header value to cookie value
4. Mismatch → reject (CSRF attack — attacker can't read the `httpOnly` cookie value)

This is a known gap, not an oversight.
