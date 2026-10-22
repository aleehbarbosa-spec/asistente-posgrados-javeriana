const C = window.CONFIG;
const $ = s => document.querySelector(s);
const chat = $("#chat"), input = $("#input"), send = $("#send");
let systemText = "", history = [];

// ---------- KPIs locales ----------
const M = { get(){ try{return JSON.parse(localStorage.getItem("kpi")||"{}")}catch{return{}} },
  set(o){ try{localStorage.setItem("kpi",JSON.stringify(o))}catch{} } };
function track(ms, ok){ const k=M.get(); k.preguntas=(k.preguntas||0)+1; k.tiempoTotal=(k.tiempoTotal||0)+ms; if(!ok)k.errores=(k.errores||0)+1; M.set(k); }
function vote(v){ const k=M.get(); k[v]=(k[v]||0)+1; M.set(k); }
// En la consola del navegador escribe: kpis()
window.kpis = () => { const k=M.get(); return {preguntas:k.preguntas||0, tiempoPromedioSeg:k.preguntas?+(k.tiempoTotal/k.preguntas/1000).toFixed(1):0, utiles:k.util||0, noUtiles:k.noutil||0, errores:k.errores||0}; };

// ---------- Markdown mínimo y seguro ----------
const esc = t => t.replace(/[&<>]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
function md(t){
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  const lines = t.split("\n"); let out="", list=null, i=0;
  const close=()=>{ if(list){out+=`</${list}>`;list=null} };
  while(i<lines.length){
    const l=lines[i];
    if(/^\s*\|.*\|\s*$/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i+1]||"")){
      close(); const row=r=>r.trim().replace(/^\||\|$/g,"").split("|").map(c=>inline(c.trim()));
      out+="<table><thead><tr>"+row(l).map(c=>`<th>${c}</th>`).join("")+"</tr></thead><tbody>"; i+=2;
      while(i<lines.length && /^\s*\|.*\|\s*$/.test(lines[i])){ out+="<tr>"+row(lines[i]).map(c=>`<td>${c}</td>`).join("")+"</tr>"; i++; }
      out+="</tbody></table>"; continue;
    }
    let m;
    if((m=l.match(/^\s*[-*]\s+(.*)/))){ if(list!=="ul"){close();out+="<ul>";list="ul"} out+=`<li>${inline(m[1])}</li>`; }
    else if((m=l.match(/^\s*\d+[.)]\s+(.*)/))){ if(list!=="ol"){close();out+="<ol>";list="ol"} out+=`<li>${inline(m[1])}</li>`; }
    else if(l.trim()===""){ close(); }
    else { close(); out+=`<p>${inline(l)}</p>`; }
    i++;
  }
  close(); return out;
}

// ---------- UI ----------
function add(role, text, extra=""){
  const row=document.createElement("div"); row.className=`row ${role}`;
  if(role==="bot") row.innerHTML='<div class="avatar" aria-hidden="true">PUJ</div>';
  const d=document.createElement("div"); d.className=`msg ${role} ${extra}`;
  d.innerHTML = role==="user" ? `<p>${esc(text)}</p>` : md(text);
  row.appendChild(d); chat.appendChild(row); row.scrollIntoView({block:"end",behavior:"smooth"}); return d;
}
function feedback(el){
  const f=document.createElement("div"); f.className="fb";
  f.innerHTML='<button data-v="util">Me sirvió</button><button data-v="noutil">No me sirvió</button>';
  f.onclick=e=>{ const v=e.target.dataset.v; if(v){vote(v); f.textContent="Gracias por tu opinión."} };
  el.appendChild(f);
}

// ---------- Carga de contexto (carpeta /contexto) ----------
async function loadContext(){
  const parts = await Promise.all(C.CONTEXTO.map(async p=>{
    try{ const r=await fetch(p); if(!r.ok) throw 0; return `\n\n=== ARCHIVO: ${p} ===\n${await r.text()}`; }
    catch{ return `\n\n=== ARCHIVO: ${p} (no disponible) ===`; }
  }));
  systemText = parts.join("");
}

