/** Статьи методологии сохраняют типографику и состояния ссылок на источники. */
export const humanMethodology = {
  intro:
    'methodology-intro mb-[25px] flex gap-[17px] rounded-[7px] border border-ouro-border bg-ouro-subtle p-[23px] at-most-680:gap-[12px] at-most-680:p-[17px]',
  introIcon: 'text-[var(--text-faint)] at-most-680:w-[18px]',
  introTitle: 'text-[16px] at-most-680:text-[14px]',
  introCopy: 'mt-[8px] text-[13px] leading-[1.8] text-ouro-text-muted',
  article:
    'flex gap-[22px] border-b border-ouro-border py-[28px] at-most-1050:gap-[15px] at-most-680:gap-[13px] at-most-680:py-[24px]',
  number:
    'methodology-number pt-[4px] font-[family-name:"JetBrains_Mono",monospace] text-[12px] text-[var(--text-faint)]',
  title: 'mb-[12px] text-[16px] at-most-680:text-[15px]',
  copy: 'max-w-[700px] text-[13px] leading-[1.9] text-ouro-text-muted',
  links: 'source-links mt-[15px] flex flex-wrap gap-x-[22px] gap-y-[8px] at-most-680:gap-[11px]',
  link: 'inline-flex items-center gap-[5px] text-[12px] text-ouro-text-muted underline decoration-ouro-border underline-offset-[4px] hover:text-ouro-text',
  footnote: 'methodology-footnote py-[25px]',
  footnoteTitle: 'mb-[9px] text-[12px]',
  footnoteCopy: 'text-[12px] leading-[1.9] text-ouro-text-muted',
  footnoteAction: 'mt-[20px]',
} as const;
