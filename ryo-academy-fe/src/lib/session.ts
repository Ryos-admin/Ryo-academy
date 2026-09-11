const tokenKey = "ryo-academy-access-token";
const expiryKey = "ryo-academy-access-token-expires-at";

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export const session = {
  getAccessToken: () => localStorage.getItem(tokenKey),
  setAccessToken: (token: string, expiresIn?: number) => {
    localStorage.setItem(tokenKey, token);
    if (expiresIn !== undefined) {
      localStorage.setItem(expiryKey, String(Date.now() + expiresIn * 1000));
    } else {
      localStorage.removeItem(expiryKey);
    }
    notify();
  },
  clear: () => {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(expiryKey);
    notify();
  },
  hasSession: () => Boolean(localStorage.getItem(tokenKey)),
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
