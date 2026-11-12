// Optional DOM runtime check. Needs: npm i jsdom (not a runtime dependency). Run: node tests/optional/dom-runtime.js
const {JSDOM,VirtualConsole,ResourceLoader}=require('jsdom');const fs=require('fs'),path=require('path');
const PUB=path.join(__dirname,'..','..','public');let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
async function load(file){const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));vc.on('error',e=>errs.push(String(e)));
 const dom=await JSDOM.fromFile(path.join(PUB,file),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.matchMedia=q=>({matches:false,media:q,addEventListener(){},removeEventListener(){}});w.IntersectionObserver=class{constructor(cb){this.cb=cb}observe(el){this.cb([{isIntersecting:true,target:el}])}unobserve(){}disconnect(){}};
  w.Path2D=function(){};w.HTMLCanvasElement.prototype.getContext=function(){const n=()=>{};return{setTransform:n,clearRect:n,save:n,restore:n,translate:n,scale:n,fill:n,set fillStyle(v){},set globalAlpha(v){}}};
  w.HTMLElement.prototype.getBoundingClientRect=function(){return{top:0,left:0,width:900,height:600,right:900,bottom:600}};
  w.__notes=[];w.AudioContext=class{constructor(){this.currentTime=0;this.state='running';this.destination={}}createOscillator(){w.__notes.push(1);return{frequency:{},connect(){},start(){},stop(){}}}createGain(){return{gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}resume(){}}}});
 await new Promise(r=>setTimeout(r,500));return{dom,w:dom.window,d:dom.window.document,errs}}
(async()=>{
 let t=await load('index.html');ok(t.errs.length===0,'index.html: no script errors '+t.errs.join('|'));
 const h=t.d.querySelector('h1');ok(h.getAttribute('aria-label')==='Same people. Different room.'&&h.querySelectorAll('.lt').length===4,'h1 split into igniting words, aria-label keeps the text');
 ok(t.d.querySelector('#river').dataset.on==='1','hero canvas initialised');ok(t.d.documentElement.classList.contains('js'),'js class set');
 t.d.querySelector('#mb').click();await new Promise(r=>setTimeout(r,120));ok(t.d.querySelector('#menu').classList.contains('open')&&!t.d.querySelector('#menu').hasAttribute('inert'),'menu opens, becomes interactive');const svg=t.d.querySelector('#menu .cons');ok(svg&&svg.querySelectorAll('a').length>=20&&svg.getAttribute('aria-hidden')==='true','constellation menu built with '+(svg&&svg.querySelectorAll('a').length)+' nodes, hidden from assistive tech');
 t=await load('lighting.html');ok(t.errs.length===0,'lighting.html: no script errors '+t.errs.join('|'));
 const room=t.d.querySelector('#room');ok(room.querySelectorAll('button').length===60,'60 lights rendered');
 const snd=t.d.querySelector('#snd');ok(snd.getAttribute('aria-pressed')==='false','sound is off by default');
 room.querySelectorAll('button')[0].click();await new Promise(r=>setTimeout(r,60));ok(t.w.__notes.length===0,'no audio created while sound is off');
 room.querySelectorAll('button')[0].click();snd.click();ok(snd.getAttribute('aria-pressed')==='true'&&snd.textContent==='Sound: on','sound toggles on by user action');
 room.querySelectorAll('button')[30].click();await new Promise(r=>setTimeout(r,1300));const lit=room.querySelectorAll('button.on').length;ok(lit===60,'light spreads until all 60 are lit ('+lit+')');ok(t.w.__notes.length>0,'notes played once sound is on ('+t.w.__notes.length+')');
 t.d.querySelector('#rs').click();ok(room.querySelectorAll('button.on').length===0,'dim the room resets');
 t=await load('passport.html');ok(t.errs.length===0,'passport.html: no script errors');const pp=t.d.querySelector('.pp');pp.click();ok(pp.querySelector('.st2')&&pp.querySelector('.st2').textContent==='YOU','passport takes a stamp');
 ok(pp.getAttribute('tabindex')==='0'&&pp.getAttribute('role')==='button','passport is keyboard operable');
 t=await load('manifesto.html');ok(t.errs.length===0,'manifesto.html: no script errors');const w=t.d.querySelectorAll('.read .w');ok(w.length>40&&t.d.querySelector('.read p').getAttribute('aria-label').startsWith('Candela'),'reading-light words split ('+w.length+'), full text kept in aria-label');
 t=await load('method.html');ok(t.errs.length===0,'method.html: no script errors');t.d.querySelectorAll('#vb button')[1].click();t.d.querySelectorAll('#vb button')[2].click();ok(/Two threads/.test(t.d.querySelector('#vt').textContent),'method explainer responds');
 t=await load('rsvp.html');ok(t.errs.length===0,'rsvp.html: no script errors');
 console.log(fails?`\n${fails} FAILED`:'\nall runtime checks passed');process.exit(fails?1:0)})();
