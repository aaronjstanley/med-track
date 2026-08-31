const STORAGE_KEY = "med-track-nfc-token";

export function getStoredNfcToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
    return value.length >= 20 ? value : null;
  } catch {
    return null;
  }
}

export function storeNfcToken(token: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // ignore quota / private mode
  }
}

export function clearStoredNfcToken() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function createNfcToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
