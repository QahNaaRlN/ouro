import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('disabled empty and all-disabled selects expose an inline explanation without losing an existing accessible description',async()=>{
  // Node renders the real component; stylesheet loading belongs to the browser bundle.
  const require=createRequire(join(process.cwd(),'tests/app-select-render.test.ts')),previousCssLoader=require.extensions['.css'];
  require.extensions['.css']=()=>{};
  try{
    const {AppSelect}=await import('../components/app-select');
    for(const searchable of [false,true])for(const noOptions of [true,false]){
      const explanation=noOptions?'Нет вариантов для выбора.':'Все варианты сейчас недоступны.';
      const markup=renderToStaticMarkup(createElement(AppSelect,{'aria-label':'Исполнитель','aria-describedby':'existing-help',disabled:true,required:true,searchable,value:'',children:noOptions?[]:createElement('option',{value:'agent',disabled:true},'Недоступный агент')}));
      const trigger=markup.match(/<button\b[^>]*>/)?.[0];assert.ok(trigger);assert.match(trigger,/disabled=""/);
      const description=trigger.match(/aria-describedby="existing-help ([^"]+)"/)?.[1];assert.ok(description);
      assert.ok(markup.includes(`<span id="${description}" class="ouro-select-disabled-reason">${explanation}</span>`));
      assert.doesNotMatch(markup,/role="listbox"/); // The explanation is readable while the disabled popup cannot open.
    }
    const custom=renderToStaticMarkup(createElement(AppSelect,{'aria-label':'Исполнитель',disabled:true,emptyReason:'Подключение ещё не зарегистрировано.',children:[]}));
    assert.match(custom,/ouro-select-disabled-reason">Подключение ещё не зарегистрировано\.<\/span>/);
    const optionalAll=renderToStaticMarkup(createElement(AppSelect,{'aria-label':'Фильтр',disabled:true,value:'',children:createElement('option',{value:''},'Все')}));
    assert.doesNotMatch(optionalAll,/ouro-select-disabled-reason/);
  }finally{
    if(previousCssLoader)require.extensions['.css']=previousCssLoader;else delete require.extensions['.css'];
  }
});
