import { AccessError } from './auth';
export function apiError(error: unknown): Response {
  const e = error as {code?: string; message?: string; status?:number; details?:Record<string,unknown>};
  const code = e.code ?? 'INTERNAL_ERROR';
  const status = error instanceof AccessError ? error.status :
    /CONFLICT|ALREADY_RESOLVED|ALREADY_MEMBER|CURSOR_AHEAD|ACCOUNT_EXISTS/.test(code) ? 409 :
    code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : code === 'RATE_LIMITED' ? 429 :
    code === 'INVITATION_LOGIN_REQUIRED' ? 401 : ['MAIL_NOT_CONFIGURED','MAIL_DELIVERY_FAILED'].includes(code) ? 503 :
    /VALIDATION|TRANSITION|LIMIT|DEPENDENCY_CYCLE/.test(code)||['EXTERNAL_STOP_UNCONFIRMED','CORRECTION_REQUIRES_REVISION','AGENT_NOT_REVOKED','LAST_OWNER','INVITATION_INVALID','RESET_INVALID','BINDING_RECOVERY_TICKET_INVALID','BINDING_RECOVERY_TICKET_EXPIRED'].includes(code) ? 422 : 500;
  if (status === 500) console.error(error);
  return Response.json({error:{code, message: status === 500 ? 'Не удалось выполнить операцию. Данные не подтверждены; повторите чтение.' : e.message, ...(status!==500 && e.details ? {details:e.details} : {})}}, {status, headers:{'Cache-Control':'no-store'}});
}
