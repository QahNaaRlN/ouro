import { twMerge } from 'tailwind-merge';
import { panelElements as elements } from './panel-elements';

/** Статическое оформление конкретных слотов отчёта; формулы и история здесь не хранятся. */
export const impactPresentation = {
  panel: 'impact-panel min-w-0',
  pageHeading:
    'page-heading mb-[27px] flex flex-wrap items-start justify-between gap-[16px] at-most-680:mb-[22px]',
  exportButton:
    'btn ' +
    twMerge(
      elements.action,
      elements.pageAction,
      'shrink-0 at-most-640:w-full at-most-640:justify-center',
    ),
  controls:
    'impact-controls my-[24px] rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-subtle p-[20px] at-most-640:p-[16px]',
  controlGrid:
    'impact-control-grid grid grid-cols-[1fr_1.25fr_1.25fr] gap-[18px] at-most-1100:grid-cols-[1fr_1fr] at-most-640:grid-cols-[minmax(0,1fr)] at-most-640:gap-[16px]',
  controlField: 'impact-control-field flex min-w-0 flex-col gap-[7px]',
  lastControl: 'at-most-1100:col-[1/-1] at-most-640:col-auto',
  nestedField: 'impact-control-field impact-nested-field mt-[8px] flex min-w-0 flex-col gap-[7px]',
  label: 'flex min-w-0 flex-col gap-[7px] text-[12px] leading-[1.5] text-ouro-text-muted',
  input: twMerge(elements.field, 'w-full text-ouro-text'),
  small: 'text-[11px] text-[var(--text-faint)]',
  footer:
    'impact-controls-footer mt-[20px] flex items-center justify-between gap-[18px] border-0 border-t border-solid border-ouro-border pt-[17px] at-most-640:flex-col at-most-640:items-stretch at-most-640:gap-[12px]',
  footerText: 'm-0 text-[11px] leading-[1.5] text-ouro-text-muted',
  calculateButton:
    'btn btn-primary ' +
    twMerge(elements.action, elements.primary, 'shrink-0 at-most-640:justify-center'),
  scope: 'impact-scope m-0 mt-[18px] min-w-0 border-0 p-0',
  legend: 'pb-[10px] text-[12px] text-ouro-text-muted',
  options:
    'impact-spec-options grid max-h-[240px] grid-cols-[1fr_1fr] gap-x-[18px] gap-y-[9px] overflow-auto px-[2px] py-[4px] at-most-640:grid-cols-[1fr]',
  option:
    'flex min-w-0 flex-row items-start gap-[10px] text-[12px] leading-[1.5] text-ouro-text [overflow-wrap:anywhere]',
  checkbox:
    elements.checkbox +
    ' mt-[2px] size-[16px] min-w-[16px] flex-[0_0_16px] appearance-auto accent-[var(--selected)]',
  optionId: 'mono font-mono text-[10px] text-[var(--text-faint)]',
  result:
    'impact-result flex items-center justify-between gap-[28px] border-0 border-y border-solid border-ouro-border py-[26px] at-most-640:flex-col at-most-640:items-start at-most-640:gap-[18px]',
  resultCount:
    'impact-result-count my-[12px] text-[28px] leading-[1.25] font-semibold tracking-[-.7px] at-most-640:text-[24px]',
  resultText: 'm-0 max-w-[650px] text-[12px] leading-[1.6] text-ouro-text-muted',
  percent:
    'impact-result-percent flex-[0_0_170px] text-right at-most-640:flex at-most-640:w-full at-most-640:flex-initial at-most-640:items-center at-most-640:gap-[18px] at-most-640:text-left',
  percentValue:
    'block text-[40px] font-medium tracking-[-1.5px] text-ouro-text at-most-640:text-[34px]',
  meter:
    'impact-meter mt-[13px] h-[6px] overflow-hidden rounded-[3px] border border-solid border-ouro-border bg-ouro-bg at-most-640:mt-0 at-most-640:flex-1',
  meterFill: 'block h-full bg-ouro-control [width:var(--ouro-impact-percent)]',
  window:
    'impact-window mt-[18px] flex flex-wrap items-center gap-[7px] text-[11px] text-[var(--text-faint)]',
  windowScope:
    'impact-window-scope ml-[4px] border-0 border-l border-solid border-ouro-border pl-[10px]',
  context:
    'impact-context-note m-0 flex items-start gap-[9px] pt-[18px] pb-[28px] text-[12px] leading-[1.6] text-ouro-text-muted',
  contextIcon: 'mt-[3px] flex-[0_0_15px]',
  sectionHeading: twMerge(elements.sectionHeading, 'flex-wrap gap-[10px]'),
  sectionTitle: 'm-0 text-[16px] leading-[1.4] font-semibold tracking-[-.4px]',
  section: 'pt-[6px] pb-[28px]',
  changes: 'impact-change-list mt-[16px] grid gap-[15px]',
  change:
    'impact-change-item min-w-0 rounded-[var(--radius)] border border-solid border-ouro-border p-[18px]',
  specHeading: 'impact-spec-heading flex items-start gap-[12px]',
  specIcon: 'mt-[3px] flex-[0_0_17px] text-ouro-text-muted',
  specId: 'font-mono text-[11px] text-[var(--text-faint)]',
  specTitle:
    'm-0 mt-[5px] text-[14px] leading-[1.5] font-medium [overflow-wrap:anywhere] at-most-640:text-[13px]',
  reason:
    'impact-change-reason mt-[14px] border-0 border-t border-solid border-ouro-border pt-[14px]',
  reasonText: 'm-0 text-[12px] [overflow-wrap:anywhere]',
  reasonHelper: twMerge(elements.helper, 'mt-[5px] [overflow-wrap:anywhere]'),
  source:
    'impact-source mt-[10px] min-w-0 rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-bg',
  sourceTrigger: 'px-[12px] py-[10px] text-[11px] leading-[1.65] [overflow-wrap:anywhere]',
  sourceVersion: 'mono mr-[8px] font-mono text-[12px] text-[var(--text-faint)]',
  sourceTime:
    'impact-source-time float-right ml-[8px] text-[10px] text-[var(--text-faint)] at-most-640:float-none at-most-640:mt-[4px] at-most-640:ml-0 at-most-640:block',
  counterTime: 'float-none mt-[4px] ml-0 block',
  sourceBody:
    'impact-source-body min-w-0 border-0 border-t border-solid border-ouro-border p-[12px] text-ouro-text-muted',
  sourceMeta: 'impact-source-meta flex flex-wrap gap-[10px]',
  sourceCode: 'font-mono text-[10px] [overflow-wrap:anywhere]',
  sourceText: 'my-[9px] text-[11px] [overflow-wrap:anywhere]',
  sourceJSON:
    'm-0 mt-[12px] max-h-[300px] overflow-auto font-mono text-[11px] leading-[1.6] whitespace-pre-wrap [overflow-wrap:anywhere]',
  empty:
    'impact-empty m-0 mt-[16px] rounded-[var(--radius)] border border-dashed border-ouro-border p-[20px] text-[12px] leading-[1.6] text-ouro-text-muted',
  countGrid:
    'impact-count-grid mt-[16px] grid grid-cols-[repeat(3,minmax(0,1fr))] gap-[12px] at-most-1100:grid-cols-[repeat(2,minmax(0,1fr))] at-most-640:grid-cols-[1fr]',
  countCard:
    'impact-count-card min-w-0 rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-subtle p-[16px]',
  countName: 'min-h-[34px] text-[12px] leading-[1.45] text-ouro-text-muted at-most-640:min-h-0',
  countValue: 'm-0 mt-[10px]',
  countNumber: 'text-[24px] leading-[1.2] font-medium',
  countText: 'm-0 mt-[7px] text-[10px] leading-[1.6] text-[var(--text-faint)]',
  counterSources: 'impact-counter-sources mt-[12px]',
  newGoals: 'impact-new-goals pb-[24px]',
  newGoalsHelper: twMerge(elements.helper, 'mt-[10px] mb-[16px]'),
  newGoal: 'impact-new-goal border-0 border-b border-solid border-ouro-border py-[14px]',
  newGoalText: 'm-0 text-[12px] [overflow-wrap:anywhere]',
  newGoalCode: 'font-mono text-[10px] text-[var(--text-faint)]',
  divider: 'border-0 border-t border-solid border-ouro-border py-[16px]',
  baseline: 'impact-baseline border-0 border-t border-solid border-ouro-border py-[16px]',
  baselineHelper: elements.helper,
  tableWrap:
    'impact-table-wrap mt-[14px] max-w-full overflow-auto rounded-[var(--radius)] border border-solid border-ouro-border',
  table: 'w-full min-w-[530px] border-collapse text-left whitespace-nowrap',
  tableHeader:
    'bg-ouro-subtle px-[15px] py-[13px] text-[12px] font-medium text-[var(--text-faint)] [border-bottom:1px_solid_var(--border)] at-most-680:px-[10px] at-most-680:py-[12px]',
  tableRow: 'hover:bg-ouro-subtle last:[&>td]:[border:0]',
  tableCell:
    'max-w-[300px] px-[15px] py-[13px] text-[12px] whitespace-normal [border-bottom:1px_solid_var(--border)] [overflow-wrap:anywhere] at-most-680:px-[10px] at-most-680:py-[12px]',
  tableCode: 'font-mono text-[10px] text-[var(--text-faint)]',
  tableTitle: 'mt-[5px] block text-[12px] font-medium',
  uuid: 'impact-uuid mt-[5px] block font-mono text-[9px] text-[var(--text-faint)] [overflow-wrap:anywhere]',
  method: 'impact-method border-0 border-t border-solid border-ouro-border py-[16px]',
  methodGrid: 'gap-[12px] pt-[16px] text-[12px] leading-[1.7] text-ouro-text-muted',
  methodLink:
    'justify-self-start text-[11px] text-ouro-text underline underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ouro-text focus-visible:outline-offset-[3px]',
} as const;
