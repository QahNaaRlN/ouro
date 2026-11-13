import { assignWorkRu } from '@/packages/frontend/src/features/assign-work';

/** Явная сборка словарей оболочки; экземпляр i18n здесь не создаётся. */
export const ouroRussianResources = { ru: { assignWork: assignWorkRu } } as const;
