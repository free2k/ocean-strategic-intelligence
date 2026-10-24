// serveQuant maps this browser URL to quant-preview/charts.js. Node tests import
// the same browser modules directly, so use that real source without copying it.
export async function resolve(specifier,context,nextResolve){
 if(specifier==='../system-profile.mjs'&&context.parentURL?.endsWith('/intelligence/public/strategy/state.js'))return nextResolve(new URL('../../system-profile.mjs',context.parentURL).href,context);
 if(specifier==='./quant/charts.js'&&context.parentURL?.endsWith('/intelligence/public/period-charts.js'))return nextResolve(new URL('../quant-preview/charts.js',context.parentURL).href,context);
 return nextResolve(specifier,context);
}
