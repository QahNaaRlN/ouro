import type { CSSProperties } from 'react';
import { twMerge } from 'tailwind-merge';
import { workspacePresentation as ui } from './workspace-presentation';

type Rect = { left: number; top: number; width: number; height: number };
type TourVariables = CSSProperties &
  Partial<
    Record<
      `--ouro-tour-${'left' | 'top' | 'width' | 'height' | 'max-width' | 'max-height'}`,
      string
    >
  >;

/** Только измеряемая геометрия viewport передаётся в CSS; палитра и оформление статичны. */
export function tourRectVariables(rect: Rect): TourVariables {
  return {
    '--ouro-tour-left': `${rect.left}px`,
    '--ouro-tour-top': `${rect.top}px`,
    '--ouro-tour-width': `${rect.width}px`,
    '--ouro-tour-height': `${rect.height}px`,
  };
}

/** Положение карточки сохраняет исходные ограничения фактического visual viewport. */
export function tourCardVariables(
  geometry: { card: { left: number; top: number }; view: Rect } | null,
): TourVariables | undefined {
  return geometry
    ? {
        '--ouro-tour-left': `${geometry.card.left}px`,
        '--ouro-tour-top': `${geometry.card.top}px`,
        '--ouro-tour-width': `${Math.max(0, Math.min(360, geometry.view.width - 32))}px`,
        '--ouro-tour-max-width': `${Math.max(0, geometry.view.width - 32)}px`,
        '--ouro-tour-max-height': `${Math.max(0, geometry.view.height - 32)}px`,
      }
    : undefined;
}

const control = twMerge(
  ui.button,
  'min-h-[38px] px-[11px] py-[8px] motion-reduce:transition-none at-most-420:px-[10px] at-most-420:text-[11px]',
);

/** Явные слоты обучения сохраняют общий workspace button contract без ancestor selectors. */
export const onboardingPresentation = {
  entry:
    'onboarding-entry m-[0_0_26px] flex flex-wrap items-center gap-[16px] at-most-700:items-start at-most-420:gap-[12px]',
  launcher: twMerge(ui.button, 'flex-none motion-reduce:transition-none'),
  invitation:
    'onboarding-invitation flex min-w-0 flex-1 items-center gap-[16px] border-0 border-l-2 border-solid border-ouro-control py-[5px] pr-0 pl-[16px] at-most-700:flex-col at-most-700:items-start at-most-700:gap-[10px] at-most-420:basis-full',
  invitationText: 'm-0 text-[12px] leading-[1.7] text-ouro-text-muted',
  invitationStrong: 'font-medium text-ouro-text',
  invitationActions: 'onboarding-invitation-actions flex flex-none flex-wrap gap-[8px]',
  invitationButton: twMerge(
    ui.button,
    'px-[10px] py-[6px] text-[11px] motion-reduce:transition-none',
  ),
  dialog:
    'onboarding-dialog fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden overscroll-contain border-0 border-none bg-transparent p-0 text-ouro-text backdrop:bg-transparent motion-reduce:animate-none motion-reduce:scroll-auto motion-reduce:transition-none',
  mask: 'onboarding-mask pointer-events-none absolute inset-0',
  pane: 'onboarding-pane absolute bg-[rgba(0,0,0,.74)] [left:var(--ouro-tour-left)] [top:var(--ouro-tour-top)] [width:var(--ouro-tour-width)] [height:var(--ouro-tour-height)]',
  highlight:
    'onboarding-highlight pointer-events-none absolute rounded-[8px] border-2 border-solid border-ouro-control shadow-[0_0_0_1px_rgba(255,255,255,.18)] [left:var(--ouro-tour-left)] [top:var(--ouro-tour-top)] [width:var(--ouro-tour-width)] [height:var(--ouro-tour-height)]',
  card: 'onboarding-card absolute overflow-auto overscroll-contain rounded-[12px] border border-solid border-ouro-border bg-ouro-bg p-[22px] font-sans shadow-[0_18px_70px_rgba(0,0,0,.35)] [left:var(--ouro-tour-left,16px)] [top:var(--ouro-tour-top,16px)] [width:var(--ouro-tour-width,min(360px,calc(100vw_-_32px)))] [max-width:var(--ouro-tour-max-width,calc(100vw_-_32px))] [max-height:var(--ouro-tour-max-height,calc(100dvh_-_32px))] motion-reduce:scroll-auto at-most-700:p-[19px]',
  header: 'onboarding-card-header mb-[12px] flex items-center justify-between gap-[12px]',
  count: 'onboarding-count m-0 text-[11px] leading-[1.75] text-ouro-text-muted',
  close: twMerge(
    ui.button,
    'onboarding-close size-[32px] min-h-[32px] border-transparent bg-transparent p-0 text-[24px] leading-none text-ouro-text-muted motion-reduce:transition-none',
  ),
  heading:
    'm-[0_0_12px] text-[20px] leading-[1.4] font-medium tracking-[-.3px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ouro-text focus-visible:outline-offset-[3px] at-most-700:text-[19px]',
  body: 'm-[0_0_22px] text-[13px] leading-[1.8] text-ouro-text-muted',
  unavailable:
    'onboarding-unavailable m-[18px_0_22px] border-0 border-l-2 border-solid border-[color:var(--attention)] pl-[12px] text-[12px] leading-[1.8] text-ouro-text',
  controls:
    'onboarding-controls flex flex-wrap items-center justify-between gap-[12px] at-most-420:gap-[10px]',
  controlsGroup: 'ml-auto flex gap-[8px]',
  control,
  next: twMerge(control, ui.primary, 'onboarding-next'),
};
