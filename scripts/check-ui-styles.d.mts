/** Фиксирует отпечаток CSS-файла и объём оставшихся обычных правил. */
export type StyleRecord = {
  file: string;
  sha256: string;
  ordinaryRules: number;
  legacyLayer: boolean;
};
/** Описывает найденные inline-выражения стилей и их отпечатки для сверки долга. */
export type InlineRecord = {
  file: string;
  sha256: string;
  expressions: { kind: string; sha256: string; count: number }[];
};
/** Связывает техническую геометрию с владельцем, обоснованием и отпечатками зависимостей. */
export type TechnicalInlineRecord = InlineRecord & {
  kind: 'computed-geometry-custom-properties';
  owner: string;
  reason: string;
  dependencies: { file: string; sha256: string }[];
};
/** Задаёт проверяемый реестр стилевого долга и явно описанных технических исключений. */
export type StyleLedger = {
  contract: string;
  technicalCss: Record<string, { kind: string; reason: string }>;
  css: (StyleRecord & { owner: string })[];
  inline: (InlineRecord & { owner: string })[];
  technicalInline?: TechnicalInlineRecord[];
};
/** Собирает текущие CSS и inline-выражения из собственных исходников без исполнения приложения. */
export function inventoryStyles(root: string): {
  css: StyleRecord[];
  inline: InlineRecord[];
  problems: string[];
};
/** Сверяет стили с реестром долга и технических исключений, включая требования финального режима. */
export function inspectStyles(options: { root: string; ledger: StyleLedger; final?: boolean }): {
  violations: string[];
  inventory: ReturnType<typeof inventoryStyles>;
  remaining: { cssFiles: number; inlineFiles: number };
};
