// selfclone studio: the page that draws every frame. `window.studio.render(frame)` puts a frame on
// screen (and returns a promise when a Manim frame has to load first); all motion is a function of the
// frame number, so a render is repeatable, needs no clock, and can be split across workers.
import { jsonForScript, escapeHtml } from '../util.mjs';
import { characterSvg, mix, CHAR_BOX, FULL_BOX, MOUTHS, GESTURES, MOOD_FACES } from './character.mjs';
import { backdropSvg, particlesSvg } from './backdrops.mjs';

const HAND = "'Ink Free','Segoe Print','Chalkboard SE','Marker Felt','Comic Neue','Comic Sans MS',cursive";
const SANS = "'Segoe UI Variable Display','Segoe UI','Helvetica Neue',Arial,system-ui,sans-serif";

// A tile of fractal noise as a CSS background: paper grain and a gouache-like mottle, no image files.
const noise = (freq, oct, alpha, [r, g, b] = [0.5, 0.42, 0.36]) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${oct}' stitchTiles='stitch' seed='7'/><feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`)}")`;

// Shared by the video page and the preview sheet: find a character's rig parts and pose them.
const RIG_JS = String.raw`
const G=DATA.gestures, MF=DATA.moodFaces;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const lerp=(a,b,k)=>a+(b-a)*k;
const ease=(k)=>k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
const outCubic=(k)=>1-Math.pow(1-k,3);
const outBack=(k)=>{const c=1.70158,d=c+1;return 1+d*Math.pow(k-1,3)+c*Math.pow(k-1,2)};
const hash=(n)=>{const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x)};
const dn=(el,k)=>parseFloat(el.getAttribute('data-'+k));
function gestureOf(name){
  const left=/-left$/.test(name), g=G[name.replace(/-left$/,'')]||G.rest;
  const o=left?{right:g.left,left:g.right}:{right:g.right,left:g.left};
  return {...o,lift:g.lift||0,chin:g.chin||0,wave:g.wave?(left?'left':'right'):null};
}
function rigParts(id){
  const q=(x)=>document.getElementById(id+'-'+x);
  const head=q('head');
  const arm=(k)=>{const a=q('arm'+k), f=q('fore'+k);return {arm:a,fore:f,side:dn(a,'side'),sx:dn(a,'x'),sy:dn(a,'y'),ex:dn(f,'x'),ey:dn(f,'y'),hands:{rest:q('hand'+k+'-rest'),open:q('hand'+k+'-open'),point:q('hand'+k+'-point'),thumb:q('hand'+k+'-thumb'),two:q('hand'+k+'-two')},last:'rest'}};
  const leg=(k)=>{const l=q('leg'+k), s=q('shin'+k);return l?{leg:l,shin:s,hx:dn(l,'x'),hy:dn(l,'y'),kx:dn(s,'x'),ky:dn(s,'y')}:null};
  return {
    mouths:Object.fromEntries(DATA.mouths.map(m=>[m,q('mouth-'+m)])),
    eyes:[q('eyes-open'),q('eyes-half'),q('eyes-closed')],
    brows:['R','L'].map(k=>{const b=q('brow'+k);return {el:b,x:dn(b,'x'),y:dn(b,'y'),side:dn(b,'side'),eh:dn(b,'eh')}}),
    head, hx:dn(head,'x'), hy:dn(head,'y'), W:dn(head,'w'), H:dn(head,'h'),
    face:q('face'), hairfront:q('hairfront'), body:q('body'), armsG:q('arms'), chin:q('chin'),
    ears:q('ears'), hairback:q('hairback'), nose:q('nose'), noseX:dn(q('nose'),'x'), bodyX:dn(q('body'),'x'), bodyY:dn(q('body'),'y'), lastNose:1,
    irises:[...q('face').querySelectorAll('.iris')],
    arms:{right:arm('Rt'),left:arm('Lt')}, legs:{right:leg('Rt'),left:leg('Lt')}, lastMouth:'rest', lastEyes:0, lastChin:0,
  };
}
function setMouth(p,m){if(p.lastMouth!==m){for(const k in p.mouths)p.mouths[k].setAttribute('display',k===m?'inline':'none');p.lastMouth=m}}
function setEyes(p,b){if(p.lastEyes!==b){p.eyes.forEach((g,k)=>g.setAttribute('display',k===b?'inline':'none'));p.lastEyes=b}}
function setArm(A,S,E,hand){
  A.arm.setAttribute('transform','rotate('+(-A.side*S)+' '+A.sx+' '+A.sy+')');
  A.fore.setAttribute('transform','rotate('+(-A.side*E)+' '+A.ex+' '+A.ey+')');
  if(A.last!==hand){for(const h in A.hands)A.hands[h].setAttribute('display',h===hand?'inline':'none');A.last=hand}
}
// The hand at the chin replaces the right arm while thinking; it slides up into place.
function setChin(p,k){
  const on=k>.5?1:0;
  if(p.lastChin!==on){p.chin.setAttribute('display',on?'inline':'none');p.arms.right.arm.setAttribute('display',on?'none':'inline');p.lastChin=on}
  if(on) p.chin.setAttribute('transform','translate(0,'+((1-k)*2*90)+')');
}
function setLegs(p,hip,knee){
  for(const side of ['right','left']){const L=p.legs[side]; if(!L) continue;
    const s=side==='right'?1:-1;
    L.leg.setAttribute('transform','rotate('+(hip*s)+' '+L.hx+' '+L.hy+')');
    L.shin.setAttribute('transform','rotate('+(-(side==='right'?knee[0]:knee[1]))+' '+L.kx+' '+L.ky+')');
  }
}
// A head turn: the face shifts toward the look, the ears and back hair the other way, and the nose points
// to the side the character looks at.
function setTurn(p,lx,ly){
  p.face.setAttribute('transform','translate('+(lx*p.W*.07)+','+((ly||0)*p.H*.035)+')');
  p.hairfront.setAttribute('transform','translate('+(lx*p.W*.03)+','+((ly||0)*p.H*.012)+')');
  p.ears.setAttribute('transform','translate('+(-lx*p.W*.05)+',0)');
  p.hairback.setAttribute('transform','translate('+(-lx*p.W*.025)+',0)');
  const n=lx<-.25?-1:lx>.25?1:p.lastNose;
  if(n!==p.lastNose){p.nose.setAttribute('transform',n<0?'translate('+(2*p.noseX)+',0) scale(-1,1)':'');p.lastNose=n}
  for(const g of p.irises) g.setAttribute('transform','translate('+(lx*6)+','+((ly||0)*4)+')');
}
function setBrows(p,pairs){p.brows.forEach((b,k)=>b.el.setAttribute('transform','translate(0,'+(-pairs[k][0]*b.eh)+') rotate('+(-b.side*pairs[k][1])+' '+b.x+' '+b.y+')'))}
`;

