import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
export async function verifyLowCarbonEnvironment({bootstrap=false}={}){
 if(process.env.APP_ID!=='low-carbon')throw Error('LOW_CARBON_PROFILE_REQUIRED');
 const expected=process.env.LC_INSTANCE_ID,root=process.env.LC_DATA_ROOT;
 if(!expected||!root||!path.isAbsolute(root)||!process.env.LC_SESSION_SECRET||!process.env.SITE_PASSWORD)throw Error('LOW_CARBON_CONFIGURATION_INCOMPLETE');
 const urls=['DATABASE_URL','INTEL_DATABASE_URL','INTEL_AUDIT_DATABASE_URL'].map(k=>{const value=process.env[k];if(!value)throw Error('LOW_CARBON_DATABASE_REQUIRED:'+k);const u=new URL(value);if(decodeURIComponent(u.pathname.slice(1))!=='low_carbon_kb'||!['55432','55433'].includes(u.port)||u.hostname!=='127.0.0.1'||u.username!=='lc_app')throw Error('LOW_CARBON_DATABASE_IDENTITY_REJECTED');return u.href;});
 if(new Set(urls).size!==1)throw Error('LOW_CARBON_DATABASES_MUST_MATCH');
 if(root!=='/opt/low-carbon/data')throw Error('LOW_CARBON_DATA_ROOT_REJECTED');
 const rootReal=await fs.realpath(root);if(rootReal!==root)throw Error('LOW_CARBON_DATA_ROOT_REJECTED');
 const marker=JSON.parse(await fs.readFile(path.join(root,'instance.json'),'utf8'));if(marker.appId!=='low-carbon'||marker.instanceId!==expected)throw Error('LOW_CARBON_FILESYSTEM_IDENTITY_REJECTED');
 for(const [key,subdir] of Object.entries({INTEL_DATA_DIR:'intelligence',INTEL_RESEARCH_ARCHIVE:'research',LC_LOCK_DIR:'locks'})){const value=process.env[key];if(value!==path.join(root,subdir))throw Error('LOW_CARBON_PATH_REJECTED:'+key);const actual=await fs.realpath(value);if(actual!==value)throw Error('LOW_CARBON_PATH_REJECTED:'+key);}
 if(process.env.INTEL_ALLOW_NO_AUTH==='true'||process.env.MP2_RSS_LINK||process.env.MP2_RSS_EXTRA_LINKS&&process.env.MP2_RSS_EXTRA_LINKS!=='[]')throw Error('LOW_CARBON_UNVERIFIED_PROVIDER_OR_AUTH');
 const pool=new pg.Pool({connectionString:urls[0],max:1,connectionTimeoutMillis:5000});
 try{const row=(await pool.query('SELECT current_database() name,inet_server_port() port')).rows[0];if(row.name!=='low_carbon_kb'||String(row.port)!==new URL(urls[0]).port)throw Error('LOW_CARBON_DATABASE_IDENTITY_REJECTED');
  if(!bootstrap){const identity=(await pool.query("SELECT instance_id FROM public.app_instance WHERE app_id='low-carbon'")).rows[0];if(identity?.instance_id!==expected)throw Error('LOW_CARBON_INSTANCE_REJECTED');}
 }finally{await pool.end();}
 return {appId:'low-carbon',instanceId:expected,dataRoot:rootReal};
}
