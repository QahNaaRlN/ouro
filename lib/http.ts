import { AccessError } from './auth';
export function apiError(error: unknown): Response {
  const e = error as {code?: string; message?: string; status?:number; details?:Record<string,unknown>};
  const code = e.code ?? 'INTERNAL_ERROR';
  const status = error instanceof AccessError ? error.status :
    /CONFLICT|ALREADY_RESOLVED|CURSOR_AHEAD/.test(code) ? 409 : code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : /VALIDATION|TRANSITION|LIMIT|DEPENDENCY_CYCLE/.test(code) ? 422 : 500;
  if (status === 500) console.error(error);
  return Response.json({error:{code, message: status === 500 ? 'Не удалось выполнить операцию. Данные не подтверждены; повторите чтение.' : e.message, ...(status!==500 && e.details ? {details:e.details} : {})}}, {status, headers:{'Cache-Control':'no-store'}});
}
