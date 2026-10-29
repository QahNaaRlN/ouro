import WorkspaceProjectPage from '@/components/workspace-project';
export default async function ProjectPage({params}:{params:Promise<{projectId:string}>}){const {projectId}=await params;return <WorkspaceProjectPage projectId={projectId}/>;}
