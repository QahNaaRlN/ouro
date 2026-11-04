/** Собственные грани карточки; родители передают только конечные presentation slots. */
export const verificationPairPresentation={
 root:'relative w-full p-0',
 layers:'mb-[8px] flex flex-wrap gap-[4px]',
 layerButton:'font-[family-name:inherit] text-[11px] leading-[inherit] font-[number:inherit] px-[7px] py-[4px] aria-pressed:bg-ouro-text aria-pressed:text-ouro-bg aria-pressed:border-ouro-text',
 turntable:'perspective-[1100px]',
 rotor:'grid transform-3d transition-[transform] duration-[700ms] ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none',
 reversed:'[transform:rotateY(180deg)]',
 face:'col-start-1 row-start-1 flex min-w-0 flex-col gap-[8px] rounded-[10px] border border-solid border-ouro-border bg-ouro-bg p-[12px] backface-hidden [-webkit-backface-visibility:hidden]',
 workFace:'[transform:rotateY(0deg)]',
 verificationFace:'[transform:rotateY(180deg)]',
 footer:'h-[42px] pt-[6px]',
 open:'cursor-pointer border-0 border-none border-current bg-transparent p-0 text-left font-[family-name:inherit] text-[length:inherit] leading-[inherit] font-semibold',
 summary:'m-0 text-[12px] leading-[1.45]',
 context:'mt-auto grid grid-rows-[minmax(16px,auto)_minmax(16px,auto)_minmax(30px,auto)] gap-[4px] text-[11px]',
 contextButton:'cursor-pointer border-0 border-none border-current bg-transparent p-0 text-left font-[family-name:inherit] text-[length:inherit] leading-[inherit] font-[number:inherit] text-ouro-text-muted',
 updated:'m-0 text-[10px] leading-[15px] text-[var(--text-faint)]',
} as const;

/** Более специфичные workspace defaults раньше выигрывали у одиночных classes карточки. */
export const verificationPairWorkspacePresentation={
 open:'border border-solid border-ouro-border bg-ouro-bg px-[14px] py-[10px] font-sans text-[12px] leading-[1.6] font-medium',
 auto:'px-[14px] py-[10px] font-sans text-[12px] leading-[1.6] font-medium',
 summary:'leading-[1.75]',
} as const;
