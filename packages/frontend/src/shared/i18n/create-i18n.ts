import { createInstance, type i18n, type Resource } from 'i18next';
import type { CreateI18nOptions, TranslationDictionary } from './i18n.types';

/** Копирует дерево словаря, чтобы изменение одного экземпляра не затронуло другой. */
function copyDictionary(dictionary: TranslationDictionary): TranslationDictionary {
  const copy: Record<string, string | TranslationDictionary> = {};
  for (const [key, value] of Object.entries(dictionary))
    copy[key] = typeof value === 'string' ? value : copyDictionary(value);
  return copy;
}

/** Создаёт готовый изолированный экземпляр из bundled-ресурсов без глобальной регистрации и загрузчиков. */
export function createI18n({ language, defaultNamespace, resources }: CreateI18nOptions): i18n {
  const namespaces = Object.hasOwn(resources, language) ? resources[language] : undefined;
  if (!language || !defaultNamespace || !namespaces || !Object.hasOwn(namespaces, defaultNamespace))
    throw new Error('Словарь интерфейса не готов.');
  const isolatedResources: Resource = {};
  for (const [code, namespaces] of Object.entries(resources)) {
    const copies: Record<string, TranslationDictionary> = {};
    for (const [namespace, dictionary] of Object.entries(namespaces))
      copies[namespace] = copyDictionary(dictionary);
    isolatedResources[code] = copies;
  }
  const instance = createInstance();
  void instance.init({
    lng: language,
    supportedLngs: [language],
    fallbackLng: language,
    load: 'currentOnly',
    resources: isolatedResources,
    ns: Object.keys(namespaces),
    defaultNS: defaultNamespace,
    initAsync: false,
    debug: false,
    saveMissing: false,
    returnNull: false,
    interpolation: { escapeValue: false },
  });
  if (!instance.isInitialized) throw new Error('Словарь интерфейса не готов.');
  return instance;
}
