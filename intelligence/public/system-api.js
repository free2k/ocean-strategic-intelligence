import {isLowCarbon} from './system-profile.mjs';
// Preserve all existing marine URLs; isolate formerly absolute management URLs.
export function systemApi(url){return isLowCarbon&&url.startsWith('/api/')?'/low-carbon'+url:url;}
