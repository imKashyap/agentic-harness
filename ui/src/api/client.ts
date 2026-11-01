export const API_ORIGIN = import.meta.env.VITE_API_URL || 'http://localhost:3000';
export const API_BASE_URL = `${API_ORIGIN}/v1`;

export const DEFAULT_USER_ID = 'default-user';

export function getUserId(): string {
  return localStorage.getItem('userId') || DEFAULT_USER_ID;
}

export function setUserId(userId: string): void {
  localStorage.setItem('userId', userId);
}

export async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : endpoint.startsWith('/health')
    ? `${API_ORIGIN}${endpoint}`
    : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': getUserId(),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}
