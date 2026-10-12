import {pool} from '../server/integrations/mp2rss-store.mjs';
import {client,subscriptions} from '../server/integrations/mp2rss-client.mjs';
import {accountKey} from '../server/integrations/wechat-identity.mjs';
import fs from 'node:fs/promises';
const remote=await subscriptions(client()),mp=remote.filter(s=>s.platform==='mp');
const names=(await fs.readFile('/opt/knowledge-base/wechatPost-import.txt','utf8')).replace(/^\uFEFF/,'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
const sources=(await pool.query('SELECT name,fakeid FROM sources')).rows;
const comparisons=names.map(name=>{const source=sources.find(s=>accountKey(s.name)===accountKey(name)&&!s.fakeid?.startsWith('mp2rss_'));let remoteId='';try{remoteId=Buffer.from(source?.fakeid||'','base64').toString('utf8')}catch{}const found=mp.find(s=>accountKey(s.name)===accountKey(name)||s.remoteId===remoteId);return {name,status:found?'已订阅':'未订阅',matched:found?.name||null};});
console.log(JSON.stringify({checkedAt:new Date().toISOString(),mpCount:mp.length,xCount:remote.length-mp.length,comparisons,remoteNames:mp.map(s=>s.name)}));await pool.end();
