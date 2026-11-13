import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '../../../../app/tailwind.css';
import '../../../../app/theme.css';
import '../../../../app/globals.css';
import '../../../../components/legacy-shared-defaults.css';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import {
  FlowRuntimeInspector,
  FlowRuntimeSummary,
  FlowTrackingChoice,
} from '../../../../components/flow-runtime-panel';
import { WorkspaceUIAppearanceProvider } from '../../../../components/workspace-ui';
import { AppSelectAppearanceProvider } from '../../../../components/app-select';
import { buildFlowRuntimeView, type ProjectState } from '../../../../packages/core/src';
import {
  runtimeIntentKey,
  type RuntimeIntent,
  type FlowRuntimeCommand,
} from '../../../../components/flow-runtime-ui';
import { createProjectSession } from '../../../../packages/client/src/lifecycle/project-session';
import { createProjectHttpPorts } from '../../../../packages/client/src/http/project-http';
import { freezeProjectCommandIntent } from '../../../../packages/client/src/ports';

/** Задаёт сохранённое состояние процесса, разрешённую команду и варианты поверхности для тестового рендера. */
export type RuntimePresentationInput = {
  state: ProjectState;
  executionId: string;
  runId?: string;
  held?: RuntimeIntent;
  receipt: RuntimeIntent;
  workspace: boolean;
  tracking?: 'on' | 'off' | 'unavailable';
  readOnly?: boolean;
  simulation?: boolean;
};
const root = createRoot(document.getElementById('root')!);
let session: ReturnType<typeof createProjectSession> | undefined,
  generation = 0;
declare global {
  interface Window {
    runtimePresentation: { configure(input: RuntimePresentationInput): void };
  }
}

/** Renderer не создаёт domain facts: разрешён только точный повтор заранее записанной собственной команды. */
window.runtimePresentation = {
  configure(input) {
    session?.dispose();
    const { state, receipt } = input,
      actorId = receipt.actorId,
      scope = { projectId: state.projectId, actorId, accessEpoch: 1 };
    session = createProjectSession({
      sourceId: location.origin,
      scope,
      ports: (adopter) => createProjectHttpPorts({ scope, mode: 'legacy', adopter }),
    });
    const command: FlowRuntimeCommand = async (body, expectedVersion) => {
      if (
        JSON.stringify(body) !== JSON.stringify(receipt.body) ||
        expectedVersion !== receipt.expectedVersion
      )
        throw new Error('Renderer permits only the committed receipt.');
      const intent = freezeProjectCommandIntent({
        scope,
        operation: 'execute-command',
        requestId: String(body.requestId),
        expectedVersion,
        body: JSON.stringify({ ...body, expectedVersion }),
      });
      const result = await session!.execute(intent);
      return { ok: result.status === 'confirmed' };
    };
    const execution = state.executions.find((candidate) => candidate.id === input.executionId)!;
    const flow = state.revisions.find(
      (candidate) => candidate.id === execution.specRevisionId,
    )!.flow!;
    const view = buildFlowRuntimeView(state, execution.id, input.runId),
      run = view.run;
    const node = flow.nodes.find(
      (candidate) => candidate.id === (run?.nodeId ?? flow.entryNodeId),
    )!;
    const edge = flow.edges.find((candidate) => candidate.source === node.id);
    const intents = new Map<string, RuntimeIntent>();
    if (input.held)
      intents.set(
        runtimeIntentKey(state.projectId, actorId, execution.id, input.held.runId),
        input.held,
      );
    const content = (
      <main className="spec-flow min-w-0 p-[18px]">
        <FlowTrackingChoice
          checked={input.tracking !== 'off'}
          reason={
            input.tracking === 'unavailable'
              ? 'Для строгого учёта сначала опишите схему активной ревизии.'
              : ''
          }
          disabled={false}
          onChange={() => undefined}
        />
        <FlowRuntimeSummary
          execution={execution}
          flow={flow}
          pending={input.held}
          onOpenCurrent={() => undefined}
          onOpenPending={() => undefined}
        />
        <FlowRuntimeInspector
          state={state}
          execution={execution}
          node={node}
          edge={edge}
          run={run}
          view={view}
          onRunChange={() => undefined}
          busy={false}
          readOnly={!!input.readOnly}
          actorId={actorId}
          intents={intents}
          onCommand={command}
          onSimulateFlow={input.simulation ? command : undefined}
        />
      </main>
    );
    flushSync(() =>
      root.render(
        <div key={++generation}>
          {input.workspace ? (
            <WorkspaceUIAppearanceProvider>
              <AppSelectAppearanceProvider triggerClassName="w-full rounded-[6px] border-ouro-border px-[12px] py-[11px] font-sans text-[13px] leading-[1.6] font-normal">
                <div className="ws-shell min-h-screen bg-ouro-bg text-ouro-text [--primary:#93dfbf] [--primary-text:#12231c]">
                  {content}
                </div>
              </AppSelectAppearanceProvider>
            </WorkspaceUIAppearanceProvider>
          ) : (
            content
          )}
        </div>,
      ),
    );
  },
};
