import { verificationContractSchema } from '@ouro/protocol';
import type { ProjectState, SpecRevision, VerificationContract, VerificationRun, VerificationSlice } from './types';
const invalid = (message: string): never => { throw Object.assign(new Error(message), { code: 'VALIDATION_ERROR' }); };
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) : item);
export function validateVerificationContract(state: ProjectState, content: SpecRevision['verification'], specId?: string): void {
    if (content === undefined)
        return;
    const parsed = verificationContractSchema.safeParse(content);
    if (!parsed.success)
        invalid('Некорректный проверочный контракт.');
    const target = state.specs.find(spec => spec.id === content!.targetSpecId && spec.projectId === state.projectId);
    const revision = state.revisions.find(item => item.specId === target?.id && item.id === content!.targetRevisionId);
    if (!target || !revision || target.id === specId || state.revisions.find(item => item.id === target.revisionIds[0])?.verification)
        invalid('Цель должна быть точной рабочей ревизией этого проекта.');
    const allowed = new Set(revision!.dod.map(item => item.id));
    if (content.criterionIds.some(id => !allowed.has(id)))
        invalid('Критерий отсутствует в целевой ревизии.');
    for (const item of content.cases)
        if (item.criterionIds.some(id => !content.criterionIds.includes(id)))
            invalid('Случай ссылается на критерий вне границы проверки.');
    if (content.criterionIds.some(id => !content.cases.some(item => item.criterionIds.includes(id))))
        invalid('У выбранного критерия нет случая проверки.');
    const selectors = content.cases.flatMap(item => item.procedure.kind === 'playwright' ? [item.procedure.testId] : []);
    if (new Set(selectors).size !== selectors.length)
        invalid('Один test ID не должен незаметно подтверждать несколько случаев.');
}
export const sameSlice = (left: VerificationSlice, right: VerificationSlice) => left.productRevision === right.productRevision && comparableSlice(left, right);
export const comparableSlice = (left: VerificationSlice, right: VerificationSlice) => left.testRevision === right.testRevision && left.fixtureRevision === right.fixtureRevision && left.environmentDigest === right.environmentDigest;
export function verificationChanges(previous: VerificationContract | undefined, next: VerificationContract | undefined): string[] {
    if (!previous && !next)
        return [];
    if (!previous || !next)
        return [next ? 'Создан проверочный контракт' : 'Удалён проверочный контракт'];
    const changes: string[] = [];
    for (const key of ['targetSpecId', 'targetRevisionId', 'criterionIds', 'workflow'] as const)
        if (canonical(previous[key]) !== canonical(next[key]))
            changes.push(`Изменена граница: ${key}`);
    for (const before of previous.cases) {
        const after = next.cases.find(item => item.id === before.id);
        if (!after) {
            changes.push(`Удалён случай ${before.id}`);
            continue;
        }
        if (before.expected !== after.expected)
            changes.push(`Изменено ожидание ${before.id}`);
        if (before.required && !after.required)
            changes.push(`Случай стал необязательным ${before.id}`);
        if (canonical(before) !== canonical(after) && before.expected === after.expected)
            changes.push(`Изменён случай / связь теста ${before.id}`);
    }
    for (const item of next.cases)
        if (!previous.cases.some(before => before.id === item.id))
            changes.push(`Добавлен случай ${item.id}`);
    return changes;
}
export type VerificationCaseEvidence={caseId:string;runId?:string;outcome?:VerificationRun['results'][number]['outcome'];applicability:'applicable'|'stale'|'incomplete'|'unknown';admitted:boolean;reason:string};
export type VerificationReadiness={result:'not_run'|VerificationRun['outcome'];applicability:'applicable'|'stale'|'incomplete'|'unknown';ready:boolean;implementationReady:boolean;reasons:string[];run?:VerificationRun;redRun?:VerificationRun;caseEvidence:VerificationCaseEvidence[];runIds:string[]};
export function verificationInputsComparable(state:ProjectState,revisionId:string,scope:string[],left:VerificationSlice,right:VerificationSlice):boolean{
 return comparableSlice(left,right)||(state.verificationRefactorAdmissions??[]).some(item=>item.verificationRevisionId===revisionId&&scope.every(id=>item.scopeCaseIds.includes(id))&&comparableSlice(item.fromSlice,left)&&comparableSlice(item.toSlice,right));
}
export function verificationRunUsable(state:ProjectState,run:VerificationRun):boolean{
 if(run.source.kind==='local_runner'&&(run.source.inputStability!=='unchanged'||run.source.exitCode!==0||!run.artifactManifest))return false;
 const review=state.verificationReviews.findLast(item=>item.runId===run.id);
 return review?['usable','baseline'].includes(review.assessment):run.source.kind==='local_runner'&&run.source.inputStability==='unchanged'&&run.source.exitCode===0;
}
export function qualifiedVerificationBaseline(state:ProjectState,revision:SpecRevision,scope:string[],slice:VerificationSlice,runIds?:string[]):VerificationRun[]{
 const contract=revision.verification;if(!contract)return [];
 const classification=contract.workflow==='preservation'?'baseline':'expected_red';
 const runs=state.verificationRuns.filter(run=>run.verificationRevisionId===revision.id&&(!runIds||runIds.includes(run.id))&&verificationInputsComparable(state,revision.id,scope,run.slice,slice)&&state.verificationReviews.findLast(item=>item.runId===run.id)?.assessment===classification);
 const selected=scope.map(caseId=>runs.findLast(run=>run.scopeCaseIds.includes(caseId)));
 if(selected.some(run=>!run))return [];
 const chosen=selected as VerificationRun[];
 if(chosen.some((run,index)=>{const result=run.results.find(item=>item.caseId===scope[index]);return !result||!['passed','failed'].includes(result.outcome)||run.source.kind==='local_runner'&&(run.source.inputStability!=='unchanged'||!run.artifactManifest||run.source.exitCode!==(classification==='baseline'?0:1))||state.verificationReviews.findLast(item=>item.runId===run.id)?.assessment!==classification;}))return [];
 if(contract.workflow==='tdd'&&!chosen.some((run,index)=>run.results.find(item=>item.caseId===scope[index])?.outcome==='failed'))return [];
 if(contract.workflow==='preservation'&&chosen.some((run,index)=>run.results.find(item=>item.caseId===scope[index])?.outcome!=='passed'))return [];
 return [...new Map(chosen.map(run=>[run.id,run])).values()];
}
export function getVerificationReadiness(state:ProjectState,revision:SpecRevision,scopeCaseIds?:string[]):VerificationReadiness{
 const contract=revision.verification,empty:VerificationReadiness={result:'not_run',applicability:'unknown',ready:false,implementationReady:false,reasons:[],caseEvidence:[],runIds:[]};
 if(!contract)return {...empty,reasons:['Это рабочая ревизия.']};
 const scope=scopeCaseIds??contract.cases.filter(item=>item.required).map(item=>item.id);
 if(!scope.length||scope.some(id=>!contract.cases.some(item=>item.id===id)))return {...empty,reasons:['Не задана допустимая обязательная граница.']};
 const current=state.verificationSlices.findLast(item=>item.verificationRevisionId===revision.id),runs=state.verificationRuns.filter(run=>run.verificationRevisionId===revision.id),run=runs.at(-1),base={...empty,...(run?{result:run.outcome,run}:{})};
 const target=state.specs.find(spec=>spec.id===contract.targetSpecId),spec=state.specs.find(item=>item.id===revision.specId);
 if(target?.activeRevisionId!==contract.targetRevisionId||target.state==='invalidated'||spec?.activeRevisionId!==revision.id||spec.state==='invalidated')return {...base,applicability:'stale',reasons:['Привязка не совпадает с действующими ревизиями.']};
 const observation=(state.verificationObservations??[]).findLast(item=>item.verificationRevisionId===revision.id);
 const observationConfig=(state.verificationObservationConfigs??[]).findLast(item=>item.verificationRevisionId===revision.id);
 if(observationConfig&&observation?.configId!==observationConfig.id)return {...base,reasons:['Новая конфигурация наблюдения ещё не имеет подтверждённого снимка.']};
 if(observation?.observation.status==='unavailable')return {...base,reasons:['Наблюдаемые файлы или окружение недоступны: '+(observation.observation.reason??'нет снимка')]};
 if(!current)return {...base,reasons:['Текущий срез кода, тестов и окружения не указан.']};
 if(observation&&!sameSlice(observation.observation.slice,current.slice))return {...base,reasons:['Объявленный срез не совпадает с серверным наблюдением.']};
 const baselines=qualifiedVerificationBaseline(state,revision,scope,current.slice),redRun=baselines.at(-1),implementationReady=contract.workflow==='verification'||!!baselines.length;
 const caseEvidence:VerificationCaseEvidence[]=scope.map(caseId=>{
  const latest=runs.findLast(candidate=>candidate.scopeCaseIds.includes(caseId)),result=latest?.results.find(item=>item.caseId===caseId),evidence={caseId,...(latest?{runId:latest.id}:{}),...(result?{outcome:result.outcome}:{})};
  if(!latest||!result)return {...evidence,applicability:'incomplete',admitted:false,reason:'Случай не запускался.'};
  if(!sameSlice(latest.slice,current.slice))return {...evidence,applicability:'stale',admitted:false,reason:'Последняя попытка относится к другому срезу; прежний PASS не подставляется.'};
  if(latest.artifactManifest&&observation&&latest.artifactManifest.digest!==observation.observation.digest)return {...evidence,applicability:'stale',admitted:false,reason:'Манифест прогона не совпадает с текущим наблюдаемым снимком.'};
  if(['skipped','not_run','error'].includes(result.outcome))return {...evidence,applicability:'incomplete',admitted:false,reason:'Последний обязательный результат отсутствует, пропущен или завершился ошибкой.'};
  if(!verificationRunUsable(state,latest))return {...evidence,applicability:'unknown',admitted:false,reason:'Результат требует допустимого provenance и человеческого заключения.'};
  const policy=contract.cases.find(item=>item.id===caseId)?.quality?.mutation;
  if(policy?.required){const quality=latest.quality?.mutation.find(item=>item.caseId===caseId);if(!quality||quality.killed/quality.total*100<policy.minimumScore)return {...evidence,applicability:'incomplete',admitted:false,reason:'Обязательная mutation-проверка отсутствует или ниже порога.'};}
  return {...evidence,applicability:'applicable',admitted:true,reason:result.outcome==='passed'?'Применимый успешный результат.':'Ожидаемый результат не достигнут.'};
 });
 const outcomes=caseEvidence.map(item=>item.outcome),result:VerificationReadiness['result']=!run?'not_run':outcomes.includes('error')?'error':outcomes.includes('failed')?'failed':outcomes.some(item=>!item||['skipped','not_run'].includes(item))?'partial':'passed';
 const applicability:VerificationReadiness['applicability']=caseEvidence.some(item=>item.applicability==='stale')?'stale':caseEvidence.some(item=>item.applicability==='incomplete')?'incomplete':caseEvidence.some(item=>item.applicability==='unknown')?'unknown':'applicable',ready=caseEvidence.every(item=>item.admitted&&item.outcome==='passed');
 return {...base,result,applicability,ready,implementationReady,redRun,caseEvidence,runIds:[...new Set(caseEvidence.flatMap(item=>item.runId?[item.runId]:[]))],reasons:ready?['Обязательные случаи подтверждены; приёмка DoD остаётся отдельной.']:[...new Set(caseEvidence.filter(item=>!item.admitted||item.outcome!=='passed').map(item=>item.reason))]};
}
