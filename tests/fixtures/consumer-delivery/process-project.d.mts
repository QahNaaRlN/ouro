/** Создаёт отдельный actual-npm process fixture, не реальный Ouro artifact. */
export function createControlledNpmEnvelope(npmCli: string): Promise<{
  directory: string;
  root: string;
  foreign: string;
  npmWitness: string;
  close: () => Promise<void>;
}>;
