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
   * register — creates an unverified account.
   * Phase 11: no longer issues tokens or logs the user in.
   * Returns the message to display ("check your email").
   * The frontend shows a success state and does NOT redirect to dashboard.
   */
  register: (data: RegisterRequest) => Promise<{ message: string; email: string }>;

  /** login — authenticates, sets access+refresh cookies, populates user state */
  login: (data: LoginRequest) => Promise<void>;

  /** loginWithGoogle — sends GIS ID token to backend, three-case upsert, sets cookies */
  loginWithGoogle: (idToken: string) => Promise<void>;

  /** logout — revokes refresh token server-side, clears both cookies, clears user state */
  logout: () => Promise<void>;

  /**
   * resendVerification — requests a new verification email for the given address.
   * Anti-enumeration: always succeeds regardless of whether email exists.
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
    await api.post('/api/auth/resend-verification', { email });
    // Always succeeds from the client's perspective (anti-enumeration)
  },
}));

export { ApiError };
