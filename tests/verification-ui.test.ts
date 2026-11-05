import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import { createRequire } from 'node:module';
const requireForTest = createRequire(import.meta.url);
requireForTest.extensions['.css'] = () => { };
import { getWorkPairGroups, getWorkPairPresentation, replay } from '../packages/core/src';
import { fixture, report } from './verification-fixture';
test('pair and details use identical result/applicability; rendering historical state never reads live runs or mutates domain', async () => {
    const { VerificationPairCard } = await import('../packages/frontend/src/entities/work');
    const { WorkspaceVerification } = await import('../components/verification-panel');
    const f = fixture(), historical = replay(f.state.events);
    f.current();
    f.importRun(report(['failed', 'failed']));
    f.review('expected_red');
    const before = JSON.stringify(f.state), group = getWorkPairGroups(f.state)[0], projection = getWorkPairPresentation(f.state, group);
    const card = renderToStaticMarkup(React.createElement(VerificationPairCard, { state: f.state, group, onOpen: () => assert.fail('Render must not navigate') }));
    const details = renderToStaticMarkup(React.createElement(WorkspaceVerification, { state: f.state, revision: f.revision, command: async () => { assert.fail('Read-only render must not command'); }, disabled: true, readOnly:true, onOpen: () => { } }));
    assert(card.includes(projection.verifications[0].resultLabel));
    assert(details.includes(projection.verifications[0].resultLabel));
    assert(card.includes('aria-pressed="true"'));
    assert.equal((card.match(/class="verification-rotor(?:\s[^"]*)?"/g) ?? []).length, 1);
    assert.equal((card.match(/class="verification-face verification-face-/g) ?? []).length, 2);
    assert.match(card, /verification-face-work[^>]*aria-hidden="true"[^>]*inert=""/);
    assert.match(card, /verification-face-verification[^>]*aria-hidden="false"/);
    assert(card.includes(f.spec.id));
    assert.equal(JSON.stringify(f.state), before);
    const old = renderToStaticMarkup(React.createElement(VerificationPairCard, { state: historical, group: getWorkPairGroups(historical)[0], onOpen: () => { } }));
    assert(old.includes('Не запускалось'));
    assert(!old.includes('Ожидаемое падение подтверждено'));
    for (const markup of [card, old]) {
        assert.match(markup, /<small>[^<]+ · r\d+ · Работа<\/small>/);
        assert.match(markup, /<small>[^<]+ · r\d+ · Проверка<\/small>/);
    }
});
test('read-only advanced projection shows cycle links and observed manifests without forms or live requests',async()=>{
 const {WorkspaceVerification}=await import('../components/verification-panel');
 const f=fixture();f.current();const red=f.importRun(report(['failed','failed']));f.review('expected_red');
 f.send({type:'beginVerificationCycle',verificationRevisionId:f.revision.id,scopeCaseIds:['case-1','case-2'],baselineRunIds:[red.id],reason:'Two exact behavior examples'});
 const snapshot=JSON.stringify(f.state);
 const html=renderToStaticMarkup(React.createElement(WorkspaceVerification,{state:f.state,revision:f.revision,command:async()=>assert.fail('Read-only history cannot send commands'),disabled:true,readOnly:true,onOpen:()=>{}}));
 assert(html.includes('Циклы работы и проверки'));assert(html.includes(red.id));assert(html.includes('Покрытие по случаям'));
 assert(!html.includes('<form'));assert(!html.includes('Сохранить наблюдение и снять входы'));assert.equal(JSON.stringify(f.state),snapshot);
});
test('busy editable verification retains form DOM while disabling writes, preserving recoverable drafts',async()=>{
 const {WorkspaceVerification}=await import('../components/verification-panel'),{WorkspaceProvider}=await import('../components/workspace-client');
 const f=fixture();
 const content=React.createElement(WorkspaceProvider,{children:React.createElement(WorkspaceVerification,{state:f.state,revision:f.revision,command:async()=>assert.fail('Rendering cannot send commands'),disabled:true,readOnly:false,onOpen:()=>{}})});
 const html=renderToStaticMarkup(React.createElement(QueryClientProvider,{client:new QueryClient(),children:content}));
 assert(html.includes('Создать цикл проверки'));assert(html.includes('Настройка наблюдения входов'));assert(html.includes('Сохранить наблюдение и снять входы'));assert(html.includes('disabled=""'));
 assert.match(html,/<button disabled="">Сохранить текущий срез<\/button>/);assert.match(html,/<button disabled="">Записать фазу<\/button>/);
});
test('adding a selected mutation case exposes its inputs while retaining previously entered counts',async()=>{
 const {VerificationQualityInputs}=await import('../components/verification-advanced');
 const f=fixture(),value={mutation:[{caseId:'case-1',killed:2,survived:0,noCoverage:0,timedOut:0,total:2}]},original=JSON.stringify(value);
 const html=renderToStaticMarkup(React.createElement(VerificationQualityInputs,{revision:f.revision,value,scopeCaseIds:['case-1','case-2'],onChange:()=>assert.fail('Rendering must not rewrite entered results')}));
 assert.match(html,/aria-label="Обнаружены · case-1"[^>]*value="2"/);assert.match(html,/aria-label="Обнаружены · case-2"[^>]*value="0"/);assert.equal(JSON.stringify(value),original);
});
