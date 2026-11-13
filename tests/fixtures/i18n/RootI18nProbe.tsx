import { useContext, useEffect } from 'react';
import { I18nContext, useTranslation } from 'react-i18next';
import type { i18n } from 'i18next';

/** Передаёт наблюдаемый экземпляр i18next, готовность перевода и текст тестового элемента. */
export type ObservedI18n = { instance: i18n | undefined; ready: boolean; text: string };
/** Обычный bare import из root tree делает расхождение installation trees наблюдаемым. */
export function RootI18nProbe({
  name,
  onObserved,
}: {
  name: string;
  onObserved: (name: string, value: ObservedI18n) => void;
}) {
  const instance = useContext(I18nContext)?.i18n,
    { ready, t } = useTranslation('assignWork'),
    text = t('heading');
  useEffect(
    () => onObserved(name, { instance, ready, text }),
    [name, onObserved, instance, ready, text],
  );
  return <output data-testid={name}>{text}</output>;
}
