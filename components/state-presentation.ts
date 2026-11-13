import { twMerge } from 'tailwind-merge';

/** Четыре оси сохраняют собственную модель и routed ports; recipes меняют только отображение. */
export const statePresentation = {
  root: 'mt-[24px] min-w-0 border-t [border-top-style:solid] border-t-ouro-border pt-[24px]',
  heading: 'flex items-start justify-between gap-[16px] at-most-760:flex-col',
  title: 'my-[6px] flex items-center gap-[8px] text-[17px]',
  description: 'max-w-[600px] text-[12px] text-ouro-text-muted',
  axes: 'mt-[20px] flex gap-[4px] overflow-auto border-b [border-bottom-style:solid] border-b-ouro-border',
  axis: 'border-b-2 [border-bottom-style:solid] border-b-transparent px-[13px] py-[10px] whitespace-nowrap text-ouro-text-muted at-most-760:p-[10px] at-most-760:text-[12px]',
  selectedAxis: 'border-b-ouro-text text-ouro-text',
  context:
    'flex min-h-[64px] items-center justify-between gap-[16px] py-[14px] at-most-760:flex-col at-most-760:items-start at-most-760:gap-[10px]',
  current: 'flex items-center gap-[8px] text-[12px] text-ouro-text-muted',
  currentIcon: 'text-[var(--positive)]',
  currentValue: 'font-semibold text-ouro-text',
  picker:
    'flex max-w-[60%] items-center gap-[8px] text-[12px] text-ouro-text-muted at-most-760:w-full at-most-760:max-w-full',
  canvas:
    'h-[460px] overflow-hidden rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-bg at-most-760:h-[400px]',
  outerNode: 'rounded-[var(--radius)] border-0 border-none border-current bg-transparent p-0',
  card: 'relative flex min-h-[92px] w-[206px] flex-col items-start justify-center rounded-[8px] border border-solid border-ouro-border bg-ouro-subtle pt-[15px] pr-[14px] pb-[14px] pl-[38px] text-left text-ouro-text',
  cardTitle: 'text-[14px] leading-[1.4] font-[550]',
  marker: 'absolute top-[19px] left-[12px] text-[var(--text-faint)]',
  markerDot: 'mt-[2px] block size-[10px] rounded-[50%] border border-solid border-ouro-control',
  caption: 'mt-[6px] block text-[10px] text-[var(--text-faint)]',
  currentCard:
    'border-[1.5px] border-[var(--positive)] bg-[var(--positive-surface)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--positive)_10%,transparent)]',
  currentDetails: 'text-[var(--positive)]',
  selectedCard: 'border-ouro-control',
  reservedCard: 'border-dashed bg-ouro-bg text-[var(--text-faint)]',
  notices:
    'mb-[14px] flex flex-col gap-[8px] rounded-[var(--radius)] border border-solid border-[color-mix(in_srgb,var(--attention)_25%,transparent)] bg-[var(--attention-surface)] px-[14px] py-[12px] text-[12px] text-[var(--attention)]',
  notice: 'flex items-start gap-[8px]',
  noticeIcon: 'mt-[2px] shrink-0',
  legend:
    'flex flex-wrap gap-[20px] pt-[12px] pb-[18px] text-[11px] text-ouro-text-muted at-most-760:gap-[10px]',
  legendItem: 'flex items-center gap-[6px]',
  legendLine:
    'inline-block h-0 w-[20px] border-t [border-top-style:solid] border-t-[var(--graph-edge)]',
  legendCurrent:
    'size-[9px] rounded-[50%] border border-solid border-[var(--positive)] bg-[var(--positive-surface)]',
  legendObserved: 'border-t-2 border-t-[var(--positive)]',
  legendPossible: '[border-top-style:dashed]',
  detail:
    'grid grid-cols-[minmax(180px,.8fr)_minmax(260px,1.2fr)] gap-[24px] rounded-[var(--radius)] border border-solid border-ouro-border bg-ouro-subtle p-[18px] at-most-760:grid-cols-[1fr] at-most-760:gap-[16px]',
  detailTitle: 'mt-[4px] mb-[7px] text-[14px]',
  detailText: 'text-[12px] leading-[1.65] text-ouro-text-muted',
  transitions:
    'border-l [border-left-style:solid] border-l-ouro-border pl-[20px] at-most-760:border-t at-most-760:[border-top-style:solid] at-most-760:border-t-ouro-border at-most-760:border-l-0 at-most-760:pt-[14px] at-most-760:pl-0',
  subsequent: 'mt-[14px] border-t [border-top-style:solid] border-t-ouro-border pt-[14px]',
  transitionTitle: 'flex items-center gap-[6px] text-[12px] font-medium',
  transitionActor: 'my-[5px] block text-[11px] text-[var(--text-faint)]',
  history: 'mt-[16px] border-t [border-top-style:solid] border-t-ouro-border pt-[14px]',
  historyCount: 'ml-[6px] text-[var(--text-faint)] tabular-nums',
  historyList: 'm-0 list-none px-0 py-[6px]',
  historyItem:
    'flex flex-wrap items-center gap-[10px] border-b [border-bottom-style:solid] border-b-ouro-border py-[10px] text-[11px] text-[var(--text-faint)]',
  historyTitle: 'flex items-center gap-[6px] font-medium text-ouro-text-muted',
  tableWrap: 'overflow-auto rounded-[var(--radius)] border border-solid border-ouro-border',
  table: 'w-full border-collapse text-[12px]',
  tableCaption: 'px-[14px] py-[12px] text-left text-[11px] text-ouro-text-muted',
  cell: 'border-b [border-bottom-style:solid] border-b-ouro-border px-[14px] py-[12px] text-left align-top',
  header: 'font-medium text-[var(--text-faint)]',
  finalRowCell: 'border-0 border-none border-current [border-bottom-style:none]',
  currentRow: 'bg-[var(--positive-surface)]',
  finalCell: 'whitespace-nowrap',
  tableButton: 'text-left',
  options:
    'mb-[10px] flex items-center justify-between gap-[12px] at-most-760:flex-col at-most-760:items-start',
  optionsText: 'text-[11px] text-[var(--text-faint)]',
  optionsButton:
    'rounded-[var(--radius)] border border-solid border-ouro-border px-[9px] py-[6px] text-[11px] whitespace-nowrap text-ouro-text-muted',
  optionsSelected: 'border-ouro-control bg-[var(--selected)] text-ouro-text',
} as const;

