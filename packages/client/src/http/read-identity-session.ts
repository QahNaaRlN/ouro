import {z} from 'zod';
import type {ClientCancellationSignal} from '../ports';
import {ClientError} from '../ports/client-error.types';
import {readWorkspaceJSON} from './workspace-intents';

const sessionSchema=z.object({actor:z.object({id:z.string().min(1),kind:z.enum(['human','agent','service']),projectIds:z.array(z.string()),name:z.string().optional()}).nullable().optional(),account:z.unknown().optional(),canManageParticipants:z.boolean().optional()});
/**
 * Утилита, которая читает и проверяет текущую identity без выдачи credential интерфейсу.
 * @param signal - Отмена ожидания устаревшего поколения identity.
 * @returns Отображаемый actor и признаки существующего session-контракта.
 * @throws {ClientError} При нарушении схемы ответа identity.
 */
export async function readIdentitySession(signal?:ClientCancellationSignal){
 const parsed=sessionSchema.safeParse(await readWorkspaceJSON<unknown>('/api/session',signal));
 if(!parsed.success)throw new ClientError('IDENTITY_CONTRACT','Ответ сессии не подтверждает участника.','contract');
 return {actor:parsed.data.actor??null,hasAccount:!!parsed.data.account,canManageParticipants:parsed.data.canManageParticipants===true};
}
