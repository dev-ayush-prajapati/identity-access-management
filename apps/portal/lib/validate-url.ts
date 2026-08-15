// Applications store an admin-entered URL that later gets rendered as a
// clickable <a href> on the Employee dashboard. Without this check, a
// javascript: or data: URL would execute in the clicking Employee's
// authenticated session — reject anything that isn't a plain http(s) link.
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
