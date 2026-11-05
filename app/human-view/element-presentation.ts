/** Явное оформление элементов Human View; общие legacy-потребители переносятся отдельно. */
export const humanElements = {
  pageHeading:
    'page-heading mb-[27px] flex items-center justify-between gap-[24px] at-most-1050:items-start at-most-1050:gap-[14px] at-most-680:mb-[22px] at-most-680:flex-wrap',
  pageTitle: 'at-most-1050:text-[24px] at-most-680:text-[23px]',
  pageDescription:
    'mt-[10px] max-w-[600px] text-[14px] leading-[1.7] text-ouro-text-muted at-most-680:mt-[8px] at-most-680:text-[12px]',
  pageAction:
    'at-most-1050:gap-[5px] at-most-1050:px-[9px] at-most-1050:py-[7px] at-most-1050:text-[12px] at-most-680:mt-0 at-most-680:max-w-[130px] at-most-680:min-h-[30px] at-most-680:shrink-0 at-most-680:gap-[4px] at-most-680:px-[8px] at-most-680:py-[6px] at-most-680:whitespace-normal',
  pageActionIcon: 'at-most-680:size-[13px]',
  sectionHeading: 'section-heading mb-[14px] flex items-center justify-between gap-[12px]',
  count:
    'heading-count ml-[7px] inline-flex h-[24px] min-w-[25px] items-center justify-center rounded-[6px] border border-ouro-border bg-ouro-muted px-[7px] align-middle text-[13px] font-medium tracking-normal text-ouro-text-muted at-most-680:h-[21px] at-most-680:min-w-[22px] at-most-680:text-[12px]',
  formLabel: 'form-label flex flex-col gap-[8px] text-[14px] font-medium',
  field: 'w-full text-[14px] font-normal',
  inlineWarning:
    'inline-warning rounded-[5px] bg-[var(--attention-surface)] p-[12px] text-[12px] leading-[1.8] text-[var(--attention)]',
} as const;
