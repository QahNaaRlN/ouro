import { getMeridianThemeVariables } from '@/packages/meridian/src/theme';

const palettes = {
  light:
    '[--bg:#fff] [--text:#18181b] [--muted:#f4f4f5] [--subtle:#fafafa] [--text-muted:#52525b] [--border:#e4e4e7] [--control:#e4e4e7] [--primary:#18181b] [--primary-text:#fff] [--selected:#e4e4e7] [--positive:#15803d] [--positive-surface:#f0fdf4] [--attention:#92400e] [--attention-surface:#fffbeb] [--negative:#b91c1c] [--negative-surface:#fef2f2]',
  dark: '[--bg:#101113] [--text:#fafafa] [--muted:#24272d] [--subtle:#181a1e] [--text-muted:#b4b8c2] [--border:#343841] [--control:#7c828e] [--primary:#fafafa] [--primary-text:#18181b] [--selected:#626975] [--positive:#86efac] [--positive-surface:#142a1e] [--attention:#fcd34d] [--attention-surface:#332919] [--negative:#fca5a5] [--negative-surface:#321c21]',
};

/** Локальная палитра сохраняет закрытый контракт темы и не изменяет тему документа. */
export function meridianThemePresentation(theme: 'light' | 'dark') {
  getMeridianThemeVariables(theme);
  return palettes[theme];
}

