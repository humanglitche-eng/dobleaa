/* LLUVIA — lluvia de estrellas al modo de UMBRAL (web/umbral/), la de demo-yarcho, traída a Doble AA.
   Capa WebGL2 fija DETRÁS del contenido: vive en el negro de la página y nunca
   pinta sobre las fotos (son opacas y la tapan).
   · Polvo: esferas corpóreas de UMBRAL (difusa + especular) en la tríada
     violeta / celeste / agua, a la deriva por el curl noise, que se apartan del puntero.
   · Fugaces: estelas con la dispersión de película delgada de UMBRAL — cada canal
     RGB se muestrea desfasado y además se abre hacia un costado a lo largo de la estela.
   Más fugaces cuanto más rápido se scrollea; un clic en el vacío larga una tanda;
   window.lluvia.tanda(n) las pide desde afuera (el hero la usa al abrirse la foto).
   Opciones en el <script>: data-invertida → en negativo para fondo claro (luz → tinta,
   mismos tonos); data-polvo="N" → cuántas estrellas de polvo en escritorio (en celular, la mitad);
   data-clave → dónde se recuerda si el visitante la apagó. */
(()=>{'use strict';
const opc=(document.currentScript&&document.currentScript.dataset)||{};
const POLVO=+opc.polvo||4200, INVERTIDA='invertida' in opc, CLAVE=opc.clave||'yarcho-lluvia';
const cv=document.createElement('canvas');cv.id='lluvia';cv.setAttribute('aria-hidden','true');
if(INVERTIDA)cv.style.filter='invert(1) hue-rotate(180deg)';   // negativo: oscuro sobre claro, mismos tonos
document.body.prepend(cv);
const gl=cv.getContext('webgl2',{alpha:true,antialias:false,premultipliedAlpha:true,depth:false});
if(!gl){cv.remove();return;}
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const btn=document.getElementById('b-lluvia');

const NOISE=`
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
 vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
 vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
 vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod(i,289.0);
 vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
 float n_=1.0/7.0;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);
 vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
 vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh2=-step(h,vec4(0.0));
 vec4 a0=b0.xzyw+s0.xzyw*sh2.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh2.zzww;
 vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
 vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
 vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
 return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
vec3 snoiseVec3(vec3 p){return vec3(snoise(p),snoise(p+vec3(123.4,45.6,78.9)),snoise(p+vec3(-9.1,32.7,11.3)));}
vec3 curlNoise(vec3 p){const float e=0.1;vec3 dx=vec3(e,0.,0.),dy=vec3(0.,e,0.),dz=vec3(0.,0.,e);
 vec3 px0=snoiseVec3(p-dx),px1=snoiseVec3(p+dx),py0=snoiseVec3(p-dy),py1=snoiseVec3(p+dy),pz0=snoiseVec3(p-dz),pz1=snoiseVec3(p+dz);
 float x=(py1.z-py0.z)-(pz1.y-pz0.y),y=(pz1.x-pz0.x)-(px1.z-px0.z),z=(px1.y-px0.y)-(py1.x-py0.x);
 return normalize(vec3(x,y,z)/(2.0*e));}
vec3 pal(float t){return 0.5+0.5*cos(6.2832*(t+vec3(0.0,0.33,0.67)));}`;

// ── polvo de estrellas: sin estado, todo sale del índice del vértice ──
const DUST_VS=`#version 300 es
precision highp float;
uniform float uTime,uAspect,uDpr,uScrollY,uEnergy;uniform vec2 uMouse;
out vec3 vCol;out float vA;out float vSoft;
${NOISE}
float hash(float n){return fract(sin(n*127.1+311.7)*43758.5453);}
void main(){
 float id=float(gl_VertexID);
 float a=hash(id+1.),b=hash(id+531.),z=hash(id+1119.),c=hash(id+83.),s=hash(id+23.);
 z=z*z;                                   // la mayoría lejos, pocas cerca
 vec3 home=vec3((a*2.-1.)*uAspect*1.06,b*2.-1.,z);
 vec3 flow=curlNoise(home*1.6+vec3(0.,0.,uTime*.05));
 vec2 p=home.xy+flow.xy*.05*(.4+z);
 // caen siempre (más las cercanas) y el scroll las corre en capas
 float fall=uTime*(.008+z*.03)*(1.+uEnergy*2.)+uScrollY*(.00010+z*.0005);
 p.y=mod(p.y-fall+1.15,2.3)-1.15;
 vec2 d=p-uMouse;float r2=dot(d,d);
 p+=normalize(d+1e-4)*exp(-r2*12.)*.13*(.35+z);
 gl_Position=vec4(p.x/uAspect,p.y,0.,1.);
 float big=step(.988,s);
 gl_PointSize=uDpr*(mix(.9,3.,z)+big*3.4);
 vec3 col=c<.34?vec3(.48,.18,1.):(c<.68?vec3(.25,.83,1.):vec3(.18,1.,.75));
 col=mix(vec3(.85,.88,1.),col,.6);
 if(hash(id+93.)>.88) col=vec3(.95,.96,1.);
 if(big>.5) col=mix(pal(uTime*.05+a),vec3(1.),.3);
 float tw=.5+.5*sin(uTime*(1.1+a*2.6)+b*40.);
 vA=(.12+z*.36+big*.45)*(.35+.65*tw);
 vCol=col;vSoft=1.-z;
}`;
const DUST_FS=`#version 300 es
precision highp float;
in vec3 vCol;in float vA;in float vSoft;out vec4 o;
void main(){
 vec2 d=(gl_PointCoord-.5)*2.;float r2=dot(d,d);if(r2>1.)discard;
 vec3 n=vec3(d.x,-d.y,sqrt(max(1.-r2,0.)));vec3 L=normalize(vec3(-.45,.55,.72));
 float diff=.4+.6*max(dot(n,L),0.);
 float spec=pow(max(dot(reflect(-L,n),vec3(0.,0.,1.)),0.),26.)*.35*(1.-vSoft);
 float a=smoothstep(1.,mix(.5,.05,vSoft),r2)*vA;
 o=vec4((vCol*diff+spec)*a,a);
}`;

// ── fugaces: un quad por estrella (instanciado), estado en JS ──
const MET_VS=`#version 300 es
precision highp float;
layout(location=0) in vec4 aA;   // cabeza.xy, dirección.xy
layout(location=1) in vec4 aB;   // largo, ancho, vida 0..1, tono
uniform float uAspect;
out vec2 vST;out float vLife;out float vHue;out float vLW;
const vec2 Q[6]=vec2[6](vec2(0.,-1.),vec2(1.,-1.),vec2(1.,1.),vec2(0.,-1.),vec2(1.,1.),vec2(0.,1.));
void main(){
 vec2 q=Q[gl_VertexID];
 float s=q.x*1.06-.06;               // un poco por delante de la cabeza, para la brasa
 vec2 dir=aA.zw,perp=vec2(-dir.y,dir.x);
 float w=aB.y*(1.7-max(s,0.)*1.2);   // más ancha en la cabeza
 vec2 p=aA.xy-dir*aB.x*s+perp*w*q.y;
 gl_Position=vec4(p.x/uAspect,p.y,0.,1.);
 vST=vec2(s,q.y);vLife=aB.z;vHue=aB.w;vLW=aB.x/aB.y;
}`;
const MET_FS=`#version 300 es
precision highp float;
in vec2 vST;in float vLife;in float vHue;in float vLW;out vec4 o;
uniform float uTime;
vec3 pal(float t){return 0.5+0.5*cos(6.2832*(t+vec3(0.0,0.33,0.67)));}
void main(){
 float s=vST.x,t=vST.y;
 float tail=pow(clamp(1.-s,0.,1.),1.7)*step(0.,s);
 // dispersión: el núcleo de cada canal se corre hacia un lado a medida que se aleja de la cabeza
 float sp=.5*clamp(s,0.,1.);
 vec3 core=vec3(exp(-pow(t-sp,2.)*7.),exp(-t*t*7.),exp(-pow(t+sp,2.)*7.));
 // película delgada de UMBRAL: la fase avanza por la estela y cada canal se muestrea desfasado
 float ph=vHue+s*1.5-uTime*.12;
 vec3 film=vec3(pal(ph+.05).r,pal(ph).g,pal(ph-.05).b);
 vec3 c=mix(vec3(1.),film*1.25,smoothstep(0.,.3,s))*core*tail*1.5;
 float hd=length(vec2(s*vLW*.55,t));
 c+=vec3(1.,.97,.93)*exp(-hd*hd*2.2)*1.6;
 c*=smoothstep(0.,.1,vLife)*smoothstep(1.,.7,vLife);
 o=vec4(c,clamp(max(c.r,max(c.g,c.b)),0.,1.));
}`;

function sh(t,s){const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);
 if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o;}
function prog(v,f){const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,v));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,f));
 gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
