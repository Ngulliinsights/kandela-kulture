(function(){'use strict';
document.documentElement.classList.add('js');
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
const FD='M -4.65,49.86 C -4.75,49.74 -4.73,49.45 -4.52,48.07 C -3.85,43.64 -3.84,41 -4.47,37.79 C -5.33,33.41 -6.56,30.76 -10.34,25.05 C -12.73,21.46 -13.67,19.73 -14.37,17.72 C -15.86,13.44 -15.22,9.21 -12.34,4.25 C -9.26,-1.06 -8.19,-4.49 -8.18,-9.18 C -8.17,-10.19 -8.21,-11.39 -8.27,-11.83 C -8.76,-15.87 -8.97,-20.73 -8.74,-23.54 C -8.09,-31.83 -4.81,-39.23 2.22,-48.23 C 4.14,-50.68 4.33,-50.61 3.45,-47.75 C 0.54,-38.27 0.15,-29.94 2.24,-22.25 C 3.26,-18.51 5.12,-14.33 7.84,-9.63 C 8.09,-9.19 8.53,-8.42 8.81,-7.91 C 9.1,-7.4 9.66,-6.39 10.05,-5.67 C 12.41,-1.41 13.84,2.15 14.64,5.77 C 15.7,10.57 15.35,13.53 12.7,22.14 C 12.33,23.37 11.8,25.11 11.53,26 C 8.35,36.73 5.97,41.6 1.67,46.12 C -0.28,48.18 -4.15,50.47 -4.65,49.86';
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const hex=h=>{h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');return[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)||0)};
const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
/* 1. The living hero: a field of flames. A river of light drifts through it; touch or move to ignite, and the light spreads. */
function heroCanvas(){const c=$('#river');if(!c||c.dataset.on||!c.getContext)return;c.dataset.on=1;const ctx=c.getContext('2d');if(!ctx)return;const P=typeof Path2D==='function'?new Path2D(FD):null;if(!P)return;
let W=0,H=0,cell=78,cols=0,rows=0,E,col,raf=0,vis=true,px=-1e4,py=-1e4;
const colors=()=>{col={dim:hex(css('--p-tone')||'#12233F'),cat:hex(css('--p-catch')||'#F0EDE7'),lit:hex(css('--gd')||'#FFBA3C')}};
function size(){const r=c.getBoundingClientRect();if(!r.width)return;const d=Math.min(devicePixelRatio||1,2);W=r.width;H=r.height;c.width=Math.round(W*d);c.height=Math.round(H*d);ctx.setTransform(d,0,0,d,0,0);cell=W<600?56:78;cols=Math.ceil(W/cell)+1;rows=Math.ceil(H/cell)+1;E=new Float32Array(cols*rows)}
const ss=(a,b,t)=>{t=Math.min(1,Math.max(0,(t-a)/(b-a)));return t*t*(3-2*t)};
const river=(x,y,t)=>{const u=((x/W)+(y/H)*.8+t*.00002+.08*Math.sin(x/W*6.283+t*.0004))%1,d=Math.min(u,1-u);return Math.max(0,1-d/.1)};
function draw(t){if(!W)return;ctx.clearRect(0,0,W,H);const n=E.slice();
for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const k=j*cols+i;let m=0;if(i>0)m=Math.max(m,n[k-1]);if(i<cols-1)m=Math.max(m,n[k+1]);if(j>0)m=Math.max(m,n[k-cols]);if(j<rows-1)m=Math.max(m,n[k+cols]);E[k]=Math.max(n[k]*.93,m*.64)}
for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const x=i*cell+(j%2?cell/2:0),y=j*cell;const dx=x-px,dy=y-py,pd=Math.hypot(dx,dy);if(pd<120)E[j*cols+i]=Math.max(E[j*cols+i],1-pd/120);
const calm=W>=760?ss(.32,.82,x/W):ss(.45,.95,y/H);const v=Math.max(river(x,y,t)*(.1+.9*calm),E[j*cols+i]);const rgb=v<.5?mix(col.dim,col.cat,v*2):mix(col.cat,col.lit,(v-.5)*2);const s=cell*(.5+.55*v)/100;
ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.fillStyle='rgb('+rgb+')';ctx.globalAlpha=.55+.45*v;ctx.fill(P);ctx.restore()}}
const loop=t=>{if(vis&&!document.hidden){draw(t);raf=requestAnimationFrame(loop)}else raf=0};
const go=()=>{if(!raf&&!rm){raf=requestAnimationFrame(loop)}};
function move(e){const r=c.getBoundingClientRect();px=e.clientX-r.left;py=e.clientY-r.top}
addEventListener('pointermove',move,{passive:true});addEventListener('pointerdown',move,{passive:true});addEventListener('pointerleave',()=>{px=py=-1e4});
colors();size();matchMedia('(prefers-color-scheme: light)').addEventListener?.('change',()=>{colors();draw(performance.now())});new MutationObserver(()=>{colors();draw(performance.now())}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
addEventListener('resize',()=>{size();draw(performance.now())});
if('IntersectionObserver'in window)new IntersectionObserver(es=>{vis=es[0].isIntersecting;if(vis){size();go()}}).observe(c);
document.addEventListener('visibilitychange',go);rm?draw(1e7):go()}
/* 2. Headlines light up letter by letter, like a room being lit. */
function lightUp(h){if(!h||h.dataset.lu||rm||h.closest('[hidden]'))return;h.dataset.lu=1;const t=h.textContent;h.setAttribute('aria-label',t);h.textContent='';t.split(' ').forEach((w,i,a)=>{const s=document.createElement('span');s.className='lt';s.setAttribute('aria-hidden','true');s.style.setProperty('--d',i*120+'ms');s.textContent=w;h.appendChild(s);if(i<a.length-1)h.appendChild(document.createTextNode(' '))})}
/* 3. The wick: a flame that travels down the page as you read. */
function wick(){if($('#wick')||rm||innerWidth<900)return;const w=document.createElement('div');w.id='wick';w.setAttribute('aria-hidden','true');const i=document.createElement('i');w.appendChild(i);document.body.appendChild(w);let tk=false;const u=()=>{tk=false;const h=document.documentElement,p=h.scrollTop/((h.scrollHeight-h.clientHeight)||1);i.style.setProperty('--p',Math.min(1,Math.max(0,p)).toFixed(3))};addEventListener('scroll',()=>{if(!tk){tk=true;requestAnimationFrame(u)}},{passive:true});u()}
/* 4. The menu as a constellation of Hearths. The accessible list stays underneath. */
function graph(){const m=$('#menu');if(!m||m.dataset.g)return;m.dataset.g=1;const gs=$$('.g > div',m);if(!gs.length)return;const NS='http://www.w3.org/2000/svg',mk=(n,a)=>{const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);return e};
const svg=mk('svg',{viewBox:'0 0 1000 560','class':'cons','aria-hidden':'true'}),cx=500,cy=280;let L='';
const home=mk('circle',{cx,cy,r:14,'class':'hn'});gs.forEach((g,gi)=>{const a=gi/gs.length*Math.PI*2-Math.PI/2,gx=cx+Math.cos(a)*250,gy=cy+Math.sin(a)*165;svg.appendChild(mk('line',{x1:cx,y1:cy,x2:gx,y2:gy}));
const items=$$('a',g);items.forEach((it,k)=>{const o=(k-(items.length-1)/2)*.66,nx=gx+Math.cos(a+o)*(95+(k%2)*28),ny=gy+Math.sin(a+o)*(70+(k%2)*20);svg.appendChild(mk('line',{x1:gx,y1:gy,x2:nx,y2:ny}));
const lk=mk('a',{href:it.getAttribute('href'),tabindex:'-1'});lk.appendChild(mk('circle',{cx:nx,cy:ny,r:7}));const tx=mk('text',{x:nx+(Math.cos(a+o)>=0?12:-12),y:ny+4,'text-anchor':Math.cos(a+o)>=0?'start':'end'});tx.textContent=it.textContent;lk.appendChild(tx);svg.appendChild(lk)});
const lb=mk('text',{x:gx,y:gy+4,'text-anchor':'middle','class':'gl'});lb.textContent=g.querySelector('.mh').textContent;svg.appendChild(mk('circle',{cx:gx,cy:gy,r:5,'class':'gn'}));svg.appendChild(lb)});
svg.appendChild(home);m.insertBefore(svg,$('.g',m))}
/* 5. Passport: tilts to your touch and takes a stamp. */
function passport(){const p=$('.pp');if(!p||p.dataset.on)return;p.dataset.on=1;const set=(a,b)=>{p.style.setProperty('--rx',a+'deg');p.style.setProperty('--ry',b+'deg')};
if(!rm){p.addEventListener('pointermove',e=>{const r=p.getBoundingClientRect();set(((e.clientY-r.top)/r.height-.5)*-10,((e.clientX-r.left)/r.width-.5)*12)});p.addEventListener('pointerleave',()=>set(0,0))}
const stamp=()=>{const s=$('.sm .no',p);if(s){s.classList.remove('no');s.classList.add('st2');s.textContent='YOU'}};p.addEventListener('click',stamp);p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();stamp()}})}
/* 6. Reading light: words brighten as they reach the middle of the screen. */
function reading(){$$('.read').forEach(r=>{if(r.dataset.on||rm||r.closest('[hidden]'))return;r.dataset.on=1;const ws=[];$$('p',r).forEach(p=>{const t=p.textContent;p.setAttribute('aria-label',t);p.textContent='';t.split(' ').forEach((w,i,a)=>{const s=document.createElement('span');s.className='w';s.setAttribute('aria-hidden','true');s.textContent=w+(i<a.length-1?' ':'');p.appendChild(s);ws.push(s)})});
let tk=false;const u=()=>{tk=false;const vh=innerHeight;for(const s of ws){const y=s.getBoundingClientRect().top;s.style.setProperty('--t',Math.max(0,Math.min(1,(vh*.85-y)/(vh*.3))).toFixed(2))}};addEventListener('scroll',()=>{if(!tk){tk=true;requestAnimationFrame(u)}},{passive:true});u()})}
/* 7. Sound, off until you ask: each light you ignite plays a note, so the room becomes a chord. */
function sound(){const b=$('#snd');if(!b||b.dataset.on)return;b.dataset.on=1;let ac=null,on=false;const SC=[0,2,4,7,9];
b.addEventListener('click',()=>{on=!on;b.setAttribute('aria-pressed',String(on));b.textContent='Sound: '+(on?'on':'off');if(on&&!ac){const A=window.AudioContext||window.webkitAudioContext;if(A)ac=new A()}if(ac&&ac.state==='suspended')ac.resume()});
document.addEventListener('kk:light',e=>{if(!on||!ac)return;const{col,k}=e.detail;if(k>2)return;const f=196*Math.pow(2,(SC[col%5]+12*(Math.floor(col/5)%3))/12),t=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.05,t+.03);g.gain.exponentialRampToValueAtTime(.0001,t+1.5);o.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+1.6)})}
function init(){heroCanvas();$$('main h1').forEach(lightUp);wick();reading();passport();sound();const mb=$('#mb');if(mb&&!mb.dataset.g){mb.dataset.g=1;mb.addEventListener('click',graph)}}
window.__kk2={init,graph};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
