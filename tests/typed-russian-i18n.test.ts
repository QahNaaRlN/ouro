import test from 'node:test';
import assert from 'node:assert/strict';
import {getI18n} from 'react-i18next';
import {createOuroI18n} from '../packages/frontend/src/app/i18n';
import {createI18n,type CreateI18nOptions} from '../packages/frontend/src/shared/i18n';
import {assignWorkRu,translateAssignWorkError,type AssignWorkErrorKey} from '../packages/frontend/src/features/assign-work';
import {ClientError,type ClientErrorKind} from '../packages/client/src/ports';
import {normalizeAppError} from '../packages/client/src/lifecycle/client-error-reporting';

/** Отсутствующие собственные entries не маскируются наследуемыми значениями или ready-флагом библиотеки. */
test('explicit language and default namespace require own bundled resource entries',()=>{
 const inheritedLanguage:CreateI18nOptions['resources']={},inheritedNamespace:CreateI18nOptions['resources'][string]={};
 Object.setPrototypeOf(inheritedLanguage,{ru:{assignWork:{}}});Object.setPrototypeOf(inheritedNamespace,{assignWork:{}});
 const invalidResources:readonly CreateI18nOptions['resources'][]=[{},{other:{assignWork:{}}},{ru:{other:{}}},inheritedLanguage,{ru:inheritedNamespace}];
 for(const resources of invalidResources){
  assert.throws(()=>createI18n({language:'ru',defaultNamespace:'assignWork',resources}),{message:'Словарь интерфейса не готов.'});
 }
});

/** Пустой собственный словарь допустим и не требует непустого текста в конфигурационной границе. */
test('an explicitly supplied empty default dictionary remains a valid configuration',()=>{
 const instance=createI18n({language:'ru',defaultNamespace:'assignWork',resources:{ru:{assignWork:{}}}});
 assert.equal(instance.isInitialized,true);assert.equal(instance.hasResourceBundle('ru','assignWork'),true);
});

/** Готовый RU instance не регистрируется глобально и сохраняет прежние доступные названия формы. */
test('typed RU factory creates ready isolated instances without global registration',()=>{
 const registered=getI18n(),first=createOuroI18n(),second=createOuroI18n();
 assert.notEqual(first,second);assert.equal(first.isInitialized,true);assert.equal(second.isInitialized,true);
 assert.equal(first.language,'ru');assert.equal(second.language,'ru');
 assert.equal(getI18n(),registered);
 const translate=first.getFixedT('ru','assignWork');
 assert.equal(translate('heading'),'Задача для подключённого агента');
 assert.equal(translate('fields.goal.label'),'Задача для агента');
 assert.equal(translate('submit'),'Назначить работу');
});

/** Вложенные resources принадлежат экземпляру, а static dictionary остаётся исходным. */
test('nested dictionary mutation cannot leak to another RU instance or later creation',()=>{
 const first=createOuroI18n(),second=createOuroI18n();
 first.addResource('ru','assignWork','fields.title.label','Synthetic changed title');
 assert.equal(first.getFixedT('ru','assignWork')('fields.title.label'),'Synthetic changed title');
 assert.equal(second.getFixedT('ru','assignWork')('fields.title.label'),'Название задачи');
 assert.equal(createOuroI18n().getFixedT('ru','assignWork')('fields.title.label'),'Название задачи');
 assert.equal(assignWorkRu.fields.title.label,'Название задачи');
});

/** Переводчик получает конечный ключ; generic/raw ошибки и даже getter message не раскрываются. */
test('error translation uses injected finite keys and never raw error text',()=>{
 const keys:AssignWorkErrorKey[]=[],translate=(key:AssignWorkErrorKey)=>{keys.push(key);return 'safe:'+key;};
 const kinds:readonly ClientErrorKind[]=['access','contract','network','cancelled','rejected','unexpected'];
 for(const kind of kinds){
  const error=new ClientError('FIXTURE_ERROR','SECRET_RAW_MESSAGE',kind);
  Object.defineProperty(error,'message',{get(){throw new Error('message must not be read');}});
  assert.equal(translateAssignWorkError(normalizeAppError(error),translate),'safe:errors.'+kind);
 }
 assert.equal(translateAssignWorkError(normalizeAppError(new Error('SECRET_SERVER_BODY')),translate),'safe:errors.unexpected');
 assert.equal(translateAssignWorkError(new ClientError('CLIENT_ERROR','SECRET','contract'),translate),'safe:errors.unconfirmed');
 assert.equal(keys.length,8);
});
