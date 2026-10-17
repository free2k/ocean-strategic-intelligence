import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const words=['海洋','海上','海底','深海','深水','近海','海工','海域','蓝碳','船用','岸电','offshore','subsea','deepwater','deep water','deep-water','ocean','marine','blue carbon','Northern Lights','FPSO','FSRU','seabed'];
try{await pool.query('BEGIN');await pool.query('LOCK TABLE public.filter_rules IN SHARE ROW EXCLUSIVE MODE');
const existing=await pool.query("SELECT id FROM public.filter_rules WHERE type='context'");
if(!existing.rows.length){const r=await pool.query("INSERT INTO public.filter_rules(type,topic,description,title_keywords,content_keywords,priority,require_all,groups,enabled) VALUES('context',NULL,$1,$2,$2,0,false,'[]',true) RETURNING id",['通用海洋语境关键词：供六个行业共用，只检查海洋场景，不直接决定行业。标题或正文前1800字符任意命中；仍需正向行业规则且不得命中反向排除。',JSON.stringify(words)]);console.log(JSON.stringify({created:r.rows[0].id,keywords:words.length}));}else console.log(JSON.stringify({existing:existing.rows.map(r=>r.id),unchanged:true}));
await pool.query('COMMIT');}catch(e){await pool.query('ROLLBACK');throw e;}finally{await pool.end();}