let dustP,metP;
try{dustP=prog(DUST_VS,DUST_FS);metP=prog(MET_VS,MET_FS);}
catch(e){console.warn('LLUVIA no disponible',e);cv.remove();btn&&btn.remove();return;}
const U=(p,ks)=>Object.fromEntries(ks.map(k=>[k,gl.getUniformLocation(p,k)]));
const du=U(dustP,['uTime','uAspect','uDpr','uScrollY','uEnergy','uMouse']);
const mu=U(metP,['uAspect','uTime']);

const MAX=40,inst=new Float32Array(MAX*8);
const vao=gl.createVertexArray();gl.bindVertexArray(vao);
const ib=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,ib);gl.bufferData(gl.ARRAY_BUFFER,inst.byteLength,gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,32,0);gl.vertexAttribDivisor(0,1);
gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,4,gl.FLOAT,false,32,16);gl.vertexAttribDivisor(1,1);
gl.bindVertexArray(null);
const empty=gl.createVertexArray();   // el polvo no lee atributos
gl.enable(gl.BLEND);

let w=1,h=1,asp=1,dpr=1,raf=0,last=0,time=0,energy=0,lastY=scrollY,nextIn=1.2;
let on=!reduced.matches,ptr=[-9,-9],sptr=[-9,-9];
try{const g=localStorage.getItem(CLAVE);if(g!==null&&!reduced.matches)on=g==='1'}catch(e){}
const met=[],cola=[];
const R=(a,b)=>a+Math.random()*(b-a);

