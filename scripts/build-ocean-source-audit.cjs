const fs=require('fs'),path=require('path'),{parseHTML}=require('linkedom'),XLSX=require('xlsx');
const {Document,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,HeadingLevel,Packer,ExternalHyperlink,Footer,AlignmentType,PageNumber}=require('docx');
const {chromium}=require('playwright-core');
const out=path.resolve('docs/ocean-source-audit-2026-10-07'),base='海洋能源资讯渠道可靠性与趋势数据核验报告';
const old=JSON.parse(fs.readFileSync('docs/ocean-energy-strategic-thinktank/requirements-content.json','utf8'));
const probes=JSON.parse(fs.readFileSync(path.join(out,'channel-probes.json'),'utf8'));
const supplement=JSON.parse(fs.readFileSync(path.join(out,'supplement-probes.json'),'utf8'));
const news=JSON.parse(fs.readFileSync(path.join(out,'rss-news-samples.json'),'utf8'));
const probe=id=>probes.find(x=>x.id===id),sub=id=>supplement.find(x=>x.id===id);
const getDoc=id=>parseHTML(fs.readFileSync(path.join(out,id+'-source.html'),'utf8')).document;
const refs={};old.sources.forEach(s=>refs[s.id]=[s.name,s.url]);refs.S33=['Northern Lights 正确新闻目录','https://norlights.com/newsroom/'];
probes.filter(x=>x.id.startsWith('D')).forEach(s=>refs[s.id]=[s.name,s.url]);
supplement.forEach(s=>refs[s.id]=[s.name,s.url]);
refs.NO=['SODIR 月度公告目录','https://www.sodir.no/en/whats-new/news/production-figures/'];
const metrics=[];
function metric(dataset,period,value,unit,url,release,status='官方披露',original=String(value),method='本地网页解析'){metrics.push({dataset,period,value,unit,original,release,status,source_url:url,acquired_via:method,checked_at:'2026-10-07'});}
const eiaDoc=getDoc('D01');
for(const tr of eiaDoc.querySelectorAll('tr')){const cells=[...tr.querySelectorAll('td')].map(x=>x.textContent.trim());if(cells.length===13&&/^\d{4}$/.test(cells[0]))for(let i=1;i<=12;i++){const n=Number(cells[i].replace(/,/g,''));if(cells[i]&&Number.isFinite(n))metric('美国联邦海域海湾原油月度日均产量',`${cells[0]}-${String(i).padStart(2,'0')}`,n,'千桶/日',probe('D01').url,'2026-09-30','本次下载版本',cells[i]);}}
const monthly=metrics.filter(x=>x.dataset.startsWith('美国'));
const norwayValues=[2219,2176,2152,2158,1909,2022,1976,2073],months=['january','february','march','april','may','june','july','august'];
const noDates=['02-20','03-20','04-21','05-20','06-23','07-21','08-20','09-22'];
norwayValues.forEach((v,i)=>metric('挪威油及NGL和凝析油初步月度日均产量',`2026-${String(i+1).padStart(2,'0')}`,v,'千桶/日',`https://www.sodir.no/en/whats-new/news/production-figures/2026/production-figures-${months[i]}-2026/`,'2026-'+noDates[i],'各月首次发布的初步值',String(v*1000)+' barrels/day','官方目录经浏览检索核对；本地返回403'));
const cn=[['2024-12',41.27,'4127万千瓦','2025-01-27','C24','已披露'],['2025-12',47,'0.47亿千瓦','2026-02-12','C25','原文精度有限，约值展示'],['2026-06',48.41,'4841万千瓦','2026-07-30','D04','已披露']];
cn.forEach(([p,v,o,d,id,status])=>metric('中国海上风电累计并网容量',p,v,'GW',refs[id][1],d,status,o));
const transText=getDoc('D03').body.textContent.replace(/\s+/g,' ');
const util=transText.match(/Total fleet average rig utilization\s+([\d.]+)\s*%\s+([\d.]+)\s*%\s+([\d.]+)\s*%/);
if(!util)throw new Error('Transocean utilization row not found');
[['2026-Q2',1],['2026-Q1',2],['2025-Q2',3]].forEach(([p,i])=>metric('Transocean 全船队钻井平台利用率',p,Number(util[i]),'%',refs.D03[1],'2026-08-05','2026Q2报告比较值',util[i]+'%'));
for(const n of news){const d=Date.parse(n.published);n.date_status=!Number.isFinite(d)?'日期待解析':d>Date.parse(n.collected_at)+5*60000?'发布时间晚于采集时刻，需核对时区/预发布':'日期解析通过';n.content_status=['R01','R02','R03'].some(id=>sub(id)?.url===n.url&&sub(id)?.headline)?'RSS与原文标题已核对；事实待核验':'仅RSS元数据，未逐篇核验正文';n.topic_status=/offshore|floating|FPSO|subsea|wind farm/i.test(n.title)?'海洋主题候选，需正文确认':'待主题筛选';}
const authority=s=>['S01','S02','S12','S13','S16','S17','S18','S19','S20','S21','S22','S23','S24'].includes(s.id)?'官方机构/统计平台：优先事实依据':['S03','S04','S05'].includes(s.id)?'专业研究机构：方法与样本需核对':['S06','S07','S08','S14','S15'].includes(s.id)?'行业媒体：发现线索，重要事实回源':['S27','S28','S29','S30'].includes(s.id)?'渠道/平台：可信度取决于具体发布者':s.id==='S26'?'候选机构集合：逐源核实':'企业/项目官方：自身业务一手披露';
const changes={
S13:'??API?????Key??????????????????547???????????????',
S12:'14?RSS???????????????EST?????????????????????????',
S01:'官方目录直连403；不能作为当前已接通来源。报告与数据产品另确认授权。',S02:'月报入口直连403；可人工下载或申请供稿，不承诺自动获取。',S03:'产品介绍页可达，商业API未认证；先索取海上样本和历史覆盖。',S04:'产品介绍页可达，商业API未认证；历史、频率和加工权待询价。',S05:'官网可达；付费接口未认证；优先询价平台利用率、日租金和订单历史。',S06:'直连403；来源可用于线索，但当前不作为稳定采集承诺。',S08:'订阅页可达，不等于订阅正文可批量获取。',S16:'代理下实际取得3个油气田要素及几何；可作地图底座，字段更新时间不是事件发生日。',S17:'实际取得2个风场要素；样例 updateyear=2024，不能称实时现状。',S18:'直连及代理存在证书校验失败；本次不列为自动接入成功。',S20:'近期发布会正文和历史统计已取得；公开网页方式，不是开放API。',S21:'代理恢复页面访问；只证明入口可达，未建立连续专题数据。',S23:'代理恢复页面访问；政策原文须逐条核查。',S25:'中国海油官网入口可达；近期正文和历史覆盖尚未逐项核验。',S26:'不计入36个初始实测入口；仍需逐省确定真实栏目。',S27:'代理能打开官方文档；没有第三方公众号账号授权或文章接口调用。',S28:'代理能打开计费文档；没有社媒数据认证调用。',S29:'权限文档可达；不承诺任意第三方机构页采集。',S30:'代理能打开API文档；未认证获取；摘要不能当全文。',S31:'官网新闻入口可达；近期海洋项目在公开目录可检索，持续采集待验证。',S32:'已取得2026Q2业绩正文及利用率比较值；网页/报告获取，无公开API验证。',S33:'旧 /news/ 返回404；更正 /newsroom/ 后200，目录含2026-10-01项目消息。'};
const methodNames={rss:'RSS订阅',api:'API/数据服务',web:'官网栏目',download:'官方文件下载',manual:'手动/授权'};
const ledger=old.sources.map(s=>{const p=probe(s.id);let status=p?`${p.status||'失败'} / ${p.route==='local-proxy-10808'?'10808代理':'直连'}`:'未单独实测';if(s.id==='S33')status+='；新目录200';const feed=p?.feed_items;return {id:s.id,name:s.name,authority:authority(s),method:methodNames[s.group],url:s.id==='S33'?refs.S33[1]:s.id==='S26'?'逐省确定':s.url,probe:status,latest:feed?p.newest_item?.published:s.id==='S13'?'统计到2026-07，发布2026-09-30':s.id==='S20'?'统计到2026-06，发布2026-07-30':s.id==='S32'?'2026Q2，发布2026-08-05':s.id==='S33'?'目录可见2026-10-01':s.id==='S16'?'样例字段有更新时间，非统计时序':s.id==='S17'?'抽样 updateyear=2024':'未逐篇核验最新时间',history:feed?'RSS仅当前窗口，完整历史未验证':s.id==='S13'?'已采集1981-01至2026-07':s.id==='S20'?'已采集2024末/2025末/2026年中':s.id==='S32'?'本次取得3个可比季度':'历史入口/产品范围待逐项验证',decision:feed?'优先资讯线索；事实仍需回源':['S13','S20','S32','S16','S17'].includes(s.id)?'优先趋势/空间数据试用':['S03','S04','S05','S08','S28','S29','S30','S27'].includes(s.id)?'有条件：账号/授权/采购':'辅助来源；进一步抽样',note:changes[s.id]||(feed?'本次读取'+feed+'条元数据；不视为完整历史或全部海洋主题。':'页面可达；正文、历史覆盖及连续稳定性尚待验证。'),checked_at:p?.checked_at||'2026-10-07'};});
const csv=(filename,rows)=>{const keys=Object.keys(rows[0]);const q=s=>'"'+String(s??'').replace(/"/g,'""')+'"';fs.writeFileSync(path.join(out,filename),'\uFEFF'+[keys,...rows.map(r=>keys.map(k=>r[k]))].map(r=>r.map(q).join(',')).join('\r\n'));};
csv('channel-reliability.csv',ledger);csv('trend-data.csv',metrics);csv('recent-news-metadata.csv',news);
fs.writeFileSync(path.join(out,'trend-data.json'),JSON.stringify(metrics,null,2));
const wb=XLSX.utils.book_new();for(const [name,rows] of [['渠道核验',ledger],['趋势数据',metrics],['资讯元数据',news]]){const sheet=XLSX.utils.json_to_sheet(rows);sheet['!autofilter']={ref:sheet['!ref']};sheet['!cols']=Object.keys(rows[0]).map(k=>({wch:k.includes('url')?60:k==='title'?65:25}));XLSX.utils.book_append_sheet(wb,sheet,name);}XLSX.writeFile(wb,path.join(out,'渠道核验与真实趋势数据.xlsx'));
const blocks=[];const H=(text,level=1)=>blocks.push({type:'h',text,level}),P=text=>blocks.push({type:'p',text}),T=(heads,rows,kind)=>blocks.push({type:'t',heads,rows,kind});
const chart=(title,rows,max,note)=>blocks.push({type:'chart',title,rows,max,note});
H('海洋能源资讯渠道可靠性与趋势数据核验报告',0);
P('独立调研报告｜2026-10-07｜面向业务评审与数据选型');
P('目标：确认哪些渠道值得信任、哪些能够实际获取、近期更新到什么时间、历史资料能否支撑趋势。本文包含实际采集样例与可复用数据表，不将“官网可打开”当作“接口已接通”。此前需求文档保持不变。');
H('1 核验结果与优先选择');
P(`本轮对36个入口完成初始只读检查，并对10个数据或文章入口补充验证。覆盖原台账中的32项具体来源及4个样例入口；沿海省市集合未作为单个来源测试。使用本地10808代理处理直连网络失败，未购买服务、注册账号或调用付费模型。`);
T(['已经拿到什么','适合展示什么','不能据此宣称什么'],[
['4个RSS，合计'+news.length+'条元数据；其中3篇文章标题另行核对','近期资讯列表、主题线索、事件候选','不是129个已核验事件，也不是完整历史新闻库'],
['EIA '+monthly.length+'个月度观察值，1981-01至2026-07','长期及近年海上原油趋势、同比/环比','本次来自官方网页表，不是已认证API调用'],
['挪威2026年1—8月初步生产公告数值','较新的月度生产走势','未取得最终修订序列；本地公告读取受限'],
['中国海上风电3个时点的累计并网容量','2024年底至2026年中的规模变化','非完整月度序列；2025年末原值精度较低'],
['Transocean报告中的3个季度比较值','公司平台利用率同比/环比','非全球平台市场指标；缺失季度不插值'],
['SODIR 3个油气田要素、EMODnet 2个风场要素','地图位置、项目/设施属性样例','抽样不是全量；空间接口不等于实时运营数据']]);
P('建议首批组合：EIA＋国家能源局＋Transocean 支撑数值趋势；Offshore Energy＋OffshoreWIND 支撑资讯发现；SODIR＋EMODnet 支撑空间分布；企业与项目官网支撑事件和关系证据。商业机构作为补充选项，不应成为首个演示版本的唯一数据依赖。');
H('2 “可靠”如何判断');
T(['判断维度','本次检查方法','结论边界'],[
['发布者可信度','确认官方域名、机构/企业主体、原始发布还是转载','官方企业对自身项目是一手来源，但预测和宣传口径仍需标识'],
['数据可追溯性','记录标题、原文地址、发布日期、统计期、数值与单位','不依据新闻标题直接确认合作、金额或实际产量'],
['获取可用性','直连请求；网络失败后尝试本地代理；检查返回内容而非仅看状态码','单次成功不证明全天候稳定；本报告不提供虚构的稳定率'],
['时间新鲜度','分开登记新闻日期、统计期、发布期和采集时刻','最新统计可能滞后数周或数月；目录最新文章也可能与海洋无关'],
['历史连续性','检查历史表格/报告，并提取可比数值','RSS常只保留最近几十条，不能倒推出过去数月新闻热度'],
['开放与授权','区分无需认证的读取、免费注册API、商业API和受限社媒','本次成功读取不代表所有再分发、全文保存和AI加工权已确认']]);
P('对平台采用逐账号判断：公众号、X、LinkedIn、NewsAPI 不是统一可信的“作者”。同一机构官网与社媒转发不算两份独立证据；同集团媒体转载也不能人为增加证据数量。');
H('3 近期资讯采集结果');
T(['订阅源','条数 / 本次窗口','可靠性与用途'],['S07','S12','S14','S15'].map(id=>{const p=probe(id);return [p.name+' ['+id+']',p.feed_items+'条；'+p.oldest_date+' → '+p.newest_item.published,id==='S12'?'官方能源背景资料，仍需海洋主题筛选':id==='S07'?'覆盖广，普通油价和财政话题不自动纳入核心库':'海洋专题相关度较高，关键事实回溯企业/项目公告'];}));
const selected=['R01','R02','R03'].map(id=>sub(id));
T(['近期文章样例（中文释义）','原始日期 / 来源','本次验证到哪一层'],[
['Yinson Production 与 Eni 扩大非洲FPSO天然气能力 [R01]','2026-10-05；Offshore Energy','RSS条目与原文标题一致；正文事实未逐条核验'],
['海上风电水下电池系统部署前完成测试 [R02]','2026-10-06；Offshore Energy','RSS条目与原文标题一致；不由标题推导商业投运'],
['Vestas 与深水风电技术开发商合作 [R03]','2026-10-07；OffshoreWIND','RSS条目与原文标题一致；合作双方角色待正文核验'],
['Northern Lights 与 Öresundskraft 的运输封存协议 [N01]','2026-10-01；官方新闻目录','目录已读到；协议能力不等于实际封存量']]);
const anomalies=news.filter(x=>x.date_status!=='日期解析通过');
P(`发现${anomalies.length}条日期需要额外核对：保留原始时区字符串，不直接改写。对于RSS给出的发布时间晚于采集时刻的条目，先列为“时间待核验”，不纳入严格的截至时刻统计。CSV中保留逐条标记。`);
P('历史资讯方案：先回补官网档案、历史月报/季报和获授权新闻库；从正式接入日开始持续保留RSS增量。未补齐的月份显示“未覆盖”，不能填零后绘制新闻热度下降趋势。');
H('4 已取得的真实趋势数据');
H('4.1 EIA：连续海上原油月序列',2);
const eiaRecent=monthly.filter(x=>x.period>='2025-01');
chart('美国联邦海域海湾原油月度日均产量｜千桶/日',eiaRecent.map(x=>[x.period,x.value]),2500,'来源 [D01]；1981年以来完整采集值在附件，图示2025-01至2026-07。发布于2026-09-30。');
const july26=monthly.find(x=>x.period==='2026-07').value,july25=monthly.find(x=>x.period==='2025-07').value,june26=monthly.find(x=>x.period==='2026-06').value;
P(`样例计算：2026年7月为${july26}千桶/日，较2025年7月${july25}增长${((july26/july25-1)*100).toFixed(2)}%；较6月${june26}增长${((july26/june26-1)*100).toFixed(2)}%。公式为（本期/基期−1）×100%。这些是本次下载版本的区域产量变化，不是全球海上油气走势。`);
P('API官方提供免费注册Key，本次没有账号认证调用；已通过公开统计表取得全部样例。图表使用统计月份而非发布日期；月度日均流量不能直接相加当作累计总产量。');
H('4.2 挪威：近期生产公告',2);
chart('挪威油、NGL与凝析油初步月度日均产量｜千桶/日',norwayValues.map((v,i)=>['2026-'+String(i+1).padStart(2,'0'),v]),2500,'来源 [NO]；各月首次公布的初步值，最新2026-08于2026-09-22发布；可能后续修订。');
P('本组数值经官方目录的浏览检索结果核对，本地直接获取目录及8月正文返回403，因此与本地成功解析的EIA序列分开标识。正式接入应取得官方最新修订表再计算严谨同比；目前可展示“各月初步披露值走势”。其介质包括NGL和凝析油，不能与EIA原油口径直接叠加。');
H('4.3 国内海上风电：公开统计快照',2);
chart('中国海上风电累计并网容量｜GW',cn.map(([p,v])=>[p,v]),60,'来源：2024末 [C24]、2025末 [C25]、2026年中 [D04]；2025末原文为0.47亿千瓦，图中47按近似值理解。');
P('这三份官方材料已经本地取得。适合使用离散时点条形图；不生成虚构月度值。2026年上半年新增海上风电84万千瓦，与2025年末粗精度累计值相减所得结果不能强行对账；可能涉及取整或统计调整，应保留原披露口径。全国风电发电量和利用率包含陆上部分，不进入“海上风电发电量”指标。');
H('4.4 海工装备：公司季度比较',2);
chart('Transocean 全船队钻井平台利用率｜%',metrics.filter(x=>x.dataset.startsWith('Transocean')).sort((a,b)=>a.period.localeCompare(b.period)).map(x=>[x.period,x.value]),100,'来源 [D03]，2026-08-05发布。3个非连续季度作分类比较，未补齐季度不连线。');
P('2026Q2为78.2%，较2026Q1的86.7%下降8.5个百分点，较2025Q2的67.3%上升10.9个百分点。原报告定义为作业天数占平台日历天数比例。它反映公司船队，并不是全市场利用率，也不等于收入效率。');
H('5 地图数据能否真正获取');
T(['服务','实测结果','数据时效及限制'],[
['SODIR FactMaps [G01]','通过10808代理、无需登录，实际返回3个油气田要素与几何；不是只读取介绍页','具有名称、运营机构、状态、官方事实页链接；更新时间不等于投产时间；仅抽样'],
['EMODnet 海上风场 [G02]','直连、无需登录，实际返回2个风场要素及属性','样例含国家、容量、状态；updateyear=2024，不能标为实时数据'],
['新闻项目坐标','本轮未从每篇新闻提取坐标','只能定位到国家/海域时显示聚合，不猜测设施位置']]);
P('这两个服务可以称为“本次无认证读取成功的公开空间服务”。是否开放读取、能否长期稳定访问、授权是否允许特定用途，是三个不同问题。地图要素不自动构成投资或供货关系；关系仍需公告正文证据。');
H('6 渠道可靠性与接入建议总表');
P('表中“可信度”按发布主体与资料类型判断，不是统一分数；“最新”只指本轮实际确认的样例，不承诺该站全部资料已检查。一次返回200也可能只是文档、登录页或空壳页面，只有取得条目、正文、表格或要素才提升验证等级。');
const groups={rss:['RSS订阅','E8F5EF'],api:['API / 数据服务','EAF2FC'],web:['官网栏目','F1EDF8'],download:['官方文件下载','FCF3DF'],manual:['手动 / 授权渠道','EDF0F3']};
for(const [key,[label,fill]] of Object.entries(groups)){
 H('6.'+(Object.keys(groups).indexOf(key)+1)+' '+label,2);
 T(['来源 / 可信度','实测与近期/历史','建议与限制'],ledger.filter(l=>old.sources.find(s=>s.id===l.id).group===key).map(l=>[l.name+(l.id==='S26'?'':' ['+l.id+']')+'。'+l.authority,l.probe+'；'+l.latest+'；'+l.history,l.decision+'。'+l.note]),fill);
}
H('7 本轮修正、缺口与后续采集策略');
T(['发现','本轮结论','下一步应怎样使用'],[
['Northern Lights旧目录404','已找到并验证 /newsroom/ 正确入口','更新渠道目录，保留旧链接失败记录'],
['SODIR直连超时','代理下空间要素查询成功，公告网页仍受限','空间与资讯分开登记可用状态，不能用一个成功代表全站成功'],
['IRENA证书失败','未关闭证书校验，本次自动获取未成功','暂人工下载或排查证书链，不能标已接入'],
['IEA/OPEC/OE返回403','资料可能权威，但当前自动采集不稳定','人工、订阅或正式数据交付作为备选'],
['国家能源局某页面200但正文依赖动态加载','状态码不代表已取得正文','优先本轮已成功读取的发布会和统计正文'],
['RSS只覆盖近期窗口','129条是采集快照，非完整历史样本','增量留存并补齐历史，再做资讯量变化分析'],
['付费机构与社媒','只核查入口/产品文档，未使用账号调用','授权或采购后单独验证历史跨度、字段和更新频率']]);
P('建议按“先趋势、再事件、最后扩展覆盖”推进：先用已取得的公开时序与官方报告形成可追溯图表；再用RSS和企业公告形成事件与关系；对深度市场指标确有需求时再采购商业数据。研究报告必须区分数据变化、资料覆盖变化和机构预测。');
P('稳定性尚未完成长期观察。后续上线验收建议覆盖连续多个更新周期，记录应到/实到、正文解析成功、延迟、改版及修订；本轮不虚构通过率。各来源都保存原文版本与发布时间，数据修订不静默覆盖既有研究快照。');
H('附录：交付文件与复核入口');
T(['文件','内容'],[['本报告 PDF / Word / HTML','业务结论、近期样例、四类真实趋势图与33项渠道台账'],['渠道核验与真实趋势数据.xlsx','渠道核验、趋势数据、资讯元数据三个工作表'],['trend-data.csv / JSON',metrics.length+'条数值观察；含统计期、单位、原值、发布日期和来源'],['recent-news-metadata.csv',news.length+'条RSS元数据；含日期异常和主题候选标记'],['channel-reliability.csv','33项渠道的独立可用性与可信度结论'],['channel-probes.json / supplement-probes.json','36个初始入口与10个补充入口的实际结果及检查时刻'],['G01-features.json / G02-features.json','本次公开空间服务返回的3个及2个要素样例']]);
P('所有样例均为此次实际获取或明确注明的官方浏览核对值，没有向正式知识库导入，没有部署采集任务，也没有改变线上服务。近期新闻仅保留元数据并标记核验层级，不作为未经审查的既成事实。');
H('参考入口',2);
for(const id of ['D01','D03','D04','C24','C25','NO','G01','G02','N01','R01','R02','R03']){P(id+' '+refs[id][0]);P(refs[id][1]);}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(s){let r='',last=0,m,re=/\[([A-Z]+\d*)\]|https?:\/\/[^\s]+/g;while((m=re.exec(s))){r+=esc(s.slice(last,m.index));const u=m[1]?refs[m[1]]?.[1]:m[0];r+=u?`<a href="${esc(u)}">${esc(m[0])}</a>`:esc(m[0]);last=re.lastIndex;}return r+esc(s.slice(last));}
function runs(s){let r=[],last=0,m,re=/\[([A-Z]+\d*)\]|https?:\/\/[^\s]+/g;while((m=re.exec(s))){if(m.index>last)r.push(new TextRun(s.slice(last,m.index)));const u=m[1]?refs[m[1]]?.[1]:m[0];r.push(u?new ExternalHyperlink({link:u,children:[new TextRun({text:m[0],style:'Hyperlink'})]}):new TextRun(m[0]));last=re.lastIndex;}if(last<s.length)r.push(new TextRun(s.slice(last)));return r;}
const parts=[],doc=[],toc=[];
for(const [i,b] of blocks.entries()){
 if(b.type==='h'){const tag=b.level===0?'h1':b.level===1?'h2':'h3';parts.push(`<${tag} id="s${i}">${esc(b.text)}</${tag}>`);if(b.level===1)toc.push([i,b.text]);doc.push(new Paragraph({text:b.text,heading:b.level===0?HeadingLevel.TITLE:b.level===1?HeadingLevel.HEADING_1:HeadingLevel.HEADING_2,keepNext:true,spacing:{before:220,after:140}}));}
 if(b.type==='p'){parts.push('<p>'+inline(b.text)+'</p>');doc.push(new Paragraph({children:runs(b.text),spacing:{after:110,line:290}}));}
 if(b.type==='t'){parts.push(`<div class="wrap"><table><thead><tr>${b.heads.map(h=>`<th style="background:#${b.kind||'e9f2f5'}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r=>'<tr>'+r.map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>').join('')}</tbody></table></div>`);doc.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[b.heads,...b.rows].map((r,j)=>new TableRow({tableHeader:j===0,cantSplit:true,children:r.map(c=>new TableCell({shading:j===0?{fill:b.kind||'E9F2F5'}:undefined,margins:{top:85,bottom:85,left:90,right:90},children:[new Paragraph({children:runs(c),spacing:{line:275,after:50}})]}))}))}));doc.push(new Paragraph(''));}
 if(b.type==='chart'){
  const rows=b.rows;const width=840,height=rows.length>10?265:220,left=45,right=16,top=20,bottom=46,innerW=width-left-right,innerH=height-top-bottom;
  let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(b.title)}">`;
  for(let j=0;j<=4;j++){let y=top+innerH-j*innerH/4;svg+=`<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="#dae6ea"/><text x="${left-7}" y="${y+4}" text-anchor="end" font-size="10">${b.max*j/4}</text>`;}
  rows.forEach(([label,v],j)=>{let band=innerW/rows.length,x=left+j*band+band*.2,h=v/b.max*innerH;svg+=`<rect x="${x}" y="${top+innerH-h}" width="${band*.6}" height="${h}" fill="#25868e"/><text x="${x+band*.3}" y="${top+innerH-h-5}" text-anchor="middle" font-size="${rows.length>10?8:12}">${v}</text><text x="${x+band*.3}" y="${top+innerH+16}" text-anchor="middle" font-size="${rows.length>10?8:11}">${label}</text>`;});svg+='</svg>';
  parts.push(`<figure><figcaption>${esc(b.title)}</figcaption>${svg}<p>${inline(b.note)}</p></figure>`);
  doc.push(new Paragraph({text:b.title,keepNext:true}));doc.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[['统计期','数值'],...rows.map(([p,v])=>[p,String(v)])].map((r,j)=>new TableRow({tableHeader:j===0,children:r.map(c=>new TableCell({children:[new Paragraph(c)]}))}))}));doc.push(new Paragraph({children:runs(b.note)}));
 }
}
const css=`*{box-sizing:border-box}body{font:15px/1.85 "Microsoft YaHei",sans-serif;margin:0;background:#eef3f5;color:#243e4a}nav{position:fixed;inset:0 auto 0 0;width:240px;background:#143848;padding:26px 18px;color:white;overflow:auto}nav a{display:block;color:#c2dce5;font-size:12px;text-decoration:none;padding:8px 0}main{margin:28px 24px 50px 264px;padding:40px;max-width:1130px;background:#fff}h1{font-size:29px;line-height:1.5;color:#145a68}h2{font-size:23px;margin-top:38px;border-bottom:2px solid #d8e7eb;padding-bottom:10px;color:#185e6e}h3{font-size:17px;color:#216c79;margin-top:26px}p{overflow-wrap:anywhere}a{color:#187d88;overflow-wrap:anywhere}table{table-layout:fixed;border-collapse:collapse;width:100%;font-size:12px;line-height:1.8}td,th{border:1px solid #d6e3e8;padding:10px;vertical-align:top;overflow-wrap:anywhere;text-align:left}td:first-child,th:first-child{width:25%}tr:nth-child(even){background:#f7fafb}.wrap{overflow:auto;margin:18px 0}figure{margin:20px 0;padding:17px;border:1px solid #d8e7eb;background:#f4f9fa;break-inside:avoid}figcaption{font-size:14px;font-weight:bold;color:#1c6470}figure svg{display:block;width:100%;height:auto;margin:15px 0}svg text{font-family:"Microsoft YaHei",sans-serif;fill:#3a5a69}figure p{font-size:12px;margin:5px 0}.print{position:fixed;right:16px;top:10px;background:#1b747b;color:white;border:0;padding:10px 14px;border-radius:5px}@media screen and (max-width:900px){nav{position:static;width:auto;max-height:180px}nav a{display:inline-block;margin-right:10px}main{margin:12px;padding:20px 16px}h1{font-size:25px}.wrap table{min-width:600px}.print{position:static;margin:10px}figure{padding:10px}figure svg{min-width:600px}figure{overflow:auto}}@media print{nav,.print{display:none}main{margin:0;padding:0;max-width:none}body{background:white;font-size:10pt;line-height:1.8}h1{font-size:25pt}h2{font-size:17pt;break-after:avoid}h3{font-size:12pt;break-after:avoid}table{font-size:8.4pt}td,th{padding:8px}tr{break-inside:avoid}p{widows:3;orphans:3}.wrap{overflow:visible}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}@page{size:A4;margin:17mm 15mm 18mm}`;
fs.writeFileSync(path.join(out,base+'.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${base}</title><style>${css}</style></head><body><nav><strong>渠道可靠性与趋势数据<br>实测报告 · 2026.10.07</strong>${toc.map(([i,t])=>`<a href="#s${i}">${esc(t)}</a>`).join('')}</nav><button class="print" onclick="print()">打印 / 保存PDF</button><main>${parts.join('\n')}</main></body></html>`);
fs.writeFileSync(path.join(out,'report-content.json'),JSON.stringify({blocks,refs,ledger,metrics_count:metrics.length,news_count:news.length},null,2));
(async()=>{
 const d=new Document({title:base,styles:{default:{document:{run:{font:'Microsoft YaHei',size:21}}}},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:950,bottom:950,left:900,right:900}}},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:'渠道可靠性与趋势数据核验 · 2026-10-07  |  ',size:17}),new TextRun({children:[PageNumber.CURRENT],size:17})]})]})},children:doc}]});fs.writeFileSync(path.join(out,base+'.docx'),await Packer.toBuffer(d));
 const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),p=await b.newPage({viewport:{width:1440,height:1000}});await p.goto(require('url').pathToFileURL(path.join(out,base+'.html')).href);await p.pdf({path:path.join(out,base+'.pdf'),preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:8px;width:100%;text-align:center;color:#627c86">渠道可靠性与趋势数据核验　<span class="pageNumber"></span> / <span class="totalPages"></span></div>'});
 const desktop=await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);await p.setViewportSize({width:390,height:844});const mobile=await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);await b.close();console.log(JSON.stringify({metrics:metrics.length,eia:monthly.length,news:news.length,dateAnomalies:anomalies.length,desktop,mobile,out}));
})().catch(e=>{console.error(e);process.exit(1)});
