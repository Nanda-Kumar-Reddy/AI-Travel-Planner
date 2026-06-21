/**
 * API client utility
 * All requests go through here so cookie credentials and base URL
 * are applied consistently. The JWT lives in an httpOnly cookie —
 * the browser sends it automatically, no manual token handling needed.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

interface RequestOptions extends RequestInit {
  data?: unknown;
}

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { data, headers = {}, ...rest } = options;

  const config: RequestInit = {
    ...rest,
    credentials: 'include', // send httpOnly cookie on every request
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (data !== undefined) {
    config.body = JSON.stringify(data);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, config);

  // Handle empty responses (e.g., 204 No Content)
  const contentType = response.headers.get('content-type');
  const json = contentType?.includes('application/json')
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new ApiError(
      json?.error || `Request failed with status ${response.status}`,
      response.status,
      json?.code
    );
  }

  return json as T;
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, data?: unknown) => request<T>(endpoint, { method: 'POST', data }),
  patch: <T>(endpoint: string, data?: unknown) => request<T>(endpoint, { method: 'PATCH', data }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};

export { ApiError };
