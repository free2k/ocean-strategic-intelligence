import test from 'node:test';import assert from 'node:assert/strict';
import {parseCSV,repdRows,regulatoryRows,policySeries,productionSeries,decodeCSV} from '../open-datasets.mjs';
import {selectRegistries} from '../registry-evidence.mjs';
import {serveQuant} from '../quant-routes.mjs';import {fileURLToPath} from 'node:url';
import {nextCollectionTime} from '../scheduler.mjs';
test('CSV supports quoted multiline, escaped quotes and missing capacities',()=>{
 assert.deepEqual(parseCSV('a,b\r\n"x\ny","a""b"\r\n'),[{a:'x\ny',b:'a"b'}]);
 const rows=repdRows('Ref ID,Technology Type,Site Name,Installed Capacity (MWelec),Development Status\n1,Wind Offshore,A,,Operational\n2,Solar,B,12,Operational\n3,Tidal Stream,C,2,Planned','https://example.org/a.csv');
 assert.equal(rows.length,2);assert.equal(rows[0].capacityMW,null);assert.equal(rows[1].capacityMW,2);assert.equal(decodeCSV(Buffer.from([0x93,65,0x94])).text,'“A”');
});
test('regulations dedupe by number and exclude future publication; current month marked partial',()=>{
 const row={document_number:'A',publication_date:'2026-10-09',html_url:'https://example.org/a',type:'Notice'};
 const rows=regulatoryRows([row,row,{...row,document_number:'B',publication_date:'2026-10-13'}],'2026-10-11');assert.equal(rows.length,1);
 const series=policySeries(rows,'2026-10-11T00:00:00Z');assert.equal(series[0].rows.at(-1).value,1);assert.equal(series[0].rows.at(-1).partial,true);assert.deepEqual(series[0].rows.at(-1).documentIds,['A']);
});
test('production preserves zero, does not coerce null, no future or current incomplete month',()=>{
 const a={prfInformationCarrier:'TROLL',prfYear:2026,prfMonth:7,prfPrdOilNetMillSm3:0,prfPrdGasNetBillSm3:null,OBJECTID:1};
 const series=productionSeries([{attributes:a},{attributes:{...a,prfMonth:10}}],'2026-10-11');assert.equal(series[0].rows.length,1);assert.equal(series[0].rows[0].value,0);assert.equal(series[1].rows.length,0);
 assert.throws(()=>productionSeries([{attributes:a},{attributes:a}],'2026-10-11'),/Duplicate/);
});
test('registry topic, country, source and actual publication dates are filtered',()=>{
 const data={assetRegistries:{'fr-boem':{topic:'宏观政策',country:'US',sourceId:'fr-boem',rows:[{publicationDate:'2026-10-09'},{publicationDate:'2025-01-01'}]},'uk-repd':{topic:'海上风电',country:'GB',rows:[{}]}}};
 assert.equal(selectRegistries(data,{topic:'宏观政策'})['fr-boem'].rows.length,2);
 assert.deepEqual(selectRegistries(data,{country:'NO'}),{});
 assert.equal(selectRegistries(data,{from:'2026-01-01'})['fr-boem'].rows.length,1);
 assert.equal(selectRegistries(data,{from:'2026-01-01'})['uk-repd'],undefined);
});
test('quantitative industry filter uses dataset classification instead of stale stored topic',async()=>{
 const raw={documents:[],sources:[],entities:[],events:[],relations:[],observations:[],evidence:[],assetRegistries:{},series:[{id:'transocean-utilization',name:'全船队平均平台利用率',topic:'海洋油气',sourceId:'transocean',unit:'%',rows:[{period:'2026-Q1',value:85},{period:'2026-Q2',value:86}]}]};
 async function catalog(topic){let text;await serveQuant({method:'GET'},{setHeader(){},end(s){text=s;},writeHead(){}},new URL('http://localhost/quant/api/catalog?'+new URLSearchParams({topic})),raw,fileURLToPath(new URL('../',import.meta.url)));return JSON.parse(text);}
 assert.equal((await catalog('海洋油气')).series.length,0);assert.equal((await catalog('海洋装备')).series.length,1);
});
test('frequent processing jobs do not postpone the scheduled source collection',()=>{
 const now=Date.parse('2026-10-11T06:00:00Z'),planned='2026-10-11T07:00:00.000Z';
 assert.equal(nextCollectionTime(planned,now),planned);
 assert.equal(nextCollectionTime(planned,now+30*60000),planned);
 assert.equal(nextCollectionTime(planned,now,true),'2026-10-11T12:00:00.000Z');
 assert.equal(nextCollectionTime(planned,now+2*3600000),'2026-10-11T08:00:30.000Z');
});
