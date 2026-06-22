/**
 * API client — all requests go through here.
 *
 * Phase 11 additions:
 *  - Silent refresh interceptor: on a 401, attempt POST /api/auth/refresh once.
 *    If refresh succeeds, retry the original request. If refresh also fails,
 *    clear auth state — the ProtectedRoute component handles the /login redirect.
 *
 * CRITICAL DESIGN NOTE — why we use a shared Promise, not a boolean flag:
 *   If multiple requests fire 401 simultaneously (common on page load), a boolean
 *   flag would only block the 2nd+ callers from starting a new refresh — it would
 *   NOT give them the result of the in-flight refresh. They'd all fail with 401.
 *   A shared Promise lets every concurrent 401 waiter get the same refresh result:
 *   the first caller creates the promise, subsequent callers await the same instance.
 *
 * CRITICAL DESIGN NOTE — why we never call window.location.href in the interceptor:
 *   Calling window.location.href = '/login' causes a full page reload. This remounts
 *   AuthProvider, which calls init() again, which hits /me (401), which triggers
 *   another refresh, which fails, which calls window.location.href = '/login' → loop.
 *   Instead we just set user = null. ProtectedRoute detects user=null and redirects
 *   via React Router (no page reload, no loop).
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

interface RequestOptions extends RequestInit {
  data?: unknown;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
    // Full response JSON body — allows callers to access extra fields like `email`
    // that the backend sends alongside `error` and `code`.
    public data?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Refresh state ─────────────────────────────────────────────────────────────
//
// refreshPromise: shared in-flight promise for the current refresh attempt.
//   - null  → no refresh in progress
//   - Promise<boolean> → refresh in progress; all concurrent callers await this
//
// hasRefreshFailed: once a refresh fails in this page session, stop retrying.
//   Prevents cascading refresh attempts if the refresh token is expired/revoked.
//   Reset on successful authenticated request (not currently implemented — the
//   module is effectively reset on full page navigation anyway).

let refreshPromise: Promise<boolean> | null = null;
let hasRefreshFailed = false;

async function attemptSilentRefresh(): Promise<boolean> {
  // If a refresh already failed this session, don't retry
  if (hasRefreshFailed) return false;

  // If a refresh is already in flight, wait for IT instead of starting a new one.
  // This is what coalesces concurrent 401s into a single refresh request.
  if (refreshPromise) {
    return refreshPromise;
  }

  // Start the refresh. Store the promise so concurrent callers can attach to it.
  refreshPromise = fetch(`${BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then(async (response) => {
      if (response.ok) {
        return true; // New access + refresh cookies are now set
      }

      // Refresh failed (401 = token expired/revoked/theft-detected).
      // Mark as failed so we don't retry again in this session.
      hasRefreshFailed = true;

      // Clear user state in the Zustand store.
      // We do NOT call window.location.href here — that would cause a full page
      // reload and trigger an infinite loop via AuthProvider → init() → /me → 401.
      // Instead, ProtectedRoute reacts to user=null and redirects via React Router.
      if (typeof window !== 'undefined') {
        // Dynamic import to avoid circular dependency: api.ts ↔ auth.store.ts
        const { useAuthStore } = await import('../store/auth.store');
        useAuthStore.getState().setUser(null);
      }

      return false;
    })
    .catch(() => {
      // Network error during refresh — treat as failure
      hasRefreshFailed = true;
      return false;
    })
    .finally(() => {
      // Clear the shared promise so future requests (after this session completes)
      // can trigger a new refresh if needed
      refreshPromise = null;
    });

  return refreshPromise;
}

/**
 * resetRefreshState — call this after a successful explicit login to clear
 * the hasRefreshFailed flag so silent refresh works in the new session.
 * Exported so auth.store.ts can call it on login/loginWithGoogle.
 */
export function resetRefreshState(): void {
  refreshPromise = null;
  hasRefreshFailed = false;
}

// ── Core request function ─────────────────────────────────────────────────────

async function request<T>(endpoint: string, options: RequestOptions = {}, _isRetry = false): Promise<T> {
  const { data, headers = {}, ...rest } = options;

  const config: RequestInit = {
    ...rest,
    credentials: 'include', // send httpOnly cookies on every request
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (data !== undefined) {
    config.body = JSON.stringify(data);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, config);

  // Handle empty responses (e.g. 204 No Content)
  const contentType = response.headers.get('content-type');
  const json = contentType?.includes('application/json')
    ? await response.json()
    : null;

  if (!response.ok) {
    // ── Silent refresh interceptor ────────────────────────────────────────────
    // Trigger on 401 from any endpoint EXCEPT:
    //   - /api/auth/refresh itself   → would cause an infinite loop
    //   - /api/auth/login            → credentials are wrong, not expired
    //   - /api/auth/register         → no session expected
    //   - retry calls (_isRetry)     → already retried once, don't retry again
    if (
      response.status === 401 &&
      !_isRetry &&
      !endpoint.includes('/api/auth/refresh') &&
      !endpoint.includes('/api/auth/login') &&
      !endpoint.includes('/api/auth/register')
    ) {
      const refreshed = await attemptSilentRefresh();
      if (refreshed) {
        // Refresh succeeded: retry the original request with the new access cookie
        return request<T>(endpoint, options, true /* _isRetry = true */);
      }
      // Refresh failed: user=null has been set, ProtectedRoute will redirect.
      // Fall through to throw the 401 ApiError below.
    }
    // Note: 403 responses (e.g. EMAIL_NOT_VERIFIED) are intentionally NOT
    // intercepted here — they are forbidden-action responses, not expired tokens.
    // They propagate directly to the caller so the UI can branch on the error code.
    // ─────────────────────────────────────────────────────────────────────────

    throw new ApiError(
      json?.error || `Request failed with status ${response.status}`,
      response.status,
      json?.code,
      json ?? undefined  // full response body available to callers
    );
  }

  return json as T;
}

export const api = {
  get:    <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post:   <T>(endpoint: string, data?: unknown) => request<T>(endpoint, { method: 'POST', data }),
  patch:  <T>(endpoint: string, data?: unknown) => request<T>(endpoint, { method: 'PATCH', data }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};
