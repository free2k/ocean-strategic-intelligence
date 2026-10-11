import fs from 'node:fs/promises';import {collectOpenDatasets} from '../intelligence/open-datasets.mjs';
const dir='/opt/ocean-intelligence/open-network-stage';await fs.mkdir(dir,{recursive:true});await fs.writeFile(dir+'/snapshot.json',JSON.stringify({sources:[],documents:[],entities:[],events:[],relations:[],observations:[],evidence:[],series:[]}));await collectOpenDatasets(dir);
