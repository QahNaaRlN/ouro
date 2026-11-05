import type {} from './i18next';
import {createI18n} from '@/packages/frontend/src/shared/i18n';
import {ouroRussianResources} from './resources.const';

/** Собирает отдельный готовый RU instance для одного владельца дерева Ouro. */
export function createOuroI18n(){
 return createI18n({language:'ru',defaultNamespace:'assignWork',resources:ouroRussianResources});
}
