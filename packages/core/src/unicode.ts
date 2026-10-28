/** Validate Unicode scalar text without replacing unpaired UTF-16 surrogates.
 * Unlike TextEncoder, this never repairs invalid input into U+FFFD. Keeping
 * valid pairs unchanged preserves exact source bytes and JSONB round-trips.
 */
export function isWellFormedUnicode(value:string):boolean{
 for(let i=0;i<value.length;i++){
  const unit=value.charCodeAt(i);
  if(unit>=0xd800&&unit<=0xdbff){
   const next=value.charCodeAt(i+1);
   if(!(next>=0xdc00&&next<=0xdfff))return false;
   i++;
  }else if(unit>=0xdc00&&unit<=0xdfff)return false;
 }
 return true;
}
