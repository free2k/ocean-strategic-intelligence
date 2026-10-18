import test from 'node:test';import assert from 'node:assert/strict';
import {publicationDates,eventDates} from '../temporal-dates.mjs';
import {parseArticle} from '../../server/integrations/x-evidence.mjs';
import {normalizeExtraction} from '../core.mjs';
test('activity dates remain separate from publication including historical dates',()=>{
 for(const now of ['2026-10-18','2027-01-01']){const r=publicationDates({url:'https://www.iea.org/events/training',publishedAt:'2026-11-23T08:00:00Z'},now);assert.equal(r.publishedAt,null);assert.equal(r.scheduledAt,'2026-11-23T08:00:00Z');}
 const r=publicationDates({url:'https://example.com/news/x',publishedAt:'2027-01-01'},'2026-10-18');assert.equal(r.publishedAt,null);assert.equal(r.originalPublishedAt,'2027-01-01');assert.equal(r.scheduledAt,null);
});
test('event parser does not borrow arbitrary page time as publication',()=>{
 const r=parseArticle('<html><head><title>Training</title><script type="application/ld+json">{"@type":"Event","startDate":"2026-11-23T08:00:00Z"}</script></head><body><time datetime="2026-11-23T08:00:00Z">Training starts</time><p>Training details</p></body></html>','https://www.iea.org/events/training');assert.equal(r.publishedAt,null);assert.equal(r.scheduledAt,'2026-11-23T08:00:00Z');
 const news=parseArticle('<html><head><meta property="article:published_time" content="2020-01-01"><title>News</title></head><body><p>News text</p></body></html>','https://example.com/news');assert.equal(news.publishedAt,'2020-01-01T00:00:00.000Z');
});
test('contract delivery date is not signing date, even after the planned date passes',()=>{
 const r=eventDates({occurredAt:'2027-01-01',publishedAt:'2026-08-24',dateQuote:'Supplies will be from 1 January 2027'});assert.equal(r.occurredAt,null);assert.equal(r.scheduledAt,'2027-01-01');assert.equal(r.dateQuote,'Supplies will be from 1 January 2027');
 assert.equal(eventDates({occurredAt:'2026-10-16',publishedAt:'2026-10-15T16:00:00Z'}).occurredAt,'2026-10-16');
});
test('new extracted future date retains evidence as schedule, never occurrence',()=>{
 const text='Supplies under the new agreement will be from 1 January 2027 to 31 December 2041';const r=normalizeExtraction({id:'d',versionId:'v',topic:'海洋油气',publishedAt:'2026-08-24',content:text},{events:[{titleZh:'签约',quote:text,eventDate:'2027-01-01',dateQuote:text}]});assert.equal(r.events[0].eventDate,null);assert.equal(r.events[0].scheduledAt,'2027-01-01');assert.equal(r.events[0].dateEvidenceIds.length,1);
});
