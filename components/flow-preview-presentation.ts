/** Конечные публичные DOM-слоты библиотеки; dagre и предметные данные не зависят от оформления. */
export const flowPreviewPresentation = {
  node: 'w-[210px] min-h-[80px] rounded-[7px] border border-solid border-ouro-border bg-ouro-bg text-ouro-text',
  edge: String.raw`[&_.react-flow\_\_edge-path]:stroke-[var(--graph-edge)] [&_.react-flow\_\_edge-text]:fill-[var(--text-muted)] [&_.react-flow\_\_edge-text]:text-[11px] [&_.react-flow\_\_edge-textbg]:fill-[var(--bg)]`,
} as const;
