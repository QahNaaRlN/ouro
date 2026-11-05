/** Оформление приватных форм страницы не меняет разрешения, исходную версию или payload команды. */
export const humanMaintenance = {
  cursorForm:
    'mt-0 mr-0 mb-[24px] ml-0 flex flex-wrap items-end gap-[12px] rounded-[9px] border border-solid border-ouro-border bg-ouro-subtle p-[18px]',
  cursorLabel: 'flex flex-col gap-[7px] text-[12px] text-ouro-text-muted',
  cursorInput: 'w-[180px]',
  cursorCopy: 'm-0 min-w-[180px] flex-1 text-[12px] leading-[1.6] text-ouro-text-muted',
  decisions: 'mt-[25px] border-t [border-top-style:solid] border-t-ouro-border pt-[23px]',
  /** В действующем request-detail общий heading выигрывал над прежним 14px/14px rule. */
  heading: 'm-0 mb-[9px] text-[12px]',
  form: 'mt-[16px] flex flex-col gap-[14px]',
  label: 'm-0',
  clarificationList: 'mt-[16px]',
  clarification: 'mb-[12px] rounded-[8px] border border-solid border-ouro-border p-[14px]',
  clarificationCopy: 'text-[13px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:anywhere]',
  clarificationAuthor: 'text-[11px] text-[var(--text-faint)]',
  lineage:
    'my-[18px] rounded-[8px] border border-solid border-ouro-border bg-[var(--attention-surface)] p-[14px] text-[12px] leading-[1.8] [overflow-wrap:anywhere]',
  lineageTitle: 'block',
  recovery:
    'my-[16px] rounded-[8px] border border-solid border-ouro-border bg-[var(--attention-surface)] p-[14px]',
  recoveryForm: 'mt-[14px] flex flex-col gap-[14px]',
  recoveryField: 'min-h-[82px] text-[12px]',
  recoveryCopy: 'text-[12px] leading-[1.7] whitespace-pre-wrap [overflow-wrap:anywhere]',
  unconfirmed: 'text-[var(--attention)] font-semibold',
  recoveryAction: 'leading-[1.5] whitespace-normal',
} as const;
