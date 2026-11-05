import type { ServiceRoute, ServiceRequestContext } from '../http/service-types.js';
import type { BackendOptions } from './create-backend.js';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { Command, Actor } from '../../../../packages/core/src/types';
import * as authSource from '../../../../lib/auth';
import * as httpSource from '../../../../lib/http';
import * as receiptSource from '../../../../lib/http-command-receipt';
import * as coreSource from '../../../../packages/core/src';
import * as connectionSource from '../../../../lib/connection-config';
import * as schemaSource from 'zod';
import * as projectSource from '../../../../lib/project-http';
import * as userAuthSource from '../../../../lib/user-auth-http';
import * as collaborativeSource from '../../../../lib/collaborative-http';
import * as githubSource from '../../../../lib/github/http';
import * as healthSource from '../../../../lib/health';
import * as mcpAgentSource from '../../../../packages/mcp/src';
import * as mcpTransportSource from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import * as mcpServerSource from '../../../../packages/mcp/src/server';
import * as meridianSource from '../../../../lib/meridian/http';
import * as participantSource from '../../../../lib/participant-http';
import * as workspaceSource from '../../../../lib/workspace-access';
import * as projectMcpSource from '../../../../packages/mcp/src/http';
import * as streamSource from '../../../../lib/project-stream';
import * as protocolSource from '@ouro/protocol';
import * as cryptoSource from 'node:crypto';
import * as workspaceFilesSource from '../../../../lib/workspace-files';
const authModule = interop(authSource);
const httpModule = interop(httpSource);
const receiptModule = interop(receiptSource);
const coreModule = interop(coreSource);
const connectionModule = interop(connectionSource);
const schemaModule = schemaSource;
const projectModule = interop(projectSource);
const userAuthModule = interop(userAuthSource);
const collaborativeModule = interop(collaborativeSource);
const githubModule = interop(githubSource);
const healthModule = interop(healthSource);
const mcpAgentModule = interop(mcpAgentSource);
const mcpTransportModule = interop(mcpTransportSource);
const mcpServerModule = interop(mcpServerSource);
const meridianModule = interop(meridianSource);
const participantModule = interop(participantSource);
const workspaceModule = interop(workspaceSource);
const projectMcpModule = interop(projectMcpSource);
const streamModule = interop(streamSource);
const protocolModule = interop(protocolSource);
const cryptoModule = interop(cryptoSource);
const workspaceFilesModule = interop(workspaceFilesSource);
function interop<T>(source: T): T {
  return (
    (
      source as T & {
        default?: T;
      }
    ).default ?? source
  );
}
function invoke(
  handler: unknown,
  request: Request,
  params: Readonly<Record<string, string>>,
): Response | Promise<Response> {
  if (typeof handler !== 'function') throw new Error('Missing handler');
  return Reflect.apply(handler, undefined, [request, { params: Promise.resolve(params) }]) as
    Response | Promise<Response>;
}
/** Собирает явные adapters одного backend owner без обращения к legacy defaults. */
function createBackendFacets(options: BackendOptions) {
  const { store, environment } = options;
  const auth = createAuth();
  const workspace = workspaceModule.createWorkspaceAccess({
    getStore: async () => store,
    auth,
    environment,
  });
  const connection = (request: Request, projectId?: string) =>
    connectionModule.connectionConfig(request, projectId, {
      env: environment,
      mcpPath: options.mcpPath ?? path.join(options.resourceRoot, 'packages/mcp/bin/ouro-mcp.mjs'),
      mcpArgs: options.mcpArgs,
    });
  function createAuth() {
    return authModule.createAuthService({
      env: environment,
      sessionSecret: randomBytes(32).toString('hex'),
      resolveUserSession: (token) => store.resolveSession(token),
      resolveParticipantIdentity: (id) => store.resolveParticipantIdentity(id),
      resolveAgentToken: (token) => store.authenticateAgentToken(token),
    });
  }
  return {
    auth: { ...authModule, ...auth },
    http: httpModule,
    receipt: receiptModule,
    store: {
      getWorkspaceStore: async () => store,
      getStorageMode: () => options.storage ?? 'embedded-postgres',
      getProject: (projectId?: string, actor?: Actor) => store.getProject(projectId, actor),
      getEvents: (after = 0, projectId?: string, actor?: Actor) =>
        store.getEvents(after, projectId, actor),
      executeCommand: (body: unknown, actor: Actor, projectId?: string) =>
        store.executeCommand(body, actor, projectId),
      executeCommandWithReceipt: (body: unknown, actor: Actor, projectId?: string) =>
        store.executeCommandWithReceipt(body, actor, projectId),
      createAgent: (name: string, actor: Actor, projectId?: string) =>
        store.createAgent(name, actor, projectId),
      listAgents: (actor: Actor, projectId?: string) => store.listAgents(actor, projectId),
      revokeAgent: (id: string, actor: Actor, projectId?: string) =>
        store.revokeAgent(id, actor, projectId),
    },
    core: coreModule,
    connection: {
      ...connectionModule,
      requestOrigin: auth.requestOrigin,
      connectionConfig: connection,
      assertMcpRequest: (request: Request) =>
        connectionModule.assertMcpRequest(request, environment),
    },
    schema: schemaModule,
    project: {
      ...projectModule,
      createProjectHandlers: () =>
        projectModule.createProjectHandlers({ getStore: async () => store, auth }),
    },
    userAuth: {
      ...userAuthModule,
      createUserAuthHandlers: () =>
        userAuthModule.createUserAuthHandlers({ getAuth: async () => store, auth }),
    },
    collaborative: {
      ...collaborativeModule,
      createCollaborativeHandlers: () =>
        collaborativeModule.createCollaborativeHandlers({ getStore: async () => store, auth }),
    },
    github: {
      ...githubModule,
      createGitHubHandlers: (
        overrides: Parameters<typeof githubModule.createGitHubHandlers>[0] = {},
      ) =>
        githubModule.createGitHubHandlers({
          getStore: async () => store,
          auth,
          env: () => ({
            secret: environment.OURO_GITHUB_WEBHOOK_SECRET,
            token: environment.OURO_GITHUB_TOKEN,
          }),
          kick: options.kickWorker ?? (async () => undefined),
          ...overrides,
        }),
    },
    health: {
      ...healthModule,
      checkHealth: async (...args: Parameters<typeof healthModule.checkHealth>) =>
        options.ready?.() === false
          ? Response.json(
              { status: 'unavailable' },
              { status: 503, headers: { 'Cache-Control': 'no-store' } },
            )
          : healthModule.checkHealth(...args),
    },
    mcpAgent: mcpAgentModule,
    mcpTransport: mcpTransportModule,
    mcpServer: {
      ...mcpServerModule,
      createOuroMcpServer: (settings: Parameters<typeof mcpServerModule.createOuroMcpServer>[0]) =>
        mcpServerModule.createOuroMcpServer({
          ...settings,
          deploymentMode: environment.OURO_DEPLOYMENT_MODE ?? 'local',
        }),
    },
    meridian: {
      ...meridianModule,
      createMeridianImportHandler: () =>
        meridianModule.createMeridianImportHandler({
          auth,
          importScope: (body, actor, projectId) =>
            store.importMeridianScope(body, actor, projectId),
        }),
    },
    participant: {
      ...participantModule,
      createParticipantHandlers: () =>
        participantModule.createParticipantHandlers({ getRegistry: async () => store, auth }),
    },
    workspace: workspace,
    projectMcp: {
      ...projectMcpModule,
      createProjectMcpHandler: (
        getContext: Parameters<typeof projectMcpModule.createProjectMcpHandler>[0],
      ) => projectMcpModule.createProjectMcpHandler(getContext, { auth, environment }),
    },
    stream: {
      ...streamModule,
      createProjectStreamHandler: (
        settings: Parameters<typeof streamModule.createProjectStreamHandler>[0],
      ) =>
        streamModule.createProjectStreamHandler({ ...settings, requestOrigin: auth.requestOrigin }),
    },
    protocol: protocolModule,
    crypto: cryptoModule,
    workspaceFiles: {
      ...workspaceFilesModule,
      browseWorkspaceFolders: (value?: string) =>
        workspaceFilesModule.browseWorkspaceFolders(value ?? options.resourceRoot),
    },
    environment,
  };
}
type BackendFacets = ReturnType<typeof createBackendFacets>;
function bindAgentsIdRevoke(facets: BackendFacets, context: ServiceRequestContext) {
  const { authenticatedParticipant, assertHuman, readCommandBody } = facets.auth;
  const { apiError } = facets.http;
  const { revokeAgent } = facets.store;
  const { AGENT_ID } = facets.core;
  const { requestedProjectId } = facets.connection;
  async function POST(
    request: Request,
    {
      params,
    }: {
      params: Promise<{
        id: string;
      }>;
    },
  ) {
    try {
      const projectId = requestedProjectId(request),
        actor = await authenticatedParticipant(request, projectId, AGENT_ID);
      assertHuman(actor);
      await readCommandBody(request);
      return Response.json(
        { agent: await revokeAgent((await params).id, actor, projectId) },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (e) {
      return apiError(e);
    }
  }
  return { POST };
}
function bindAgents(facets: BackendFacets, context: ServiceRequestContext) {
  const { z } = facets.schema;
  const { authenticatedParticipant, assertHuman, readCommandBody, AccessError } = facets.auth;
  const { apiError } = facets.http;
  const { createAgent, listAgents } = facets.store;
  const { connectionConfig, requestedProjectId } = facets.connection;
  const { AGENT_ID } = facets.core;
  const input = z.object({ name: z.string().trim().min(1).max(100) }).strict();
  async function GET(request: Request) {
    try {
      const projectId = requestedProjectId(request),
        actor = await authenticatedParticipant(request, projectId, AGENT_ID);
      assertHuman(actor);
      return Response.json(
        {
          agents: await listAgents(actor, projectId),
          connection: connectionConfig(request, projectId),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (e) {
      return apiError(e);
    }
  }
  async function POST(request: Request) {
    try {
      const projectId = requestedProjectId(request),
        actor = await authenticatedParticipant(request, projectId, AGENT_ID);
      assertHuman(actor);
      const data = input.safeParse(await readCommandBody(request));
      if (!data.success)
        throw new AccessError('VALIDATION_ERROR', 'Укажите имя агента (1–100 символов).', 422);
      const connection = connectionConfig(request, projectId);
      const result = await createAgent(data.data.name, actor, projectId);
      return Response.json(
        { ...result, connection },
        { status: 201, headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (e) {
      return apiError(e);
    }
  }
  return { GET, POST };
}
function bindAuthInvitationsAccept(facets: BackendFacets, context: ServiceRequestContext) {
  const { createProjectHandlers } = facets.project;
  const POST = createProjectHandlers().acceptInvitation;
  return { POST };
}
function bindAuthLogin(facets: BackendFacets, context: ServiceRequestContext) {
  const { createUserAuthHandlers } = facets.userAuth;
  const POST = createUserAuthHandlers().login;
  return { POST };
}
function bindAuthLogout(facets: BackendFacets, context: ServiceRequestContext) {
  const { createUserAuthHandlers } = facets.userAuth;
  const POST = createUserAuthHandlers().logout;
  return { POST };
}
function bindAuthPasswordResetConfirm(facets: BackendFacets, context: ServiceRequestContext) {
  const { createProjectHandlers } = facets.project;
  const POST = createProjectHandlers().resetPassword;
  return { POST };
}
function bindAuthPasswordResetRequest(facets: BackendFacets, context: ServiceRequestContext) {
  const { createProjectHandlers } = facets.project;
  const POST = createProjectHandlers().requestPasswordReset;
  return { POST };
}
function bindAuthSession(facets: BackendFacets, context: ServiceRequestContext) {
  const { createUserAuthHandlers } = facets.userAuth;
  const GET = createUserAuthHandlers().session;
  return { GET };
}
function bindCommands(facets: BackendFacets, context: ServiceRequestContext) {
  const { authenticatedParticipant, assertHuman, readCommandBody } = facets.auth;
  const { apiError } = facets.http;
  const { executeCommandWithReceipt } = facets.store;
  const { commandReceiptResponse } = facets.receipt;
  const { PROJECT_ID, AGENT_ID } = facets.core;
  const { requestedProjectId } = facets.connection;
  async function POST(request: Request) {
    try {
      const projectId = requestedProjectId(request);
      const actor = await authenticatedParticipant(request, projectId, AGENT_ID);
      assertHuman(actor);
      const result = await executeCommandWithReceipt(
        await readCommandBody(request),
        actor,
        projectId,
      );
      return commandReceiptResponse(result);
    } catch (e) {
      return apiError(e);
    }
  }
  return { POST };
}
function bindDraftsIdPublish(facets: BackendFacets, context: ServiceRequestContext) {
  const { createCollaborativeHandlers } = facets.collaborative;
  async function POST(
    request: Request,
    context: {
      params: Promise<{
        id: string;
      }>;
    },
  ) {
    return createCollaborativeHandlers().publish(request, (await context.params).id);
  }
  return { POST };
}
function bindDraftsId(facets: BackendFacets, context: ServiceRequestContext) {
  const { createCollaborativeHandlers } = facets.collaborative;
  async function GET(
    request: Request,
    context: {
      params: Promise<{
        id: string;
      }>;
    },
  ) {
    return createCollaborativeHandlers().read(request, (await context.params).id);
  }
  return { GET };
}
function bindDraftsIdUpdates(facets: BackendFacets, context: ServiceRequestContext) {
  const { createCollaborativeHandlers } = facets.collaborative;
  async function POST(
    request: Request,
    context: {
      params: Promise<{
        id: string;
      }>;
    },
  ) {
    return createCollaborativeHandlers().update(request, (await context.params).id);
  }
  return { POST };
}
function bindDrafts(facets: BackendFacets, context: ServiceRequestContext) {
  const { createCollaborativeHandlers } = facets.collaborative;
  const GET = (request: Request) => createCollaborativeHandlers().list(request);
  const POST = (request: Request) => createCollaborativeHandlers().create(request);
  return { GET, POST };
}
function bindEvents(facets: BackendFacets, context: ServiceRequestContext) {
  const { authenticatedParticipant, assertHuman } = facets.auth;
  const { apiError } = facets.http;
  const { getEvents } = facets.store;
  const { PROJECT_ID, AGENT_ID } = facets.core;
  const { requestedProjectId } = facets.connection;
  async function GET(request: Request) {
    try {
      const projectId = requestedProjectId(request);
      const actor = await authenticatedParticipant(request, projectId, AGENT_ID);
      assertHuman(actor);
      const after = Number(new URL(request.url).searchParams.get('after') ?? 0);
      if (!Number.isSafeInteger(after) || after < 0)
        return Response.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Курсор должен быть неотрицательным целым.',
            },
          },
          { status: 422 },
        );
      const result = await getEvents(after, projectId, actor);
      if (after > result.cursor)
        return Response.json(
          {
            error: {
              code: 'CURSOR_CONFLICT',
              message: 'Курсор опережает журнал. Загрузите снимок проекта.',
            },
          },
          { status: 409 },
        );
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) {
      return apiError(e);
    }
  }
  return { GET };
}
function bindGithubBindingsIdRevoke(facets: BackendFacets, context: ServiceRequestContext) {
  const { createGitHubHandlers } = facets.github;
  async function POST(
    request: Request,
    {
      params,
    }: {
      params: Promise<{
        id: string;
      }>;
    },
  ) {
    return createGitHubHandlers().revoke(request, (await params).id);
  }
  return { POST };
}
function bindGithubBindings(facets: BackendFacets, context: ServiceRequestContext) {
  const { createGitHubHandlers } = facets.github;
  const POST = (request: Request) => createGitHubHandlers().create(request);
  return { POST };
}
function bindGithubDeliveriesIdRetry(facets: BackendFacets, context: ServiceRequestContext) {
  const after = context.afterResponse;
  const { createGitHubHandlers } = facets.github;
  async function POST(
    request: Request,
    {
      params,
    }: {
      params: Promise<{
        id: string;
      }>;
    },
  ) {
    return createGitHubHandlers({ afterResponse: after }).retry(request, (await params).id);
  }
  return { POST };
}
function bindGithub(facets: BackendFacets, context: ServiceRequestContext) {
  const { createGitHubHandlers } = facets.github;
  const GET = (request: Request) => createGitHubHandlers().list(request);
  return { GET };
}
function bindGithubWebhook(facets: BackendFacets, context: ServiceRequestContext) {
  const after = context.afterResponse;
  const { createGitHubHandlers } = facets.github;
  const POST = (request: Request) =>
    createGitHubHandlers({ afterResponse: after }).webhook(request);
  return { POST };
}
function bindHealth(facets: BackendFacets, context: ServiceRequestContext) {
  const { checkHealth } = facets.health;
  const { getWorkspaceStore, getStorageMode } = facets.store;
  async function GET() {
    return checkHealth(getWorkspaceStore, getStorageMode());
  }
  return { GET };
}
function bindInbox(facets: BackendFacets, context: ServiceRequestContext) {
  const { authenticatedAgent, readCommandBody, AccessError } = facets.auth;
  const { apiError } = facets.http;
  const { executeCommand } = facets.store;
  const { AGENT_ID } = facets.core;
  const { requestedProjectId } = facets.connection;
  const { toDomainCommand } = facets.mcpAgent;
  async function POST(request: Request) {
    try {
      const projectId = requestedProjectId(request),
        actor = await authenticatedAgent(request, projectId, AGENT_ID);
      if (actor.kind !== 'agent')
        throw new AccessError('FORBIDDEN', 'Inbox требует отдельный серверный токен агента.');
      const body = (await readCommandBody(request)) as {
        tool?: unknown;
        arguments?: unknown;
      };
      if (
        !body ||
        typeof body.tool !== 'string' ||
        !body.arguments ||
        typeof body.arguments !== 'object' ||
        Array.isArray(body.arguments)
      )
        throw new AccessError('VALIDATION_ERROR', 'Нужны tool и arguments.', 422);
      const command = toDomainCommand(body.tool, body.arguments as Record<string, unknown>);
      const committed = await executeCommand(command, actor, projectId);
      if (actor.id === AGENT_ID) return Response.json(committed);
      const execution = committed.state.executions.find(
        (e) =>
          e.id === (body.arguments as Record<string, unknown>).executionId &&
          e.agentId === actor.id,
      );
      return Response.json({
        ok: true,
        execution,
        requests: committed.state.requests.filter((r) => r.executionId === execution?.id),
        events: committed.events,
        cursor: committed.cursor,
        replayed: committed.replayed,
      });
    } catch (e) {
      return apiError(e);
    }
  }
  return { POST };
}
function bindMcp(facets: BackendFacets, context: ServiceRequestContext) {
  const { WebStandardStreamableHTTPServerTransport } = facets.mcpTransport;
  const { authenticatedAgent } = facets.auth;
  const { assertMcpRequest, requestedProjectId } = facets.connection;
  const { apiError } = facets.http;
  const { executeCommand, getEvents, getProject } = facets.store;
  const { PROJECT_ID, AGENT_ID } = facets.core;
  const { createOuroMcpServer } = facets.mcpServer;
  async function POST(request: Request) {
    let server: ReturnType<typeof createOuroMcpServer> | undefined;
    try {
      assertMcpRequest(request);
      const projectId = requestedProjectId(request);
      const actor = await authenticatedAgent(request, projectId, AGENT_ID);
      server = createOuroMcpServer({
        store: {
          getProject: () => getProject(projectId, actor),
          getEvents: (after = 0) => getEvents(after, projectId, actor),
          executeCommand: (body, commandActor) => executeCommand(body, commandActor, projectId),
        },
        actor,
        projectId,
      });
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        maxRequestBodySize: 256000,
      });
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      const body = await response.arrayBuffer();
      return new Response(body.byteLength ? body : null, {
        status: response.status,
        headers: response.headers,
      });
    } catch (e) {
      return apiError(e);
    } finally {
      await server?.close();
    }
  }
  const unsupported = () =>
    new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  const GET = unsupported;
  const DELETE = unsupported;
  return { POST, GET, DELETE };
}
function bindMeridianImport(facets: BackendFacets, context: ServiceRequestContext) {
  const { createMeridianImportHandler } = facets.meridian;
  const POST = createMeridianImportHandler();
  return { POST };
}
function bindParticipantsIdRevoke(facets: BackendFacets, context: ServiceRequestContext) {
  const { createParticipantHandlers } = facets.participant;
  const handlers = createParticipantHandlers();
  async function POST(
    request: Request,
    {
      params,
    }: {
      params: Promise<{
        id: string;
      }>;
    },
  ) {
    return handlers.revoke(request, (await params).id);
  }
  return { POST };
}
function bindParticipantsLogout(facets: BackendFacets, context: ServiceRequestContext) {
  const { createParticipantHandlers } = facets.participant;
  const POST = createParticipantHandlers().logout;
  return { POST };
}
function bindParticipants(facets: BackendFacets, context: ServiceRequestContext) {
  const { createParticipantHandlers } = facets.participant;
  const handlers = createParticipantHandlers();
  const GET = handlers.list;
  const POST = handlers.create;
  return { GET, POST };
}
function bindParticipantsSession(facets: BackendFacets, context: ServiceRequestContext) {
  const { createParticipantHandlers } = facets.participant;
  const POST = createParticipantHandlers().login;
  return { POST };
}
function bindProject(facets: BackendFacets, context: ServiceRequestContext) {
  const { authenticatedParticipant, assertHuman } = facets.auth;
  const { apiError } = facets.http;
  const { getProject, getStorageMode } = facets.store;
  const { PROJECT_ID, AGENT_ID } = facets.core;
  const { requestedProjectId } = facets.connection;
  async function GET(request: Request) {
    try {
      const projectId = requestedProjectId(request);
      const actor = await authenticatedParticipant(request, projectId, AGENT_ID);
      assertHuman(actor);
      const state = await getProject(projectId, actor);
      return Response.json(
        { state, cursor: state.version, storage: getStorageMode() },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (e) {
      return apiError(e);
    }
  }
  return { GET };
}
function bindProjectsProjectIdAgentsAgentIdRevoke(
  facets: BackendFacets,
  context: ServiceRequestContext,
) {
  const { z } = facets.schema;
  const { AccessError, readCommandBody } = facets.auth;
  const { resolveWorkspaceRequest } = facets.workspace;
  const { apiError } = facets.http;
  async function POST(
    request: Request,
    {
      params,
    }: {
      params: Promise<{
        projectId: string;
        agentId: string;
      }>;
    },
  ) {
    try {
      const { projectId, agentId } = await params,
        { store, actor } = await resolveWorkspaceRequest(request, projectId);
      if (
        !agentId ||
        agentId.length > 200 ||
        !z.strictObject({}).safeParse(await readCommandBody(request)).success
      )
        throw new AccessError('VALIDATION_ERROR', 'Нужен ID агента и пустое JSON-тело.', 422);
      return Response.json(
        { agent: await store.revokeAgent(agentId, actor) },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      return apiError(error);
    }
  }
  return { POST };
}
function bindProjectsProjectIdAgents(facets: BackendFacets, context: ServiceRequestContext) {
  const { z } = facets.schema;
  const { AccessError, readCommandBody } = facets.auth;
  const { resolveWorkspaceRequest } = facets.workspace;
  const { connectionConfig } = facets.connection;
  const { apiError } = facets.http;
  const input = z.strictObject({ name: z.string().trim().min(1).max(120) });
  async function GET(
    request: Request,
    {
      params,
    }: {
      params: Promise<{
        projectId: string;
      }>;
    },
  ) {
    try {
      const { projectId } = await params,
        { store, actor } = await resolveWorkspaceRequest(request, projectId);
      return Response.json(
        { agents: await store.listAgents(actor), connection: connectionConfig(request, projectId) },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      return apiError(error);
    }
  }
  async function POST(
    request: Request,
    {
      params,
    }: {
      params: Promise<{
        projectId: string;
      }>;
    },
  ) {
    try {
      const { projectId } = await params,
        { store, actor } = await resolveWorkspaceRequest(request, projectId),
        parsed = input.safeParse(await readCommandBody(request));
      if (!parsed.success)
        throw new AccessError(
          'VALIDATION_ERROR',
          'Укажите имя агента (1–120 символов), без посторонних полей.',
          422,
        );
      return Response.json(
        {
          ...(await store.createAgent(parsed.data.name, actor)),
          connection: connectionConfig(request, projectId),
        },
        { status: 201, headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      return apiError(error);
    }
  }
  return { GET, POST };
}
function bindProjectsProjectIdBindingRecovery(
  facets: BackendFacets,
  context: ServiceRequestContext,
) {
  const { readCommandBody } = facets.auth;
  const { resolveLocalWorkspaceRequest } = facets.workspace;
  const { apiError } = facets.http;
  async function GET(
    request: Request,
    {
      params,
    }: {
      params: Promise<{
        projectId: string;
      }>;
    },
  ) {
    try {
      const { projectId } = await params,
        { store, actor } = await resolveLocalWorkspaceRequest(request, projectId);
      return Response.json(
        { projectId, ...(await store.inspectWorkspaceBindingRecovery(actor)) },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      return apiError(error);
    }
  }
  async function POST(
    request: Request,
    {
      params,
    }: {
      params: Promise<{
        projectId: string;
      }>;
    },
  ) {
    try {
      const { store, actor } = await resolveLocalWorkspaceRequest(
        request,
        (await params).projectId,
      );
      const result = await store.recoverWorkspaceBinding(await readCommandBody(request), actor);
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return apiError(error);
    }
  }
  return { GET, POST };
}
function bindProjectsProjectIdCommands(facets: BackendFacets, context: ServiceRequestContext) {
  const { readCommandBody } = facets.auth;
  const { resolveWorkspaceRequest } = facets.workspace;
  const { apiError } = facets.http;
  const { commandReceiptResponse } = facets.receipt;
  async function POST(
    request: Request,
    {
      params,
    }: {
      params: Promise<{
        projectId: string;
      }>;
    },
  ) {
    try {
      const { store, actor } = await resolveWorkspaceRequest(request, (await params).projectId);
      const result = await store.executeCommandWithReceipt(await readCommandBody(request), actor);
      return commandReceiptResponse(result);
    } catch (error) {
      return apiError(error);
    }
  }
  return { POST };
}
function bindProjectsProjectIdInvitationsInvitationIdRevoke(
  facets: BackendFacets,
  context: ServiceRequestContext,
) {
  const { createProjectHandlers } = facets.project;
  const handlers = createProjectHandlers();
  async function POST(
    request: Request,
    context: {
      params: Promise<{
        projectId: string;
        invitationId: string;
      }>;
    },
  ) {
    const params = await context.params;
    return handlers.revokeInvitation(request, params.projectId, params.invitationId);
  }
  return { POST };
}
function bindProjectsProjectIdInvitations(facets: BackendFacets, context: ServiceRequestContext) {
  const { createProjectHandlers } = facets.project;
  const handlers = createProjectHandlers();
  async function GET(
    request: Request,
    context: {
      params: Promise<{
        projectId: string;
      }>;
    },
  ) {
    return handlers.listInvitations(request, (await context.params).projectId);
  }
  async function POST(
    request: Request,
    context: {
      params: Promise<{
        projectId: string;
      }>;
    },
  ) {
    return handlers.createInvitation(request, (await context.params).projectId);
  }
  return { GET, POST };
}
function bindProjectsProjectIdMcp(facets: BackendFacets, context: ServiceRequestContext) {
  const { getWorkspaceStore } = facets.store;
  const { createProjectMcpHandler } = facets.projectMcp;
  const handle = createProjectMcpHandler(async (projectId) => ({
    store: await (await getWorkspaceStore()).forProject(projectId),
  }));
  async function POST(
    request: Request,
    context: {
      params: Promise<{
        projectId: string;
      }>;
    },
  ) {
    return handle(request, (await context.params).projectId);
  }
  const unsupported = () =>
    new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  const GET = unsupported;
  const DELETE = unsupported;
  return { POST, GET, DELETE };
}
function bindProjectsProjectIdMembersMembershipId(
  facets: BackendFacets,
  context: ServiceRequestContext,
) {
  const { createProjectHandlers } = facets.project;
  const handlers = createProjectHandlers();
  async function PATCH(
    request: Request,
    context: {
      params: Promise<{
        projectId: string;
        membershipId: string;
      }>;
    },
  ) {
    const params = await context.params;
    return handlers.changeRole(request, params.projectId, params.membershipId);
  }
  async function DELETE(
    request: Request,
    context: {
      params: Promise<{
        projectId: string;
        membershipId: string;
      }>;
    },
  ) {
    const params = await context.params;
    return handlers.revokeMember(request, params.projectId, params.membershipId);
  }
  return { PATCH, DELETE };
}
function bindProjectsProjectIdMembers(facets: BackendFacets, context: ServiceRequestContext) {
  const { createProjectHandlers } = facets.project;
  const handlers = createProjectHandlers();
  async function GET(
    request: Request,
    context: {
      params: Promise<{
        projectId: string;
      }>;
    },
  ) {
    return handlers.listMembers(request, (await context.params).projectId);
  }
  return { GET };
}
function bindProjectsProjectId(facets: BackendFacets, context: ServiceRequestContext) {
  const { resolveWorkspaceRequest } = facets.workspace;
  const { connectionConfig } = facets.connection;
  const { apiError } = facets.http;
  async function GET(
    request: Request,
    {
      params,
    }: {
      params: Promise<{
        projectId: string;
      }>;
    },
  ) {
    try {
      const { projectId } = await params,
        { project, store, actor } = await resolveWorkspaceRequest(request, projectId);
      const [state, agents] = await Promise.all([
        store.getProject(projectId, actor),
        store.listAgents(actor),
      ]);
      return Response.json(
        {
          project,
          state,
          cursor: state.version,
          agents,
          connection: connectionConfig(request, projectId),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      return apiError(error);
    }
  }
  return { GET };
}
function bindProjectsProjectIdStream(facets: BackendFacets, context: ServiceRequestContext) {
  const { createProjectStreamHandler } = facets.stream;
  const { resolveWorkspaceRequest } = facets.workspace;
  const { getStorageMode } = facets.store;
  const { apiError } = facets.http;
  async function GET(
    request: Request,
    {
      params,
    }: {
      params: Promise<{
        projectId: string;
      }>;
    },
  ) {
    try {
      const { projectId } = await params,
        { store, actor } = await resolveWorkspaceRequest(request, projectId);
      return createProjectStreamHandler({
        store: {
          getProject: () => store.getProject(projectId, actor),
          getEvents: (after) => store.getEvents(after, projectId, actor),
        },
        storage: getStorageMode(),
        authenticateHuman: async (incoming) =>
          (await resolveWorkspaceRequest(incoming, projectId)).actor,
      })(request);
    } catch (error) {
      return apiError(error);
    }
  }
  return { GET };
}
function bindProjectsProjectIdTasks(facets: BackendFacets, context: ServiceRequestContext) {
  const { z } = facets.schema;
  const { proposalRevisionContentSchema } = facets.protocol;
  const { AccessError, readCommandBody } = facets.auth;
  const { resolveWorkspaceRequest } = facets.workspace;
  const { apiError } = facets.http;
  const { commandReceiptResponse } = facets.receipt;
  const input = z.strictObject({
    requestId: z.string().min(8).max(200),
    expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    agentId: z.string().min(1).max(200),
    content: proposalRevisionContentSchema,
  });
  async function POST(
    request: Request,
    {
      params,
    }: {
      params: Promise<{
        projectId: string;
      }>;
    },
  ) {
    try {
      const { store, actor } = await resolveWorkspaceRequest(request, (await params).projectId),
        parsed = input.safeParse(await readCommandBody(request));
      if (!parsed.success)
        throw new AccessError(
          'VALIDATION_ERROR',
          'Нужны requestId, expectedVersion, выбранный agentId и полное содержание задачи с критериями без посторонних полей.',
          422,
        );
      const result = await store.executeCommandWithReceipt(
        { type: 'startProjectWork', ...parsed.data },
        actor,
      );
      return commandReceiptResponse(result);
    } catch (error) {
      return apiError(error);
    }
  }
  return { POST };
}
function bindProjectsProjectIdVerificationObserve(
  facets: BackendFacets,
  context: ServiceRequestContext,
) {
  const { readCommandBody } = facets.auth;
  const { resolveLocalWorkspaceRequest } = facets.workspace;
  const { apiError } = facets.http;
  async function POST(
    request: Request,
    {
      params,
    }: {
      params: Promise<{
        projectId: string;
      }>;
    },
  ) {
    try {
      const { store, actor } = await resolveLocalWorkspaceRequest(
        request,
        (await params).projectId,
      );
      return Response.json(await store.observeVerification(await readCommandBody(request), actor), {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      return apiError(error);
    }
  }
  return { POST };
}
function bindProjectsProjectIdVerificationRun(
  facets: BackendFacets,
  context: ServiceRequestContext,
) {
  const { readCommandBody } = facets.auth;
  const { resolveLocalWorkspaceRequest } = facets.workspace;
  const { apiError } = facets.http;
  async function POST(
    request: Request,
    {
      params,
    }: {
      params: Promise<{
        projectId: string;
      }>;
    },
  ) {
    try {
      const { store, actor } = await resolveLocalWorkspaceRequest(
        request,
        (await params).projectId,
      );
      return Response.json(await store.runVerification(await readCommandBody(request), actor), {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      return apiError(error);
    }
  }
  return { POST };
}
function bindProjects(facets: BackendFacets, context: ServiceRequestContext) {
  const { z } = facets.schema;
  const { AccessError, readCommandBody, userSessionCookie } = facets.auth;
  const { apiError } = facets.http;
  const { createProjectHandlers } = facets.project;
  const { requireWorkspaceOperator } = facets.workspace;
  const { getWorkspaceStore } = facets.store;
  const accounts = createProjectHandlers();
  const input = z.strictObject({
    requestId: z.string().min(8).max(200),
    name: z.string().min(1).max(120).optional(),
    rootPath: z.string().min(1).max(4096),
  });
  async function GET(request: Request) {
    if (
      facets.environment.OURO_DEPLOYMENT_MODE === 'cloud' ||
      userSessionCookie(request) !== undefined
    )
      return accounts.listProjects(request);
    try {
      const actor = await requireWorkspaceOperator(request);
      return Response.json(
        { projects: await (await getWorkspaceStore()).listWorkspaceProjects(actor) },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      return apiError(error);
    }
  }
  async function POST(request: Request) {
    if (
      facets.environment.OURO_DEPLOYMENT_MODE === 'cloud' ||
      userSessionCookie(request) !== undefined
    )
      return accounts.createProject(request);
    try {
      const actor = await requireWorkspaceOperator(request),
        parsed = input.safeParse(await readCommandBody(request));
      if (!parsed.success)
        throw new AccessError(
          'VALIDATION_ERROR',
          'Укажите requestId, абсолютный rootPath и необязательное имя проекта без посторонних полей.',
          422,
        );
      const result = await (await getWorkspaceStore()).createWorkspaceProject(parsed.data, actor);
      return Response.json(result, {
        status: result.created ? 201 : 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      return apiError(error);
    }
  }
  return { GET, POST };
}
function bindSession(facets: BackendFacets, context: ServiceRequestContext) {
  const { createParticipantHandlers } = facets.participant;
  const { createUserAuthHandlers } = facets.userAuth;
  const { userSessionCookie } = facets.auth;
  const participant = createParticipantHandlers().session;
  const user = createUserAuthHandlers().session;
  async function GET(request: Request) {
    return userSessionCookie(request) !== undefined ? user(request) : participant(request);
  }
  return { GET };
}
function bindSimulator(facets: BackendFacets, context: ServiceRequestContext) {
  const { createHash } = facets.crypto;
  const { z } = facets.schema;
  const { authenticatedParticipant, assertHuman, readCommandBody, AccessError, isLocalDemo } =
    facets.auth;
  const { apiError } = facets.http;
  const { executeCommand, getProject } = facets.store;
  const { AGENT_ID, replay } = facets.core;
  const { requestedProjectId } = facets.connection;
  const input = z
    .object({
      scenario: z.enum([
        'action',
        'question',
        'fork',
        'blocker',
        'complete',
        'apply',
        'clear',
        'stop',
        'flow_start',
        'flow_complete',
        'flow_fail',
      ]),
      specId: z.string().uuid(),
      expectedVersion: z.number().int().nonnegative(),
      requestId: z.string().min(1).max(200),
      executionId: z.string().min(1).max(200).optional(),
      runId: z.string().min(1).max(200).optional(),
      edgeId: z.string().min(1).max(200).optional(),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.scenario.startsWith('flow_') && (!value.executionId || !value.runId))
        context.addIssue({
          code: 'custom',
          message: 'Для прохода нужны точные executionId и runId.',
        });
      if (value.edgeId && value.scenario !== 'flow_complete')
        context.addIssue({
          code: 'custom',
          message: 'Ребро выбирается только при завершении прохода.',
        });
    });
  async function POST(request: Request) {
    try {
      if (!isLocalDemo(request))
        throw new AccessError('FORBIDDEN', 'Симулятор доступен только в локальном демо.');
      const projectId = requestedProjectId(request);
      const operator = await authenticatedParticipant(request, projectId, AGENT_ID);
      assertHuman(operator);
      if (!['local-human', 'human-token'].includes(operator.id))
        throw new AccessError(
          'FORBIDDEN',
          'Учебным симулятором управляет доверенный локальный оператор.',
        );
      const parsed = input.safeParse(await readCommandBody(request));
      if (!parsed.success)
        throw new AccessError(
          'VALIDATION_ERROR',
          'Нужны scenario, specId, expectedVersion, requestId.',
          422,
        );
      const { scenario, specId, expectedVersion, requestId } = parsed.data;
      const current = await getProject();
      const state =
        expectedVersion < current.version
          ? replay(
              current.events.filter((e) => e.version <= expectedVersion),
              projectId,
            )
          : current;
      const stableId = (label: string) => {
        const hash = createHash('sha256').update(`${requestId}:${label}`).digest('hex');
        return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      };
      const flowScenario = scenario.startsWith('flow_');
      const execution = flowScenario
        ? state.executions.find((x) => x.id === parsed.data.executionId && x.specId === specId)
        : state.executions
            .filter(
              (x) =>
                x.specId === specId &&
                !['cancelled', 'skipped', 'failed', 'succeeded'].includes(x.state),
            )
            .at(-1);
      if (!execution)
        throw new AccessError(
          'INVALID_TRANSITION',
          'Сначала человек должен разрешить запуск попытки для активной ревизии.',
          422,
        );
      if (execution.agentId !== AGENT_ID)
        throw new AccessError(
          'FORBIDDEN',
          'Учебный симулятор не подтверждает работу другого агента.',
        );
      const run = execution.flowRuntime?.runs.find(
        (run) => run.id === execution.flowRuntime?.currentRunId,
      );
      const definition = state.revisions.find(
        (revision) => revision.id === execution.specRevisionId,
      )?.flow;
      const base = {
        requestId,
        expectedVersion,
        specId,
        specRevisionId: execution.specRevisionId,
        executionId: execution.id,
      };
      const reportBase = { ...base, ...(run ? { flowStepRunId: run.id } : {}) };
      const requestBase = (kind: string) => ({
        ...reportBase,
        ...(run && definition?.nodes.find((node) => node.id === run.nodeId)?.kind === kind
          ? { flowNodeId: run.nodeId }
          : {}),
      });
      let command: Command;
      switch (scenario) {
        case 'flow_start':
        case 'flow_complete':
        case 'flow_fail': {
          const phase =
            scenario === 'flow_start'
              ? 'start'
              : scenario === 'flow_complete'
                ? 'complete'
                : 'fail';
          command = {
            ...base,
            type: 'reportFlowStep',
            runId: parsed.data.runId!,
            phase,
            ...(phase === 'start'
              ? {}
              : {
                  evidence: `simulation://ouro/flow/${parsed.data.runId}/${phase} — синтетическое подтверждение учебного прохода, не работа внешнего агента`,
                }),
            ...(parsed.data.edgeId ? { edgeId: parsed.data.edgeId } : {}),
          };
          break;
        }
        case 'stop':
          command = { ...base, type: 'confirmStopped' };
          break;
        case 'action':
          command = {
            ...reportBase,
            ...(run ? { flowNodeId: run.nodeId } : {}),
            type: 'reportAction',
            actionId: stableId('action'),
            phase: 'completed',
            title: 'Симулятор прочитал контракт и проверил границы',
            context: 'Демонстрационный факт. Внешний агент и реальные файлы не изменялись.',
            evidence: 'simulation://ouro/contract-review — синтетический результат чтения',
          };
          break;
        case 'question':
          command = {
            ...requestBase('question'),
            type: 'reportQuestion',
            title: 'Какой критерий считать обязательным?',
            question: 'Подтвердите ожидаемое поведение при отсутствии входных данных.',
            context:
              'Симулятор обнаружил неоднозначность ожидания. Ответ может дать только человек.',
            blockingScope: 'execution',
          };
          break;
        case 'fork': {
          const outcomes =
            run && definition?.nodes.find((node) => node.id === run.nodeId)?.kind === 'fork'
              ? definition.edges.filter((edge) => edge.source === run.nodeId)
              : undefined;
          const options = outcomes?.length
            ? outcomes.map((edge) => ({
                id: edge.optionId!,
                title: edge.label,
                description: 'Учебный вариант из назначенной схемы; решение принимает человек.',
              }))
            : [
                {
                  id: stableId('option-a'),
                  title: 'Граф и таблица',
                  description: 'Граф для связей, доступная таблица для последовательной навигации.',
                },
                {
                  id: stableId('option-b'),
                  title: 'Только таблица',
                  description: 'Начать со списка зависимостей и добавить холст в следующей версии.',
                },
              ];
          command = {
            ...requestBase('fork'),
            type: 'reportFork',
            title: 'Выберите способ представления зависимостей',
            context:
              'Два допустимых пути для текущего ожидания. Это симуляция, реализация ещё не выполнялась.',
            reason:
              'Для продолжения нужно выбрать способ представления, потому что варианты по-разному влияют на читаемость и плотность интерфейса.',
            options,
            recommendationOptionId: options[0].id,
          };
          break;
        }
        case 'blocker':
          command = {
            ...requestBase('blocker'),
            type: 'reportBlocker',
            title: 'Источник проверки недоступен',
            context: 'Синтетический блокер: демонстрационный стенд не получил входной контракт.',
            reason:
              'Исполнение не может подтвердить критерий без проверяемого источника данных, поэтому зависимая работа должна ожидать решения человека.',
            expected: 'Доступный версионированный источник проверки',
            actual: 'Источник не отвечает в демонстрационном сценарии',
            impact: 'Критерий нельзя проверить; основная попытка остаётся остановленной.',
            options: [
              {
                id: stableId('plan'),
                title: 'Подготовить локальный проверяемый источник',
                description:
                  'Разрешить отдельную ограниченную попытку устранения и предъявить evidence.',
              },
            ],
          };
          break;
        case 'complete':
          command = {
            ...base,
            type: 'completeExecution',
            result: 'succeeded',
            evidence:
              'simulation://ouro/execution-check — синтетическая проверка попытки; не человеческая приёмка DoD',
          };
          break;
        case 'apply': {
          if (execution.resumeAuthorized) command = { ...base, type: 'confirmResumed' };
          else {
            const decision = state.requests.find(
              (x) =>
                x.executionId === execution.id &&
                x.state === 'resolved' &&
                x.decision &&
                !x.decision.appliedAt &&
                x.decision.outcome.kind !== 'reject',
            );
            if (!decision)
              throw new AccessError(
                'INVALID_TRANSITION',
                'Нет принятого решения, ожидающего подтверждения применения.',
                422,
              );
            command = {
              ...base,
              type: 'confirmDecisionApplied',
              decisionRequestId: decision.id,
              evidence:
                'simulation://ouro/decision-applied — симулятор подтвердил получение решения',
            };
          }
          break;
        }
        case 'clear': {
          const blocker = state.requests.find(
            (x) =>
              x.specId === specId &&
              x.kind === 'Blocker' &&
              x.state === 'resolved' &&
              !x.clearedEvidence &&
              x.decision?.outcome.kind === 'approve',
          );
          const remediation = state.executions.findLast(
            (x) => x.remediatesBlockerId === blocker?.id,
          );
          if (!blocker || !remediation)
            throw new AccessError(
              'INVALID_TRANSITION',
              'Человек должен выбрать план и разрешить отдельную попытку устранения.',
              422,
            );
          command = {
            ...base,
            type: 'clearBlocker',
            decisionRequestId: blocker.id,
            remediationExecutionId: remediation.id,
            evidence: 'simulation://ouro/blocker-cleared — синтетическое evidence устранения',
          };
          break;
        }
      }
      const agent: Actor = {
        id: AGENT_ID,
        kind: 'agent',
        name: 'Симулятор · не внешний агент',
        projectIds: [projectId],
      };
      return Response.json(await executeCommand(command, agent), {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (e) {
      return apiError(e);
    }
  }
  return { POST };
}
function bindStream(facets: BackendFacets, context: ServiceRequestContext) {
  const { createProjectStreamHandler } = facets.stream;
  const { getEvents, getProject, getStorageMode } = facets.store;
  const { requestedProjectId } = facets.connection;
  const { authenticatedParticipant } = facets.auth;
  const { apiError } = facets.http;
  const { AGENT_ID } = facets.core;
  const GET = (request: Request) => {
    try {
      const projectId = requestedProjectId(request);
      return createProjectStreamHandler({
        store: {
          getEvents: (after: number) => getEvents(after, projectId),
          getProject: () => getProject(projectId),
        },
        authenticateHuman: (streamRequest) =>
          authenticatedParticipant(streamRequest, projectId, AGENT_ID),
        storage: getStorageMode(),
      })(request);
    } catch (error) {
      return apiError(error);
    }
  };
  return { GET };
}
function bindWorkspaceFolders(facets: BackendFacets, context: ServiceRequestContext) {
  const { AccessError } = facets.auth;
  const { apiError } = facets.http;
  const { requireWorkspaceOperator } = facets.workspace;
  const { browseWorkspaceFolders } = facets.workspaceFiles;
  async function GET(request: Request) {
    try {
      await requireWorkspaceOperator(request);
      const query = new URL(request.url).searchParams;
      if ([...query.keys()].some((key) => key !== 'path') || query.getAll('path').length > 1)
        throw new AccessError(
          'VALIDATION_ERROR',
          'Просмотр папок принимает только один необязательный path.',
          422,
        );
      return Response.json(await browseWorkspaceFolders(query.get('path') ?? undefined), {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      return apiError(error);
    }
  }
  return { GET };
}
/** Регистрирует все сохранённые HTTP contracts с единственным переданным owner. */
export function backendRoutes(options: BackendOptions): ServiceRoute[] {
  const facets = createBackendFacets(options);
  return [
    {
      path: '/api/agents/:id/revoke',
      methods: {
        POST: (request, context) =>
          invoke(bindAgentsIdRevoke(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/agents',
      methods: {
        GET: (request, context) => invoke(bindAgents(facets, context).GET, request, context.params),
        POST: (request, context) =>
          invoke(bindAgents(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/auth/invitations/accept',
      methods: {
        POST: (request, context) =>
          invoke(bindAuthInvitationsAccept(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/auth/login',
      methods: {
        POST: (request, context) =>
          invoke(bindAuthLogin(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/auth/logout',
      methods: {
        POST: (request, context) =>
          invoke(bindAuthLogout(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/auth/password-reset/confirm',
      methods: {
        POST: (request, context) =>
          invoke(bindAuthPasswordResetConfirm(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/auth/password-reset/request',
      methods: {
        POST: (request, context) =>
          invoke(bindAuthPasswordResetRequest(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/auth/session',
      methods: {
        GET: (request, context) =>
          invoke(bindAuthSession(facets, context).GET, request, context.params),
      },
    },
    {
      path: '/api/commands',
      methods: {
        POST: (request, context) =>
          invoke(bindCommands(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/drafts/:id/publish',
      methods: {
        POST: (request, context) =>
          invoke(bindDraftsIdPublish(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/drafts/:id',
      methods: {
        GET: (request, context) =>
          invoke(bindDraftsId(facets, context).GET, request, context.params),
      },
    },
    {
      path: '/api/drafts/:id/updates',
      methods: {
        POST: (request, context) =>
          invoke(bindDraftsIdUpdates(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/drafts',
      methods: {
        GET: (request, context) => invoke(bindDrafts(facets, context).GET, request, context.params),
        POST: (request, context) =>
          invoke(bindDrafts(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/events',
      methods: {
        GET: (request, context) => invoke(bindEvents(facets, context).GET, request, context.params),
      },
    },
    {
      path: '/api/github/bindings/:id/revoke',
      methods: {
        POST: (request, context) =>
          invoke(bindGithubBindingsIdRevoke(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/github/bindings',
      methods: {
        POST: (request, context) =>
          invoke(bindGithubBindings(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/github/deliveries/:id/retry',
      methods: {
        POST: (request, context) =>
          invoke(bindGithubDeliveriesIdRetry(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/github',
      methods: {
        GET: (request, context) => invoke(bindGithub(facets, context).GET, request, context.params),
      },
    },
    {
      path: '/api/github/webhook',
      methods: {
        POST: (request, context) =>
          invoke(bindGithubWebhook(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/health',
      methods: {
        GET: (request, context) => invoke(bindHealth(facets, context).GET, request, context.params),
      },
    },
    {
      path: '/api/inbox',
      methods: {
        POST: (request, context) =>
          invoke(bindInbox(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/mcp',
      methods: {
        POST: (request, context) => invoke(bindMcp(facets, context).POST, request, context.params),
        GET: (request, context) => invoke(bindMcp(facets, context).GET, request, context.params),
        DELETE: (request, context) =>
          invoke(bindMcp(facets, context).DELETE, request, context.params),
      },
    },
    {
      path: '/api/meridian/import',
      methods: {
        POST: (request, context) =>
          invoke(bindMeridianImport(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/participants/:id/revoke',
      methods: {
        POST: (request, context) =>
          invoke(bindParticipantsIdRevoke(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/participants/logout',
      methods: {
        POST: (request, context) =>
          invoke(bindParticipantsLogout(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/participants',
      methods: {
        GET: (request, context) =>
          invoke(bindParticipants(facets, context).GET, request, context.params),
        POST: (request, context) =>
          invoke(bindParticipants(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/participants/session',
      methods: {
        POST: (request, context) =>
          invoke(bindParticipantsSession(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/project',
      methods: {
        GET: (request, context) =>
          invoke(bindProject(facets, context).GET, request, context.params),
      },
    },
    {
      path: '/api/projects/:projectId/agents/:agentId/revoke',
      methods: {
        POST: (request, context) =>
          invoke(
            bindProjectsProjectIdAgentsAgentIdRevoke(facets, context).POST,
            request,
            context.params,
          ),
      },
    },
    {
      path: '/api/projects/:projectId/agents',
      methods: {
        GET: (request, context) =>
          invoke(bindProjectsProjectIdAgents(facets, context).GET, request, context.params),
        POST: (request, context) =>
          invoke(bindProjectsProjectIdAgents(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/projects/:projectId/binding-recovery',
      methods: {
        GET: (request, context) =>
          invoke(
            bindProjectsProjectIdBindingRecovery(facets, context).GET,
            request,
            context.params,
          ),
        POST: (request, context) =>
          invoke(
            bindProjectsProjectIdBindingRecovery(facets, context).POST,
            request,
            context.params,
          ),
      },
    },
    {
      path: '/api/projects/:projectId/commands',
      methods: {
        POST: (request, context) =>
          invoke(bindProjectsProjectIdCommands(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/projects/:projectId/invitations/:invitationId/revoke',
      methods: {
        POST: (request, context) =>
          invoke(
            bindProjectsProjectIdInvitationsInvitationIdRevoke(facets, context).POST,
            request,
            context.params,
          ),
      },
    },
    {
      path: '/api/projects/:projectId/invitations',
      methods: {
        GET: (request, context) =>
          invoke(bindProjectsProjectIdInvitations(facets, context).GET, request, context.params),
        POST: (request, context) =>
          invoke(bindProjectsProjectIdInvitations(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/projects/:projectId/mcp',
      methods: {
        POST: (request, context) =>
          invoke(bindProjectsProjectIdMcp(facets, context).POST, request, context.params),
        GET: (request, context) =>
          invoke(bindProjectsProjectIdMcp(facets, context).GET, request, context.params),
        DELETE: (request, context) =>
          invoke(bindProjectsProjectIdMcp(facets, context).DELETE, request, context.params),
      },
    },
    {
      path: '/api/projects/:projectId/members/:membershipId',
      methods: {
        PATCH: (request, context) =>
          invoke(
            bindProjectsProjectIdMembersMembershipId(facets, context).PATCH,
            request,
            context.params,
          ),
        DELETE: (request, context) =>
          invoke(
            bindProjectsProjectIdMembersMembershipId(facets, context).DELETE,
            request,
            context.params,
          ),
      },
    },
    {
      path: '/api/projects/:projectId/members',
      methods: {
        GET: (request, context) =>
          invoke(bindProjectsProjectIdMembers(facets, context).GET, request, context.params),
      },
    },
    {
      path: '/api/projects/:projectId',
      methods: {
        GET: (request, context) =>
          invoke(bindProjectsProjectId(facets, context).GET, request, context.params),
      },
    },
    {
      path: '/api/projects/:projectId/stream',
      methods: {
        GET: (request, context) =>
          invoke(bindProjectsProjectIdStream(facets, context).GET, request, context.params),
      },
    },
    {
      path: '/api/projects/:projectId/tasks',
      methods: {
        POST: (request, context) =>
          invoke(bindProjectsProjectIdTasks(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/projects/:projectId/verification/observe',
      methods: {
        POST: (request, context) =>
          invoke(
            bindProjectsProjectIdVerificationObserve(facets, context).POST,
            request,
            context.params,
          ),
      },
    },
    {
      path: '/api/projects/:projectId/verification/run',
      methods: {
        POST: (request, context) =>
          invoke(
            bindProjectsProjectIdVerificationRun(facets, context).POST,
            request,
            context.params,
          ),
      },
    },
    {
      path: '/api/projects',
      methods: {
        GET: (request, context) =>
          invoke(bindProjects(facets, context).GET, request, context.params),
        POST: (request, context) =>
          invoke(bindProjects(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/session',
      methods: {
        GET: (request, context) =>
          invoke(bindSession(facets, context).GET, request, context.params),
      },
    },
    {
      path: '/api/simulator',
      methods: {
        POST: (request, context) =>
          invoke(bindSimulator(facets, context).POST, request, context.params),
      },
    },
    {
      path: '/api/stream',
      methods: {
        GET: (request, context) => invoke(bindStream(facets, context).GET, request, context.params),
      },
    },
    {
      path: '/api/workspace/folders',
      methods: {
        GET: (request, context) =>
          invoke(bindWorkspaceFolders(facets, context).GET, request, context.params),
      },
    },
  ];
}
