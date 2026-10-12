export function dateRangeStart(range,now=new Date()){
 const days={'3d':3,'1w':7,'2w':14};if(days[range])return new Date(now.getTime()-days[range]*86400000);
 const months={'1m':1,'3m':3,'6m':6,'1y':12};return months[range]?new Date(now.getFullYear(),now.getMonth()-months[range],now.getDate()):null;
}
