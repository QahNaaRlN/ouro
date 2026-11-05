/** Эти slots раньше наследовались из process CSS; runtime-панель владеет ими самостоятельно. */
export const runtimeInheritedPresentation = {
  label: 'flex min-w-0 flex-col gap-[6px] text-[12px] text-ouro-text-muted',
  input: 'w-full text-ouro-text',
  request: 'border-t [border-top-style:solid] border-t-ouro-border py-[12px]',
  requestTitle: 'block text-[12px] [overflow-wrap:anywhere]',
  requestCode: 'text-[10px] [overflow-wrap:anywhere]',
} as const;
