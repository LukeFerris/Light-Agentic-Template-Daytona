import { startServer } from './server';

// Entrypoint for the local dev server (`yarn dev:api`) and the production
// container. Booting lives here, separate from `server.ts`, so the server's
// request handling can be imported and unit-tested without opening a socket.
startServer();
