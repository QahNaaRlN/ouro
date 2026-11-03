type Choice={value:string;disabled:boolean};

/** A required empty value is a placeholder; optional empty values such as “All” are real choices. */
export function selectAvailability(options:readonly Choice[],required=false):'available'|'no-options'|'all-disabled'{
  const choices=required?options.filter(option=>option.value!==''):options;
  if(choices.length===0)return 'no-options';
  return choices.every(option=>option.disabled)?'all-disabled':'available';
}
