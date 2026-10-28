import test from 'node:test';
import assert from 'node:assert/strict';

test('M05 Meridian theme maps the pinned workbench palette onto Ouro variables',async()=>{
 const {getMeridianThemeVariables}=await import('../packages/meridian/src/theme');
 const dark=getMeridianThemeVariables('dark'),light=getMeridianThemeVariables('light');
 assert.equal(dark['--bg'],'#101113');assert.equal(dark['--control'],'#7c828e');assert.equal(dark['--positive'],'#86efac');
 assert.equal(light['--bg'],'#fff');assert.equal(light['--text'],'#18181b');assert.equal(light['--positive'],'#15803d');
 assert.equal(light['--attention-surface'],'#fffbeb');
});
test('M05 theme input is a closed enum and cannot introduce arbitrary CSS or contaminate later calls',async()=>{
 const {getMeridianThemeVariables}=await import('../packages/meridian/src/theme');
 for(const value of [undefined,null,'system','DARK','dark;url(https://example.com)',{mode:'dark'}])assert.throws(()=>getMeridianThemeVariables(value),e=>(e as {code?:string}).code==='VALIDATION_ERROR');
 const changed=getMeridianThemeVariables('dark');changed['--bg']='url(https://example.com)';
 assert.equal(getMeridianThemeVariables('dark')['--bg'],'#101113');
 assert.deepEqual(Object.keys(getMeridianThemeVariables('dark')).sort(),Object.keys(getMeridianThemeVariables('light')).sort());
});
