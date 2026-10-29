import { z } from 'zod';
import {submitProposalInputSchema} from './inputs.js';

export type AgentToolDefinition = {
  name: string; title: string; description: string;
  inputSchema: z.ZodObject;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
};

const text = z.string().min(1).max(20_000);
const id = z.string().min(1).max(200);
const version = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const write = {executionId:id, requestId:z.string().min(8).max(200), expectedVersion:version};
const report = {...write,title:text,context:text,flowNodeId:id.optional().describe('Optional explicit process-node ID from the assigned immutable revision. Omit for unbound facts; do not infer a path or human approval.')};
const option = z.strictObject({id,title:text,description:text});
const define = (name:string,title:string,description:string,inputSchema:z.ZodObject,readOnlyHint=false):AgentToolDefinition => ({
  name,title,description,inputSchema,
  annotations:{readOnlyHint,destructiveHint:false,idempotentHint:true,openWorldHint:false},
});

/** The same strict runtime schemas are published by MCP tools/list and used by the facade. */
export const AGENT_TOOLS: AgentToolDefinition[] = [
  define('ouro.get_context','Read assigned work','Read your human-authorized executions, their immutable specification revisions, decisions and current project version. Read before writing; never create your own assignment.',z.strictObject({executionId:id.optional()}),true),
  define('ouro.get_updates','Read committed updates','Read permitted events after a global cursor. Cursor may advance with no visible events. Poll this tool while awaiting a human; never infer consent from time or silence.',z.strictObject({afterCursor:version}),true),
  define('ouro.report_action','Report an action fact','Record a started/completed/failed action against an assigned execution. Completed/failed phases require evidence. This records a fact, without approving a decision or accepting DoD.',z.strictObject({...report,actionId:id,phase:z.enum(['started','completed','failed']),evidence:text.optional()})),
  define('ouro.report_question','Ask the human','Create a question requiring a human answer. blockingScope execution suspends this execution; none preserves independent work. Confidence and time never answer the question.',z.strictObject({...report,question:text,blockingScope:z.enum(['execution','none'])})),
  define('ouro.report_fork','Request a human choice','Provide at least two distinct alternatives and reason of at least 50 characters. A recommendation is advisory; only the human chooses.',z.strictObject({...report,reason:z.string().min(50).max(20_000),options:z.array(option).min(2).max(10),recommendationOptionId:id.optional()})),
  define('ouro.report_blocker','Report a blocker','Describe expected/actual, impact and a reason of at least 50 characters. Supply proposed plans or explain that no path is known. Approval of a plan does not clear the blocker.',z.strictObject({...report,reason:z.string().min(50).max(20_000),expected:text,actual:text,impact:text,options:z.array(option).max(10),noPathReason:text.optional()})),
  define('ouro.withdraw_decision','Withdraw your pending request','Withdraw your own still-pending Question, Fork or Blocker with a reason. This is not a human decision, resume authorization or proof that a physical blocker disappeared. The execution may still need separate human authorization and ACK.',z.strictObject({...write,decisionRequestId:id,reason:text})),
  define('ouro.submit_decision_clarification','Respond to requested clarification','Provide additional facts for a real, unanswered human clarification event on your pending request. Preserve its clarificationEventId. The original request remains pending; this response grants no execution permission and never answers the human decision for them.',z.strictObject({...write,decisionRequestId:id,clarificationEventId:id,response:text})),
  define('ouro.confirm_started','Acknowledge an authorized start','Confirm that your queued, human-authorized execution has actually started. This is an ACK, not permission to start unassigned work.',z.strictObject(write)),
  define('ouro.confirm_resumed','Acknowledge authorized continuation','Confirm continuation only after human resume authorization and cleared applicable blockers. Reading a decision alone does not authorize continuation.',z.strictObject(write)),
  define('ouro.confirm_stopped','Acknowledge a requested stop','Confirm actual stopping only when the human/system has requested stop. A recorded request itself is not proof of physical stopping.',z.strictObject(write)),
  define('ouro.confirm_decision_applied','Confirm decision application','Supply evidence that a positive human decision for this execution was applied. This does not accept the specification DoD.',z.strictObject({...write,decisionRequestId:id,evidence:text})),
  define('ouro.complete_execution','Report an execution result','Report succeeded or failed with evidence. Success requires a running permitted execution and does not mark the specification done; human DoD acceptance is separate.',z.strictObject({...write,result:z.enum(['succeeded','failed']),evidence:text})),
  define('ouro.clear_blocker','Confirm blocker remediation','executionId must be your successful, explicitly authorized remediation execution for this blocker. Supply evidence of actual clearance; the primary execution remains stopped until authorized separately.',z.strictObject({...write,decisionRequestId:id,evidence:text})),
  define('ouro.submit_proposal','Submit source-backed analysis','Submit your interpretation of the chosen assigned immutable execution, with exact committed source IDs per finding and sourceCursor. Only your execution sources are admissible; summaries are not facts or lessons. A spec proposal stays pending until a human explicitly edits/adopts a draft. Never claim acceptance or activation.',submitProposalInputSchema),
];
