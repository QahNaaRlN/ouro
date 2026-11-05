import { twMerge } from 'tailwind-merge';

const section =
  'participant-section flex flex-col gap-[16px] rounded-[10px] border border-ouro-border bg-ouro-subtle p-[22px] [@media(max-width:760px)]:p-[16px]';
const field =
  'w-full rounded-[6px] border border-ouro-border bg-ouro-bg px-[12px] py-[10px] font-[family-name:inherit] text-[13px] leading-[inherit] text-ouro-text focus:outline-2 focus:outline-solid focus:outline-ouro-text focus:outline-offset-2';
const error =
  'participant-error rounded-[6px] border border-[color-mix(in_srgb,var(--negative)_40%,var(--border))] bg-[color-mix(in_srgb,var(--negative)_10%,var(--bg))] px-[14px] py-[12px] text-[13px] leading-[1.5] text-ouro-text';
const notice =
  'participant-notice rounded-[6px] border border-ouro-border px-[14px] py-[12px] text-[13px] text-ouro-text-muted';

/** Явное оформление форм участника и аккаунта без транспорта и runtime-состояния. */
export const participantUi = {
  panel:
    'participants-panel mx-auto my-0 flex w-[min(100%,1080px)] flex-col gap-[22px] px-[40px] pt-[36px] pb-[60px] [@media(max-width:760px)]:gap-[16px] [@media(max-width:760px)]:px-[18px] [@media(max-width:760px)]:pt-[24px] [@media(max-width:760px)]:pb-[40px]',
  title: 'flex items-center gap-[9px]',
  section,
  secretSection: twMerge(section, 'participant-secret border-ouro-text'),
  heading: 'm-0 flex items-center gap-[9px] text-[15px] font-semibold',
  sectionHeading:
    'section-heading [@media(max-width:760px)]:flex-wrap [@media(max-width:760px)]:items-start [@media(max-width:760px)]:gap-[10px]',
  copy: 'm-0 text-[13px] leading-[1.6] text-ouro-text-muted',
  label: 'flex min-w-0 flex-col gap-[7px] text-[12px] text-ouro-text-muted',
  field,
  secretField: twMerge(field, 'font-[family-name:var(--font-mono,monospace)] wrap-anywhere'),
  form: 'flex items-end gap-[12px] [@media(max-width:760px)]:flex-col [@media(max-width:760px)]:items-stretch',
  formButton: 'min-h-[38px] whitespace-nowrap',
  error,
  notice,
  sectionError: twMerge(error, 'm-0 leading-[1.6] text-ouro-text-muted'),
  sectionNotice: twMerge(notice, 'm-0 leading-[1.6]'),
  id: 'participant-id font-[family-name:var(--font-mono,monospace)] text-[11px] text-ouro-text-muted wrap-anywhere',
  directory: 'participant-directory flex flex-col gap-[10px]',
  card: 'participant-card flex justify-between gap-[18px] rounded-[7px] border border-ouro-border bg-ouro-bg p-[16px] [@media(max-width:760px)]:flex-col [@media(max-width:760px)]:gap-[12px]',
  cardIdentity: 'flex min-w-0 flex-col items-start gap-[7px]',
  cardActions: 'flex min-w-0 flex-col items-end gap-[7px] [@media(max-width:760px)]:items-start',
  name: 'text-[14px]',
  small: 'text-[11px] text-ouro-text-muted',
  badge:
    'participant-badge whitespace-nowrap rounded-[4px] border border-ouro-border px-[7px] py-[4px] text-[11px] text-ouro-text',
} as const;

/** Контекст оформления, который явно выбирает одна из двух существующих оболочек. */
export type ParticipantSurface = 'legacy' | 'workspace';
const workspaceUi = {
  ...participantUi,
  heading: twMerge(participantUi.heading, 'mb-[12px] text-[19px] leading-[1.4] font-medium'),
  form: 'grid min-w-0 items-end gap-[16px] [@media(max-width:760px)]:items-stretch',
  label: 'grid min-w-0 gap-[8px] text-[12px] leading-[1.6] text-ouro-text-muted',
  field: twMerge(
    participantUi.field,
    'min-w-0 max-w-full py-[11px] leading-[1.6] focus-visible:outline-offset-3',
  ),
  copy: twMerge(participantUi.copy, 'leading-[1.75]'),
  error: twMerge(participantUi.error, 'leading-[1.75]'),
  sectionError: twMerge(participantUi.sectionError, 'leading-[1.75]'),
  sectionNotice: twMerge(participantUi.sectionNotice, 'leading-[1.75]'),
  id: twMerge(participantUi.id, "font-[family-name:'JetBrains_Mono',monospace] leading-[1.7]"),
};

/** Выбирает готовый набор utilities без чтения DOM и открытия транспорта. */
export function participantPresentation(surface: ParticipantSurface) {
  return surface === 'workspace' ? workspaceUi : participantUi;
}
