/** Цвета и размеры узла относятся к внешнему library-node; подписи связей остаются самостоятельными SVG slots. */
export const realityPresentation={
 frame:String.raw`relative h-[420px] overflow-hidden rounded-[6px] border border-solid border-ouro-border [&_.react-flow\_\_node:focus-visible]:outline-2 [&_.react-flow\_\_node:focus-visible]:outline-solid [&_.react-flow\_\_node:focus-visible]:outline-ouro-text [&_.react-flow\_\_node:focus-visible]:outline-offset-[3px]`,
 node:'h-[98px] w-[230px] rounded-[6px] border border-solid border-ouro-border bg-ouro-subtle text-ouro-text',
 label:'p-[4px] text-left',
 caption:'text-[12px] text-ouro-text-muted',
 title:'my-[7px] block text-[14px]',
 edge:String.raw`[&>.react-flow\_\_edge-path]:stroke-[var(--graph-edge)] [&_.react-flow\_\_edge-text]:text-[10px] [&_.react-flow\_\_edge-text]:fill-[var(--text-muted)] [&_.react-flow\_\_edge-textbg]:fill-[var(--bg)]`,
 empty:'p-[24px] text-[13px] text-ouro-text-muted',
} as const;
