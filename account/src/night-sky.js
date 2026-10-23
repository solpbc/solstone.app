export function installNightSky(root) {
'use strict';
const PHI=(1+Math.sqrt(5))/2, GOLD='#FFCC33', TILE='#FCF3E4';
const sm=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const wrap=x=>((x%1440)+1440)%1440;
const hash=(a,b)=>{const x=Math.sin(a*12.9898+b*78.233)*43758.5453;return x-Math.floor(x);};
const rgba=(c,a)=>`rgba(${parseInt(c.slice(1,3),16)},${parseInt(c.slice(3,5),16)},${parseInt(c.slice(5,7),16)},${Math.max(0,Math.min(1,a)).toFixed(3)})`;
function rng(seed){return ()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const levels=[0,1,2,3].map(i=>({a:.92*Math.pow(PHI,-.75*i),r:1.75*Math.pow(PHI,-.5*i),thr:[.18,.38,.58,.74][i]}));
function geometry(W,H){
 const side=Math.min(W,H),R=PHI*side/2,d=R/Math.SQRT2,A=[-d,-d],B=[W+d,H+d],dx=B[0]-A[0],dy=B[1]-A[1],c=Math.hypot(dx,dy),s=Math.tan(Math.PI/20)/2*c,ra=c*c/(8*s)+s/2;
 const O=[W/2-dy/c*(ra-s),H/2+dx/c*(ra-s)],a0=Math.atan2(A[1]-O[1],A[0]-O[0]);
 let delta=Math.atan2(B[1]-O[1],B[0]-O[0])-a0;while(delta>Math.PI)delta-=2*Math.PI;while(delta< -Math.PI)delta+=2*Math.PI;
 return {W,H,side,R,O,ra,a0,delta,at:t=>[O[0]+ra*Math.cos(a0+delta*t),O[1]+ra*Math.sin(a0+delta*t)]};
}
function rotate(g,x,y,ang){const dx=x-g.O[0],dy=y-g.O[1],c=Math.cos(ang),s=Math.sin(ang);return [g.O[0]+dx*c-dy*s,g.O[1]+dx*s+dy*c];}
function catalogue(g){
 let lo=Infinity,hi=0,ta=Infinity,tb=-Infinity;
 for(let i=0;i<=400;i++){const f=i/100;let x,y;if(f<1){x=f*g.W;y=0;}else if(f<2){x=g.W;y=(f-1)*g.H;}else if(f<3){x=(3-f)*g.W;y=g.H;}else{x=0;y=(4-f)*g.H;}
 const dx=x-g.O[0],dy=y-g.O[1],r=Math.hypot(dx,dy);let t=Math.atan2(dy,dx);while(t-g.a0>Math.PI)t-=2*Math.PI;while(t-g.a0< -Math.PI)t+=2*Math.PI;lo=Math.min(lo,r);hi=Math.max(hi,r);ta=Math.min(ta,t);tb=Math.max(tb,t);}
 ta-=Math.abs(g.delta)/2+.01;tb+=Math.abs(g.delta)/2+.01;lo=Math.max(0,lo-4);hi+=4;
 const n=Math.round(.5*(hi*hi-lo*lo)*(tb-ta)/9000),R=rng(g.W*7919+g.H*104729+4*31),out=[];
 function push(r,t,lv){out.push({x:g.O[0]+r*Math.cos(t),y:g.O[1]+r*Math.sin(t),lv});R();R();R();R();} // preserve the chosen sky's seeded sequence
 for(let i=0;i<n;i++){const r=Math.sqrt(lo*lo+R()*(hi*hi-lo*lo)),t=ta+R()*(tb-ta),v=R();push(r,t,v<.07?0:v<.23?1:v<.53?2:3);}
 for(let i=0;i<Math.round(n*2.6);i++){const gs=Math.sqrt(-2*Math.log(R()+1e-9))*Math.cos(6.283*R());push(g.ra+gs*g.side/Math.pow(PHI,4),ta+R()*(tb-ta),R()<.12?2:3);}
 return out;
}
function meteors(g){const R=rng(1021),out=[];for(let i=0;i<11;i++)out.push({t0:(i+.15+R()*.7)*54.5,dur:.75+R()*.5,k:Math.floor(R()*10),off:1.05+R()*1.1,len:g.side*(.16+R()*.14),lane:R(),br:.65+R()*.35});return out;}
function state(g,fr,sun,m){
 const set=sun.set<sun.rise?sun.set+1440:sun.set,dusk=set+30,dawn=sun.rise-30,span=wrap(dawn-dusk)||1440,ms=wrap(m-dusk);
 let u=ms<=span?ms/span:fr.t<0?0:1;if(fr.night<=0)u=fr.t<.5?0:1;
 const half=Math.max(0,Math.min(180,span-120))/2,mid=wrap(dusk+span/2),rel=wrap(m-(mid-half)),len=2*half;
 return {s:Math.max(0,Math.min(1,fr.night*(1-.62*fr.w))),ang:g.delta*(u-.5),au:len>0&&rel<len?sm(Math.min(rel,len-rel)/Math.min(45,len/2)):0,mrel:wrap(m-mid),mid};
}
function suppression(fr,x,y){let a=0;for(const gl of fr.glows){const f=Math.hypot(x-gl.x,y-gl.y)/gl.r;if(f<1)a+=gl.a*(f<=.38?1-.55*f/.38:.45*(1-(f-.38)/.62));}return 1-Math.min(.9,1.9*a);}
function dot(ctx,x,y,r,col,a){ctx.fillStyle=rgba(col,a);ctx.beginPath();ctx.arc(x,y,r,0,6.2832);ctx.fill();if(r>1.3&&a>.4){ctx.fillStyle=rgba(col,a*.16);ctx.beginPath();ctx.arc(x,y,r*2.6,0,6.2832);ctx.fill();}}
function line(ctx,x0,y0,x1,y1,col,a,width){const gr=ctx.createLinearGradient(x0,y0,x1,y1);gr.addColorStop(0,rgba(col,0));gr.addColorStop(1,rgba(col,a));ctx.strokeStyle=gr;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();}
class NightSky {
 constructor(W,H,makeCanvas=()=>document.createElement('canvas')){this.g=geometry(W,H);this.field=catalogue(this.g);this.meteors=meteors(this.g);this.aurora=makeCanvas();this.aurora.width=Math.ceil(W/4);this.aurora.height=Math.ceil(H/4);}
 paintStatic(ctx,fr,sun,m,{dark=true,still=false,stillMeteors=still,watch=false}={}){
  const g=this.g,ns=state(g,fr,sun,m),W=g.W,H=g.H;ctx.clearRect(0,0,W,H);
  if(ns.au>.001&&!watch)this.paintAurora(ctx,ns,m,dark,still);
  for(const st of this.field){const L=levels[st.lv],p=rotate(g,st.x,st.y,ns.ang);if(p[0]< -3||p[1]< -3||p[0]>W+3||p[1]>H+3)continue;const a=(dark?L.a:Math.min(1,L.a*1.05+.08))*sm((ns.s-L.thr)/.2)*suppression(fr,...p);if(a>=.01)dot(ctx,...p,L.r*(dark?1:1.1),GOLD,a);}
  const cv=sm((ns.s-.3)/.35),c=g.at(.5),lv=[0,1,0,0,1,0,0,1,0,1];
  for(let k=0;k<10;k++){const ang=(-90+36*k)*Math.PI/180,L=levels[lv[k]],p=rotate(g,c[0]+g.R/PHI*Math.cos(ang),c[1]+g.R/PHI*Math.sin(ang),ns.ang),a=Math.min(1,(dark?L.a:Math.min(1,L.a*1.05+.08))*1.25)*cv*suppression(fr,...p),r=(L.r*1.35+.4)*.8*(dark?1:1.1);if(a>.01){ctx.fillStyle=rgba(GOLD,a*.14);ctx.beginPath();ctx.arc(...p,r*4.2,0,6.2832);ctx.fill();dot(ctx,...p,r,GOLD,a);}}
  if(stillMeteors||watch)this.paintMeteors(ctx,fr,sun,m,{dark,still:true});
 }
 paintAurora(ctx,ns,m,dark,still){const g=this.g,cv=this.aurora,x2=cv.getContext('2d'),w=cv.width,h=cv.height; x2.clearRect(0,0,w,h);
  const ph=still?2.1:Math.floor(m)*.9,peak=(dark?.34:.42*1.3)*ns.au,side=g.side;
  for(let xi=0;xi<w;xi++){const x=xi*4+2,dx=x-g.O[0],yb=g.O[1]-Math.sqrt(Math.max(0,g.ra*g.ra-dx*dx))+side*.04*Math.sin(x/side*6+ph*.8),fold=.5+.5*Math.sin(x/side*9+ph)*Math.sin(x/side*3.3-ph*.6),ray=hash(xi,Math.floor(ph*3))*.5+hash(xi+1,Math.floor(ph*3))*.5,I=peak*(.3+.7*fold*fold)*(.55+.45*Math.sin(x/side*27+ph*2.3))*(.45+.75*ray);if(I<.004)continue;const y0=yb/4,y1=(yb-side*.42*(.7+.3*fold))/4,gr=x2.createLinearGradient(0,y0+2,0,y1);[[0,'#6CF0A8',0],[.06,'#6CF0A8',I],[.35,'#6CF0A8',I*.55],[.7,'#A27CFF',I*.3],[1,'#A27CFF',0]].forEach(v=>gr.addColorStop(v[0],rgba(v[1],v[2])));x2.fillStyle=gr;x2.fillRect(xi,Math.min(y0+2,y1),1.2,Math.abs(y0+2-y1));}
  ctx.save();ctx.globalCompositeOperation=dark?'lighter':'screen';ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.filter='blur(3.6px)';ctx.drawImage(cv,0,0,w*4,h*4);ctx.restore();
 }
 paintMeteors(ctx,fr,sun,m,{dark=true,still=false}={}){const g=this.g,ns=state(g,fr,sun,m);if(ns.mrel>=10||ns.s<=.2)return;const c=g.at(.5),rad=rotate(g,...c,ns.ang),sec=ns.mrel*60,col=dark?TILE:'#FFFFFF',peak=dark?.95:.98;
  for(const mt of this.meteors){const dir=(-90+36*mt.k)*Math.PI/180,r=g.R*6.5/13.5*(.25+.4*(mt.off-1.05)),ux=Math.cos(dir),uy=Math.sin(dir),x=rad[0]+r*ux,y=rad[1]+r*uy;
   if(still){if(sec+59>=mt.t0)line(ctx,x,y,x+ux*mt.len,y+uy*mt.len,col,peak*.42*mt.br,.9);continue;}
   const tt=(sec-mt.t0)/mt.dur;if(tt<0||tt>1)continue;const head=sm(tt)*mt.len,tail=Math.min(head,mt.len*.42),fade=Math.sin(Math.PI*Math.min(1,tt*1.1)),hx=x+ux*head,hy=y+uy*head;line(ctx,hx-ux*tail,hy-uy*tail,hx,hy,col,peak*fade*mt.br,1.4);dot(ctx,hx,hy,1.1,col,peak*fade*mt.br);
  }
 }
 // Seconds until next meteor, or zero while one is active. Null outside this shower.
 nextMeteor(fr,sun,m){const ns=state(this.g,fr,sun,m);if(ns.s<=.2)return null;const rel=ns.mrel>1439?ns.mrel-1440:ns.mrel;if(rel>=10)return null;const sec=rel*60;for(const mt of this.meteors){if(sec<=mt.t0+mt.dur)return Math.max(0,mt.t0-sec);}return null;}
}
root.NightSky=NightSky;root.NightSkyMath={geometry,catalogue,meteors,state,levels};
}
