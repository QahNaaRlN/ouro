import WorkspaceMembers from '@/components/workspace-members';
export default async function MembersPage({params}:{params:Promise<{projectId:string}>}){
 const {projectId}=await params;return <WorkspaceMembers projectId={projectId}/>;
}
