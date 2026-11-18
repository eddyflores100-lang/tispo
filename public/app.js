const $ = s => document.querySelector(s);
const catalog = await fetch('./catalog.json').then(r => r.json());
const photos = await fetch('./photos.json').then(r=>r.json());
$('#hero-photo').src=photos.hero;
const panel=$('#panel'), inside=$('#inside');
const saved=new Set(JSON.parse(localStorage.getItem('tispo-selection') || '[]'));
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node};
const button=(title,action)=>{const b=el('button',title);b.onclick=action;return b};
function openPanel(title){inside.replaceChildren(el('h2',title));panel.setAttribute('aria-label',title);if(!panel.open)panel.showModal();panel.scrollTop=0}
$('.close').onclick=()=>panel.close();
function updateCount(){ $('#count').textContent=saved.size }
function product(p){
 openPanel(p.name);
 const photo=el('img',null,'product-img');photo.src=photos[p.id];photo.alt=p.name+' · referencia editorial';
 const save=button(saved.has(p.id)?'Quitar de guardados':'Guardar prenda',()=>{saved.has(p.id)?saved.delete(p.id):saved.add(p.id);localStorage.setItem('tispo-selection',JSON.stringify([...saved]));updateCount();product(p)});
 inside.append(photo,el('p',p.note),el('h3','Cómo llevarla'),el('p',p.look),el('p','Avance de colección · Precio y disponibilidad por confirmar.','fine'),save,button('Consultar al asesor',()=>chat(p.id)));
}
function render(category){
 $('#grid').replaceChildren();
 for(const p of catalog.filter(p=>category==='Todo'||p.category===category)){
 const card=button('',()=>product(p));card.className='card';const img=el('img');img.src=photos[p.id];img.loading='lazy';img.alt=p.name+' · referencia editorial';card.append(img,el('small',p.category.toUpperCase()),el('h3',p.name));$('#grid').append(card)
 }
 for(const b of $('.filters').children)b.setAttribute('aria-pressed',String(b.textContent===category));
}
for(const category of ['Todo',...new Set(catalog.map(p=>p.category))])$('.filters').append(button(category,()=>render(category)));
render('Todo');updateCount();
$('#saved').onclick=()=>{openPanel('Tus guardados');if(!saved.size)inside.append(el('p','Abre una prenda y toca «Guardar prenda» para volver a verla aquí.'));for(const p of catalog.filter(p=>saved.has(p.id)))inside.append(button(p.name,()=>product(p)))};
function chat(context){
 openPanel('Asesor Tispo');const item=catalog.find(p=>p.id===context);inside.append(el('p',item?'Consultando sobre '+item.name.toLowerCase()+'.':'Pregunta por combinaciones, medidas o la apertura de la colección.'));
 const log=el('div',null,'chatlog');log.setAttribute('aria-live','polite');const form=el('form'),input=el('input');input.placeholder='Escribe tu consulta';input.setAttribute('aria-label','Tu consulta');input.maxLength=500;input.required=true;
 const send=el('button','Enviar');send.type='submit';form.append(input,send);const choices=el('div');inside.append(choices,log,form);
 async function ask(message){
 if(send.disabled||!message.trim())return;log.append(el('p',message,'user'));send.disabled=true;input.value='';const pending=el('p','Consultando…');log.append(pending);
 try{const res=await fetch('https://tispo.eddyflores100.workers.dev/api/asesor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,product:context}),signal:AbortSignal.timeout(12000)});if(!res.ok)throw Error();const data=await res.json();pending.textContent=data.text;context=data.product}catch{pending.textContent='El asesor no pudo conectarse. Puedes volver a enviar tu consulta.'}finally{send.disabled=false;panel.scrollTop=panel.scrollHeight}
 }
 for(const q of ['¿Cómo combino el jean?','¿Cómo mido mi talla?','¿Ya puedo comprar?'])choices.append(button(q,()=>ask(q)));
 form.onsubmit=e=>{e.preventDefault();ask(input.value)};
}
$('#ask').onclick=()=>chat();$('#styleAsk').onclick=()=>chat('denim');
