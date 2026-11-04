import type {FrozenProjectCommandIntent} from '../ports';

/** Тип, описывающий исходное действие и занятый им клиентский slot без изменения wire DTO. */
export type ProjectCommandPresentation=Readonly<{slot:string;label:string}>;
/** Тип, описывающий чтение закреплённой подписи во время передачи намерения адаптеру. */
export type ProjectCommandPresentationLookup=(intent:FrozenProjectCommandIntent)=>ProjectCommandPresentation|undefined;
