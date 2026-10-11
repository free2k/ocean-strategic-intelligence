export const sources=[
 {id:'nea',name:'国家能源局',country:'CN',level:'S1',language:'zh',method:'web',url:'https://www.nea.gov.cn/',scope:'官网首页及新能源司列表增量发现；保留原始出处，不代表全站覆盖',discoverPages:['https://www.nea.gov.cn/','https://www.nea.gov.cn/sjzz/xny/index.htm'],allowedHosts:['www.nea.gov.cn','nfj.nea.gov.cn'],seeds:['https://www.nea.gov.cn/20260807/76699679f8b84ecd92d686226d1ef8f2/c.html','https://www.nea.gov.cn/20260612/988816c0556748508bcb830948af8b1e/c.html','https://nfj.nea.gov.cn/xwzx/jgdt/202605/t20260506_300591.html']},
 {id:'cnooc',name:'中国海油',country:'CN',level:'S2',language:'zh',method:'web',url:'https://ltd.cnooc.com.cn/',scope:'上市公司首页及年度新闻列表；不含集团全站，不等于全国海上统计',discoverPages:['https://ltd.cnooc.com.cn/',`https://ltd.cnooc.com.cn/xwzx/gsxw/${new Date().getFullYear()}/`]},
 {id:'norlights',name:'Northern Lights',country:'NO',level:'S2',language:'en',method:'rss',url:'https://norlights.com/feed/',scope:'海底CO₂运输与封存项目官方公告',sitemap:'https://norlights.com/post-sitemap.xml'},
 {id:'offshore',name:'Offshore Energy',country:'GLOBAL',level:'S4',language:'en',method:'rss',url:'https://www.offshore-energy.biz/feed/',scope:'行业媒体；海上油气、风电、CCS，关系需原始公告复核'},
];
