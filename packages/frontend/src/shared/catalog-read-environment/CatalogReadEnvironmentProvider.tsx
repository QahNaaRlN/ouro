'use client';

import {createContext,useContext,type ReactNode} from 'react';
import type {CatalogReadEnvironment} from './catalog-read-environment.types';

const Context=createContext<CatalogReadEnvironment|null>(null);
/** Передаёт уже собранный reader; отсутствие host injection не включает HTTP. */
export function CatalogReadEnvironmentProvider({value,children}:{value:CatalogReadEnvironment;children:ReactNode}){
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
/** Читает ограниченную environment ближайшего владельца без нового identity singleton. */
export const useCatalogReadEnvironment=()=>useContext(Context);
