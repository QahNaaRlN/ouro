import { twMerge } from 'tailwind-merge';

/** Выбирает оформление управления графом для старого экрана или рабочего пространства. */
export type GraphSurface = 'legacy' | 'workspace';
/** Задаёт вариант управления для общего графа, схемы процесса или графа состояний. */
export type GraphControlTone = 'default' | 'process' | 'state';

/** Публичные slots React Flow оформляют только DOM библиотеки; String.raw сохраняет подчёркивания имён классов. */
export const graphPresentation = {
  fullscreen: String.raw`[&:fullscreen]:w-screen! [&:fullscreen]:h-screen! [&:fullscreen]:min-h-0 [&:fullscreen]:rounded-none [&:fullscreen]:[border:0] [&:fullscreen]:bg-ouro-bg motion-reduce:[&_.react-flow\_\_edge.animated_path]:animate-none!`,
  minimap:
    'bottom-0 right-0 m-0 h-[65px] w-[110px] rounded-[4px] border border-solid border-ouro-border bg-ouro-subtle [&>svg]:h-[65px] [&>svg]:w-[110px] at-most-680:hidden',
  attribution: String.raw`[&_.react-flow\_\_attribution]:bg-ouro-bg [&_.react-flow\_\_attribution]:text-[12px] [&_.react-flow\_\_attribution]:text-[var(--text-faint)]`,
  processAttribution: String.raw`[&_.react-flow\_\_attribution]:bg-ouro-subtle [&_.react-flow\_\_attribution]:text-[12px] [&_.react-flow\_\_attribution]:text-ouro-text-muted`,
  feedback:
    'absolute z-[6] top-[44px] right-[14px] left-[14px] max-w-[540px] rounded-[6px] border border-solid border-[var(--negative)] bg-[var(--negative-surface)] px-[12px] py-[10px] text-[12px] leading-[1.6] text-[var(--negative)]',
  unavailable:
    'pointer-events-none absolute bottom-[4px] left-[14px] text-[10px] text-[var(--text-faint)]',
} as const;

/** Позиция 0 сохраняет выигравшие library Panel.left/bottom, а не перекрытые старые offsets. */
const controls =
  'bottom-0 left-0 flex overflow-hidden rounded-[5px] border border-solid border-ouro-border shadow-none [&>button]:h-[27px] [&>button:last-child]:border-0 [&>button:last-child]:border-none [&>button:last-child]:border-current [&>button:hover]:bg-ouro-muted [&>button_svg]:max-h-[12px] [&>button_svg]:max-w-[12px]';
const surface = {
  legacy:
    '[&>button]:w-[27px] [&>button]:border-b-0 [&>button]:border-r [&>button]:[border-right-style:solid] [&>button]:border-r-ouro-border [&>button]:bg-ouro-subtle [&>button]:text-ouro-text-muted',
  workspace: '[&>button]:bg-ouro-bg [&>button]:text-ouro-text',
} as const satisfies Record<GraphSurface, string>;
const tone = {
  default: '[&>button_svg]:fill-[var(--text-muted)]',
  process:
    '[&>button]:bg-ouro-subtle [&>button]:text-ouro-text [&>button:last-child]:border-ouro-border [&>button_svg]:fill-current',
  state:
    '[&>button]:bg-ouro-subtle [&>button]:text-ouro-text [&>button]:fill-[var(--text)] [&>button:last-child]:border-ouro-border [&>button_svg]:fill-[var(--text-muted)]',
} as const satisfies Record<GraphControlTone, string>;

/** Surface сохраняет фактические defaults старого экрана и рабочего пространства до их отдельного переноса. */
export function graphControlsClassName(
  appearance: GraphSurface,
  kind: GraphControlTone = 'default',
) {
  return twMerge(controls, surface[appearance], tone[kind]);
}

export const fullscreenControlsClassName =
  '[&>button:disabled]:cursor-not-allowed [&>button:disabled]:opacity-40 [&>button_svg.lucide]:max-h-[15px] [&>button_svg.lucide]:max-w-[15px] [&>button_svg.lucide]:fill-none [&>button_svg.lucide]:stroke-current';

/** Selected принадлежит внешнему library node и сохраняет прежний приоритет над цветом отдельного handle. */
export const graphHandlePresentation = {
  roadmap: String.raw`size-[5px] border-ouro-border bg-[var(--selected)] in-[.react-flow\_\_node.selected]:bg-ouro-text-muted`,
  process: String.raw`size-[8px] border-2 border-solid border-ouro-bg bg-ouro-control in-[.react-flow\_\_node.selected]:bg-ouro-text-muted`,
  state: String.raw`size-[7px] border-2 border-solid border-ouro-bg bg-ouro-control in-[.react-flow\_\_node.selected]:bg-ouro-text-muted`,
  defaultNodes: String.raw`[&_.react-flow\_\_handle]:size-[5px] [&_.react-flow\_\_handle]:border-ouro-border [&_.react-flow\_\_handle]:bg-[var(--selected)] [&_.react-flow\_\_node.selected_.react-flow\_\_handle]:bg-ouro-text-muted`,
} as const;
