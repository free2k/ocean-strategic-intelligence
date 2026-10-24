// Public baseline readings, fetched independently. Dates come from the page.
export const baselineSources=[
 {name:'Northern Lights · CCUS项目',url:'https://norlights.com/news/northern-lights-jv-has-successfully-stored-first-co%E2%82%82/',country:'NO'},
 {name:'IEA · 能效研究',url:'https://www.iea.org/reports/energy-efficiency-2025/industry'},
 {name:'IEA · 清洁能源研究',url:'https://www.iea.org/reports/renewables-2025'},
 {name:'IEA · 数字能源研究',url:'https://www.iea.org/articles/energy-efficiency-and-digitalisation'},
 {name:'工信部 · 绿色设计',url:'https://www.miit.gov.cn/zwgk/zcjd/art/2026/art_80a7194a21fb44dc8f46973b9dff19e3.html',country:'CN'},
 {name:'生态环境部 · 碳市场',url:'https://www.mee.gov.cn/ywgz/ydqhbh/wsqtkz/202601/t20260101_1139528.shtml',country:'CN'},
 {name:'国家发展改革委 · 节能装备',url:'https://www.ndrc.gov.cn/xxgk/jd/jd/202504/t20250402_1396969_ext.html',country:'CN'},
 {name:'工信部 · 数字化能碳管理',url:'https://www.miit.gov.cn/zwgk/zcjd/art/2025/art_343b12d5e9f249449391c46cf0327e88.html',country:'CN'}
].map((s,i)=>({...s,id:'lc-official-'+(i+1),method:'official',level:'S1',scope:'公开低碳技术与政策原文；非实时统计'}));
