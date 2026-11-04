import {createOuroI18n} from '../../packages/frontend/src/app/i18n';

/** Compile-only проверки ключей; функция не вызывается и не является runtime test. */
function checkTranslationKeys(){
 const instance=createOuroI18n(),translate=instance.getFixedT('ru','assignWork');
 const text:string=translate('fields.goal.label');
 /** @ts-expect-error Неизвестный ключ не входит в typed RU registry. */
 translate('fields.missing.label');
 /** @ts-expect-error defaultValue не обходит strictKeyChecks. */
 translate('missing',{defaultValue:'fallback'});
 /** @ts-expect-error Namespace принадлежит явному app registry. */
 instance.getFixedT('ru','missingNamespace');
 return text;
}