// ---------- Gemini ----------
function apiKey(){
  let k=localStorage.getItem("gk");
  if(!k){ k=prompt("Pega tu API key gratuita de Gemini (se guarda solo en este navegador):"); if(k) localStorage.setItem("gk",k.trim()); }
  return k;
}
async function ask(question){
  history.push({role:"user",parts:[{text:question}]});
  const body={
    systemInstruction:{parts:[{text:systemText}]},
    contents:history.slice(-10),
    generationConfig:{temperature:0.2,maxOutputTokens:900}
  };
  let r;
  const init={method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)};
  if(C.PROXY_URL){ r=await fetch(C.PROXY_URL,init); }
  else {
    const k=apiKey(); if(!k) throw new Error("Falta la API key. Recarga la página y pégala cuando la pida.");
    // Si un modelo ya no existe (404), prueba el siguiente de la lista
    const MODELS=[C.MODEL,"gemini-3.1-flash-lite","gemini-flash-latest"].filter((m,i,x)=>m&&x.indexOf(m)===i);
    for(const m of MODELS){
      r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${k}`,init);
      if(r.status!==404) break;
    }
  }
  if(!r.ok){ if(r.status===400||r.status===403) localStorage.removeItem("gk"); throw new Error(r.status===429?"Hay muchas consultas en este momento. Intenta de nuevo en un minuto.":`No pude conectar con el servicio (código ${r.status}).`); }
  const j=await r.json();
  const text=j.candidates?.[0]?.content?.parts?.map(p=>p.text).join("")||"";
  if(!text) throw new Error("No recibí respuesta. Reformula tu pregunta o escribe al equipo de Posgrados.");
  history.push({role:"model",parts:[{text}]});
  return text;
}

async function submit(q){
  q=q.trim(); if(!q) return;
  $("#intro").hidden=true; add("user",q); input.value=""; send.disabled=true;
  const wait=add("bot",""); wait.innerHTML='<span class="typing" role="status" aria-label="Escribiendo"><i></i><i></i><i></i></span>'; const t0=performance.now();
  try{ const a=await ask(q); wait.innerHTML=md(a); feedback(wait); track(performance.now()-t0,true); }
  catch(e){ history.pop(); wait.className="msg bot err"; wait.innerHTML=md(e.message); track(performance.now()-t0,false); }
  send.disabled=false; input.focus();
}

// ---------- Inicio ----------
$("#form").addEventListener("submit",e=>{e.preventDefault();submit(input.value)});
input.addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submit(input.value)} });
const PROG=C.PROGRAMAS||[
  {n:"Gerencia Financiera",d:"Decisiones de inversión, finanzas y valor",q:"Cuéntame sobre el posgrado en Gerencia Financiera"},
  {n:"Talento Humano",d:"Gestión y desarrollo de personas",q:"Cuéntame sobre el posgrado en Talento Humano"},
  {n:"Gerencia Estratégica de la Innovación",d:"Estrategia e innovación organizacional",q:"Cuéntame sobre el posgrado en Gerencia Estratégica de la Innovación"}];
$("#programas").innerHTML=PROG.map((p,i)=>`<button type="button" class="prog" data-i="${i}"><span class="ico" aria-hidden="true">${p.i||"🎓"}</span><strong>${esc(p.n)}</strong><span class="d">${esc(p.d)}</span></button>`).join("");
$("#programas").onclick=e=>{ const b=e.target.closest(".prog"); if(b) submit(PROG[b.dataset.i].q) };
$("#chips").innerHTML=C.SUGERENCIAS.map(s=>`<button type="button">${esc(s)}</button>`).join("");
$("#chips").onclick=e=>{ if(e.target.tagName==="BUTTON") submit(e.target.textContent) };
$("#humano").href=`https://wa.me/${C.CONTACTO_WHATSAPP}?text=${encodeURIComponent("Hola, tengo una consulta sobre los posgrados en Administración.")}`;
loadContext();
