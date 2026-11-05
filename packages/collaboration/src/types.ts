import type { RevisionContent } from '../../core/src/types';

/** Подтверждённое представление совместного черновика без серверного storage owner. */
export type CollaborativeDraft = {
  id: string;
  projectId: string;
  specId: string;
  baseRevisionId: string;
  createdBy: string;
  createdAt: string;
  version: number;
  stateUpdate: string;
  stateHash: string;
  contentHash: string;
  content: RevisionContent;
  hasPendingUpdates: boolean;
  publishedRevisionId?: string;
  publishedAt?: string;
};
/** Краткая запись каталога черновиков без документа CRDT и полного содержимого. */
export type CollaborativeDraftSummary = Omit<CollaborativeDraft, 'stateUpdate' | 'content'> & {
  title: string;
};
