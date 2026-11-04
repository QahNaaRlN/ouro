/** Оформление модалок legacy Human View; фокусом и закрытием владеет ModalDialog. */
export const humanModal={
 backdrop:'modal-backdrop fixed inset-0 z-100 flex items-center justify-center bg-[#0009] p-[24px] backdrop-blur-[4px] at-most-680:p-[12px]',
 dialog:'modal max-h-[calc(100vh-48px)] w-[620px] max-w-full overflow-y-auto rounded-[10px] border border-ouro-control bg-ouro-bg shadow-[var(--shadow)] at-most-680:max-h-[calc(100vh-24px)] at-most-680:rounded-[8px]',
 header:'modal-header sticky top-0 z-1 flex items-center justify-between gap-[16px] border-b border-ouro-border bg-ouro-bg px-[25px] py-[21px] at-most-680:p-[17px]',
 title:'text-[19px] at-most-680:text-[17px]',
 form:'modal-form grid gap-[19px] px-[25px] py-[24px] at-most-680:gap-[17px] at-most-680:p-[18px]',
 copy:'text-[12px] leading-[1.8] text-ouro-text-muted',
 helper:'m-0',
 submit:'justify-self-end',
 hint:'input-hint -mt-[4px] text-[12px] font-normal text-[var(--text-faint)]',
} as const;
