(function(){'use strict';
document.documentElement.classList.add('js');
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];const rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
const WA=document.body.dataset.wa||'';const TX={rsvp:'Hi Kandela, I’d like to RSVP for a gathering. My name is ',partner:'Hi Kandela, I’d like to talk about working together. I run ',concern:'Hi, I’d like to raise a concern. ',hello:'Hi Kandela, I have a question: '};
const wa=t=>'https://wa.me/'+WA+'?text='+encodeURIComponent(t);
const SOC={instagram:'https://www.instagram.com/kandelakulture/',tiktok:'https://www.tiktok.com/@kandelakulture'};
function wire(){$('[data-wa]').forEach(a=>{a.href=wa(TX[a.dataset.wa]||TX.hello);a.target='_blank';a.rel='noopener'});$('[data-social]').forEach(a=>{a.href=SOC[a.dataset.social]||'#';a.target='_blank';a.rel='noopener me nofollow'})}
function menu(){const m=$('#menu'),b=$('#mb'),x=$('#mx');if(!m||!b||m.dataset.on)return;m.dataset.on=1;
const shut=back=>{m.classList.remove('open');m.setAttribute('aria-hidden','true');m.setAttribute('inert','');b.setAttribute('aria-expanded','false');document.body.classList.remove('nolock');if(back)b.focus()};
b.addEventListener('click',()=>{const r=b.getBoundingClientRect();m.style.setProperty('--mx',(r.left+r.width/2)+'px');m.style.setProperty('--my',(r.top+r.height/2)+'px');$$('.g>div',m).forEach((d,i)=>d.style.setProperty('--i',i));m.removeAttribute('inert');m.setAttribute('aria-hidden','false');m.classList.add('open');b.setAttribute('aria-expanded','true');document.body.classList.add('nolock');setTimeout(()=>x.focus(),80)});
x.addEventListener('click',()=>shut(true));addEventListener('keydown',e=>{if(e.key==='Escape'&&m.classList.contains('open'))shut(true)});m.addEventListener('click',e=>{if(e.target.closest('a'))setTimeout(()=>shut(false),0)})}
function initMethod(){const g=$('#th'),b=$('#vb'),t=$('#vt');if(!g||b.dataset.on)return;b.dataset.on=1;const VS=[['The floor',0],['A hike',1],['A supper',2],['A build day',3]],MSG=['No threads yet. Two people who’ve never met.','One thread: pleasant, but fragile.','Two threads: stronger.','Three threads: starting to carry real trust.','Four threads: a bond that can carry a favour.'],st=['','','stroke-dasharray="14 8"','stroke-dasharray="1 8" stroke-linecap="round"'],on=new Set();
function draw(){g.innerHTML=[...on].sort().map((i,n,a)=>`<path d="M78 114 Q300 ${114+(n-(a.length-1)/2)*68} 522 114" class="${i%2?'s-lit':'s-line'}" ${st[i]}/>`).join('');t.textContent=MSG[on.size];$$('button',b).forEach(x=>x.setAttribute('aria-pressed',on.has(+x.dataset.i)))}
b.innerHTML=VS.map(v=>`<button class="ch" type="button" data-i="${v[1]}" aria-pressed="false">${v[0]}</button>`).join('');b.onclick=e=>{const x=e.target.closest('button');if(!x)return;const i=+x.dataset.i;on.has(i)?on.delete(i):on.add(i);draw()};draw()}
function initRoom(){const r=$('#room');if(!r)return;const R=5,C=12;r.innerHTML=Array.from({length:R*C},(_,i)=>`<button type="button" aria-label="light ${i+1}"></button>`).join('');const bs=$$('button',r);
const ping=(j,q)=>document.dispatchEvent(new CustomEvent('kk:light',{detail:{col:j%C,k:q}}));
function spread(i){if(rm){bs.forEach(b=>b.classList.add('on'));return}const seen=new Set([i]);let f=[i];bs[i].classList.add('on');ping(i,0);(function step(){const n=[];f.forEach(k=>{const x=k%C,y=(k/C)|0;[[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy])=>{const a=x+dx,c=y+dy;if(a<0||a>=C||c<0||c>=R)return;const j=c*C+a;if(!seen.has(j)){seen.add(j);n.push(j)}})});n.forEach((j,q)=>{bs[j].classList.add('on');ping(j,q)});f=n;if(n.length)setTimeout(step,130)})()}
r.onclick=e=>{const b=e.target.closest('button');if(b)spread(bs.indexOf(b))};$('#rs').onclick=()=>bs.forEach(b=>b.classList.remove('on'))}
function initForm(){const f=$('[data-rsvp]');if(!f)return;const out=$('#rsvp-out'),ok=$('#rsvp-ok');const q=new URLSearchParams(location.search);if(q.get('event')&&f.event)f.event.value=q.get('event');
f.addEventListener('submit',async e=>{e.preventDefault();out.textContent='';const d={event:f.event.value,name:f.name.value,phone:f.phone.value,needs:f.needs.value,website:f.website.value,age18:f.age18.checked,remind:f.remind.checked,future:f.future.checked};
if(!d.age18){out.textContent='Please confirm you are 18 or older.';return}
try{const r=await fetch('/api/rsvp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});const j=await r.json();if(r.ok){f.hidden=true;ok.hidden=false;ok.setAttribute('tabindex','-1');ok.focus()}else out.textContent=j.error||'Please check the form.'}
catch(_){out.textContent='We couldn’t reach the server. Use the WhatsApp button instead, and we’ll save your place by hand.';const a=document.createElement('a');a.className='bt gh';a.dataset.wa='rsvp';a.textContent='RSVP on WhatsApp';out.after(a);wire()}})}
function reveal(){const els=$$('.rv:not(.in)');if(rm||!('IntersectionObserver'in window)){els.forEach(e=>e.classList.add('in'));return}let fired=false;const io=new IntersectionObserver(es=>{fired=true;es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -6% 0px',threshold:.06});els.forEach(e=>io.observe(e));let tk=false;const sweep=()=>{tk=false;els.forEach(e=>{if(!e.classList.contains('in')&&e.getBoundingClientRect().top<innerHeight*.94){e.classList.add('in');io.unobserve(e)}})};addEventListener('scroll',()=>{if(!tk){tk=true;requestAnimationFrame(sweep)}},{passive:true});setTimeout(()=>{if(!fired)els.forEach(e=>e.classList.add('in'))},2500)}
function header(){const h=$('header');if(!h||h.dataset.on)return;h.dataset.on=1;const u=()=>h.classList.toggle('sc',scrollY>8);addEventListener('scroll',u,{passive:true});u()}
function current(){const here=window.__preview?location.hash:(location.pathname.split('/').pop()||'index.html');$$('header nav a:not(.bt)').forEach(a=>{a.removeAttribute('aria-current');if(a.getAttribute('href')===here)a.setAttribute('aria-current','page')})}

function loaded(){$('.im img:not([data-w])').forEach(i=>{i.dataset.w=1;const d=()=>i.classList.add('ld');i.complete&&i.naturalWidth?d():(i.addEventListener('load',d),i.addEventListener('error',d))})}
let items=[],cur=0,dlg=null;
function buildLb(){
  if(dlg)return dlg;
  dlg=document.createElement('dialog');dlg.id='lb';dlg.setAttribute('aria-label','Photo viewer');
  const bx=document.createElement('div');bx.className='lbx';
  const x=document.createElement('button');x.className='x';x.type='button';x.textContent='Close';
  const pv=document.createElement('button');pv.className='pv';pv.type='button';pv.setAttribute('aria-label','Previous photo');pv.textContent='←';
  const nx=document.createElement('button');nx.className='nx';nx.type='button';nx.setAttribute('aria-label','Next photo');nx.textContent='→';
  const im=document.createElement('img');im.alt='';
  const p=document.createElement('p');
  bx.append(x,pv,nx,im,p);dlg.appendChild(bx);document.body.appendChild(dlg);
  dlg.addEventListener('click',e=>{if(e.target===dlg||e.target===bx)dlg.close()});
  x.onclick=()=>dlg.close();pv.onclick=()=>go(-1);nx.onclick=()=>go(1);
  dlg.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')go(-1);if(e.key==='ArrowRight')go(1)});
  let sx=0;dlg.addEventListener('touchstart',e=>{sx=e.touches[0].clientX},{passive:true});
  dlg.addEventListener('touchend',e=>{const d=e.changedTouches[0].clientX-sx;if(Math.abs(d)>50)go(d<0?1:-1)});
  return dlg;
}
function showLb(){
  const f=items[cur];if(!f)return;
  const im=$('img',f),a=$('a[data-lb]',f),d=buildLb(),t=$('img',d),h=a?a.getAttribute('href'):'';
  t.src=(h&&!h.startsWith('#'))?h:(im.currentSrc||im.src);t.alt=im.alt;
  const cap=$('figcaption',f);$('p',d).textContent=cap?cap.textContent:'';
}
function go(n){cur=(cur+n+items.length)%items.length;showLb()}
function openLb(f){
  items=$('figure[data-slot]:not([hidden])',f.closest('main')||document);
  cur=Math.max(0,items.indexOf(f));
  showLb();
  const d=buildLb();if(!d.open)d.showModal();
}
function initLb(){
  document.addEventListener('click',e=>{
    const a=e.target.closest&&e.target.closest('a[data-lb]');
    if(!a||e.metaKey||e.ctrlKey)return;
    e.preventDefault();
    const f=a.closest('figure');if(f)openLb(f);
  });
}
function gallery(){
  const g=$('#gal');if(!g||g.dataset.on)return;g.dataset.on=1;
  const n=$('#gal-n');
  $('.chips [data-f]').forEach(b=>b.addEventListener('click',()=>{
    const f=b.dataset.f;
    $('.chips [data-f]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    let c=0;
    $('figure',g).forEach(m=>{
      const tags=(m.dataset.tags||'').split(' ');
      const ok=f==='all'||tags.includes(f);
      m.hidden=!ok;
      if(ok)c++;
    });
    if(n)n.textContent=c+' photo'+(c===1?'':'s');
  }));
}

function initChooser(){const c=$('#chooser');if(!c||c.dataset.on)return;c.dataset.on=1;const out=$('#ch-out');
const D={f2f:{h:'Then we organise something side by side.',p:'You talk, meet and catch up. What you haven’t had is a shared task, so we give you one.',ex:['A build day for a community space','Cooking for forty, together','A walk with a purpose','A day of volunteering'],t:'The shared effort becomes a story you tell together. That is the third context.'},
sbs:{h:'Then we organise time face to face.',p:'You work, dance or play together. What you haven’t had is unhurried time to talk, so we make some.',ex:['A long table with no agenda','A slow evening of stories','A walk and talk in pairs','A quiet supper after a hard week'],t:'The conversations come back into the work with you. That is the third context.'},
both:{h:'Then we start with the one you have least of.',p:'We begin with a short conversation about how your people really spend time together, then alternate: one side by side, one face to face.',ex:['Alternate month by month','Keep a steady Kandela rhythm','Add a third setting when you are ready'],t:'Each new experience adds to what the group shares.'}};
c.addEventListener('click',e=>{const b=e.target.closest('button[data-k]');if(!b)return;$('button[data-k]',c).forEach(x=>x.setAttribute('aria-pressed',String(x===b)));const d=D[b.dataset.k];if(!d)return;out.textContent='';const h=document.createElement('h3'),p=document.createElement('p'),ul=document.createElement('ul'),t=document.createElement('p');h.textContent=d.h;p.textContent=d.p;ul.className='ls';d.ex.forEach(s=>{const li=document.createElement('li');li.textContent=s;ul.appendChild(li)});t.className='third';t.textContent=d.t;out.append(h,p,ul,t)})}

function initTranslate(){const dlg=$('#tr-dlg');if(!dlg||dlg.dataset.on)return;dlg.dataset.on=1;
const pathEl=$('#tr-path'),sel=$('#tr-sel'),form=$('#tr-form'),orig=$('#tr-orig'),x=$('#tr-close');
const path=location.pathname.split('/').pop()||'index.html';
if(pathEl)pathEl.textContent=path;
function url(l){const c=encodeURIComponent(l||'sw');const live=location.protocol.startsWith('http')&&!/^(localhost|127\.0\.0\.1)/.test(location.hostname);const u=live?location.href:('https://kandelakulture.example/'+(path==='index.html'?'':path));return 'https://translate.google.com/translate?sl=auto&tl='+c+'&u='+encodeURIComponent(u)}
function go(l){if(!l)return;try{localStorage.setItem('kk-lang',l)}catch(_){}window.open(url(l),'_blank','noopener,noreferrer');dlg.close()}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('.tr-btn, a[href="#translate"]');if(!b)return;e.preventDefault();dlg.showModal();if(sel){try{const s=localStorage.getItem('kk-lang');if(s)sel.value=s}catch(_){}}});
if(x)x.onclick=()=>dlg.close();
dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});
dlg.addEventListener('keydown',e=>{if(e.key==='Escape')dlg.close()});
$$('.tr-pill',dlg).forEach(p=>p.onclick=()=>go(p.dataset.lang));
if(form)form.onsubmit=e=>{e.preventDefault();go(sel?sel.value:'sw')};
if(orig)orig.onclick=e=>{e.preventDefault();try{localStorage.removeItem('kk-lang')}catch(_){}dlg.close()}}

function boot(){loaded();initLb();gallery();initTranslate();wire();menu();initChooser();initMethod();initRoom();initForm();reveal();header();current();if(window.__preview&&window.route)window.route();else if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('/sw.js').catch(()=>{})}
window.__kk={wire,initChooser,initMethod,initRoom,initForm,reveal,current,menu,initTranslate};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot()})();
