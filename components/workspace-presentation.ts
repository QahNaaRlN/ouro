/** Базовое оформление элементов рабочего места; потребитель дополняет его классами конкретного слота. */
export const workspacePresentation = {
  button:
    'box-border inline-flex w-fit min-w-0 max-w-full cursor-pointer items-center justify-center gap-[8px] rounded-[6px] border border-solid border-ouro-border bg-ouro-bg px-[14px] py-[10px] text-center font-sans text-[12px] leading-[1.6] font-medium text-ouro-text whitespace-normal [overflow-wrap:break-word] disabled:cursor-not-allowed disabled:opacity-45 enabled:hover:border-ouro-control focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ouro-text focus-visible:outline-offset-[3px]',
  primary: 'border-[color:var(--primary)] bg-[var(--primary)] text-[color:var(--primary-text)]',
  input:
    'box-border w-full min-w-0 max-w-full rounded-[6px] border border-solid border-ouro-border bg-ouro-bg px-[12px] py-[11px] font-[family-name:inherit] text-[13px] leading-[1.6] text-ouro-text focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ouro-text focus-visible:outline-offset-[3px]',
  textarea:
    'box-border w-full min-w-0 max-w-full resize-y rounded-[6px] border border-solid border-ouro-border bg-ouro-bg px-[12px] py-[11px] font-[family-name:inherit] text-[13px] leading-[1.6] text-ouro-text min-h-[75px] read-only:font-workspace-mono read-only:text-[11px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ouro-text focus-visible:outline-offset-[3px]',
  label: 'grid min-w-0 gap-[8px] text-[12px] leading-[1.6] text-ouro-text-muted',
  form: 'grid min-w-0 gap-[16px]',
  paragraph: 'leading-[1.75]',
  h2: 'm-[0_0_12px] text-[19px] leading-[1.4] font-medium',
  h3: 'm-[0_0_10px] text-[16px] leading-[1.5] font-medium',
  h4: 'm-[16px_0_8px] text-[14px] leading-[1.5] font-bold',
  code: 'font-workspace-mono text-[11px] leading-[1.7] [overflow-wrap:anywhere]',
  pre: 'max-w-full whitespace-pre-wrap rounded-[6px] border border-solid border-ouro-border bg-ouro-bg p-[12px] font-workspace-mono text-[11px] leading-[1.7] [overflow-wrap:anywhere]',
  link: 'text-ouro-text no-underline hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ouro-text focus-visible:outline-offset-[3px]',
  details: 'my-[16px] text-[12px] leading-[1.8]',
  summary:
    'cursor-pointer text-ouro-text-muted focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ouro-text focus-visible:outline-offset-[3px]',
  panel:
    'mb-[24px] min-w-0 rounded-[10px] border border-solid border-ouro-border bg-ouro-subtle p-[26px] at-most-520:rounded-[8px] at-most-520:px-[16px] at-most-520:py-[19px]',
  flatPanel: 'mb-[22px] border-0 border-none border-current bg-transparent p-0 at-most-520:p-0',
  sectionHeading:
    'mb-[16px] flex min-w-0 items-center justify-between gap-[16px] at-most-520:gap-[10px]',
  actions: 'flex flex-wrap items-center gap-[10px]',
  muted: 'text-[12px] leading-[1.7] text-ouro-text-muted',
  badge:
    'inline-flex rounded-[30px] border border-solid border-ouro-border px-[9px] py-[3px] text-[10px] leading-[1.5] whitespace-normal',
  empty:
    'rounded-[8px] border border-dashed border-ouro-border px-[20px] py-[28px] text-[13px] leading-[1.9] text-ouro-text-muted',
  error:
    'my-[15px] rounded-[7px] border border-solid border-[color:var(--negative)] bg-[var(--negative-surface)] px-[16px] py-[14px] text-[12px] leading-[1.7] text-[color:var(--negative)]',
  path: 'flex min-w-0 items-center gap-[8px] [overflow-wrap:anywhere] [word-break:normal]',
  evidence:
    'whitespace-pre-wrap border-0 border-l-2 border-solid border-ouro-positive px-[14px] py-[10px] [overflow-wrap:anywhere]',
};
