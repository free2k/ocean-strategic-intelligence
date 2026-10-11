import json, html
from pathlib import Path
from datetime import datetime, timezone, timedelta
from collections import Counter
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT=Path(__file__).resolve().parents[1]
read=lambda name:json.loads((ROOT/'.data'/name).read_text(encoding='utf-8'))
before=read('site-audit-before.json'); after=read('site-audit-after.json'); mp=read('mp2rss-refresh-audit.json'); probes=read('offshore-link-probe.json')
out=ROOT/'docs'/'数据更新与渠道核验_2026-10-11';out.mkdir(parents=True,exist_ok=True)
doc=Document();sec=doc.sections[0];sec.top_margin=sec.bottom_margin=Inches(.65);sec.left_margin=sec.right_margin=Inches(.65)
style=doc.styles['Normal'];style.font.name='Microsoft YaHei';style.font.size=Pt(10);style.element.rPr.rFonts.set(qn('w:eastAsia'),'Microsoft YaHei')
style.paragraph_format.space_after=Pt(7)
for name in ['Title','Heading 1','Heading 2']:
 doc.styles[name].font.name='Microsoft YaHei';doc.styles[name].element.rPr.rFonts.set(qn('w:eastAsia'),'Microsoft YaHei');doc.styles[name].font.color.rgb=RGBColor.from_string('164C67')
