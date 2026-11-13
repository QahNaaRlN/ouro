/** История событий получает оформление отдельно от владения данными событий. */
export const humanHistory = {
  timeline: 'timeline py-[14px]',
  item: 'timeline-item relative flex gap-[13px] pt-[12px] pb-[23px] after:absolute after:top-[44px] after:bottom-[-11px] after:left-[14px] after:w-px after:bg-ouro-border after:content-[""] last:after:hidden at-most-680:gap-[10px] at-most-680:after:top-[42px] at-most-680:after:left-[13px]',
  icon: 'timeline-icon relative z-1 mt-px grid size-[29px] shrink-0 place-items-center rounded-[6px] border border-ouro-border bg-ouro-subtle text-[var(--text-faint)] at-most-680:size-[26px]',
  humanIcon: 'text-ouro-positive',
  body: 'timeline-body min-w-0 flex-1',
  metadata:
    'timeline-meta flex items-center justify-between gap-[12px] at-most-680:flex-wrap at-most-680:items-start at-most-680:gap-[4px]',
  comparisonMetadata: 'flex-wrap gap-[4px]',
  eventTitle: 'text-[13px] font-medium',
  comparisonTitle: 'text-[12px]',
  time: 'text-[12px] whitespace-nowrap text-[var(--text-faint)]',
  copy: 'mt-[6px] mb-[8px] text-[13px] text-ouro-text-muted wrap-anywhere',
  tags: 'timeline-tags flex items-center gap-[10px] text-[12px] text-[var(--text-faint)] at-most-680:flex-wrap at-most-680:gap-[5px]',
  comparisonTags: 'flex-wrap gap-[5px]',
  version: 'mono text-[12px]',
  accordion: 'mt-[10px] text-[12px] text-[var(--text-faint)]',
  source:
    'max-h-[400px] overflow-auto rounded-[5px] border border-ouro-border bg-ouro-subtle p-[14px] text-[12px]',
  filter:
    'history-filter flex items-end gap-[15px] border-b border-ouro-border pb-[15px] at-most-680:flex-col at-most-680:items-start at-most-680:gap-[5px]',
  filterLabel: 'block flex-1 text-[12px] text-[var(--text-faint)] at-most-680:w-full',
  filterAction: 'mb-px text-[12px] whitespace-nowrap',
} as const;
