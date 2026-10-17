// Offer only encodings supported by the actual dimensions and measurement scale.
export function availableViews(card){
 const rows=card.rows||[];
 if(card.id==='fleet')return ['multiTrend','scatter','parallel','bar'];
 if(card.renderer==='series')return ['line','bar',...(card.types||[]).filter(t=>!['line','bar'].includes(t))];
 if(card.renderer==='metric-comparison')return ['dot','bar',...(card.types||[]).filter(t=>!['dot','bar'].includes(t))];
 if(card.renderer==='calendar')return ['calendar','dailyLine','dailyBar'];
 if(card.renderer==='registry-count')return ['bar','pie','treemap'];
 if(card.renderer==='official-distribution')return [...card.types,...(card.types.includes('countryBar')?['countryPie']:[]),...(card.types.includes('statusBar')?['statusPie']:[])];
 if(card.id==='lease-year')return ['heatmap','stackedBar'];
 if(card.id==='geography')return ['map','countryRank','countryTiles'];
 if(card.types?.includes('graph'))return ['graph','graphCircular'];
 if(card.id==='coverage')return ['sankey','sourceBar'];
 if(card.id==='reports-宏观政策')return ['scatter','monthlyBar','monthlyLine'];
 if(card.types?.length===1&&card.types[0]==='tree')return ['tree','radialTree'];
 if(card.id==='buzios-share')return ['pie','shareBar'];
 if(card.id==='ccs-plan')return ['bar','valueDot'];
 // Hierarchies, lease breakdowns and official comparable cohorts already have alternatives.
 return [...(card.types||[])];
}
