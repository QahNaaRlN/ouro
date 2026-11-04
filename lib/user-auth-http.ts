import { z } from 'zod';
import { AccessError, readCommandBody, userSessionCookie,defaultAuthService,type AuthService } from './auth';
import { requestOrigin } from './connection-config';
import { apiError } from './http';
import type { UserAuth } from './user-auth';

export type UserAuthHttpDependencies = { getAuth?: () => Promise<UserAuth>;auth?:AuthService };
const loginInput = z.strictObject({ email: z.string().max(254), password: z.string().max(128) });
const empty = z.strictObject({});
const json = (data: unknown, status = 200, headers?: HeadersInit) => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return Response.json(data, { status, headers: responseHeaders });
};
export const userSessionCookieName = 'ouro_user_session';

export function sessionCookie(request: Request, value: string, maxAge = 43_200,origin:typeof requestOrigin=requestOrigin) {
  return `${userSessionCookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${origin(request).startsWith('https:') ? '; Secure' : ''}`;
}

export function createUserAuthHandlers(dependencies: UserAuthHttpDependencies = {}) {
  const {readCommandBody,requestOrigin}=dependencies.auth??defaultAuthService;
  const auth = dependencies.getAuth ?? (async () => (await import('./store')).getUserAuth());
  return {
    async login(request: Request) {
      try {
        requestOrigin(request);
        const input = loginInput.safeParse(await readCommandBody(request));
        if (!input.success) throw new AccessError('UNAUTHENTICATED', 'Email или пароль неверны.', 401);
        const login = await (await auth()).authenticate(input.data.email, input.data.password);
        if (!login) throw new AccessError('UNAUTHENTICATED', 'Email или пароль неверны.', 401);
        const headers = new Headers();
        headers.append('Set-Cookie', sessionCookie(request, login.token,43_200,requestOrigin));
        headers.append('Set-Cookie', 'ouro_participant=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        headers.append('Set-Cookie', 'ouro_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        return json({ account: login.account, actor: login.actor, expiresAt: login.expiresAt }, 200, headers);
      } catch (error) { return apiError(error); }
    },
    async logout(request: Request) {
      try {
        requestOrigin(request);
        if (!empty.safeParse(await readCommandBody(request)).success) throw new AccessError('VALIDATION_ERROR', 'Выход принимает пустое JSON-тело.', 422);
        const token = userSessionCookie(request);
        if (token) await (await auth()).revokeSession(token);
        const headers = new Headers();
        headers.append('Set-Cookie', sessionCookie(request, '', 0,requestOrigin));
        headers.append('Set-Cookie', 'ouro_participant=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        headers.append('Set-Cookie', 'ouro_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        return json({ ok: true }, 200, headers);
      } catch (error) { return apiError(error); }
    },
    async session(request: Request) {
      try {
        requestOrigin(request);
        const token = userSessionCookie(request);
        const session = token ? await (await auth()).resolveSession(token) : null;
        if (!session) throw new AccessError('UNAUTHENTICATED', 'Требуется вход по email и паролю.', 401);
        return json(session);
      } catch (error) { return apiError(error); }
    },
  };
}

export type UserAuthHandlers = ReturnType<typeof createUserAuthHandlers>;
