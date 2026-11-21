import { createServer, type AddressInfo } from 'node:net';

// Ask the OS for a free port: a random port could land on a running Tubescope (:4949) and send test requests to real data.
export async function freePort(): Promise<number> {
  const srv = createServer();
  await new Promise<void>(resolve => srv.listen(0, '127.0.0.1', resolve));
  const { port } = srv.address() as AddressInfo;
  await new Promise(resolve => srv.close(resolve));
  return port;
}
