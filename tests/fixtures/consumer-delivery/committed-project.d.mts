export const ownedDeliveryFiles:string[];
export function createCommittedProjectFixture(origin:string):Promise<{directory:string;repository:string;commit:string;originCommit:string;close:()=>Promise<void>}>;
