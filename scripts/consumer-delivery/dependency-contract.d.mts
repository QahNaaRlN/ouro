export type ConsumerDependencyOptions={blueprint:string;template:string;provenance:string;productVersion:string;protocol:{manifest:string;filename:string;bytes:Buffer}};
export type ConsumerDependencyResult={manifest:{name:string;version:string;private:true;type:'module';engines:{node:string};dependencies:Record<string,string>;devDependencies:Record<string,string>};lockfile:Record<string,unknown>};
export class ConsumerDependencyError extends Error {readonly code:'CONSUMER_DEPENDENCY_INVALID';constructor();}
export function materializeConsumerDependencies(options:ConsumerDependencyOptions):ConsumerDependencyResult;
