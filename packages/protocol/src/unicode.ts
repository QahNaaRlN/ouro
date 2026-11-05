/** Проверяет Unicode scalar text без замены одиночных UTF-16 surrogate на U+FFFD.
 * Сохраняет допустимые пары, точные исходные байты и представление после JSONB round-trip.
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
