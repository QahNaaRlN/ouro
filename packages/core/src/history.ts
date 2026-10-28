import {DomainError,replay} from './engine';
import type {DomainEvent,ProjectState} from './types';

/** Historical read model never replaces the live network snapshot or authorizes commands. */
export function projectAtCursor(events:readonly DomainEvent[],cursor:number,projectId?:string):ProjectState{
  if(!Number.isSafeInteger(cursor)||cursor<0||cursor>events.length)throw new DomainError('INVALID_CURSOR','Исторический cursor должен указывать на существующий зафиксированный префикс.');
  // Validate the complete supplied history as well as the prefix: an incomplete or
  // foreign stream cannot present a seemingly valid early snapshot as authoritative.
  const latest=replay(events,projectId);
  return cursor===events.length?latest:replay(events.slice(0,cursor),latest.projectId);
}
