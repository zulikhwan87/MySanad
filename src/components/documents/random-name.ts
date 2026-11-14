/** 20 lowercase base-36 characters from the browser CSPRNG. */
export function randomObjectName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}
