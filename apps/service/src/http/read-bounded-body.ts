import { ServiceTransportError } from './service-error.js';

/** Читает не более operation limit и сохраняет исходные bytes для подписанных payload. */
export async function withBoundedBody(request: Request, limit: number | undefined): Promise<Request> {
  if (limit === undefined || request.body === null) return request;
  const declared = Number(request.headers.get('content-length') ?? 0);
  const tooLarge = () => new ServiceTransportError('PAYLOAD_TOO_LARGE', 413, 'Request body exceeds its operation limit.');
  if (declared > limit) throw tooLarge();
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > limit) throw tooLarge();
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Request(request.url, { method: request.method, headers: request.headers, signal: request.signal, body: bytes.buffer });
}
