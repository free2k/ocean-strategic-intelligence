export function inPeriodWindow(period,filters={}){
 let start,end;const q=period.match(/^(\d{4})-Q([1-4])$/);if(q){const y=Number(q[1]),m=(Number(q[2])-1)*3;start=`${y}-${String(m+1).padStart(2,'0')}-01`;end=new Date(Date.UTC(y,m+3,0)).toISOString().slice(0,10);}else if(/^\d{4}-\d{2}$/.test(period)){start=period+'-01';const [y,m]=period.split('-').map(Number);if(m<1||m>12)return false;end=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);}else if(/^\d{4}$/.test(period)){start=period+'-01-01';end=period+'-12-31';}else if(/^\d{4}-\d{2}-\d{2}$/.test(period)&&Number.isFinite(Date.parse(period))&&new Date(period).toISOString().slice(0,10)===period){start=end=period;}else return false;
 return (!filters.from||end>=filters.from)&&(!filters.to||start<=filters.to);
}
