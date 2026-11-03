export default function setup(){
 if(process.env.OURO_VERIFICATION_SCENARIO==='infra'){
  const error=new Error('Isolated fixture prerequisite unavailable');
  // This synthetic prerequisite failure does not need loader/source-map frames.
  // Bound the fixture itself; the real Playwright JSON remains untouched.
  error.stack=`Error: ${error.message}`;
  throw error;
 }
}
