/** Общий ownership contract storage adapter, одинаковый для совместимого Next и service. */
import * as source from '../../../../lib/storage/profile-owner';
const storage = (source as typeof source & { default?: typeof source }).default ?? source;
export const acquireProfileOwner = storage.acquireProfileOwner;
