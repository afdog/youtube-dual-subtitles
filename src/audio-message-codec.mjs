export function decodeFloat32Base64(encoded) {
  if (typeof encoded !== "string" || !encoded) return null;
  let binary;
  try {
    binary = atob(encoded);
  } catch {
    return null;
  }
  if (!binary.length || binary.length % Float32Array.BYTES_PER_ELEMENT !== 0) return null;
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Float32Array(bytes.buffer);
}
