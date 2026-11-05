/** Публичный pure API admission и общего receipt projection без HTTP/UI runtime. */
export {
  canonicalProjectJSON,
  inspectProjectSnapshot,
  normalizeProjectSnapshot,
  commandReceiptProjection,
  createProjectSnapshotAdopter,
} from './project-snapshot';
export type { ProjectSnapshot, SnapshotAdoption, ProjectSnapshotAdopter } from './project-snapshot';
