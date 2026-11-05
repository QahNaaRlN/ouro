/** Создаёт bootstrap-only fixture с реальным REC/locked parser, без app/DB imports. */
export function createPortProbe(): Promise<{
  directory: string;
  root: string;
  foreign: string;
  generation: { id: string; directory: string };
  close: () => Promise<void>;
}>;
