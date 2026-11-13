import { twMerge } from 'tailwind-merge';
import { panelElements as elements } from './panel-elements';

/** Статические utilities конкретных слотов предложений; прежние имена остаются только hooks. */
export const proposalPresentation = {
  panel: 'agent-proposals-panel min-w-0',
  count:
    'proposal-count flex items-center gap-[8px] text-[12px] text-ouro-text-muted whitespace-nowrap at-most-760:mt-[10px]',
  layout:
    'proposals-layout grid grid-cols-[265px_minmax(0,1fr)] items-start gap-[24px] at-most-1180:grid-cols-[220px_minmax(0,1fr)] at-most-1180:gap-[16px] at-most-760:flex at-most-760:flex-col',
  list: 'proposal-list min-w-0 overflow-hidden rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-bg at-most-760:max-h-[240px] at-most-760:w-full at-most-760:overflow-auto',
  search:
    'proposal-search flex items-center gap-[8px] border-0 border-b border-solid border-ouro-border p-[13px] text-[var(--text-faint)]',
  searchInput: twMerge(
    elements.field,
    'w-full border-0 border-none border-current bg-transparent p-[4px] text-[12px]',
  ),
  item:
    'proposal-list-item ' +
    twMerge(
      elements.button,
      'block w-full border-0 border-b border-solid border-ouro-border bg-ouro-bg px-[15px] py-[17px] text-left last:border-b-0 hover:bg-ouro-subtle at-most-760:py-[12px]',
    ),
  selected: 'selected bg-ouro-subtle shadow-[inset_3px_0_var(--text-muted)]',
  kind: 'proposal-kind flex items-center gap-[7px] text-[10px] text-ouro-text-muted',
  listTitle: 'my-[9px] mb-[12px] block text-[13px] font-[550] [overflow-wrap:anywhere]',
  listMeta:
    'proposal-list-meta flex flex-wrap justify-between gap-[8px] text-[10px] text-[var(--text-faint)]',
  detail:
    'proposal-detail min-w-0 rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-bg p-[24px] at-most-1180:p-[18px] at-most-760:w-full at-most-760:p-[15px]',
  detailHeading:
    'proposal-detail-heading flex items-start justify-between gap-[16px] at-most-1180:flex-wrap',
  title:
    'mt-[10px] mb-[20px] text-[22px] leading-[1.4] font-semibold tracking-[-.4px] [overflow-wrap:anywhere] at-most-760:text-[19px]',
  status:
    'proposal-status rounded-[4px] border border-solid border-ouro-border bg-ouro-subtle px-[8px] py-[5px] text-[10px] text-ouro-text-muted whitespace-nowrap at-most-760:whitespace-normal',
  context:
    'proposal-context mb-[18px] grid grid-cols-[1fr_1fr] gap-[15px] rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-subtle p-[17px] at-most-1180:grid-cols-[1fr] at-most-760:p-[13px]',
  contextLabel: 'mb-[5px] block text-[10px] text-[var(--text-faint)]',
  contextValue: 'text-[11px] font-[450] text-ouro-text-muted [overflow-wrap:anywhere]',
  version:
    'proposal-version my-[20px] flex items-end justify-between gap-[12px] at-most-760:flex-col at-most-760:items-start',
  versionLabel: 'flex flex-col gap-[6px] text-[11px] text-ouro-text-muted',
  h3: 'm-0 text-[14px] leading-[1.5] font-[550]',
  sectionHeading: twMerge(elements.sectionHeading, 'my-[22px] mb-[16px] flex-wrap'),
  finding: 'proposal-finding mb-[18px] border-0 border-b border-solid border-ouro-border pb-[18px]',
  findingTitle: 'proposal-finding-title flex items-baseline gap-[12px]',
  findingIndex: 'font-workspace-mono text-[10px] text-[var(--text-faint)]',
  findingText: 'm-0 mb-[12px] text-[13px] whitespace-pre-wrap [overflow-wrap:anywhere]',
  sources: 'proposal-sources ml-[27px] grid gap-[7px] at-most-760:ml-0',
  source:
    'proposal-source min-w-0 rounded-[5px] border border-solid border-ouro-border bg-ouro-subtle',
  sourceTrigger: 'flex-wrap gap-[10px] px-[11px] py-[9px] text-[10px] leading-[inherit]',
  sourceBody:
    'flex flex-col gap-[6px] border-0 border-t border-solid border-ouro-border p-[12px] text-[11px] [overflow-wrap:anywhere]',
  sourceMeta: 'text-[10px] text-[var(--text-faint)]',
  sourceTag: 'proposal-source-tag text-[10px] text-[var(--attention)]',
  sourceJSON: 'font-mono text-[10px] whitespace-pre-wrap [overflow-wrap:anywhere]',
  interpretation:
    'proposal-interpretation mb-[24px] rounded-r-[var(--radius)] border-0 border-l-2 border-solid border-ouro-control bg-ouro-subtle p-[18px]',
  interpretationText:
    'mt-[9px] mb-[17px] text-[12px] leading-[1.75] text-ouro-text-muted whitespace-pre-wrap [overflow-wrap:anywhere]',
  evidence:
    'proposal-evidence-note m-0 mt-[14px] flex items-start gap-[7px] text-[10px] leading-[1.6] text-[var(--text-faint)]',
  suggestedText:
    'm-0 text-[12px] leading-[1.7] text-ouro-text-muted whitespace-pre-wrap [overflow-wrap:anywhere]',
  form: 'proposal-review-form mt-[28px] border-0 border-t border-solid border-ouro-border pt-[3px]',
  label: 'my-[16px] flex min-w-0 flex-col gap-[7px] text-[11px] text-ouro-text-muted',
  field: twMerge(
    elements.field,
    'w-full text-[12px] [&[readonly]]:bg-ouro-subtle [&[readonly]]:text-ouro-text-muted',
  ),
  textarea: twMerge(
    elements.field,
    'min-h-[65px] w-full resize-y text-[12px] leading-[1.6] [&[readonly]]:bg-ouro-subtle [&[readonly]]:text-ouro-text-muted',
  ),
  fields:
    'proposal-fields grid grid-cols-[1fr_1fr] gap-x-[15px] gap-y-0 at-most-1180:grid-cols-[1fr]',
  dod: 'proposal-dod mx-0 my-[20px] rounded-[var(--radius)] border border-solid border-ouro-border px-[15px] py-[13px]',
  legend: 'px-[7px] text-[11px] text-ouro-text-muted',
  criterionRow: 'my-[12px] flex flex-wrap items-start gap-[12px] at-most-760:gap-[8px]',
  criterion:
    'proposal-criterion flex min-w-[150px] flex-1 flex-col gap-[6px] text-[11px] at-most-760:basis-full',
  checkboxLabel:
    'proposal-checkbox flex flex-row items-center gap-[8px] text-[11px] text-ouro-text-muted',
  derivedCheckboxLabel:
    'proposal-checkbox my-[16px] flex min-w-0 flex-row items-center gap-[7px] text-[11px] text-ouro-text-muted',
  checkbox: elements.checkbox + ' shrink-0 accent-[var(--text)]',
  basis:
    'proposal-basis flex flex-wrap items-center gap-[12px] rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-subtle p-[13px] text-[11px] text-ouro-text-muted',
  attention:
    'proposal-attention my-[14px] rounded-[var(--radius)] border border-solid border-[color:color-mix(in_srgb,var(--attention)_30%,transparent)] bg-[var(--attention-surface)] px-[15px] py-[13px] text-[11px] leading-[1.7] text-[var(--attention)] [overflow-wrap:anywhere]',
  error:
    'proposal-error m-0 rounded-[var(--radius)] bg-[var(--negative-surface)] px-[14px] py-[12px] text-[11px] text-[var(--negative)] [overflow-wrap:anywhere]',
  success:
    'proposal-success m-0 rounded-[var(--radius)] bg-[var(--positive-surface)] px-[14px] py-[12px] text-[11px] text-[var(--positive)] [overflow-wrap:anywhere]',
  actions: 'proposal-review-actions mt-[20px] flex flex-wrap gap-[12px]',
  button: 'btn ' + elements.action,
  smallButton: 'btn btn-small ' + twMerge(elements.action, elements.small),
  primaryButton: 'btn btn-primary ' + twMerge(elements.action, elements.primary),
  actionButton: 'btn ' + twMerge(elements.action, 'at-most-760:w-full at-most-760:justify-center'),
  primaryActionButton:
    'btn btn-primary ' +
    twMerge(elements.action, elements.primary, 'at-most-760:w-full at-most-760:justify-center'),
  attentionButton: 'btn ' + twMerge(elements.action, 'mt-[9px] flex'),
  textButton: 'text-btn ' + elements.textAction,
  iconButton: 'icon-btn ' + elements.iconAction,
  record:
    'proposal-review-record mt-[20px] rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-subtle p-[17px] text-[12px]',
  recordText: 'm-0 text-[12px] text-ouro-text-muted whitespace-pre-wrap [overflow-wrap:anywhere]',
  recordMeta: 'block text-[10px] text-[var(--text-faint)] [overflow-wrap:anywhere]',
  empty: 'proposal-empty m-0 p-[24px] text-[12px] leading-[1.8] text-ouro-text-muted',
  detailEmpty:
    'proposal-empty proposal-detail-empty rounded-[var(--radius)] border border-dashed border-ouro-border px-[30px] py-[60px] text-center text-[12px] leading-[1.8] text-ouro-text-muted',
  flow: 'proposal-flow my-[20px] overflow-hidden rounded-[var(--radius)] border border-solid border-ouro-border',
  flowHeading:
    'flex flex-col gap-[4px] border-0 border-b border-solid border-ouro-border bg-ouro-subtle px-[15px] py-[12px] text-[11px]',
  flowCaption: 'text-[10px] text-[var(--text-faint)]',
  flowCanvas: 'proposal-flow-canvas h-[280px] at-most-760:h-[250px]',
  flowNode:
    'w-[200px] rounded-[6px] border border-solid border-ouro-control bg-ouro-subtle text-ouro-text',
  flowOwner: 'mb-[6px] block text-[10px] text-[var(--text-faint)]',
  flowNodeTitle: 'block text-[12px] font-medium',
  flowEdge: String.raw`[&>.react-flow\_\_edge-path]:stroke-[var(--graph-edge)] [&_.react-flow\_\_edge-text]:fill-[var(--text-muted)] [&_.react-flow\_\_edge-text]:text-[11px] [&_.react-flow\_\_edge-textbg]:fill-[var(--bg)]`,
  flowTableAccordion:
    'border-0 border-t border-solid border-ouro-border px-[15px] py-[10px] text-[11px]',
  flowTable: 'mt-[10px] w-full border-collapse text-left text-[10px] whitespace-nowrap',
  flowRow: 'hover:bg-ouro-subtle last:[&>td]:[border:0]',
  flowHeaderCell:
    'bg-ouro-subtle p-[8px] text-left text-[12px] font-medium text-[var(--text-faint)] [border-bottom:1px_solid_var(--border)] [overflow-wrap:anywhere]',
  flowCell:
    'p-[8px] text-left text-[12px] [border-bottom:1px_solid_var(--border)] [overflow-wrap:anywhere]',
} as const;

export const proposalStatusPresentation = {
  pending: 'pending bg-[var(--attention-surface)] text-[var(--attention)]',
  adopted: 'adopted bg-[var(--positive-surface)] text-[var(--positive)]',
  reviewed: 'reviewed bg-[var(--positive-surface)] text-[var(--positive)]',
  dismissed: 'dismissed bg-[var(--negative-surface)] text-[var(--negative)]',
} as const;
