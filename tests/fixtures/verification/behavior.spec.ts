import {test,expect} from '@playwright/test';
// An isolated synthetic product. This never imports or changes Concord data.
const add=(left:number,right:number)=>process.env.OURO_VERIFICATION_SCENARIO==='red'?left-right:left+right;
test('first observable behavior',()=>expect(add(2,3)).toBe(5));
test('second observable behavior',()=>{test.skip(process.env.OURO_VERIFICATION_SCENARIO==='partial','Deliberate required skip for ingestion acceptance');expect(add(3,4)).toBe(7);});
