import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export const impactLessonsPassword='isolated-impact-lessons-test-password';
export const impactLessonsFixturePath=resolve('.operations/impact-lessons-fixture.json');
export type ImpactLessonsFixture={profile:string;projectId:string;emptyProjectId:string;ownerEmail:string;viewerEmail:string;c0:number;version:number;specs:Array<{id:string;humanId:string;title:string}>;lesson:{id:string;title:string;draftTitle:string;publishedRevisionId:string;draftRevisionId:string};draftLesson:{id:string;title:string};sourceEventId:string;candidateId:string};

/** Читает только metadata собственного сохранённого набора; auth cookies здесь не хранятся. */
export async function readImpactLessonsFixture():Promise<ImpactLessonsFixture>{
 const value=JSON.parse(await readFile(impactLessonsFixturePath,'utf8')) as ImpactLessonsFixture;
 if(!process.env.OURO_E2E_DATA_DIR||value.profile!==resolve(process.env.OURO_E2E_DATA_DIR))throw new Error('Fixture относится к другому profile.');
 return value;
}
