import fs from 'node:fs';import fsp from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {pipeline} from 'node:stream/promises';import {createHash} from 'node:crypto';
const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1];
if(!args.includes('--output')||!args.includes('--host')||!args.includes('--identity'))throw Error('Required: --output NEW_DIRECTORY --host SSH_HOST --identity KEY');
const out=path.resolve(arg('--output'));await fsp.mkdir(out,{recursive:false});
const child=spawn('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','-i',arg('--identity'),arg('--host'),'node','-',...(args.includes('--snapshot')?['--snapshot']:[]),...(args.includes('--text-baseline')?['--text-baseline']:[])],{stdio:['pipe','pipe','pipe']});let stderr='';child.stderr.on('data',b=>stderr+=b);const exited=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Read-only capture failed: '+stderr.slice(-500))));});
child.stdin.end(await fsp.readFile(new URL('./export-live-readonly.cjs',import.meta.url)));
await Promise.all([pipeline(child.stdout,fs.createWriteStream(path.join(out,'source.ndjson.gz.partial'),{flags:'wx'})),exited]);
const file=path.join(out,'source.ndjson.gz');await fsp.rename(file+'.partial',file);const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);
await fsp.writeFile(path.join(out,'capture.json'),JSON.stringify({capturedAt:new Date().toISOString(),source:'production_read_only',archive:'source.ndjson.gz',sha256:hash.digest('hex'),bytes:(await fsp.stat(file)).size,isolated:true},null,2));console.log(JSON.stringify({output:out,bytes:(await fsp.stat(file)).size}));
