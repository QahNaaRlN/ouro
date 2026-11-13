/** Дерево статических текстов без исполняемых обработчиков или внешних ответов. */
export type TranslationDictionary = { readonly [key: string]: string | TranslationDictionary };
/** Явно переданные языки и принадлежащие им словари пространств имён. */
export type TranslationResources = Readonly<
  Record<string, Readonly<Record<string, TranslationDictionary>>>
>;
/** Настройки отдельного экземпляра с уже включёнными в приложение ресурсами. */
export type CreateI18nOptions = Readonly<{
  language: string;
  defaultNamespace: string;
  resources: TranslationResources;
}>;
