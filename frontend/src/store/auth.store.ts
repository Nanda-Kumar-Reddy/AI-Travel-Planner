import { create } from 'zustand';
import { api, ApiError, resetRefreshState } from '../lib/api';
import type {
  User,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  GoogleAuthRequest,
} from '../../../shared/src/index';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean; // true once the initial /me check has completed

  // Actions
  setUser: (user: User | null) => void;

  /**
   * init — called once on app load (in root layout via AuthProvider).
   * Hits GET /api/auth/me to check if the httpOnly access cookie is valid.
   * Sets user if authenticated, null if not. Always sets isInitialized = true.
   *
   * Phase 11: the /me endpoint now also triggers the silent refresh interceptor
   * in api.ts if the access token is expired but the refresh token is still valid.
   */
  init: () => Promise<void>;

  /**
   * register — creates an unverified account and sends verification email.
   *
   * Phase 12: registration is now atomic with respect to email delivery.
   * Returns { message, email } on success (email sent, frontend navigates to /verify-pending).
   * Throws ApiError with code='EMAIL_SEND_FAILED' if account was created but
   * email send failed (frontend shows inline error + resend action, not a full re-submit).
   */
  register: (data: RegisterRequest) => Promise<{ message: string; email: string }>;

  /**
   * login — authenticates and sets access+refresh cookies.
   * Phase 12: throws ApiError with code='EMAIL_NOT_VERIFIED' (403) if the
   * account has correct credentials but email is not yet verified.
   */
  login: (data: LoginRequest) => Promise<void>;

  /** loginWithGoogle — sends GIS ID token to backend, three-case upsert, sets cookies */
  loginWithGoogle: (idToken: string) => Promise<void>;

  /** logout — revokes refresh token server-side, clears both cookies, clears user state */
  logout: () => Promise<void>;

  /**
   * resendVerification — requests a new verification email for the given address.
   *
   * Phase 12: now throws on EMAIL_SEND_FAILED so the UI can show a specific
   * error with retry action, rather than silently succeeding or failing.
   * Anti-enumeration: if the email is unknown or already verified, the backend
   * returns 200 and this resolves normally (caller cannot distinguish).
   */
  resendVerification: (email: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,

  setUser: (user) => set({ user }),

  init: async () => {
    set({ isLoading: true });
    try {
      const { user } = await api.get<AuthResponse>('/api/auth/me');
      set({ user, isInitialized: true, isLoading: false });
    } catch {
      // 401 = no valid session (or refresh failed) — expected, not an error
      set({ user: null, isInitialized: true, isLoading: false });
    }
  },

  register: async (data: RegisterRequest) => {
    set({ isLoading: true });
    try {
      const result = await api.post<RegisterResponse>('/api/auth/register', data);
      set({ isLoading: false });
      return result; // { message, email } — caller shows success UI
    } catch (err) {
      set({ isLoading: false });
      throw err; // re-throw so the form can display the error
    }
  },

  login: async (data: LoginRequest) => {
    set({ isLoading: true });
    try {
      const { user } = await api.post<AuthResponse>('/api/auth/login', data);
      // Clear any stale refresh-failed flag from a previous session
      resetRefreshState();
      set({ user, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  loginWithGoogle: async (idToken: string) => {
    set({ isLoading: true });
    try {
      const { user } = await api.post<AuthResponse>('/api/auth/google', { idToken } satisfies GoogleAuthRequest);
      // Clear any stale refresh-failed flag from a previous session
      resetRefreshState();
      set({ user, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      // Server revokes the specific refresh token and clears both cookies
      await api.post('/api/auth/logout');
    } catch {
      // Even if the server call fails, clear client state
    } finally {
      set({ user: null, isLoading: false });
    }
  },

  resendVerification: async (email: string) => {
    // Phase 12: propagate errors so the UI can distinguish success from failure.
    // The backend returns EMAIL_SEND_FAILED (500) on provider errors, which the
    // ApiError carries as err.code. Anti-enumeration: unknown/already-verified
    // emails still return 200 — those resolve normally here.
    await api.post('/api/auth/resend-verification', { email });
  },
}));

export { ApiError };
