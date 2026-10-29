import {z} from 'zod';

const id=z.string().min(1).max(200);
const relativePath=z.string().max(4096);
const extensible=<Shape extends z.ZodRawShape>(shape:Shape)=>z.object(shape).catchall(z.json());
const metadataShape=z.object({name:z.string(),projectId:id,bindingId:id,folderName:z.string(),capabilities:z.object({readOnlyFiles:z.literal(true)})});
const entryShape=z.object({name:z.string().min(1),path:relativePath,kind:z.enum(['file','directory']),size:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()});
const listShape=z.object({path:relativePath,entries:z.array(entryShape).max(200),nextCursor:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),truncated:z.boolean()});
const fileShape=z.object({path:relativePath.min(1),text:z.string().max(131072),sha256:z.string().regex(/^[a-f0-9]{64}$/),size:z.number().int().min(0).max(131072),modifiedAt:z.string().min(1)});

/** Read-only context never includes the server's absolute root path. */
export const workspaceMetadataSchema=metadataShape.extend({capabilities:extensible({readOnlyFiles:z.literal(true)})}).catchall(z.json());
export const workspaceFileEntrySchema=entryShape.catchall(z.json());
export const workspaceFileListSchema=listShape.extend({entries:z.array(workspaceFileEntrySchema).max(200)}).catchall(z.json());
export const workspaceFileSchema=fileShape.catchall(z.json());
export type WorkspaceMetadata=z.infer<typeof metadataShape>;
export type WorkspaceFileEntry=z.infer<typeof entryShape>;
export type WorkspaceFileList=z.infer<typeof listShape>;
export type WorkspaceFile=z.infer<typeof fileShape>;
