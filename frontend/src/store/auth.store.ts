import { create } from 'zustand';
import { api, ApiError } from '../lib/api';
import type { User, AuthResponse, LoginRequest, RegisterRequest } from '../../../shared/src/index';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean; // true once the initial /me check has completed

  // Actions
  setUser: (user: User | null) => void;

  /**
   * init — called once on app load (in root layout or a client provider).
   * Hits GET /api/auth/me to check if the httpOnly cookie is valid.
   * Sets user if authenticated, null if not. Always sets isInitialized = true.
   */
  init: () => Promise<void>;

  /** register — creates account, sets cookie, populates user state */
  register: (data: RegisterRequest) => Promise<void>;

  /** login — authenticates, sets cookie, populates user state */
  login: (data: LoginRequest) => Promise<void>;

  /** logout — clears cookie server-side, clears user state */
  logout: () => Promise<void>;
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
      // 401 = no valid session — expected, not an error
      set({ user: null, isInitialized: true, isLoading: false });
    }
  },

  register: async (data: RegisterRequest) => {
    set({ isLoading: true });
    try {
      const { user } = await api.post<AuthResponse>('/api/auth/register', data);
      set({ user, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err; // re-throw so the form can display the error
    }
  },

  login: async (data: LoginRequest) => {
    set({ isLoading: true });
    try {
      const { user } = await api.post<AuthResponse>('/api/auth/login', data);
      set({ user, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Continue even if server call fails — clear client state regardless
    } finally {
      set({ user: null, isLoading: false });
    }
  },
}));

export { ApiError };
