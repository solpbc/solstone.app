export function installNightLayer(root){
'use strict';
root.createNightLayer=function(container,{read,fullMotion=false}={}){
 const sky=document.createElement('canvas'),moving=document.createElement('canvas');
 for(const cv of [sky,moving]){cv.width=cv.height=1;cv.ariaHidden='true';cv.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';container.insertBefore(cv,container.querySelector('.sunarc-sun')); }
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let engine=null,key='',paintKey='',sample=null,wake=null,raf=null,nativeVisible=true,intersects=true,disposed=false;
 function visible(){return !disposed&&nativeVisible&&intersects&&document.visibilityState==='visible'&&container.getClientRects().length>0;}
 function stop(){if(wake!==null)clearTimeout(wake);if(raf!==null)cancelAnimationFrame(raf);wake=raf=null;if(moving.width!==1||moving.height!==1){moving.width=moving.height=1;}}
 function animate(){
  wake=raf=null;if(!visible()||!engine||!fullMotion||reduced.matches)return;
  const s=read(),next=engine.nextMeteor(s.frame,s.sun,s.minute);
  if(next===null||next>0){moving.width=moving.height=1;if(next!==null)wake=setTimeout(animate,next*1000);return;}
  const dpr=window.devicePixelRatio||1,w=Math.round(s.W*dpr),h=Math.round(s.H*dpr);
  if(moving.width!==w||moving.height!==h){moving.width=w;moving.height=h;moving.getContext('2d').setTransform(dpr,0,0,dpr,0,0);}
  const ctx=moving.getContext('2d');ctx.clearRect(0,0,s.W,s.H);
  engine.paintMeteors(ctx,s.frame,s.sun,s.minute,{dark:s.dark});raf=requestAnimationFrame(animate);
 }
 function update(){stop();if(!visible())return;sample=read();const s=sample;if(s.frame.night<=0){if(engine){for(const cv of [sky,moving]){cv.width=1;cv.height=1;}engine=null;key=paintKey='';}return;}const dpr=window.devicePixelRatio||1,k=`${s.W}x${s.H}@${dpr}`;
  if(k!==key){key=k;engine=new NightSky(s.W,s.H);for(const cv of [sky]){cv.width=Math.round(s.W*dpr);cv.height=Math.round(s.H*dpr);cv.getContext('2d').setTransform(dpr,0,0,dpr,0,0);}}
  const pk=JSON.stringify([key,Math.floor(s.minute),s.frame,s.sun,s.dark,fullMotion,reduced.matches]);
  if(pk!==paintKey){engine.paintStatic(sky.getContext('2d'),s.frame,s.sun,s.minute,{dark:s.dark,still:reduced.matches,stillMeteors:!fullMotion||reduced.matches});paintKey=pk;}
  if(fullMotion&&!reduced.matches)animate();
 }
 const observer=new IntersectionObserver(entries=>{intersects=entries.some(e=>e.isIntersecting);update();});observer.observe(container);
 document.addEventListener('visibilitychange',update);reduced.addEventListener('change',update);
 return {update,setVisible(v){nativeVisible=v;update();},setFullMotion(v){fullMotion=v;update();},dispose(){disposed=true;stop();observer.disconnect();document.removeEventListener('visibilitychange',update);reduced.removeEventListener('change',update);sky.remove();moving.remove();engine=null;}};
};
}
