import { validateNodeVersion } from './runtime-node.mjs';
import { runConsumer } from './consumer-delivery/consumer-owner.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Публичный stdlib entry независимой поставки; Node admission предшествует файловым операциям. */
try {
  validateNodeVersion(process.versions.node);
  process.exitCode = await runConsumer({
    root: path.resolve(fileURLToPath(new URL('../', import.meta.url))),
    argv: process.argv.slice(2),
  });
} catch (error) {
  process.stderr.write(
    error?.code === 'NODE_RUNTIME_UNSUPPORTED'
      ? 'NODE_RUNTIME_UNSUPPORTED: ' + error.message + '\n'
      : 'OURO_CONSUMER_LAUNCH_FAILED' +
          (typeof error?.phase === 'string' && /^[A-Z_]{1,40}$/.test(error.phase)
            ? ' ' + error.phase
            : '') +
          '\n',
  );
  if (error?.cleanupIncomplete === true) process.stderr.write('OURO_CONSUMER_CLEANUP_INCOMPLETE\n');
  process.exitCode = 1;
}
