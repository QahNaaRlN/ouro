import { createServer } from 'node:http';
import { writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

const directory = process.argv[2],
  nonce = process.argv[3],
  filename = path.join(directory, 'old-writer.txt');
let ticks = 0,
  pending = Promise.resolve();
await writeFile(filename, '0\n');
/** Записывает только собственный fixture generation; endpoint закрывает именно этот bounded child. */
const timer = setInterval(() => {
  pending = pending.then(() => appendFile(filename, String(++ticks) + '\n'));
}, 30);
const server = createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/stop/' + nonce) {
    clearInterval(timer);
    void pending.finally(() => {
      response.end('closed');
      server.close();
    });
  } else {
    response.statusCode = 404;
    response.end();
  }
});
server.listen(0, '127.0.0.1', () =>
  process.stdout.write(
    JSON.stringify({ kind: 'writer', pid: process.pid, port: server.address().port }) + '\n',
  ),
);
