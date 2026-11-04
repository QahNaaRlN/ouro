/** Ожидаемая ошибка admission/размера на транспортной границе. */
export class ServiceTransportError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); }
}

/** Формирует безопасную transport error без исходного исключения и секретов. */
export function serviceError(code = 'INTERNAL_ERROR', status = 500, message = 'Operation outcome is not confirmed.'): Response {
  return Response.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}