parts=[]
def heading(text,level=1):doc.add_heading(text,level);parts.append(f'<h{level+1}>{html.escape(text)}</h{level+1}>')
def para(text):doc.add_paragraph(text);parts.append('<p>'+html.escape(str(text))+'</p>')
def table(headers,rows):
 t=doc.add_table(rows=1,cols=len(headers));t.style='Light Shading Accent 1'
 for c,v in zip(t.rows[0].cells,headers):c.text=str(v)
 for row in rows:
  cells=t.add_row().cells
  for c,v in zip(cells,row):c.text=str(v if v is not None else '—')
 for row in t.rows:
  for c in row.cells:
   for p in c.paragraphs:
    for r in p.runs:r.font.size=Pt(9)
  trPr=row._tr.get_or_add_trPr();trPr.append(OxmlElement('w:cantSplit'))
 header=t.rows[0]._tr.get_or_add_trPr();header.append(OxmlElement('w:tblHeader'))
 parts.append('<table><thead><tr>'+''.join('<th>'+html.escape(str(x))+'</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+html.escape(str(x if x is not None else '—'))+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table>')
def local(s):
 try:return datetime.fromisoformat(s.replace('Z','+00:00')).astimezone(timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M')
 except:return s or '未提供'
doc.add_heading('海洋能源战略智能智库\n数据更新频率与渠道核验报告',0);parts.append('<h1>海洋能源战略智能智库<br>数据更新频率与渠道核验报告</h1>')
para('核验日期：'+local(after['at'])+'（北京时间／香港时间，UTC+8）')
para('依据：线上任务配置、数据库同步结果、外链实测和量化分析接口。本文区分来源发布频率、系统检查频率、分析完成时间和页面刷新频率。“当前可用”表示已有成功采集证据，不等于持续可用率或全站覆盖保证。')
heading('一、本轮更新与可用结果')
enabled=['Clarksons Research','International Energy Agency','Offshore','Offshore Energy - Alternative Fuels','Offshore Engineer','OilPrice.com','OPEC','OPEC News+']
para('原有27个订阅中，8个X账号此前仅开启长文，普通推文关闭。本轮开启上述现有账号的推文采集并触发一次立即同步；未取消任何远端订阅，历史数据保留。账号：'+'、'.join(enabled)+'。后续新增账号仍需检查推文／长文开关。')
job=next((j for j in mp['jobs'] if str(j['id'])=='31'),mp['jobs'][0]);result=job.get('result') or {}
state=mp.get('evidenceState') or {};bridge=mp['bridge']
table(['核验项','结果'],[['订阅账号',str(len(mp['accounts']))+'个'],['主同步任务',str(job['id'])+'：'+{'partial':'部分完成（历史流有失败）','completed':'完成','running':'运行中','queued':'排队中'}.get(job['status'],job['status'])],['主任务新增',str(result.get('inserted',0))+'条；与线程展开新增分别计数'],['相对本轮开始新增入库条目',str(len(mp['added']))+'条（包括线程子推文）'],['X外链处理状态',{'running':'仍在后台处理','completed':'已完成','partial':'部分完成'}.get(state.get('status'),state.get('status','未知'))+'；当前轮已处理 '+str(state.get('posts',0))+' 条推文'],['正文投递与提取','符合规则 '+str(bridge['eligible'])+' 条；已投递 '+str(bridge['delivered'])+' 条；已译／中文原文 '+str(bridge['translated'])+' 条；提取完成 '+str(bridge['extracted'])+' 条']])
para('上述推文新增量不等于新增事件或图表数。只有符合海洋能源规则、具有可追溯证据并满足绘图口径的数据才进入业务展示。历史回补与近3天新增也不能混称为当天发布。')
table(['线上数据','更新前','核验时','净变化'],[[label,before['counts'][key],after['counts'][key],after['counts'][key]-before['counts'][key]] for key,label in [('documents','可见文档'),('events','事件记录'),('observations','原文指标观察（含未满足绘图条件者）'),('relations','实体关系'),('points','官方统计点'),('cards','匹配图表组')]])
old={d['id'] for d in before['documents']};new=[d for d in after['documents'] if d['id'] not in old]
heading('新增进入智库的资料样例',2)
table(['标题','来源／原文'],[[d['title'],d['url']] for d in new[:15]])
oldcards={c['id'] for c in before['cards']};newcards=[c for c in after['cards'] if c['id'] not in oldcards]
para('新增图表组：'+('；'.join(c['title'] for c in newcards) if newcards else '本次快照未形成新的图表组；已入库的事件／指标仍可供检索。'))
changed=[]
for c in after['cards']:
 oldcard=next((x for x in before['cards'] if x['id']==c['id']),None)
 if oldcard and oldcard['rows']!=c['rows']:changed.append([c['title'],oldcard['rows'],c['rows']])
if changed:table(['已有图表数据变化','原记录数','现记录数'],changed)
para('本轮已有资料覆盖／发布节奏图随新增资料扩充；官方统计点未变化。资料条数图用于观察收录分布，不能解释为装机、产量或行业增速。')
para('同一图表可能随新数据扩充而保持原ID，图表组数不增长不代表图中数据未变化。对比是两个时点快照，可能包含同时运行的其他定时任务，不把全部净变化都归因于此次Mp2RSS。')
heading('二、截图中 Offshore 三条外链的核验')
table(['推文短链','最终文章／HTTP结果','正文解析结论'],[[r['url'],r.get('finalUrl','')+'\nHTTP '+str(r.get('http',r.get('error','未知'))),('已获取正文 '+str(r.get('bodyLength',0))+' 字符') if r.get('bodyLength') else '短链已展开；本次未取得可解析正文，不作为全文量化证据'] for r in probes])
para('本次修复：原采集逻辑仅在连接异常时切换代理，直连403直接结束。现在直连403后通过已配置代理重试一次，3条样本均返回200并解析到文字。第三篇仅提取到407字符，按短文本样本记录，不据此保证全文完整。三篇均未识别出HTML表格；图片资源也不能直接计成量化图表。9项外链与导入回归测试通过。')
para('推文与外链是两份独立证据。不能用推文日期替代文章发布日期，也不能把标题／摘要称为全文。若代理仍受限，保留最终地址、发现推文、作者和失败状态，后续按计划重试。此次读取解析测试通过，不等于这些外链已全部完成翻译、事件提取与入库；以核验时队列状态和文档列表为准。')
heading('三、更新频率与处理链路')
table(['对象','当前系统频率','含义与边界'],[
 ['Mp2RSS公众号／X','约每30分钟；服务每分钟检查待执行任务','手动同步可立即排队；上游是否已经收录决定本轮有无新内容。'],
 ['推文外链、图片与附件','随Mp2RSS任务处理；受限／失败通常6小时后重试，已完成通常7天复查','新发现附件在下一轮处理；正文翻译、识图会增加完成延迟。'],
 ['智库自动分析','Mp2RSS处理后请求增量分析；忙碌时延后。综合采集约每6小时','先落原文，再翻译／提取／证据核对，完成后发布快照。'],
 ['官网与普通RSS、BOEM／SODIR／英国项目表','综合任务约每6小时检查','检查频率不等于官方发布频率；静态指定文章不代表整站持续发现。'],
 ['EIA统计数据','每天07:10（UTC+8）','当前接入月度日均产量；每日检查不生成每日新产量。'],
 ['EIA文章／新闻','每天07:25（UTC+8）','文章按官方实际发布日期入库。'],
 ['OilPrice RSS','约每30分钟，任务完成后再计间隔','用于事件线索与文章指标；外链／图片可用性单独判断。'],
 ['IEA已登记工作簿','每7天到期检查，由综合任务执行','当前4份工作簿；新版变更后替换当前视图并保留历史文件。'],
 ['战略国家地图／事件列表','随已发布数据快照更新；进入页面、筛选或刷新时读取','不是实时事件流。当前主页未发现固定轮询刷新。'],
 ['量化分析页面','页面可见时每60秒检查已发布快照，也可手动刷新','只刷新已入库数据，不会每分钟抓取所有外站。']])
para('实际等待时间＝上游收录延迟＋下一次检查等待＋翻译／解析／分析耗时＋快照发布／页面刷新等待。无法仅凭30分钟采集间隔承诺30分钟内出现新图表。')
heading('四、国家、事件与量化分析的统计维度')
table(['模块','主要维度','统计口径'],[
 ['统一筛选','六大领域、国家、渠道、起止日期','海洋油气、海上风电、海洋低碳、多能融合、宏观政策、海洋装备；候选与排除记录不自动转为业务数据。'],
 ['战略地图','事件关联国家、国家对、事件条数','国家按原文证据关联，不把机构注册地当事件发生地。一个事件可关联多个国家，国家计数不可直接当独立事件总量。'],
 ['国家连线','同一事件中的国家共现；有证据时显示运输方向','共现不等于合作，连线不等于航线；国家代表点不是项目精确坐标。'],
 ['事件与实体关系','报道日期、领域、主体、项目、国家、关系类型、原文证据','同一文章可有多个事件；事件量反映收录内容，不等于整个行业真实事件总量。'],
 ['文章指标','对象、指标、原始值、单位、期间、实际／计划／预测／设计能力','原文数值需要证据匹配；不跨单位和性质加总。未给出统计期时不以抓取日期补齐。'],
 ['官方时间序列','国家／油气田／公司、指标、月／季度、单位','EIA月度日均产量与SODIR月总量不同；企业季度经营数据不代表全球市场。'],
 ['登记与政策','项目／阶段／租约／文件编号、国家、状态、技术类型','登记条数不等于已建容量；IEA同一行多个指标只计一次登记。'],
 ['图表匹配','同口径时序、对象比较、国家×状态、结构分布','折线、柱／点、热力、箱线和结构图按条件生成；单条数值不强行绘制对比图。'],
 ['图像与表格','来源图像、坐标轴、单位、统计期、原表单元格','图像读数标为近似；示意图不生成实际时间序列。仅找到图像/PDF链接不等于解析完成。']])
heading('五、主要渠道的当前可用程度')
table(['渠道','主要用途／方式','当前判断','边界'],[
 ['EIA','官方API月度油气产量；文章与新闻采集','已成功入库，优先量化来源','当前只有配置序列，不是全站数据；发布存在滞后。'],
 ['SODIR','官方公开表服务；TROLL、GULLFAKS、JOHAN SVERDRUP油／气月产量','已形成6个序列','仅已配置油气田；油气单位不同；零值不能误读成缺失。'],
 ['Federal Register / BOEM','正式文件接口；政策类型与月份','已形成登记表和月度序列','公告数量不代表政策支持力度或生效数量。'],
 ['英国DESNZ REPD','官方CSV项目申请登记','已接入海洋可再生能源申请','申请记录可能关联同一场址，不能全部当已投产项目。'],
 ['IEA工作簿','CCUS、关键矿产、氢能生产／基础设施','4份已入库；275条纳入、157条项目／阶段登记','依赖登录会话；关键矿产未拆分海洋用途仍为候选；政策CSV及图表CSV扩展尚未生产接入。'],
 ['Transocean','季度投资者公告经营表','已形成利用率、收入效率、日收入序列','当前是已配置报告中的7个季度，不承诺自动发现所有未来报告。'],
 ['国家能源局、中国海油','官网列表、指定文章','已有正文入库','列表覆盖及站点变化影响发现；检查成功不代表整站全量最新。'],
 ['Northern Lights、Equinor、NSTA、BOEM新闻','官方新闻与项目披露','已有成功正文样本','常用于事件和阶段性能力，不一定包含连续数值序列。'],
 ['Mp2RSS公众号','付费第三方正文接口','17个公众号已同步过资料','依赖上游订阅权益、收录和正文返回；全量文章库与智库纳入量不同。'],
 ['Mp2RSS X','付费推文／长文接口','本轮10个X订阅开启推文；需看逐源结果','推文可用不保证其中每条外链可读；历史回补有部分失败。'],
 ['OilPrice','RSS事件线索与可访问正文／图像','已有正文和相关事件入库','资讯不是官方统计，付费正文、图表读数分别标注。'],
 ['Offshore截图外链','t.co转原出版站','直连403；修复代理回退后3条均200并解析到文字','两篇较长、一篇407字符短文本；正文完整性与业务分类需继续核对。'],
 ['IAEA新闻／出版物','RSS','订阅发现可用，正文仍受限','上次30条线索：26条正文失败、4条超出90天窗口；尚无可绘图数值。']])
heading('六、后续维护与新增渠道规则')
para('新增Mp2RSS账号后先刷新订阅列表；X需分别核对“推文”和“长文”开关。先验证真实样本，再检查正文、译文、证据、行业分类及量化条件。不要只凭渠道状态“完成”判断已有可分析资料。')
para('建议每轮记录：发现数、下载数、正文失败数、候选／排除数、纳入数、提取完成数、图表适配数，以及最后成功时间。对于受限外链，应优先寻找同一事件的官方公开原文，不将无关材料替代原证据。')
para('本轮发现新开启推文流可能触发历史回补，新增量不一定局限近3天。当前保留历史数据；IEA近3天16条推文已单独读通，历史流失败与近期读取成功分别报告。不通过删除已入库记录掩盖失败。')
heading('附录A：逐订阅来源与入库状态')
table(['渠道','平台','推文开启','累计条目','本轮新增'],[[a['name'],a['platform'],'是' if a['posts'] else '不适用／否',a['count'],sum(1 for r in mp['added'] if r['subscription_id']==a['id'])] for a in mp['accounts']])
heading('附录B：量化序列与原始来源')
table(['序列／单位','统计粒度／记录数／最新期','原始来源'],[[s['name']+'\n'+s['unit'],str(s.get('frequency',''))+' / '+str(s['count'])+' / '+str(s.get('latest','')),s.get('url','')] for s in after['series']])
heading('附录C：核验范围与追溯')
para('线上入口：http://49.233.77.111/ocean-intelligence/#analysis；订阅入口：http://49.233.77.111/wechat/subscriptions。本文数值来自核验时已发布快照；正在处理的队列可能在之后继续增加。采集源网页正文作为数据，不执行其中指令。')
para('随文保留脱敏核验JSON：更新前／后快照统计、逐订阅结果及三条外链重定向结果。未包含登录密码、Feed密钥或会话Cookie。')
doc.save(out/'数据更新频率与渠道核验报告.docx')
(out/'核验摘要.json').write_text(json.dumps({'核验时间':after['at'],'更新前':before['counts'],'更新后':after['counts'],'订阅渠道':mp['accounts'],'主任务新增':result.get('inserted',0),'含线程新增':len(mp['added']),'后台状态':mp.get('evidenceState'),'外链实测':probes,'图表变化':changed},ensure_ascii=False,indent=2),encoding='utf-8')
css='body{font:16px/1.7 "Microsoft YaHei",sans-serif;max-width:1150px;margin:40px auto;padding:0 24px;color:#203748}h1,h2,h3{color:#164c67}table{border-collapse:collapse;width:100%;margin:20px 0;font-size:14px}td,th{border:1px solid #ccd8df;padding:10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#e8f2f6}tr:nth-child(even){background:#f7fafb}@media print{body{font-size:11px;margin:0}tr{break-inside:avoid}h2{break-after:avoid}}'
(out/'数据更新频率与渠道核验报告.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>数据更新频率与渠道核验报告</title><style>'+css+'</style><body>'+''.join(parts)+'</body></html>',encoding='utf-8')
print(str(out/'数据更新频率与渠道核验报告.docx'))