/** Собирает оформление карточки, учитывая текущее, выбранное и зарезервированное состояние. */
export function stateCardClassName(current: boolean, selected: boolean, reserved: boolean) {
  return twMerge(
    statePresentation.card,
    current && statePresentation.currentCard,
    !current && selected && statePresentation.selectedCard,
    reserved && statePresentation.reservedCard,
  );
}

const edgeBase = String.raw`[&_.react-flow\_\_edge-text]:text-[11px] [&_.react-flow\_\_edge-textbg]:fill-[var(--bg)] [&_.react-flow\_\_edge-textbg]:[fill-opacity:.97]`;
const observed = String.raw`[&>.react-flow\_\_edge-path]:stroke-[var(--positive)] [&>.react-flow\_\_edge-path]:[stroke-width:2] [&>.react-flow\_\_edge-path]:opacity-100 [&_.react-flow\_\_edge-text]:fill-[var(--positive)]`;
const possible = String.raw`[&>.react-flow\_\_edge-path]:stroke-[var(--graph-edge)] [&>.react-flow\_\_edge-path]:[stroke-width:1] [&>.react-flow\_\_edge-path]:[stroke-dasharray:5_5] [&>.react-flow\_\_edge-path]:opacity-65 [&_.react-flow\_\_edge-text]:fill-[var(--text-muted)]`;
/** Opacity относится к видимому path, фон подписи использует собственный fill-opacity. */
export function stateEdgeClassName(hasFact: boolean) {
  return `${edgeBase} ${hasFact ? observed : possible}`;
}
