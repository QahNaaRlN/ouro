import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStore} from '../lib/store';
import {PROJECT_ID,type Actor,type Command,type LessonContent,type RevisionContent} from '../packages/core/src';
import {getLessonCandidates} from '../packages/core/src/lessons';
import {impactLessonsFixturePath,impactLessonsPassword,type ImpactLessonsFixture} from './impact-lessons-fixture';

type CommandInput<T=Command>=T extends Command?Omit<T,'requestId'|'expectedVersion'>:never;

/** Один раз сохраняет настоящие domain events и роли; повторная съёмка не меняет факты. */
export default async function setupImpactLessons(){
 const profile=process.env.OURO_E2E_DATA_DIR;if(!profile)throw new Error('Укажите собственный OURO_E2E_DATA_DIR.');
 try{const old=JSON.parse(await readFile(impactLessonsFixturePath,'utf8')) as ImpactLessonsFixture;if(old.profile!==resolve(profile))throw new Error('Сохранённый fixture принадлежит другому profile.');return;}catch(error){if(!(error instanceof Error)||!('code'in error)||error.code!=='ENOENT')throw error;}
 const invitations:Array<{email:string;code:string}>=[],ownerEmail='impact-owner@example.invalid',viewerEmail='impact-viewer@example.invalid';
 const store=await createStore({dataDir:profile,seedEvents:[],mailer:{sendInvitation:async value=>{invitations.push({email:value.email,code:value.code});},sendPasswordReset:async()=>{}}});
 try{
  const account=(await store.createAccount({email:ownerEmail,name:'Владелец изолированной проверки',password:impactLessonsPassword},{id:'local-human',kind:'human',projectIds:[PROJECT_ID]})).account;
  const owner:Actor={id:account.id,kind:'human',name:account.name,projectIds:[]};
  const project=await store.createProject({name:'Изолированные показатели и уроки'},owner),empty=await store.createProject({name:'Пустой архив проверки'},owner);owner.projectIds=[project.id,empty.id];
  await store.createInvitation(project.id,{email:viewerEmail,role:'Viewer'},owner);const invitation=invitations.find(item=>item.email===viewerEmail);if(!invitation)throw new Error('Viewer invitation не создан.');
  await store.acceptInvitation(invitation.code,{name:'Наблюдатель изолированной проверки',password:impactLessonsPassword});
  const scoped=await store.forProject(project.id),registration=await scoped.createAgent('Агент сохранённых источников',owner),agent:Actor={id:registration.agent.id,kind:'agent',name:registration.agent.name,projectIds:[project.id]};
  const snapshot=()=>scoped.getProject();
  const command=async(body:CommandInput,actor=owner)=>scoped.executeCommand({...body,requestId:randomUUID(),expectedVersion:(await snapshot()).version},actor);
  const content=(title:string):RevisionContent=>({title,goal:'Проверить сохранённое ожидание по источникам.',dod:[{id:'proof',text:'Источник прочитан человеком',required:true},{id:'optional',text:'Необязательный критерий сохраняет false',required:false}],constraints:'Только изолированные факты.',assumptions:'Никаких вызовов модели.',risks:'Это проверка интерфейса.',inputs:'История проекта.',comment:'Публикация и активация отдельны.'});
  const specs:ImpactLessonsFixture['specs']=[];
  for(const title of ['Длинное исходное ожидание: '+('проверяемая граница '.repeat(5)).trim(),'Вторая исходная цель с неизменным контрактом']){
   const created=await command({type:'createSpec',content:content(title)}),spec=created.state.specs.at(-1)!;await command({type:'activateRevision',specId:spec.id,revisionId:spec.revisionIds[0]});specs.push({id:spec.id,humanId:spec.humanId,title:spec.title});
  }
  const c0=(await snapshot()).version,first=(await snapshot()).specs.find(item=>item.id===specs[0].id)!,firstRevision=(await snapshot()).revisions.find(item=>item.id===first.activeRevisionId)!;
  await command({type:'createSpec',content:content('Новая цель за пределами исходной базы')});
  const changed=await command({type:'proposeRevision',specId:first.id,content:{...content(first.title),goal:'Человек уточнил проверяемую границу исходного ожидания.'}});await command({type:'activateRevision',specId:first.id,revisionId:changed.state.revisions.at(-1)!.id});
  for(const [index,spec]of specs.entries()){
   const current=(await snapshot()).specs.find(item=>item.id===spec.id)!,started=await command({type:'startExecution',specId:spec.id,specRevisionId:current.activeRevisionId!,agentId:agent.id}),execution=started.state.executions.at(-1)!;
   const base={specId:spec.id,specRevisionId:execution.specRevisionId,executionId:execution.id};await command({type:'confirmResumed',ackPhase:'start',...base},agent);
   if(index===0){
    await command({type:'reportAction',...base,actionId:randomUUID(),phase:'completed',title:'Проверен сохранённый источник',context:'Настоящее domain event из fixture, без внешней работы.',evidence:'fixture://impact-lessons/source'},agent);
    const options=[{id:randomUUID(),title:'Сохранить точную границу',description:'Проверить источник перед публикацией.'},{id:randomUUID(),title:'Перенести вывод в новый контекст только после отдельной человеческой проверки',description:'Не объявлять невыбранный вариант ошибочным.'}];
    const reported=await command({type:'reportFork',...base,title:'Выбрать границу применимости',context:'Два допустимых варианта требуют решения человека.',reason:'Проверить контекст и сохранённые источники до применения вывода; выбор человека не доказывает ошибочность других вариантов.',options},agent),request=reported.state.requests.at(-1)!;
    await command({type:'resolveDecision',decisionRequestId:request.id,specRevisionId:execution.specRevisionId,outcome:{kind:'approve',chosenOptionId:options[0].id}});
   }else{
    const reported=await command({type:'reportQuestion',...base,title:'Нужна ли дополнительная проверка?',context:'Неоднозначность сохраняется в исходной истории.',question:'Какой отдельный источник следует проверить?',blockingScope:'execution'},agent),request=reported.state.requests.at(-1)!;
    await command({type:'resolveDecision',decisionRequestId:request.id,specRevisionId:execution.specRevisionId,outcome:{kind:'reject',reason:'Проверка этого пути отложена человеком, вывод не обобщается.'}});
   }
  }
  const state=await snapshot(),candidate=getLessonCandidates(state).find(item=>item.kind==='unchosen_fork_option')!,source=state.events.find(item=>item.type==='SpecCreated'&&item.specId===first.id)!;
  const lessonContent:LessonContent={title:'Опубликованный урок о проверяемой границе и явных условиях переноса',context:'Сохранены конкретная попытка, выбранный и невыбранный варианты.',conclusion:'Невыбранный путь не становится доказанной ошибкой.',applicability:'Применимо после отдельной проверки источников и условий.',evidence:'Человек прочитал сохранённые события; автоматического вывода нет.',tags:['границы','источники','false'],sourceEventIds:[candidate.sourceEventId,source.id]};
  const created=await command({type:'createLesson',content:lessonContent}),lesson=created.state.lessons.at(-1)!,publishedRevisionId=lesson.latestRevisionId;await command({type:'publishLesson',lessonId:lesson.id,revisionId:publishedRevisionId});
  const draftTitle='Новая редакция урока: '+('контекст проверяется отдельно '.repeat(4)).trim(),revised=await command({type:'reviseLesson',lessonId:lesson.id,content:{...lessonContent,title:draftTitle,conclusion:'Черновой вывод ещё не опубликован. '+lessonContent.conclusion,tags:['черновик','источники']}}),draftRevisionId=revised.state.lessons.find(item=>item.id===lesson.id)!.latestRevisionId;
  const second=await command({type:'createLesson',content:{...lessonContent,title:'Сохранённый черновик без публикации',tags:['черновик'],sourceEventIds:[getLessonCandidates(await snapshot()).find(item=>item.kind==='rejected_decision')!.sourceEventId]}}),draftLesson=second.state.lessons.at(-1)!;
  const fixture:ImpactLessonsFixture={profile:resolve(profile),projectId:project.id,emptyProjectId:empty.id,ownerEmail,viewerEmail,c0,version:(await snapshot()).version,specs,lesson:{id:lesson.id,title:lessonContent.title,draftTitle,publishedRevisionId,draftRevisionId},draftLesson:{id:draftLesson.id,title:'Сохранённый черновик без публикации'},sourceEventId:source.id,candidateId:candidate.id};
  if(firstRevision.dod[1].required!==false)throw new Error('False исходного контракта потерян.');
  await mkdir(resolve('.operations'),{recursive:true});await writeFile(impactLessonsFixturePath,JSON.stringify(fixture,null,2));
 }finally{await store.close();}
}
