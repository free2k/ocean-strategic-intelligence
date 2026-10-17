import fs from 'node:fs/promises';
import path from 'node:path';
import {rawFixture} from '../../intelligence/tests/strategy-fixture.mjs';
const dir=process.argv[2];if(!dir||!path.resolve(dir).startsWith('/tmp/strategy-'))throw Error('Use an isolated /tmp/strategy-* directory');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'snapshot.json'),JSON.stringify(await rawFixture()));console.log('Prepared isolated engineering fixture');
