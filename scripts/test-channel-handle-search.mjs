import fs from 'node:fs';import assert from 'node:assert/strict';
const lines=fs.readFileSync('intelligence/public/sensing.js','utf8').split('\n');
const payload=Function(lines.find(x=>x.startsWith('function sourcePayload('))+';return sourcePayload')();
const data=payload({list:[{id:'x:1',present:true,payload:{name:'OIES',handle:'OxfordEnergy',platform:'x'}}]},{});
const row={...data.subscriptions[0],type:'x',url:'',count:0,ready:0};
const render=Function('allChannels','search',`let channel='all',page=1;const date=()=>'',esc=s=>String(s??'');${lines.find(x=>x.startsWith('function channelTable('))};return channelTable();`);
for(const query of ['OxfordEnergy','@OxfordEnergy','oxfordenergy',' OIES ']){const html=render(()=>[row],query);assert.ok(html.includes('<strong>OIES</strong>'));assert.ok(html.includes('<small>@OxfordEnergy</small>'));}
assert.ok(render(()=>[row],'unknown').includes('没有匹配的渠道'));
console.log('PASS display name, username, @username, case and whitespace searches');