function nace(x,y,vel=1){
 if(met.length>=MAX)return;
 const ang=R(-2.25,-2.0);                 // de arriba a la derecha hacia abajo a la izquierda
 met.push({x,y,dx:Math.cos(ang),dy:Math.sin(ang),v:R(1.1,1.9)*vel,len:R(.26,.62),wd:R(.0032,.0056),
   life:0,dur:R(.8,1.5),hue:Math.random()});
}
function alAzar(){nace(R(-asp*.5,asp*1.25),R(.35,1.2))}
function tanda(n=6,x){                    // n fugaces escalonadas, cerca de x si viene
 for(let i=0;i<n;i++)cola.push({t:time+i*R(.07,.16),x:x==null?R(-asp*.4,asp*1.2):x+R(-.25,.45),y:R(.9,1.25)});
}

function resize(){
 w=innerWidth;h=innerHeight;asp=w/h;dpr=Math.min(devicePixelRatio||1,1.5);
 cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);gl.viewport(0,0,cv.width,cv.height);
 if(!raf)frame(0,true);
}

function frame(dt,quieto){
 time+=dt;
 energy*=Math.exp(-dt*2.5);
 sptr[0]+=(ptr[0]-sptr[0])*Math.min(1,dt*6);sptr[1]+=(ptr[1]-sptr[1])*Math.min(1,dt*6);
 if(!quieto){
  nextIn-=dt*(1+energy*4);
  if(nextIn<=0){alAzar();nextIn=R(.35,1.5)}
  while(cola.length&&cola[0].t<=time){const c=cola.shift();nace(c.x,c.y,1.15)}
  for(let i=met.length-1;i>=0;i--){const m=met[i];
   m.x+=m.dx*m.v*dt*(1+energy*.6);m.y+=m.dy*m.v*dt*(1+energy*.6);m.life+=dt/m.dur;
   if(m.life>=1)met.splice(i,1);}
 }
 gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
 gl.useProgram(dustP);gl.bindVertexArray(empty);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
 gl.uniform1f(du.uTime,time);gl.uniform1f(du.uAspect,asp);gl.uniform1f(du.uDpr,dpr);
 gl.uniform1f(du.uScrollY,scrollY);gl.uniform1f(du.uEnergy,energy);gl.uniform2f(du.uMouse,sptr[0],sptr[1]);
 gl.drawArrays(gl.POINTS,0,w<760?Math.round(POLVO*.43):POLVO);
 if(met.length){
  met.forEach((m,i)=>inst.set([m.x,m.y,m.dx,m.dy,m.len*(1+energy*.3),m.wd,m.life,m.hue],i*8));
  gl.useProgram(metP);gl.bindVertexArray(vao);gl.blendFunc(gl.ONE,gl.ONE);
  gl.uniform1f(mu.uAspect,asp);gl.uniform1f(mu.uTime,time);
  gl.bindBuffer(gl.ARRAY_BUFFER,ib);gl.bufferSubData(gl.ARRAY_BUFFER,0,inst,0,met.length*8);
  gl.drawArraysInstanced(gl.TRIANGLES,0,6,met.length);
 }
 gl.bindVertexArray(null);
}
function loop(now){
 raf=0;if(!on||document.hidden)return;
 const dt=Math.min((now-last)/1000||.016,.05);last=now;
 frame(dt,false);raf=requestAnimationFrame(loop);
}
function sync(){
 cancelAnimationFrame(raf);raf=0;
 cv.style.opacity=on?'1':'0';
 if(btn){btn.setAttribute('aria-pressed',String(on));btn.title=on?'Apagar la lluvia de estrellas':'Prender la lluvia de estrellas'}
 if(on&&!document.hidden){last=performance.now();raf=requestAnimationFrame(loop)}
 else if(reduced.matches){cv.style.opacity='1';frame(0,true)}   // movimiento reducido: cielo quieto
}

