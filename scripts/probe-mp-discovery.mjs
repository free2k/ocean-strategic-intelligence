import fs from 'node:fs/promises';import {discoverAccount} from '../server/integrations/mp-discovery.mjs';
const name=process.argv[2]||'中国能源报',r=await discoverAccount(name);await fs.writeFile('/opt/knowledge-base/discovery-probe.json',JSON.stringify(r,null,2),{mode:0o600});console.log(JSON.stringify(r));
