import path from 'node:path';
import { PROJECT_ID } from '../packages/core/src';
import { AccessError } from './auth';

const loopback=(host:string)=>['localhost','127.0.0.1','[::1]'].includes(host);
export function requestOrigin(request:Request): string {
  const url=new URL(request.url);
  const host=request.headers.get('host')??url.host;
  const configured=process.env.OURO_PUBLIC_URL?new URL(process.env.OURO_PUBLIC_URL):null;
  const target=new URL(`${url.protocol}//${host}`);
  if(configured&&configured.host===host) {
    if(configured.protocol!=='https:'&&!loopback(configured.hostname))throw new AccessError('CONFIGURATION_ERROR','Удалённый MCP endpoint требует HTTPS.',503);
    return configured.origin;
  }
  if(!loopback(target.hostname))throw new AccessError('FORBIDDEN','Host не разрешён. Для внешнего HTTPS endpoint задайте OURO_PUBLIC_URL.');
  return target.origin;
}
export function assertMcpRequest(request:Request) {
  const expected=requestOrigin(request);
  const origin=request.headers.get('origin');
  if(origin&&origin!==expected)throw new AccessError('FORBIDDEN','Origin не разрешён для MCP.');
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AccessError('UNSUPPORTED_MEDIA_TYPE','MCP POST требует application/json.',415);
}
export function connectionConfig(request:Request,projectId=PROJECT_ID) {
  const endpoint=projectId===PROJECT_ID?'/api/mcp':`/api/projects/${encodeURIComponent(projectId)}/mcp`;
  return {httpUrl:`${requestOrigin(request)}${endpoint}`,stdioCommand:process.execPath,stdioArgs:[path.resolve('packages/mcp/bin/ouro-mcp.mjs')],projectId};
}