/** Оформление конкретных слотов импорта; имена прежних классов остаются тестовыми hooks. */
export const meridianPresentation = {
  panel: 'meridian-panel m-[0_0_24px] min-w-0 border-0 border-none bg-ouro-bg pt-0 text-ouro-text',
  heading: 'meridian-heading flex items-start justify-between gap-[18px] at-most-950:flex-wrap',
  headingTitle: 'm-[8px_0_10px] flex items-center gap-[10px] text-[24px] tracking-[-.5px]',
  paragraph: 'text-[12px] leading-[1.7] text-ouro-text-muted',
  boundary: 'meridian-boundary m-[15px_0_20px] text-[12px] leading-[1.7] text-ouro-text-muted',
  badges: 'meridian-heading-badges flex flex-col items-end gap-[8px] at-most-950:items-start',
  badge:
    'meridian-badge inline-flex whitespace-nowrap rounded-[4px] border border-solid border-ouro-border bg-ouro-subtle px-[8px] py-[5px] text-[10px] text-ouro-text-muted',
  file: 'meridian-file flex flex-col gap-[12px] rounded-[var(--radius)] border border-dashed border-ouro-control bg-ouro-subtle p-[20px] text-[12px] text-ouro-text-muted',
  fileTitle: 'flex items-center gap-[9px] font-[550] text-ouro-text',
  fileInput:
    'w-full min-w-0 max-w-full text-[12px] file:mr-[12px] file:cursor-pointer file:rounded-[4px] file:border file:border-solid file:border-ouro-border file:bg-ouro-bg file:px-[10px] file:py-[7px] file:[font:inherit] file:text-ouro-text motion-reduce:transition-none',
  fileHint: 'text-[10px] text-[color:var(--text-faint)]',
  error:
    'meridian-error my-[15px] rounded-[var(--radius)] border border-solid border-[color:var(--negative)] bg-[var(--negative-surface)] px-[15px] py-[13px] text-[12px] leading-[1.7] text-[color:var(--negative)] [overflow-wrap:anywhere]',
  notice:
    'meridian-notice my-[15px] rounded-[var(--radius)] border border-solid border-ouro-border bg-[var(--positive-surface)] px-[15px] py-[13px] text-[12px] leading-[1.7] text-[color:var(--positive)] [overflow-wrap:anywhere]',
  conflict:
    'meridian-conflict my-[15px] rounded-[var(--radius)] border border-solid border-ouro-border bg-[var(--attention-surface)] px-[15px] py-[13px] text-[12px] leading-[1.7] text-[color:var(--attention)] [overflow-wrap:anywhere]',
  conflictButton: 'text-btn mt-[8px] block motion-reduce:transition-none',
  preview:
    'meridian-preview my-[20px] min-w-0 rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-bg p-[22px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ouro-control focus-visible:outline-offset-[3px] at-most-950:p-[17px]',
  form: 'meridian-form my-[20px] min-w-0 rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-bg p-[22px] at-most-950:p-[17px]',
  sectionHeading: 'section-heading mb-[16px] flex-wrap gap-[12px]',
  sectionTitle: 'text-[15px] tracking-[-.2px]',
  trust:
    'meridian-trust my-[15px] flex items-start gap-[9px] border-0 border-l-2 border-solid border-ouro-control bg-ouro-subtle px-[14px] py-[12px] text-[11px] leading-[1.7] text-ouro-text-muted',
  trustIcon: 'mt-[3px] shrink-0',
  trustStrong: 'font-[550] text-ouro-text',
  meta: 'meridian-meta my-[20px] grid grid-cols-[1fr_1fr] gap-x-[20px] gap-y-[14px] at-most-950:grid-cols-[1fr]',
  metaRow: 'min-w-0',
  metaTerm: 'mb-[5px] text-[10px] text-[color:var(--text-faint)]',
  metaValue: 'm-0 whitespace-pre-wrap text-[12px] [overflow-wrap:anywhere]',
  pins: 'meridian-pins my-[14px] grid grid-cols-[1fr] gap-[9px]',
  pin: 'meridian-pin min-w-0 rounded-[4px] border border-solid border-ouro-border bg-ouro-subtle px-[14px] py-[12px]',
  pinLabel: 'mb-[6px] block text-[10px] text-[color:var(--text-faint)]',
  pinValue: 'block text-[11px] font-medium [overflow-wrap:anywhere]',
  pinHash: 'mt-[6px] block text-[10px] text-ouro-text-muted [overflow-wrap:anywhere]',
  accordion:
    'mt-[18px] border-0 border-t border-solid border-ouro-border pt-[15px] text-[11px] text-ouro-text-muted',
  accordionTrigger:
    'py-[3px] text-[12px] leading-[inherit] text-ouro-text focus-visible:outline-ouro-control motion-reduce:transition-none',
  source: 'meridian-source-details py-[12px]',
  sourceTitle: 'm-[12px_0_7px] text-[11px] font-[550]',
  sourceParagraph:
    'my-[10px] whitespace-pre-wrap text-[11px] leading-[1.7] [overflow-wrap:anywhere]',
  label: 'my-[16px] flex flex-col gap-[7px] text-[12px] text-ouro-text-muted',
  input:
    'w-full text-[12px] leading-[1.7] read-only:bg-ouro-subtle read-only:text-ouro-text-muted motion-reduce:transition-none',
  dod: 'meridian-dod m-[25px_0_15px] min-w-0 rounded-[var(--radius)] border border-solid border-ouro-border px-[16px] pt-0 pb-[17px] at-most-950:px-[10px] at-most-950:pb-[14px]',
  legend: 'px-[7px] text-[12px] font-[550] text-ouro-text',
  criterion: 'meridian-criterion',
  criterionFollowing: 'mt-[20px] border-0 border-t border-solid border-ouro-border pt-[6px]',
  required: 'meridian-required flex items-center gap-[7px] text-[11px] text-ouro-text-muted',
  criterionHint:
    'mt-[10px] block text-[10px] text-[color:var(--text-faint)] [overflow-wrap:anywhere]',
  actions:
    'meridian-actions mt-[20px] flex flex-wrap items-center gap-[12px] at-most-950:flex-col at-most-950:items-start',
  actionsNote: 'max-w-[420px] text-[10px] leading-[1.65] text-[color:var(--text-faint)]',
  note: 'meridian-note my-[14px] flex items-center gap-[8px] text-[11px] leading-[1.7] text-ouro-text-muted [overflow-wrap:anywhere]',
  spinner: 'spin animate-[spin_1.5s_linear_infinite] motion-reduce:animate-none',
  button: 'motion-reduce:transition-none',
  origin:
    'meridian-origin mb-[26px] rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-subtle p-[18px] at-most-950:p-[14px]',
  originHeading: 'section-heading mb-[12px] flex-wrap gap-[10px]',
  originTitle: 'flex items-center gap-[7px] text-[13px]',
  originParagraph: 'text-[11px] leading-[1.75] text-ouro-text-muted',
  originMeta:
    'meridian-meta my-[16px] grid grid-cols-[1fr_1fr] gap-x-[20px] gap-y-[14px] at-most-950:grid-cols-[1fr]',
  originValue: 'm-0 whitespace-pre-wrap text-[11px] [overflow-wrap:anywhere]',
  hash: 'meridian-hash col-[1/-1] min-w-0',
  hashCode: 'text-[10px]',
  originDownload: 'btn btn-small mt-[15px] motion-reduce:transition-none',
  criterionMap:
    'meridian-criterion-map pl-[18px] text-[10px] leading-[1.7] [overflow-wrap:anywhere]',
};
