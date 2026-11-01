import { z } from 'zod';
import { AccessError, readCommandBody, userSessionCookie } from './auth';
import { requestOrigin } from './connection-config';
import { apiError } from './http';
import type { ProjectService } from './projects';
import type { UserAuth } from './user-auth';
import { sessionCookie } from './user-auth-http';

type ControlStore = ProjectService & UserAuth;
export type ProjectHttpDependencies = { getStore?: () => Promise<ControlStore> };
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const role = z.enum(['Owner', 'Contributor', 'Viewer']);
const createProjectInput = z.strictObject({ name: z.string().min(1).max(120) });
const inviteInput = z.strictObject({ email: z.string().max(254), role });
const roleInput = z.strictObject({ role });
const acceptInput = z.strictObject({ code: z.string().regex(/^[A-Za-z0-9_-]{43}$/), name: z.string().max(120).optional(), password: z.string().max(128).optional() });
const resetRequestInput = z.strictObject({ email: z.string().max(254) });
const resetConfirmInput = z.strictObject({ code: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: z.string().min(12).max(128) });
const empty = z.strictObject({});
const json = (data: unknown, status = 200, headers?: HeadersInit) => {
  const responseHeaders = new Headers(headers); responseHeaders.set('Cache-Control', 'no-store');
  return Response.json(data, { status, headers: responseHeaders });
};
const valid = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new AccessError('VALIDATION_ERROR', 'Поля запроса не соответствуют контракту.', 422);
  return result.data;
};
const clientKey = (request: Request) => request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'direct';

export function createProjectHandlers(dependencies: ProjectHttpDependencies = {}) {
  const getStore = dependencies.getStore ?? (async () => (await import('./store')).getUserAuth());
  const authenticate = async (request: Request, store: ControlStore, optional = false) => {
    const token = userSessionCookie(request);
    if (!token && optional) return undefined;
    const session = token ? await store.resolveSession(token) : null;
    if (!session) throw new AccessError('UNAUTHENTICATED', 'Требуется действующая пользовательская сессия.', 401);
    return session.actor;
  };
  const mutationHeaders = (request: Request, token: string) => {
    const headers = new Headers({ 'Set-Cookie': sessionCookie(request, token) });
    headers.append('Set-Cookie', 'ouro_participant=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    headers.append('Set-Cookie', 'ouro_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return headers;
  };
  return {
    async listProjects(request: Request) { try {
      requestOrigin(request); const store = await getStore(), actor = (await authenticate(request, store))!;
      return json({ projects: await store.listProjects(actor) });
    } catch (error) { return apiError(error); } },
    async createProject(request: Request) { try {
      requestOrigin(request); const store = await getStore(), actor = (await authenticate(request, store))!;
      const input = valid(createProjectInput, await readCommandBody(request));
      return json({ project: await store.createProject(input, actor) }, 201);
    } catch (error) { return apiError(error); } },
    async listMembers(request: Request, projectId: string) { try {
      requestOrigin(request); const store = await getStore(), actor = (await authenticate(request, store))!;
      return json({ members: await store.listMembers(valid(id, projectId), actor) });
    } catch (error) { return apiError(error); } },
    async changeRole(request: Request, projectId: string, membershipId: string) { try {
      requestOrigin(request); const store = await getStore(), actor = (await authenticate(request, store))!;
      const input = valid(roleInput, await readCommandBody(request));
      return json({ member: await store.changeMemberRole(valid(id, projectId), valid(id, membershipId), input.role, actor) });
    } catch (error) { return apiError(error); } },
    async revokeMember(request: Request, projectId: string, membershipId: string) { try {
      requestOrigin(request); const store = await getStore(), actor = (await authenticate(request, store))!;
      valid(empty, await readCommandBody(request));
      return json({ member: await store.revokeMember(valid(id, projectId), valid(id, membershipId), actor) });
    } catch (error) { return apiError(error); } },
    async listInvitations(request: Request, projectId: string) { try {
      requestOrigin(request); const store = await getStore(), actor = (await authenticate(request, store))!;
      return json({ invitations: await store.listInvitations(valid(id, projectId), actor) });
    } catch (error) { return apiError(error); } },
    async createInvitation(request: Request, projectId: string) { try {
      requestOrigin(request); const store = await getStore(), actor = (await authenticate(request, store))!;
      const input = valid(inviteInput, await readCommandBody(request));
      return json({ invitation: await store.createInvitation(valid(id, projectId), input, actor) }, 201);
    } catch (error) { return apiError(error); } },
    async revokeInvitation(request: Request, projectId: string, invitationId: string) { try {
      requestOrigin(request); const store = await getStore(), actor = (await authenticate(request, store))!;
      valid(empty, await readCommandBody(request));
      return json({ invitation: await store.revokeInvitation(valid(id, projectId), valid(id, invitationId), actor) });
    } catch (error) { return apiError(error); } },
    async acceptInvitation(request: Request) { try {
      requestOrigin(request); const store = await getStore(), actor = await authenticate(request, store, true);
      const input = valid(acceptInput, await readCommandBody(request));
      const result = await store.acceptInvitation(input.code, { name: input.name, password: input.password }, actor);
      return json({ account: result.account, membership: result.membership, expiresAt: result.expiresAt }, 200, mutationHeaders(request, result.token));
    } catch (error) { return apiError(error); } },
    async requestPasswordReset(request: Request) { try {
      requestOrigin(request); const store = await getStore(), input = valid(resetRequestInput, await readCommandBody(request));
      return json(await store.requestPasswordReset(input.email, clientKey(request)));
    } catch (error) { return apiError(error); } },
    async resetPassword(request: Request) { try {
      requestOrigin(request); const store = await getStore(), input = valid(resetConfirmInput, await readCommandBody(request));
      const result = await store.resetPassword(input.code, input.password, clientKey(request));
      return json({ account: result.account, expiresAt: result.expiresAt }, 200, mutationHeaders(request, result.token));
    } catch (error) { return apiError(error); } },
  };
}
