export default function setup(){
 if(process.env.OURO_VERIFICATION_SCENARIO==='infra'){
  throw new Error('Isolated fixture prerequisite unavailable');
 }
}
