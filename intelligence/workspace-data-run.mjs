import {createWorkspaceDataServer} from './workspace-data-server.mjs';

// Keep the executable separate from the importable server. PM2 imports ESM
// entries through its own launcher, so argv is not a reliable entry check.
createWorkspaceDataServer().listen(Number(process.env.WORKSPACE_DATA_PORT||3104),'127.0.0.1',()=>console.log('Workspace data ready on loopback'));
