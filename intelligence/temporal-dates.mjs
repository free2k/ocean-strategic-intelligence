// Keep source dates, but never label an activity schedule as publication/occurrence.
export function publicationDates(record, now=new Date().toISOString()) {
 const raw=record.originalPublishedAt||record.publishedAt;
 let eventPage=false;try{eventPage=/\/events?\//i.test(new URL(record.url).pathname);}catch{}
 const explicit=['article:published_time','datePublished','rss'].includes(record.publishedDateSource);
 const future=Number.isFinite(Date.parse(raw))&&Date.parse(raw)>Date.parse(now);
 const activity=eventPage&&!explicit&&raw;
 if(activity||future)return {...record,publishedAt:null,originalPublishedAt:raw,scheduledAt:record.scheduledAt||(activity?raw:null),publicationDateStatus:activity?'activity_date':'future_unverified'};
 return record;
}
export function eventDates(event, publication=event.publishedAt) {
 const raw=event.eventDate||event.occurredAt;
 const day=v=>!v||!Number.isFinite(Date.parse(v))?null:/^\d{4}-\d{2}-\d{2}$/.test(v)?v:new Date(Date.parse(v)+8*3600000).toISOString().slice(0,10);
 const anchor=day(publication)||day(new Date().toISOString());
 const future=day(raw)&&day(raw)>anchor;
 const planned=raw&&/\bwill\b|\bplanned\b|\bscheduled\b|预计|计划|拟于|将于|将从/i.test(event.dateQuote||'');
 if(!future&&!planned)return event;
 return {...event,...('eventDate' in event?{eventDate:null}:{}),...('occurredAt' in event?{occurredAt:null}:{}),scheduledAt:event.scheduledAt||raw,dateRole:'planned_or_unconfirmed',dateBasis:'原文计划或后续日期，不能据此确认已经发生'};
}
