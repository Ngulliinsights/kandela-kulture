(function(){'use strict';let lc=null;const rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
const keep=()=>{try{if(lc)sessionStorage.setItem('kk-x',lc.join(','))}catch(_){}};
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href]');if(!a||e.button)return;lc=[e.clientX,e.clientY];if(a.origin===location.origin&&!a.hash)keep()},true);
document.addEventListener('keydown',e=>{const a=document.activeElement;if(e.key==='Enter'&&a&&a.matches&&a.matches('a[href]')){const r=a.getBoundingClientRect();lc=[r.left+r.width/2,r.top+r.height/2];if(a.origin===location.origin&&!a.hash)keep()}},true);
function reveal(vt,p){if(rm||!p||p.length!==2||p.some(isNaN))return;const r=Math.hypot(Math.max(p[0],innerWidth-p[0]),Math.max(p[1],innerHeight-p[1]));return vt.ready.then(()=>document.documentElement.animate({clipPath:['circle(0px at '+p[0]+'px '+p[1]+'px)','circle('+r+'px at '+p[0]+'px '+p[1]+'px)']},{duration:700,easing:'cubic-bezier(.16,1,.3,1)',pseudoElement:'::view-transition-new(root)'})).catch(()=>{})}
addEventListener('pagereveal',e=>{if(!e.viewTransition)return;let p=[];try{p=(sessionStorage.getItem('kk-x')||'').split(',').map(Number);sessionStorage.removeItem('kk-x')}catch(_){}reveal(e.viewTransition,p)});
window.__kkvt={last:()=>lc,reveal};})();
