
export const TOKEN_KEY = "access_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function getUserId(): string | number | null {
  const token = getToken();
  if (!token) return null;
  try {
    const [, payloadB64] = token.split(".");
    const json = JSON.parse(atob(payloadB64));
    return (
      json?.user_id || json?.userId || json?.id || json?.sub || null
    );
  } catch {
    return null;
  }
}