const PAGE_RUNTIME = String.raw`
const {fps,W,H,U,boxes,scenes,tracks,manim}=DATA;
const wrap=(v,n)=>((v%n)+n)%n;
const at=(el)=>{const m=/translate\(([-\d.]+),([-\d.]+)\)/.exec(el.getAttribute('transform')||'');return m?[+m[1],+m[2]]:[0,0]};
const els=scenes.map((s,i)=>{
  const root=document.getElementById('s'+i);
  const chars=s.characters.map((c,k)=>{
    const el=document.getElementById('s'+i+'c'+k);
    const box=boxes[c.body];
    const hgt=c.scale*U, wid=hgt*box.width/box.height;
    Object.assign(el.style,{width:wid+'px',height:hgt+'px',top:(c.y*H-hgt)+'px'});
    return {el,wid,p:rigParts('c'+i+'_'+k)};
  });
  const items=s.items.map((it,k)=>{
    const el=document.getElementById('s'+i+'i'+k);
    const rv=el.firstElementChild;
    const o={it,el,rv,phase:k*1.7+i,draw:null,drawn:false,mark:null,num:null,grow:null};
    if(it.count){o.num=rv.querySelector('.text');o.num.textContent=it.text.replace('{n}',it.count.to.toLocaleString('en-US',{minimumFractionDigits:it.count.decimals,maximumFractionDigits:it.count.decimals}))}
    if(it.enter==='draw'){
      const shapes=[...rv.querySelectorAll('path,circle,rect,ellipse,line,polyline,polygon')];
      o.draw=shapes.map((sh,j)=>{
        const cs=getComputedStyle(sh);
        const stroked=cs.stroke&&cs.stroke!=='none'&&parseFloat(cs.strokeWidth)>0;
        let len=0;try{len=sh.getTotalLength()}catch(e){}
        const n=shapes.length, a=(j/n)*.6;
        return {sh,len,stroked:stroked&&len>0,a,b:a+.4,fo:parseFloat(cs.fillOpacity)||1};
      });
    }
    const cr=rv.querySelector('svg.crowd');
    if(cr){
      // A crowd: each person's spot, pace and phase, when they hear the news and where they walk to.
      const mem=[...cr.querySelectorAll('.cm')].map(g=>({g,f:g.querySelector('.cf'),b:g.querySelector('.cbad'),r:g.querySelector('.cring'),
        i:dn(g,'i'),hx:dn(g,'hx'),hy:dn(g,'hy'),ph:dn(g,'ph'),sp:dn(g,'sp'),wa:dn(g,'wa'),s:dn(g,'s'),know:dn(g,'know'),ring:dn(g,'ring'),
        gt:dn(g,'gt'),gd:dn(g,'gd'),gx:dn(g,'gx'),gy:dn(g,'gy'),dir:1}));
      // People are drawn back to front, so whisper arcs find them by their number, not their place in the drawing.
      const byI=[]; for(const m of mem) byI[m.i]=m;
      const sh=it.crowdShift||{ring:0,spread:0,gather:0};
      for(const m of mem){if(m.know>=0)m.know+=sh.spread;if(m.ring>=0)m.ring+=sh.ring;if(m.gt>=0)m.gt+=sh.gather}
      o.crowd={mem,byI,arcs:[...cr.querySelectorAll('.cw')].map(p=>({p,a:dn(p,'a'),b:dn(p,'b'),t:dn(p,'t')+sh.spread}))};
    }
    const nw=rv.querySelector('svg.network');
    if(nw){const av=(l,k)=>parseFloat(l.getAttribute(k));o.net=[...nw.querySelectorAll('.ne')].map(l=>({l,t:dn(l,'t'),len:Math.hypot(av(l,'x2')-av(l,'x1'),av(l,'y2')-av(l,'y1'))}))}
    if(it.enter==='grow'){
      const q=(c)=>[...rv.querySelectorAll('.'+c)];
      const line=rv.querySelector('.g-line');
      o.grow={bars:q('g-bar'),dots:q('g-dot'),pies:q('g-pie').map(e=>({e,len:dn(e,'len'),f:dn(e,'f'),s:-parseFloat(e.getAttribute('stroke-dashoffset'))/dn(e,'len')})),labels:q('g-label'),line,lineLen:line?line.getTotalLength():0};
    }
    const mk=el.querySelector('.mark');
    if(mk){
      // A rough hand-drawn path around the item's own box, drawn on later with a dash offset.
      const w=rv.offsetWidth, h=rv.offsetHeight, kind=mk.getAttribute('data-kind'), pth=mk.firstElementChild;
      const j=(n)=>(hash(n+k*7+i*13)-.5);
      let d='';
      if(kind==='underline') d='M'+(-w*.04)+','+(h*1.02+j(1)*6)+' Q'+(w*.5)+','+(h*1.12+j(2)*8)+' '+(w*1.04)+','+(h*1.0+j(3)*6);
      else if(kind==='strike') d='M'+(-w*.03)+','+(h*.55+j(1)*4)+' L'+(w*1.03)+','+(h*.48+j(2)*4);
      else if(kind==='box') d='M'+(-w*.06)+','+(-h*.08)+' L'+(w*1.06+j(1)*6)+','+(-h*.1)+' L'+(w*1.05)+','+(h*1.1+j(2)*6)+' L'+(-w*.05+j(3)*6)+','+(h*1.08)+' Z';
      else {const cx=w/2, cy=h/2, rx=w*.62, ry=h*.75; d='M'+(cx+rx*Math.cos(-2.6))+','+(cy+ry*Math.sin(-2.6));
        for(let a=-2.6;a<=-2.6+6.28+.5;a+=.25){const r=1+j(a)*.05; d+=' L'+(cx+rx*r*Math.cos(a))+','+(cy+ry*r*Math.sin(a))}}
      pth.setAttribute('d',d);
      let len=0;try{len=pth.getTotalLength()}catch(e){}
      o.mark={pth,len};
      pth.style.strokeDasharray=len+' '+len; pth.style.strokeDashoffset=String(len);
    }
    return o;
  });
  // Scenery: parse each animated part's place once; particles keep their start, speed and phase.
  const bd=document.getElementById('s'+i+'b'), pt=document.getElementById('s'+i+'p');
  const scen=bd?{
    drift:[...bd.querySelectorAll('.a-drift')].map(el=>({el,p:at(el),v:dn(el,'speed'),w:dn(el,'w')})),
    twinkle:[...bd.querySelectorAll('.a-twinkle')].map(el=>({el,ph:dn(el,'phase'),r:dn(el,'rate')})),
    float:[...bd.querySelectorAll('.a-float')].map(el=>({el,p:at(el),ph:dn(el,'phase'),a:dn(el,'amp')})),
    roll:[...bd.querySelectorAll('.a-roll')].map(el=>({el,v:dn(el,'speed'),span:dn(el,'span')})),
  }:null;
  const particles=pt?[...pt.querySelectorAll('.p')].map(el=>({el,x:dn(el,'x'),y:dn(el,'y'),vx:dn(el,'vx'),vy:dn(el,'vy'),ph:dn(el,'phase'),tw:dn(el,'tw')})):null;
  const mn=document.getElementById('s'+i+'m');
  return {root,world:document.getElementById('s'+i+'w'),chars,items,bd,pt,scen,particles,mn,mnFrame:-1};
});
const cap=document.getElementById('cap');
const boil=document.getElementById('boilT');

function drawScenery(e,t,tx,ty,z){
  const tq=Math.floor(t*12)/12;
  if(e.bd){
    // Behind: moves at 45% of the camera.
    e.bd.style.transform='translate('+(tx*.45)+'px,'+(ty*.45)+'px) scale('+(1+(z-1)*.45)+')';
    const s=e.scen;
    if(s){
      for(const d of s.drift) d.el.setAttribute('transform','translate('+(wrap(d.p[0]+d.v*tq+150,d.w+300)-150)+','+d.p[1]+')');
      for(const d of s.twinkle) d.el.setAttribute('opacity',String(.3+.7*(.5+.5*Math.sin(tq*d.r+d.ph))));
      for(const d of s.float) d.el.setAttribute('transform','translate('+(d.p[0]+Math.sin(tq*.7+d.ph)*d.a*.5)+','+(d.p[1]+Math.sin(tq*.9+d.ph)*d.a)+')');
      for(const d of s.roll) d.el.setAttribute('transform','translate('+(-wrap(tq*d.v,d.span))+',0)');
    }
  }
  if(e.pt){
    // In front: moves a little more than the camera.
    e.pt.style.transform='translate('+(tx*.2)+'px,'+(ty*.2)+'px) scale('+(1+(z-1)*1.2)+')';
    for(const p of e.particles){
      const x=wrap(p.x+p.vx*tq+Math.sin(tq*.8+p.ph)*8,W), y=wrap(p.y+p.vy*tq,H);
      const tw=p.tw?(.6+.4*Math.sin(tq*3+p.ph)):1;
      p.el.setAttribute('transform','translate('+x+','+y+') scale('+tw+')');
    }
  }
}

function drawProgress(o,k){
  if(o.drawn&&k>=1) return;
  for(const d of o.draw){
    const u=clamp((k-d.a)/(d.b-d.a),0,1);
    if(d.stroked){d.sh.style.strokeDasharray=d.len+' '+d.len;d.sh.style.strokeDashoffset=String(d.len*(1-u))}
    d.sh.style.fillOpacity=String(d.fo*clamp((k-.45)/.45,0,1)*(d.stroked?1:u));
  }
  o.drawn=k>=1;
}

// Charts: bars grow from the axis in turn, the line draws with its points popping in, the pie sweeps.
function growProgress(o,k){
  const g=o.grow, n=Math.max(1,g.bars.length||g.dots.length||g.pies.length);
  const step=(i)=>outCubic(clamp(k*(1+(n-1)*.35)-i*.35,0,1));
  g.bars.forEach((b,i)=>{const u=step(i), y0=dn(b,'y0');b.setAttribute('transform','translate(0 '+y0+') scale(1 '+Math.max(.001,u)+') translate(0 '+(-y0)+')')});
  if(g.line){g.line.style.strokeDasharray=g.lineLen+' '+g.lineLen;g.line.style.strokeDashoffset=String(g.lineLen*(1-k))}
  g.dots.forEach((d,i)=>{const u=k>=i/Math.max(1,n-1)?1:0;d.setAttribute('opacity',String(u))});
  g.pies.forEach(p=>{const u=clamp((k-p.s)/Math.max(.001,p.f),0,1);p.e.setAttribute('stroke-dasharray',(p.f*p.len*u)+' '+p.len)});
  g.labels.forEach(l=>{const i=l.hasAttribute('data-i')?+l.getAttribute('data-i'):n;l.setAttribute('opacity',String(g.bars.length||g.dots.length?(step(i)>.9?1:0):(k>.9?1:0)))});
}

// A crowd person's place d seconds after the crowd came in: wandering round their spot, or walking to
// the gathering place and standing there. The third value is 1 while they walk there.
function crowdAt(m,d){
  const wx=(u)=>m.hx+Math.sin(u*m.sp+m.ph)*m.wa, wy=(u)=>m.hy+Math.sin(u*m.sp*.73+m.ph*1.7)*m.wa*.55;
  if(m.gt<0||d<m.gt) return [wx(d),wy(d),0];
  const u=ease(clamp((d-m.gt)/m.gd,0,1));
  return [lerp(wx(m.gt),m.gx,u),lerp(wy(m.gt),m.gy,u),u<1?1:0];
}
function drawCrowd(C,d){
  for(const m of C.mem){
    const [x,y,going]=crowdAt(m,d), [px]=crowdAt(m,d-.1);
    const v=Math.abs(x-px)*10, moving=going?1:clamp(v/25,0,1);
    const bob=-Math.abs(Math.sin(d*9+m.ph))*(1.5+4.5*moving)*m.s;
    m.g.setAttribute('transform','translate('+x.toFixed(1)+','+(y+bob).toFixed(1)+')');
    const dir=x>px+.05?1:x<px-.05?-1:m.dir;
    if(dir!==m.dir||!m.set){m.dir=dir;m.set=1;m.f.setAttribute('transform','scale('+(dir*m.s)+','+m.s+')')}
    if(m.b){const u=m.know<0?0:clamp((d-m.know)/.35,0,1);
      m.b.setAttribute('opacity',u>0?'1':'0');
      if(u>0) m.b.setAttribute('transform','translate(0,'+((-96+Math.sin(d*3+m.ph)*3)*m.s).toFixed(1)+') scale('+((u<1?outBack(u):1)*m.s).toFixed(3)+')')}
    if(m.r){const on=m.ring>=0&&d>=m.ring;m.r.setAttribute('opacity',on?String(.55+.45*Math.sin(d*5)):'0');
      if(on) m.r.setAttribute('transform','scale('+m.s+') rotate('+((d*40)%360).toFixed(1)+' 0 -36)')}
  }
  for(const a of C.arcs){
    const u=(d-a.t+.7)/.7;
    if(u<0||u>1.5){a.p.setAttribute('opacity','0');continue}
    const A=C.byI[a.a], B=C.byI[a.b]; if(!A||!B) continue;
    const pa=crowdAt(A,d), pb=crowdAt(B,d);
    const x1=pa[0], y1=pa[1]-62*A.s, x2=pb[0], y2=pb[1]-62*B.s;
    const lift=Math.hypot(x2-x1,y2-y1)*.35+30;
    a.p.setAttribute('d','M'+x1.toFixed(1)+','+y1.toFixed(1)+' Q'+((x1+x2)/2).toFixed(1)+','+(Math.min(y1,y2)-lift).toFixed(1)+' '+x2.toFixed(1)+','+y2.toFixed(1));
    let L=0;try{L=a.p.getTotalLength()}catch(e){}
    a.p.style.strokeDasharray=L+' '+L; a.p.style.strokeDashoffset=String(L*(1-clamp(u,0,1)));
    a.p.setAttribute('opacity',String(u<=1?1:clamp(1-(u-1)/.5,0,1)));
  }
}
function drawNet(N,d){
  for(const e of N){const u=e.t<0?1:clamp((d-e.t)/.35,0,1);
    e.l.setAttribute('opacity',u>0?'.85':'0');
    if(u>0){e.l.style.strokeDasharray=e.len+' '+e.len;e.l.style.strokeDashoffset=String(e.len*(1-outCubic(u)))}}
}

function camAt(keys,t){
  let cur={zoom:keys[0].zoom,x:keys[0].x,y:keys[0].y};
  for(let k=1;k<keys.length;k++){
    const key=keys[k]; if(t<key.t) break;
    const u=ease(clamp((t-key.t)/Math.max(.01,key.dur),0,1));
    cur={zoom:lerp(cur.zoom,key.zoom,u),x:lerp(cur.x,key.x,u),y:lerp(cur.y,key.y,u)};
  }
  return cur;
}

function drawScene(i,t,f){
  const s=scenes[i], e=els[i];
  e.root.style.visibility='visible';
  const c=camAt(s.camera,t);
  const z=c.zoom, fx=c.x*W, fy=c.y*H;
  const tx=clamp(W/2-fx*z,W-W*z,0), ty=clamp(H/2-fy*z,H-H*z,0);
  e.world.style.transform='translate('+tx+'px,'+ty+'px) scale('+z+')';
  drawScenery(e,t,tx,ty,z);
  const tq=Math.floor(t*12)/12;
  for(const o of e.items){
    const it=o.it, st=o.el.style, dt=t-it.t;
    if(dt<0){st.visibility='hidden';continue}
    let x=it.x, y=it.y;
    if(it.move){const k=ease(clamp((t-it.move.t)/it.move.dur,0,1));x=lerp(x,it.move.x,k);y=lerp(y,it.move.y,k)}
    let sc=it.scale, rot=it.rotate, dx=0, dy=0, op=1, clip='none';
    const k=clamp(dt/Math.max(.01,it.enterDur),0,1);
    switch(it.enter){
      case 'pop': sc*=dt<.35?outBack(clamp(dt/.35,0,1)):1; op=clamp(dt/.12,0,1); break;
      case 'zoom': sc*=lerp(1.7,1,outCubic(k)); op=k; break;
      case 'fade': op=k; break;
      case 'write': clip='inset(-20% '+((1-k)*100)+'% -20% -20%)'; break;
      case 'draw': drawProgress(o,k); break;
      case 'grow': if(o.grow) growProgress(o,k); else {sc*=outBack(k);op=clamp(dt/.12,0,1)} break;
      case 'slide-left': dx=-(1-outCubic(k))*W*.45; break;
      case 'slide-right': dx=(1-outCubic(k))*W*.45; break;
      case 'slide-up': dy=(1-outCubic(k))*H*.45; break;
      case 'slide-down': dy=-(1-outCubic(k))*H*.45; break;
    }
    const ph=o.phase;
    switch(it.loop){
      case 'float': dy+=Math.sin(tq*2.2+ph)*H*.01; break;
      case 'bob': dy-=Math.abs(Math.sin(tq*3+ph))*H*.016; break;
      case 'wobble': rot+=Math.sin(tq*3+ph)*5; break;
      case 'pulse': sc*=1+Math.sin(tq*4+ph)*.05; break;
      case 'spin': rot+=(tq-it.t)*60; break;
      case 'shake': dx+=Math.sin(tq*45+ph)*3; break;
    }
    if(it.exit&&t>=it.exit.t){
      const u=clamp((t-it.exit.t)/.35,0,1);
      if(u>=1){st.visibility='hidden';continue}
      switch(it.exit.anim){
        case 'fade': op*=1-u; break;
        case 'pop': sc*=1-outCubic(u); break;
        case 'slide-left': dx-=u*u*W*.6; break;
        case 'slide-right': dx+=u*u*W*.6; break;
        case 'slide-up': dy-=u*u*H*.6; break;
        case 'slide-down': dy+=u*u*H*.6; break;
      }
    }
    st.visibility='visible';
    st.left=(x*W)+'px'; st.top=(y*H)+'px';
    st.opacity=op;
    st.transform='translate(-50%,-50%) translate('+dx+'px,'+dy+'px) rotate('+rot+'deg) scale('+Math.max(0,sc)+')';
    o.rv.style.clipPath=clip;
    if(o.crowd) drawCrowd(o.crowd,dt);
    if(o.net) drawNet(o.net,dt);
    if(o.mark){const u=clamp((t-it.markT)/.5,0,1);o.mark.pth.style.strokeDashoffset=String(o.mark.len*(1-outCubic(u)))}
    if(o.num){const c=it.count, u=outCubic(clamp(dt/c.dur,0,1)), v=lerp(c.from,c.to,u);
      o.num.textContent=it.text.replace('{n}',v.toLocaleString('en-US',{minimumFractionDigits:c.decimals,maximumFractionDigits:c.decimals}))}
  }
  // Manim: show the frame for this moment (the last one once the animation is over).
  if(e.mn){
    const m=manim[i], k=Math.floor((t-m.t)*fps);
    if(k<0){e.mn.style.visibility='hidden';if(e.mn.tagName==='VIDEO'&&!e.mn.paused)e.mn.pause();return null}
    e.mn.style.visibility='visible';
    if(e.mn.tagName==='VIDEO'){
      const want=Math.min((m.frames-1)/fps,t-m.t), v=e.mn;
      if(Math.abs(v.currentTime-want)>.2) v.currentTime=want;
      if(window.__playing&&v.paused&&want<(m.frames-1)/fps) v.play().catch(()=>{});
      if(!window.__playing&&!v.paused) v.pause();
      return null;
    }
    const idx=Math.min(m.frames-1,k);
    if(idx!==e.mnFrame){e.mnFrame=idx;e.mn.src='http://studio.local/manim/'+i+'/'+(idx+1)+'.png';return e.mn.decode().catch(()=>{})}
  }
  return null;
}

// Where a character stands at time t, following its walk keys.
function xAt(c,t){let x=c.walk[0].x;for(let k=1;k<c.walk.length;k++){const w=c.walk[k];if(t>=w.t)x=x+(w.x-x)*Math.min(1,(t-w.t)/w.dur)}return x}

function drawCharacter(i,k,f,t){
  const s=scenes[i], c=s.characters[k], C=els[i].chars[k], p=C.p;
  const tr=tracks[c.who]||{};
  const tq=Math.floor(t*12)/12;
  const m0=(tr.mouth&&tr.mouth[f])||'rest', em=(tr.emph&&tr.emph[f])||0, talking=m0!=='rest'?1:0;
  let mi=0; for(let q=0;q<c.moods.length;q++) if(c.moods[q].t<=t) mi=q;
  const mc=MF[c.moods[mi].m], mp=MF[(c.moods[mi-1]||c.moods[mi]).m];
  const mk=ease(clamp((t-c.moods[mi].t)/.35,0,1));
  setMouth(p,(m0==='rest'&&lerp(mp.smile||0,mc.smile||0,mk)>.5)?'smile':m0);
  setEyes(p,(tr.blink&&tr.blink[f])||0);
  const line=s.lines.find(l=>l.who===c.who&&t>=l.start&&t<=l.end+.3);
  const q=line&&line.question?clamp((t-line.start)/Math.max(.1,line.end-line.start)*2-.6,0,1):0;
  setBrows(p,[0,1].map(j=>[lerp(mp.brows[j][0],mc.brows[j][0],mk)+em*.45+q*.5,lerp(mp.brows[j][1],mc.brows[j][1],mk)]));
  // gaze: where it is told to look, glances at new items, turning to a speaker, small saccades
  let lx=c.look, ly=0;
  for(const L of c.looks){if(t>=L.t&&t<=L.until){const u=Math.min(ease(clamp((t-L.t)/.2,0,1)),ease(clamp((L.until-t)/.25,0,1)));lx=lerp(lx,L.x,u);ly=lerp(ly,L.y,u)}}
  const sn=Math.floor((t+i*.7+k*1.3)/1.7);
  lx+=(hash(sn)-.5)*.25*(1-Math.abs(lx)); ly+=(hash(sn+99)-.5)*.15;
  setTurn(p,lx,ly);
  // walking: where it is, how fast it moves, the stride
  const x=xAt(c,t), v=Math.abs(x-xAt(c,t-1/fps))*fps, walking=clamp(v/.04,0,1);
  const phase=t*2*Math.PI*1.7;
  // arms: blend between gestures over 0.45 s, beat with the stress, swing while walking, breathe
  let gi=0; for(let q2=0;q2<c.gestures.length;q2++) if(c.gestures[q2].t<=t) gi=q2;
  const gname=c.gestures[gi].g, gc=gestureOf(gname), gp=gestureOf((c.gestures[gi-1]||c.gestures[gi]).g);
  const gk=ease(clamp((t-c.gestures[gi].t)/.45,0,1));
  const base=gname.replace(/-left$/,''), lead=/-left$/.test(gname)?'left':'right';
  const breath=Math.sin(t*2*Math.PI/3.8);
  for(const side of ['right','left']){
    const a=gp[side], b=gc[side];
    let S=lerp(a[0],b[0],gk), E=lerp(a[1],b[1],gk);
    if(base==='rest'&&side===lead){E+=em*12;S+=em*3}
    else if(base==='explain'&&side===lead) E-=em*14;
    else if(base==='present') E+=em*10;
    S+=Math.sin(tq*1.3+(side==='right'?0:2))*1.2+breath*.8;
    if(base==='rest') S+=Math.sin(phase+(side==='right'?0:Math.PI))*14*walking;
    if(gc.wave===side) E+=Math.sin(t*2*Math.PI*2)*18*gk;
    setArm(p.arms[side],S,E,gk>.5?b[2]:a[2]);
  }
  setChin(p,lerp(gp.chin,gc.chin,gk));
  setLegs(p,Math.sin(phase)*24*walking,[Math.max(0,Math.sin(phase+1.3))*34*walking,Math.max(0,Math.sin(phase+1.3+Math.PI))*34*walking]);
  const lift=lerp(gp.lift,gc.lift,gk);
  const step=-Math.abs(Math.sin(phase))*10*walking;
  p.armsG.setAttribute('transform','translate(0,'+(-lift*16-breath*1.5)+')');
  p.body.setAttribute('transform','translate(0,'+(-breath*1.5+step)+') rotate('+(Math.sin(phase)*2.2*walking)+' '+p.bodyX+' '+p.bodyY+')');
  const tilt=Math.sin(tq*1.1+i+k)*1.6+Math.sin(tq*2.3)*.7*talking+lx*2.5+lift*5;
  const bob=Math.sin(tq*5.5)*1.6*talking;
  p.head.setAttribute('transform','translate('+(lx*p.W*.015)+','+(bob+em*5-lift*9-breath*1.5+step)+') rotate('+tilt+' '+p.hx+' '+p.hy+')');
  // entrance
  let ox=0, oy=0, sc=1;
  if(c.enter==='slide-left'||c.enter==='slide-right'||c.enter==='rise'||c.enter==='pop'){
    const u0=clamp((t-s.start)/.6,0,1), u=outCubic(u0);
    if(c.enter==='slide-left') ox=-(1-u)*W*.6; else if(c.enter==='slide-right') ox=(1-u)*W*.6;
    else if(c.enter==='rise') oy=(1-u)*H*.6; else sc=u0<1?Math.max(0,outBack(u0)):1;
  }
  C.el.style.left=(x*W-C.wid/2)+'px';
  C.el.style.transform='translate('+ox+'px,'+oy+'px)'+(c.flip?' scaleX(-1)':'')+' scale('+sc+')';
}

const TD=.5;
window.studio={render(f){
  const t=f/fps;
  let i=scenes.findIndex(s=>t<s.end); if(i<0) i=scenes.length-1;
  for(const e of els){const st=e.root.style;st.visibility='hidden';st.opacity=1;st.transform='none';st.clipPath='none'}
  const s=scenes[i];
  const k=(i>0&&s.transition!=='cut')?clamp((t-s.start)/TD,0,1):1;
  const waits=[];
  if(k<1){
    waits.push(drawScene(i-1,t,f)); scenes[i-1].characters.forEach((c,j)=>drawCharacter(i-1,j,f,t));
    const a=els[i-1].root.style, b=els[i].root.style, u=ease(k);
    switch(s.transition){
      case 'fade': b.opacity=u; break;
      case 'wipe': b.clipPath='inset(0 '+((1-u)*100)+'% 0 0)'; break;
      case 'push': a.transform='translateX('+(-u*100)+'%)'; b.transform='translateX('+((1-u)*100)+'%)'; break;
      case 'zoom': b.opacity=u; b.transform='scale('+lerp(1.35,1,outCubic(k))+')'; a.transform='scale('+lerp(1,.85,u)+')'; break;
      case 'iris': b.clipPath='circle('+(u*80)+'% at 50% 50%)'; break;
    }
  }
  waits.push(drawScene(i,t,f)); s.characters.forEach((c,j)=>drawCharacter(i,j,f,t));
  const line=s.lines.find(l=>t>=l.start-.05&&t<=l.end+.25);
  if(DATA.captions==='words'&&line){
    // Karaoke: the word being spoken lights up, timed by its place in the sentence.
    if(cap.__line!==line){cap.__line=line;const ws=line.text.split(/\s+/);let acc=0;const tot=ws.reduce((a,w)=>a+w.length+1,0);
      cap.innerHTML='';cap.__words=ws.map(w=>{const sp=document.createElement('span');sp.className='w';sp.textContent=w+' ';cap.appendChild(sp);const a=acc/tot;acc+=w.length+1;return {sp,a}})}
    const u=(t-line.start)/Math.max(.1,line.end-line.start);
    let on=0;cap.__words.forEach((w,k)=>{if(u>=w.a)on=k});
    cap.__words.forEach((w,k)=>w.sp.classList.toggle('on',k===on));
  } else {cap.__line=null;cap.textContent=line?line.text:''}
  boil.setAttribute('seed',String(1+Math.floor(t*8)%3));
  const w=waits.filter(Boolean);
  return w.length?Promise.all(w).then(()=>i):i;
}, scenes:scenes.length};
`;

