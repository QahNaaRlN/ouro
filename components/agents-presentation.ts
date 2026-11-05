/** Собственные slots подключений; формат ключей, запросы и присутствие определяются прежним компонентом. */
export const agentsPresentation = {
  error:
    'mb-[20px] rounded-[var(--radius)] border border-solid border-[var(--negative)] bg-[var(--negative-surface)] px-[16px] py-[12px] text-[var(--negative)]',
  steps:
    'm-0 mb-[28px] grid list-none grid-cols-3 gap-[24px] border-b [border-bottom-style:solid] border-b-ouro-border px-0 pt-0 pb-[28px] at-most-900:grid-cols-[1fr] at-most-900:gap-[18px]',
  step: 'flex min-w-0 gap-[12px]',
  stepNumber:
    'grid size-[28px] flex-none place-items-center rounded-[50%] border border-solid border-ouro-control',
  stepTitle: 'text-[14px] font-medium',
  stepCopy: 'mt-[8px] mr-0 mb-0 ml-0 text-[12px] leading-[1.7] text-ouro-text-muted',
  create:
    'mb-[28px] flex max-w-[760px] items-end gap-[16px] at-most-900:flex-col at-most-900:items-stretch',
  createLabel: 'm-0 min-w-0 flex-1',
  createAction: 'min-h-[40px]',
  issued:
    'mt-[24px] mr-0 mb-[32px] ml-0 rounded-[var(--radius)] border border-solid border-ouro-control bg-ouro-subtle p-[24px] at-most-900:p-[16px]',
  issuedTitle: 'mt-[8px] mr-0 mb-0 ml-0 text-[20px]',
  issuedCopy: 'max-w-[850px] text-[14px] leading-[1.8] text-ouro-text-muted',
  tabs: 'mt-[20px] mr-0 mb-[12px] ml-0 max-w-full flex-wrap at-most-900:flex',
  clientTab: 'text-[12px]',
  config:
    'block min-h-[250px] w-full resize-y overflow-auto rounded-[var(--radius)] bg-ouro-bg p-[16px] text-[12px] leading-[1.7] whitespace-pre text-ouro-text [tab-size:2]',
  configActions: 'my-[16px] flex flex-wrap items-center gap-[20px]',
  configTextAction: 'text-[12px]',
  listSection: 'my-[30px]',
  sectionTitle: 'text-[16px]',
  list: 'mt-[16px]',
  registration:
    'flex min-w-0 items-start gap-[16px] border-b [border-bottom-style:solid] border-b-ouro-border px-0 py-[20px] at-most-900:flex-wrap',
  icon: 'pt-[3px] text-ouro-text-muted',
  body: 'min-w-0 flex-1',
  registrationHeading: 'mb-[8px] flex flex-wrap items-center gap-[16px]',
  name: 'text-[14px] [overflow-wrap:anywhere]',
  id: 'text-[12px] text-[var(--text-faint)] [overflow-wrap:anywhere]',
  metadata: 'mt-[10px] flex flex-wrap gap-[20px] text-[12px] text-ouro-text-muted',
  revoked: 'text-ouro-text-muted',
  revokeAction: 'flex-none at-most-900:ml-[36px]',
  empty: 'border-b [border-bottom-style:solid] border-b-ouro-border py-[24px] text-ouro-text-muted',
  instructions: 'mt-[32px] border-t [border-top-style:solid] border-t-ouro-border px-0 py-[24px]',
  instructionsHeading: 'at-most-900:flex-wrap at-most-900:gap-[12px]',
  instructionsCopy: 'max-w-[1000px] text-[14px] leading-[1.9] text-ouro-text-muted',
  instructionsLink: 'text-[12px] text-ouro-text-muted underline underline-offset-[4px]',
} as const;
