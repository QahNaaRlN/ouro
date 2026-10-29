#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {validateFlowDefinition,validateToolBody,protocolManifest} from '../dist/esm/index.js';

const [command,...args]=process.argv.slice(2);
try{
 if(command==='manifest')console.log(JSON.stringify(protocolManifest,null,2));
 else if(command==='validate-flow'&&args.length===1){
  validateFlowDefinition(JSON.parse(await readFile(args[0],'utf8')));console.log(JSON.stringify({valid:true}));
 }else if(command==='validate-response'&&args.length===2){
  const body=JSON.parse(await readFile(args[1],'utf8'));
  validateToolBody(args[0],body,body?.ok===false);console.log(JSON.stringify({valid:true}));
 }else{console.error('Usage: ouro-protocol manifest | validate-flow <file.json> | validate-response <tool> <file.json>');process.exitCode=2;}
}catch(error){
 console.error(JSON.stringify({valid:false,code:error?.code??'VALIDATION_ERROR',message:error?.issues?'JSON does not satisfy the selected contract':error.message}));process.exitCode=1;
}
