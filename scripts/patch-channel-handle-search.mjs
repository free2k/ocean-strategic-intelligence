import fs from 'node:fs/promises';
const changes=[
 ["name:s.payload?.name||s.name||s.id,lastSync:","name:s.payload?.name||s.name||s.id,handle:s.payload?.handle||s.handle||'',lastSync:"],
 ['`${s.name} ${s.url}`.toLowerCase().includes(search.toLowerCase())',"`${s.name} ${s.url} @${s.handle||''}`.toLowerCase().includes(search.trim().toLowerCase())"],
 ['<strong>${esc(s.name)}</strong><small>',"<strong>${esc(s.name)}</strong>${s.type==='x'&&s.handle?`<small>@${esc(s.handle)}</small>`:''}<small>"]
];
const files=process.argv.slice(2);
for(const file of files){let text;try{text=await fs.readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')continue;throw e;}
for(const [before,after] of changes){if(text.includes(after))continue;if(!text.includes(before))throw Error('Unexpected source in '+file);text=text.replace(before,after);}
await fs.copyFile(file,file+'.before-handle-'+Date.now());await fs.writeFile(file+'.handle.tmp',text);await fs.rename(file+'.handle.tmp',file);console.log('Patched '+file);}
