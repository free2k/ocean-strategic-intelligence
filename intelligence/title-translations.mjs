// Editorial title translations for the first collection. Original evidence stays unchanged.
const titles = {
  doc_5fa769fdbb7678854950: 'Northern Lights与Öresundskraft签署瑞典二氧化碳运输与封存协议',
  doc_83d47e69c6f85b6d25bf: '探访Northern Lights二氧化碳运输与封存设施',
  doc_71199d7f84a4c1ee0a31: 'Northern Purpose号抵达挪威',
  doc_2caef4ab077f80e54bdc: '期租合同授予工作完成',
  doc_0a38bdf1da0ae1cd890d: 'Northern Phoenix号在挪威卑尔根举行欢迎及祈福仪式',
  doc_3a939a6d4a197d618ba2: 'Northern Lights首次注入来自污水处理的二氧化碳',
  doc_f5e1bb3c20328f993f83: 'Northern Lights二期：扩大欧洲二氧化碳封存能力',
  doc_4932c66bce150c382659: 'Northern Lights举行二氧化碳运输船队扩充签约仪式',
  doc_52414a56734e578d5d81: 'Northern Lights新增四艘二氧化碳运输船',
  doc_3051f7576909039ef263: '巴西企业新增Petrobras业务，在手订单总额超过20亿美元',
  doc_21d987711e6703348007: 'Yinson Production发行14.6亿美元FPSO项目债券，创行业首个非巴西项目案例',
  doc_0619ada45f325da5fc78: 'Lamprell委托IMI制造海上平台及导管架',
  doc_79cc0ff18471d3c7c02c: '用于工业脱碳的“全球首座”碳捕集与封存平台矗立英国近海',
  doc_fbb28e8ce3d5e5ec20b5: 'Excelerate委托Seatrium改装浮式储存再气化装置，另有一艘在考虑中',
  doc_f34906ea4ce69b0d542f: 'Subsea7为特立尼达和多巴哥海底开发项目聘用EnerMech',
  doc_8340fa72eb681edbe7ca: 'XOCEAN在日本建立战略联盟，扩大无人水面艇应用',
  doc_f261a14e68f4d11e732b: 'Rockhopper承诺投入4400万美元，用于福克兰群岛油田项目第二艘FPSO',
  doc_f1794960af50f365bdc7: 'Valaris钻井平台在北海、澳大利亚和苏里南获得更多作业合同',
  doc_65b44ff0774bc85a3c45: '沿海僵局：加州基础设施禁令与海湾地区阻力引发能源拉锯',
  doc_56022641654bfaa543af: '荷兰方面为海湾地区油气作业设计超浅吃水潜水支持船',
  doc_f05345584b1e5b1c460f: '新加坡企业购入Argus电动作业级水下机器人，拟部署至波斯湾',
};
export function translatedDoc(doc) {
  return titles[doc.id] ? {...doc, titleZh: titles[doc.id], titleTranslation: '人工整理译题；正文及证据保留原文'} : doc;
}
export function translatedData(data) {
  const documents = data.documents.map(translatedDoc), byId = new Map(documents.map(d => [d.id, d]));
  return {...data, documents, events: data.events.map(e => {
    const d = byId.get(e.documentId);
    return d && e.title === d.title && d.titleZh !== d.title ? {...e, title: d.titleZh, originalTitle: d.title} : e;
  })};
}
