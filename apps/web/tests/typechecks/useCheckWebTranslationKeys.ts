import '@/tests/typechecks/typed-russian-i18n';
import { useTranslation } from 'react-i18next';

/** Проверки web hook входят только в compilation tree и никогда не вызывают hook в runtime. */
function useCheckWebTranslationKeys() {
  const { t } = useTranslation('assignWork');
  const text: string = t('fields.goal.label');
  /** @ts-expect-error Неизвестный ключ запрещён также для web installation tree. */
  t('fields.missing.label');
  /** @ts-expect-error defaultValue не отключает проверку ключей web hook. */
  t('missing', { defaultValue: 'fallback' });
  /** @ts-expect-error Namespace не входит в явный registry приложения. */
  useTranslation('missingNamespace');
  return text;
}
