import fs from 'node:fs/promises';
const helper="function xChannelUrl(s){if(s.platform!=='x')return '';const handle=String(s.handle||s.payload?.handle||'').replace(/^@/,'');if(/^[A-Za-z0-9_]{1,15}$/.test(handle))return 'https://x.com/'+handle;const id=String(s.payload?.remoteId||s.id?.replace(/^x:/,'')||'');return /^\\d+$/.test(id)?'https://x.com/i/user/'+id:'';}";
const changes=[
 ['function sourcePayload(',helper+'\nfunction sourcePayload('],
 ["date:s.latest,url:'',status:","date:s.latest,url:xChannelUrl(s),status:"],
 ["${urlLink(s.url,'访问原始渠道')}","${urlLink(s.url,s.type==='x'?'X 原始主页：'+s.url:'访问原始渠道')}"]
];
for(const file of process.argv.slice(2)){
 let text;try{text=await fs.readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')continue;throw e;}
 for(const [before,after] of changes){if(text.includes(after))continue;if(!text.includes(before))throw Error('Unexpected source: '+file);text=text.replace(before,after);}
 await fs.copyFile(file,file+'.before-x-links-'+Date.now());await fs.writeFile(file+'.links.tmp',text);await fs.rename(file+'.links.tmp',file);console.log('Patched '+file);
}
