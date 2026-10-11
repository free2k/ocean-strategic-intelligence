import test from 'node:test';
import assert from 'node:assert/strict';
import {feedDate,parseFeed} from '../server/integrations/oilprice.mjs';
import {parseArticle,imageMime} from '../server/integrations/x-evidence.mjs';
import {xEvidenceView} from '../intelligence/public/x-evidence-view.js';
test('RSS dates respect Chicago DST and never substitute collection time',()=>{
 assert.equal(feedDate('Fri, 09 Oct 2026 16:30:00 America/Chicago'),'2026-10-09T21:30:00.000Z');
 assert.equal(feedDate('Fri, 09 Jan 2026 16:30:00 America/Chicago'),'2026-01-09T22:30:00.000Z');
 assert.equal(feedDate('bad'),null);assert.equal(feedDate(''),null);
});
test('feed parser retains summaries and accepts only original OilPrice article URLs',()=>{
 const result=parseFeed('<rss><channel><item><title>Offshore &amp; LNG</title><link>https://oilprice.com/Energy/test.html?utm_source=rss</link><description><![CDATA[<p>Summary</p>]]></description><pubDate>bad</pubDate></item><item><link>http://127.0.0.1/test.html</link></item></channel></rss>');
 assert.equal(result.length,1);assert.equal(result[0].url,'https://oilprice.com/Energy/test.html');assert.equal(result[0].summary,'Summary');assert.equal(result[0].publishedAt,null);assert.equal(result[0].content,undefined);
 assert.throws(()=>parseFeed('<html>blocked</html>'));
});
test('article tables and charts preserve evidence without creating synthetic series',()=>{
 const html=`<html><head><title>Offshore LNG</title></head><body><article><h1>Offshore LNG</h1><p>${'Offshore gas capacity is planned, not actual production. '.repeat(20)}</p><figure><img src="/chart.png" alt="LNG capacity forecast"><figcaption>Source: company report</figcaption></figure><table><tr><th>Year</th><th>Mtpa</th></tr><tr><td>2030</td><td>10</td></tr></table></article></body></html>`;
 const p=parseArticle(html,'https://oilprice.com/Energy/test.html');assert.equal(p.assets[0].url,'https://oilprice.com/chart.png');assert.equal(p.tables[0].rows[1][1],'10');assert.equal(p.tables[0].automaticSeries,false);assert.equal(p.publishedAt,null);
});
test('OilPrice adapter excludes related reads, author sidebar and market widgets',()=>{
 const p=parseArticle(`<html><head><title>Report</title></head><body><main><aside>Author biography and offshore wind unrelated</aside><div id="article-content"><p>${'Offshore oil production report. '.repeat(20)}</p><figure><img src="/chart.png"><figcaption>Source: company</figcaption></figure><p>More Top Reads From Oilprice.com</p><ul><li>Unrelated macro policy</li></ul></div><div>BUY STOCK NOW</div></main></body></html>`,'https://oilprice.com/report.html');
 assert.ok(!p.content.includes('Unrelated'));assert.ok(!p.content.includes('biography'));assert.ok(!p.content.includes('BUY STOCK'));assert.equal(p.assets[0].caption,'Source: company');
});
test('RSS provenance is labelled as RSS and quotes are escaped in evidence UI',()=>{
 const html=xEvidenceView({url:'https://oilprice.com/a.html',provenance:[{provider:'OilPrice RSS',subscriptionName:'OilPrice',feedUrl:'https://oilprice.com/rss/main',articleUrl:'https://oilprice.com/a.html',feedPublishedAt:'2026-10-10',relation:'rss'}],references:[{url:'https://example.org',label:'<script>test</script>'}]});
 assert.ok(html.includes('RSS 发现入口'));assert.ok(!html.includes('的推文'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('尚未逐项核实'));
});
test('news pages use their own body container and keep inline chart evidence',()=>{
 const p=parseArticle(`<html><head><title>Offshore news</title></head><body><main><div id="news-content"><html><body><p>${'Offshore production update. '.repeat(20)}</p><p><img src="/chart.png" alt="Production chart"></p><p>More Top Reads From Oilprice.com</p><ul><li>Unrelated article</li></ul></body></html></div><aside>BUY STOCK</aside></main></body></html>`,'https://oilprice.com/Latest-Energy-News/test.html');
 assert.equal(p.assets.length,1);assert.ok(!p.content.includes('Unrelated'));assert.ok(!p.content.includes('BUY STOCK'));
});
test('CDN octet-stream image bytes have a verified MIME type without trusting suffixes',()=>{
 assert.equal(imageMime(Buffer.from('ffd8ffe000104a464946','hex')),'image/jpeg');
 assert.equal(imageMime(Buffer.from('89504e470d0a1a0a','hex')),'image/png');
 assert.equal(imageMime(Buffer.from('RIFF0000WEBP')),'image/webp');
 assert.equal(imageMime(Buffer.from('<html>Access denied</html>')),null);
});