btn&&btn.addEventListener('click',()=>{on=!on;try{localStorage.setItem(CLAVE,on?'1':'0')}catch(e){}sync();if(on)tanda(4)});
reduced.addEventListener('change',()=>{on=!reduced.matches;sync()});
document.addEventListener('visibilitychange',sync);
addEventListener('resize',resize,{passive:true});
addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;ptr=[(e.clientX/w*2-1)*asp,1-e.clientY/h*2]},{passive:true});
document.documentElement.addEventListener('pointerleave',()=>{ptr=[-9,-9]});
addEventListener('scroll',()=>{energy=Math.min(3,energy+Math.abs(scrollY-lastY)*.0022);lastY=scrollY},{passive:true});
// clic en el vacío (no en fotos, links, controles ni paneles): tanda donde cayó el clic
addEventListener('pointerdown',e=>{
 if(!on||e.button!==0||e.target.closest('a,button,input,textarea,select,label,summary,figure,video,form,.lb,.panel,.mosaico,.grilla,.tablero'))return;
 tanda(6,(e.clientX/w*2-1)*asp);
});
cv.addEventListener('webglcontextlost',e=>{e.preventDefault();on=false;sync();btn&&(btn.hidden=true)});

window.lluvia={tanda:n=>{if(on)tanda(n)}};
resize();sync();
if(on)setTimeout(()=>tanda(3),900);
})();
