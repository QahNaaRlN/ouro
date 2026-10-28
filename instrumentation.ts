export async function register(){
  if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.NEXT_PHASE!=='phase-production-build'&&process.env.OURO_GITHUB_WEBHOOK_SECRET){
    const {startGitHubWorker}=await import('./lib/github/worker');
    startGitHubWorker();
  }
}
