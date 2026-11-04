export type StyleRecord = { file: string; sha256: string; ordinaryRules: number; legacyLayer: boolean };
export type InlineRecord = { file: string; sha256: string; expressions: { kind: string; sha256: string; count: number }[] };
export type TechnicalInlineRecord = InlineRecord & { kind: 'computed-geometry-custom-properties'; owner: string; reason: string; dependencies: { file: string; sha256: string }[] };
export type StyleLedger = { contract: string; technicalCss: Record<string, { kind: string; reason: string }>; css: (StyleRecord & { owner: string })[]; inline: (InlineRecord & { owner: string })[]; technicalInline?: TechnicalInlineRecord[] };
export function inventoryStyles(root: string): { css: StyleRecord[]; inline: InlineRecord[]; problems: string[] };
export function inspectStyles(options: { root: string; ledger: StyleLedger; final?: boolean }): { violations: string[]; inventory: ReturnType<typeof inventoryStyles>; remaining: { cssFiles: number; inlineFiles: number } };
