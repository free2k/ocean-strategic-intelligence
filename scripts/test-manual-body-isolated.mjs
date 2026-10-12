import assert from 'node:assert/strict';
import {pool,persistItem} from '../server/integrations/mp2rss-store.mjs';
import {compileRules} from '../intelligence/industry-classification.mjs';
// All persistence writes are redirected to a disposable schema, never live article tables.
const schema='test_body_'+Date.now(),originalConnect=pool.connect.bind(pool);
const admin=await originalConnect();
try{
 await admin.query(`CREATE SCHEMA ${schema}`);
 await admin.query(`CREATE TABLE ${schema}.articles (LIKE public.articles INCLUDING ALL); CREATE SEQUENCE ${schema}.article_seq; ALTER TABLE ${schema}.articles ALTER COLUMN id SET DEFAULT nextval('${schema}.article_seq'); CREATE TABLE ${schema}.article_chunks (article_id integer); CREATE TABLE ${schema}.items (id text PRIMARY KEY,subscription_id text,article_id integer,payload jsonb,content_hash text,classification jsonb,updated_at timestamptz DEFAULT now()); CREATE TABLE ${schema}.versions (id text,hash text,payload jsonb,PRIMARY KEY(id,hash)); CREATE TABLE ${schema}.manual_bodies(item_id text PRIMARY KEY REFERENCES ${schema}.items(id),body text,updated_at timestamptz DEFAULT now())`);
 pool.connect=async()=>{const client=await originalConnect();const query=client.query.bind(client);client.query=(sql,args)=>query(sql.replace(/\b(?:public|mp2rss)\./g,schema+'.'),args);const release=client.release.bind(client);client.release=()=>{client.query=query;release();};return client;};
 const item={key:'manual-test',kind:'mp_article',source:{platform:'mp'},title:'海上风电项目测试',url:'https://example.invalid/test-body',publishedAt:'2026-10-01T00:00:00Z',content:'',author:'test'};
 const source={id:'test',source_id:1};const rules=compileRules({rules:[]});
 await persistItem(source,item,rules);
 const content='海上风电项目的原始正文，保留装机容量、统计单位与项目来源。'.repeat(12)+'\n推荐阅读\n不属于正文的推荐内容';
 await persistItem(source,item,rules,{manualBody:content});
 let row=(await admin.query(`SELECT * FROM ${schema}.items WHERE id='manual-test'`)).rows[0];
 assert.equal(row.payload.bodyOrigin,'manual');assert.equal(row.payload.contentStatus,'complete');assert.ok(!row.payload.content.includes('不属于正文'));assert.equal(row.payload.originalContent,content);
 const previousHash=row.content_hash;
 await persistItem(source,{...item,content:'供应商后来返回的摘要'},rules);
 row=(await admin.query(`SELECT * FROM ${schema}.items WHERE id='manual-test'`)).rows[0];assert.equal(row.content_hash,previousHash);assert.equal(row.payload.originalContent,content);
 const article=(await admin.query(`SELECT content FROM ${schema}.articles WHERE id=$1`,[row.article_id])).rows[0];assert.ok(article.content.includes('装机容量'));
 console.log('Isolated database: manual body persistence, cleaning, reclassification and sync protection passed');
}finally{pool.connect=originalConnect;await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);admin.release();await pool.end();}