/**
 * The video page for a built timeline. `cast` maps each name to its character; `tracks` maps each name
 * to its per-frame {mouth, blink, emph}; `media` holds data URLs for image items and backdrops;
 * `manim` holds per scene {t, frames} for scenes with a Manim animation.
 */
export function explainerHtml({ spec, timeline, cast, tracks, media = {}, manim = {}, fps, width: W, height: H, player = null }) {
  // The size unit for characters and text: the height in landscape, less in a tall frame so they fit across.
  const U = Math.min(H, 1.2 * W);
  const data = { fps, W, H, U, captions: spec.captions, boxes: { bust: CHAR_BOX, full: FULL_BOX }, mouths: MOUTHS, gestures: GESTURES, moodFaces: MOOD_FACES, scenes: timeline, tracks, manim };
  const sceneHtml = spec.scenes.map((s, i) => {
    const tl = timeline[i];
    const items = s.items.map((it, k) => {
      let inner;
      if (it.kind === 'svg' || it.kind === 'chart' || it.kind === 'crowd' || it.kind === 'network') inner = it.svg;
      else if (it.kind === 'image') inner = `<img src="${media[it.image]}" style="width:100%;height:auto;display:block;border-radius:6px">`;
      else if (it.kind === 'bubble') {
        const sp = tl.characters.find((c) => c.who === it.who);
        const side = sp && sp.x > tl.items[k].x ? 'right' : 'left';
        inner = `<div class="bubble ${it.style} tail-${side}" style="font-size:${Math.round(U * 0.034)}px">${escapeHtml(it.text)}</div>`;
      } else if (it.kind === 'tag') inner = `<div class="tag" style="font-size:${Math.round(U * 0.03)}px">${escapeHtml(it.text)}</div>`;
      else inner = `<div class="text" style="font-family:${it.font === 'hand' ? HAND : SANS};font-size:${Math.round(it.size * U)}px;color:${it.color}">${escapeHtml(it.text)}</div>`;
      const style = it.kind === 'text' || it.kind === 'tag' ? '' : `width:${Math.round(it.w * W)}px`;
      const mark = it.mark !== 'none' ? `<svg class="mark" data-kind="${it.mark}" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible"><path fill="none" stroke="${it.markColor}" stroke-width="${Math.max(3, Math.round(H / 140))}" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '';
      return { pin: !!it.pin, html: `<div class="item${it.kind === 'tag' || it.kind === 'bubble' || it.over ? ' over' : ''}" id="s${i}i${k}" style="${style}"><div class="reveal">${inner}</div>${mark}</div>` };
    });
    // Pinned items (titles, counters, labels) stay put on screen while the camera moves.
    const hud = items.filter((x) => x.pin).map((x) => x.html).join('');
    const worldItems = items.filter((x) => !x.pin).map((x) => x.html).join('');
    const chars = s.characters.map((c, k) => `<div class="char" id="s${i}c${k}">${characterSvg(cast[c.who], { id: `c${i}_${k}`, body: c.body })}</div>`).join('');
    const mnTag = player && player.manim[i] ? `video muted playsinline preload="auto" src="${player.manim[i]}"` : 'img';
    const mn = s.manim ? `<${mnTag} class="mn" id="s${i}m" style="left:${(s.manim.x - s.manim.w / 2) * W}px;top:${(s.manim.y - s.manim.w / 2) * H}px;width:${s.manim.w * W}px;height:${s.manim.w * H}px">${mnTag === 'img' ? '' : '</video>'}` : '';
    let bd = '';
    if (s.backdropImage) bd = `<div class="bd" id="s${i}b"><img src="${media[s.backdropImage.file]}" style="width:100%;height:100%;object-fit:cover;display:block"><div style="position:absolute;inset:0;background:${s.background[0]};opacity:${s.backdropImage.dim}"></div></div>`;
    else {
      const svg = backdropSvg(s.backdrop, s.background[0], { width: W, height: H, seed: `${spec.title}:${i}` });
      if (svg) bd = `<div class="bd" id="s${i}b">${svg}</div>`;
    }
    const pt = particlesSvg(s.particles, { width: W, height: H, seed: `${spec.title}:${i}` });
    return `<div class="scene" id="s${i}"><div class="bg" style="background:radial-gradient(ellipse at 50% 42%, ${mix(s.background[0], '#ffffff', 0.18)} 0%, ${s.background[0]} 45%, ${s.background[1]} 100%)"></div>` +
      bd + `<div class="world" id="s${i}w">${mn}${worldItems}${chars}</div>` + (hud ? `<div class="hud">${hud}</div>` : '') + (pt ? `<div class="pt" id="s${i}p">${pt}</div>` : '') + '</div>';
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(spec.title)}</title><style>
html,body{margin:0;width:${player ? '100%' : W + 'px'};height:${player ? '100%' : H + 'px'};overflow:hidden;background:#000}
#frame{position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;transform-origin:0 0}
#stage{position:absolute;inset:0;overflow:hidden}
.scene{position:absolute;inset:0;overflow:hidden;visibility:hidden;transform-origin:50% 50%;isolation:isolate}
.world{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
.hud{position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:4}
.bg{position:absolute;inset:0}
.bd{position:absolute;left:-15%;top:-15%;width:130%;height:130%;transform-origin:50% 50%}
.bd svg,.pt svg{width:100%;height:100%;display:block}
.pt{position:absolute;inset:0;pointer-events:none;transform-origin:50% 50%}
.item{position:absolute;transform-origin:50% 50%;visibility:hidden;filter:url(#boil)}
.item svg{width:100%;height:auto;display:block;overflow:visible}
.text{white-space:pre;line-height:1.05}
.mn{position:absolute;visibility:hidden;object-fit:contain}
.item.over{z-index:3}
#cap .w{transition:none}#cap .w.on{color:#f6d94a}
.tag{background:#2a2346;color:#fffaf0;font-family:${SANS};font-weight:600;padding:.35em .8em;border-radius:.4em;border-left:.35em solid #f2c14b;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.25)}
.bubble{position:relative;background:#fffaf0;border:3px solid #2a2346;color:#2a2346;font-family:${HAND};line-height:1.2;padding:.55em .8em;border-radius:1.2em;text-align:center}
.bubble.thought{border-radius:50%;padding:1em 1.2em}
.bubble.speech::after{content:'';position:absolute;bottom:-18px;width:26px;height:22px;background:#fffaf0;border:3px solid #2a2346;border-top:none;border-left:none;clip-path:polygon(0 0,100% 0,100% 100%)}
.bubble.speech.tail-left::after{left:22%;transform:skewX(30deg)}
.bubble.speech.tail-right::after{right:22%;transform:skewX(-30deg) scaleX(-1)}
.bubble.thought::before,.bubble.thought::after{content:'';position:absolute;background:#fffaf0;border:3px solid #2a2346;border-radius:50%}
.bubble.thought::before{width:20px;height:20px;bottom:-24px}
.bubble.thought::after{width:11px;height:11px;bottom:-40px}
.bubble.thought.tail-left::before{left:24%}.bubble.thought.tail-left::after{left:16%}
.bubble.thought.tail-right::before{right:24%}.bubble.thought.tail-right::after{right:16%}
.char{position:absolute;transform-origin:50% 100%;filter:url(#boil)}
.char svg{width:100%;height:100%;display:block;overflow:visible}
#mottle{position:absolute;inset:0;pointer-events:none;mix-blend-mode:soft-light;opacity:.9;background-image:${noise(0.012, 3, 0.55, [0.15, 0.12, 0.2])}}
#grain{position:absolute;inset:0;pointer-events:none;mix-blend-mode:multiply;opacity:.5;background-image:${noise(0.85, 3, 0.35)}}
#vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 55%,rgba(12,8,36,.5) 100%)}
#cap{position:absolute;left:12%;right:12%;bottom:${H > W ? '7%' : '4.5%'};text-align:center;color:#fff;font:600 ${Math.round(Math.min(H, 1.6 * W) * 0.034)}px/1.3 ${SANS};-webkit-text-stroke:${(Math.min(H, 1.6 * W) * 0.034 * 0.16).toFixed(1)}px rgba(18,14,34,.92);paint-order:stroke fill;text-shadow:0 1px 3px rgba(0,0,0,.85),0 0 14px rgba(0,0,0,.4)${spec.captions === false ? ';display:none' : ''}}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><filter id="boil" x="-2%" y="-2%" width="104%" height="104%"><feTurbulence id="boilT" type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="1"/><feDisplacementMap in="SourceGraphic" scale="${Math.max(2, Math.round(H / 260))}" xChannelSelector="R" yChannelSelector="G"/></filter></svg>
<div id="frame"><div id="stage">${sceneHtml}</div><div id="mottle"></div><div id="grain"></div><div id="vignette"></div><div id="cap"></div></div>${player ? playerChrome(spec, timeline, player) : ''}
<script>const DATA=${jsonForScript(data)};
${RIG_JS}
${PAGE_RUNTIME}
${player ? PLAYER_JS : ''}
</script></body></html>`;
}

// The interactive player: the same page, driven by the sound's clock, with play/pause, a scrubber,
// chapters (one per scene) and a captions switch. The frame scales to the window.
function playerChrome(spec, timeline, player) {
  const chapters = timeline.map((s, i) => `<button class="ch" data-t="${s.start.toFixed(2)}" title="${escapeHtml(s.lines[0].text)}">${i + 1}. ${escapeHtml(s.lines[0].text.split(/\s+/).slice(0, 5).join(' '))}${s.lines[0].text.split(/\s+/).length > 5 ? '...' : ''}</button>`).join('');
  return `<audio id="snd" preload="auto" src="${player.audio}"></audio>
<div id="bar"><button id="pp" aria-label="Play">&#9658;</button><input id="scrub" type="range" min="0" max="1000" value="0" aria-label="Position"><span id="tm">0:00</span><button id="cc" aria-pressed="true">CC</button></div>
<div id="chapters">${chapters}</div>
<div id="big">&#9658;</div>
<style>#bar{position:fixed;left:0;right:0;bottom:0;display:flex;gap:10px;align-items:center;padding:8px 12px;background:rgba(10,8,24,.82);font:14px ${SANS};color:#fff;z-index:5}
#bar button{background:#2a2346;color:#fff;border:1px solid #6b6688;border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit}
#scrub{flex:1}#chapters{position:fixed;left:0;right:0;bottom:46px;display:flex;flex-wrap:wrap;gap:6px;padding:6px 12px;z-index:5}
.ch{background:rgba(255,255,255,.88);border:0;border-radius:12px;padding:3px 10px;font:12px ${SANS};color:#2a2346;cursor:pointer}.ch.on{background:#f2c14b}
#big{position:fixed;left:50%;top:45%;transform:translate(-50%,-50%);font-size:64px;color:#fff;background:rgba(10,8,24,.6);border-radius:50%;width:110px;height:110px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:6}</style>`;
}

const PLAYER_JS = String.raw`
(()=>{
  const snd=document.getElementById('snd'), pp=document.getElementById('pp'), scrub=document.getElementById('scrub'), tm=document.getElementById('tm'), cc=document.getElementById('cc'), big=document.getElementById('big'), frame=document.getElementById('frame');
  const total=scenes[scenes.length-1].end, chs=[...document.querySelectorAll('.ch')];
  const fit=()=>{const s=Math.min(innerWidth/W,(innerHeight-90)/H);frame.style.transform='translate('+((innerWidth-W*s)/2)+'px,0) scale('+s+')'};
  addEventListener('resize',fit);fit();
  const fmt=(x)=>Math.floor(x/60)+':'+String(Math.floor(x%60)).padStart(2,'0');
  let last=-1;
  const draw=()=>{const t=Math.min(total-.001,snd.currentTime), f=Math.floor(t*fps);
    if(f!==last){last=f;window.studio.render(f)}
    scrub.value=String(Math.round(t/total*1000)); tm.textContent=fmt(t)+' / '+fmt(total);
    const i=scenes.findIndex(s=>t<s.end); chs.forEach((c,k)=>c.classList.toggle('on',k===i));
    if(!snd.paused) requestAnimationFrame(draw)};
  const play=()=>{window.__playing=true;snd.play();pp.innerHTML='&#10074;&#10074;';big.style.display='none';requestAnimationFrame(draw)};
  const pause=()=>{window.__playing=false;snd.pause();pp.innerHTML='&#9658;';draw()};
  pp.onclick=()=>snd.paused?play():pause(); big.onclick=play;
  addEventListener('keydown',(e)=>{if(e.code==='Space'){e.preventDefault();snd.paused?play():pause()}});
  scrub.oninput=()=>{snd.currentTime=scrub.value/1000*total;last=-1;draw()};
  chs.forEach(c=>c.onclick=()=>{snd.currentTime=+c.dataset.t+.01;last=-1;if(snd.paused)play();else draw()});
  cc.onclick=()=>{const on=cc.getAttribute('aria-pressed')!=='true';cc.setAttribute('aria-pressed',String(on));document.getElementById('cap').style.visibility=on?'visible':'hidden'};
  snd.onended=pause;
  window.studio.render(0);
})();
`;

/** Cells of the preview sheet: mouths, blinks, moods, every gesture and looking aside. */
export const SHEET_STATES = [
  { label: 'rest' }, { label: 'smile', mood: 'happy' }, { label: 'open', m: 'open' }, { label: 'round', m: 'round' },
  { label: 'f / v', m: 'fv' }, { label: 'half blink', eyes: 1 }, { label: 'blink', eyes: 2 }, { label: 'surprised', mood: 'surprised', m: 'round' },
  { label: 'serious', mood: 'serious' }, { label: 'point', g: 'point' }, { label: 'wave', g: 'wave' }, { label: 'explain', g: 'explain' },
  { label: 'present', g: 'present' }, { label: 'shrug', g: 'shrug', mood: 'curious' }, { label: 'think', g: 'think', mood: 'curious' }, { label: 'look left', look: -1 },
  { label: 'thumbs up', g: 'thumbs', mood: 'happy' }, { label: 'count', g: 'count' }, { label: 'point left', g: 'point-left' }, { label: 'look right', look: 1 },
];

/** The preview sheet page for a character. */
export function sheetHtml(character, { body = 'bust' } = {}) {
  const box = body === 'full' ? FULL_BOX : CHAR_BOX;
  const cellH = Math.round(300 * box.height / box.width) + 20;
  const cells = SHEET_STATES.map((s, i) => `<div class="cell"><div class="c">${characterSvg(character, { id: `k${i}`, body })}</div><div class="l">${s.label}</div></div>`).join('');
  const data = { mouths: MOUTHS, gestures: GESTURES, moodFaces: MOOD_FACES, states: SHEET_STATES };
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#8fc0d8;display:grid;grid-template-columns:repeat(4,300px);width:1200px}
.cell{position:relative;height:${cellH}px;overflow:hidden}.c svg{width:300px;height:${cellH - 20}px;overflow:visible}.l{position:absolute;left:8px;bottom:6px;font:600 15px system-ui,sans-serif;color:#1d1840}</style></head><body>${cells}
<script>const DATA=${jsonForScript(data)};
${RIG_JS}
DATA.states.forEach((s,i)=>{
  const p=rigParts('k'+i), mf=MF[s.mood||'neutral'];
  setMouth(p,s.m||(mf.smile?'smile':'rest'));
  setEyes(p,s.eyes||0);
  setBrows(p,mf.brows);
  const g=gestureOf(s.g||'rest');
  for(const side of ['right','left']) setArm(p.arms[side],g[side][0],g[side][1],g[side][2]);
  setChin(p,g.chin);
  p.armsG.setAttribute('transform','translate(0,'+(-(g.lift||0)*16)+')');
  const lx=s.look||0;
  setTurn(p,lx,0);
  p.head.setAttribute('transform','rotate('+(lx*2.5+(g.lift||0)*5)+' '+p.hx+' '+p.hy+')');
});
</script></body></html>`;
}

/** Height of the preview sheet in pixels. */
export const sheetHeight = (body = 'bust') => Math.ceil(SHEET_STATES.length / 4) * (Math.round(300 * (body === 'full' ? FULL_BOX : CHAR_BOX).height / CHAR_BOX.width) + 20);
