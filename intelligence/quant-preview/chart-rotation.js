// Each visible card keeps its own full interval after an interaction or pause.
export function mountChartRotation(article,{views,current,select,interval=2500,schedule=setTimeout,cancel=clearTimeout}){
 const page=article.ownerDocument,listeners=[];
 let timer,visible=false,disposed=false,hovered=article.matches(':hover');
 const keyboardFocus=()=>Boolean(article.querySelector(':focus-visible'));
 const canRun=()=>!disposed&&visible&&!page.hidden&&!hovered&&!keyboardFocus()&&views().length>1;
 function reset(){
  if(timer!==undefined){cancel(timer);timer=undefined;}
  if(canRun())timer=schedule(()=>{
   timer=undefined;if(!canRun())return;
   const choices=views(),index=choices.indexOf(current());
   select(choices[(index+1)%choices.length]);reset();
  },interval);
 }
 function listen(target,type,handler){target.addEventListener(type,handler);listeners.push([target,type,handler]);}
 listen(article,'pointerenter',event=>{if(event.pointerType!=='touch'){hovered=true;reset();}});
 listen(article,'pointerleave',()=>{hovered=false;reset();});
 listen(article,'focusin',reset);
 listen(article,'focusout',()=>queueMicrotask(()=>{if(!disposed)reset();}));
 listen(article,'keydown',()=>queueMicrotask(()=>{if(!disposed)reset();}));
 listen(page,'visibilitychange',reset);
 return {
  reset,
  setVisible(next){if(visible!==next){visible=next;reset();}},
  dispose(){disposed=true;reset();for(const [target,type,handler] of listeners)target.removeEventListener(type,handler);}
 };
}
