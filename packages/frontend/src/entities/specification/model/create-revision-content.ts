import type { RevisionContent } from '@/packages/core/src';

/** Подготавливает содержание ревизии из исходных полей формы, сохраняя текст непустых критериев. */
export function workspaceContent(title: string, goal: string, dodText: string): RevisionContent {
  return {
    title,
    goal,
    dod: dodText
      .split('\n')
      .filter((text) => text.trim())
      .map((text, index) => ({ id: `criterion-${index + 1}`, text, required: true })),
    constraints: '',
    assumptions: '',
    risks: '',
    inputs: '',
    comment: '',
  };
}
