// Casual client-side gate, not authentication. Only a salted verifier is shipped;
// a visitor who edits the JavaScript can still bypass the gate.
const SALT = 'af4fe6b76d7a25b7a458b72c09a8470b';
const EXPECTED = '9de005f78e0ecdafe2c148cb1b4e96711b9b5a5285afefc0df9d6c68235d30bd';
const bytes = hex => Uint8Array.from(hex.match(/../g), part => parseInt(part, 16));

export async function verifyPassword(value) {
  if (typeof value !== 'string' || !value || value.length > 256) return false;
  if (!crypto.subtle) throw new Error('Secure browser APIs are unavailable.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(value), 'PBKDF2', false, ['deriveBits']);
  const derived = new Uint8Array(await crypto.subtle.deriveBits({name: 'PBKDF2', salt: bytes(SALT), iterations: 180000, hash: 'SHA-256'}, key, 256));
  const expected = bytes(EXPECTED);
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= derived[index] ^ expected[index];
  return difference === 0;
}
