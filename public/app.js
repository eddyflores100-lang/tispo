import {categoryFit,imagePath,money,normalize,searchable,unitFor,variantKey,variantMap} from './shop.mjs';
import {$,closeModal,empty,escapeHTML as e,icon,modal,opt,readLocal,request,toast,writeLocal} from './ui.mjs';
import {checkoutUI} from './checkout.mjs';

const store={
  products:new Map(),cart:[],stock:new Map(),delivery:null,
  saveCart(){writeLocal('tispo-bolsa-v1',this.cart);const count=this.cart.reduce((n,x)=>n+x.qty,0);$('#bag-count').textContent=count;$('.bag-button').setAttribute('aria-label','Abrir bolsa, '+count+' prendas')},
  async refresh(){try{const data=await request('/api/inventario');this.stock=variantMap(data.variants);this.delivery=data.delivery;return true}catch{return false}}
};
const checkout=checkoutUI(store);
let list=[],categories=[],favorites=new Set(),currentProduct=null,selectedSize='',chatContext=null;
const sortOptions=[['destacadas','Destacadas'],['menor','Menor precio'],['mayor','Mayor precio'],['nombre','Nombre A–Z']];
function shopLink(changes={},params=new URLSearchParams()){
  const query=new URLSearchParams(params);
  for(const [key,value] of Object.entries(changes)){if(!value||value==='Todas'||value==='destacadas')query.delete(key);else query.set(key,value)}
  return '#tienda'+(query.size?'?'+query:'');
}
const route=()=>{const [path,query='']=location.hash.slice(1).split('?');return {path,params:new URLSearchParams(query)}};
const deptMatch=(p,d)=>!d||p.department===d||(d!=='Unisex'&&p.department==='Unisex');
function pricing(p){
  const available=p.sizes.map(size=>store.stock.get(variantKey(p.id,size))).filter(row=>row?.unidades>0);
  const lowest=Math.min(...p.sizes.map(size=>unitFor(p,store.stock.get(variantKey(p.id,size)))));
  const varied=p.sizes.some(s=>unitFor(p,store.stock.get(variantKey(p.id,s)))!==lowest);
  return {amount:lowest,text:(varied?'Desde ':'')+money(lowest),ready:available.length>0};
}
function filtered(params){
  const q=normalize(params.get('q')),category=params.get('categoria'),line=params.get('linea'),size=params.get('talla'),order=params.get('ordenar');
  let found=list.filter(p=>(!category||p.category===category)&&deptMatch(p,line)&&(!size||p.sizes.includes(size))&&(!q||q.split(/\s+/).every(term=>searchable(p).includes(term))));
  if(order==='menor'||order==='mayor') found.sort((a,b)=>(pricing(a).amount-pricing(b).amount)*(order==='menor'?1:-1));
  if(order==='nombre')found.sort((a,b)=>a.name.localeCompare(b.name,'es'));
  return found;
}
const heart=(p,wide=false)=>'<button type="button" class="'+(wide?'outline':'heart icon-button')+'" data-act="favorito" data-id="'+p.id+'" aria-label="'+(favorites.has(p.id)?'Quitar de favoritos':'Guardar en favoritos')+' '+e(p.name+' '+p.color)+'" aria-pressed="'+favorites.has(p.id)+'">'+icon('heart')+(wide?(favorites.has(p.id)?'Guardado en favoritos':'Guardar en favoritos'):'')+'</button>';
function card(p,index){
  const price=pricing(p);
  return '<article class="card"><a class="card-image" href="#producto/'+p.id+'" aria-label="Ver '+e(p.name+' '+p.color)+'"><img src="'+imagePath(p.id)+'" alt="'+e(p.name+' en '+p.color.toLowerCase())+'" width="456" height="570" loading="'+(index<4?'eager':'lazy')+'"></a>'+heart(p)+'<div class="card-info"><p class="card-dept">'+e(p.department)+' · '+e(p.category)+'</p><div class="card-line"><h3><a href="#producto/'+p.id+'">'+e(p.name)+'</a></h3><span class="price">'+price.text+'</span></div><p class="card-color"><i class="swatch" style="--color:'+p.swatch+'"></i>'+e(p.color)+'</p><button class="quick" data-act="rapido" data-id="'+p.id+'" aria-label="Elegir talla de '+e(p.name+' '+p.color)+'">Elegir talla '+icon('plus')+'</button></div></article>';
}
function collection(params,saved=false,home=false){
  const rows=saved?list.filter(p=>favorites.has(p.id)):filtered(params);
  const category=params.get('categoria'),line=params.get('linea'),search=params.get('q'),size=params.get('talla');
  const title=saved?'Tus favoritos':search?'Resultados de búsqueda':category||(!line?'Toda la ropa':'Ropa de '+line.toLowerCase());
  const filteredNow=Boolean(size||line||category||search);
  const titleNote=saved?'Las prendas que guardaste en este dispositivo.':search?'Búsqueda: «'+e(search)+'»':'Precios en USD · Las referencias por encargo se cotizan antes del pago.';
  const grid=items=>'<div class="grid">'+items.map(card).join('')+'</div>';
  let merchandise=rows.length?grid(rows):empty(saved?'Todavía no tienes favoritos':'No encontramos prendas con esos filtros',saved?'Toca el corazón de una prenda para guardarla.':'Prueba otra talla, categoría o búsqueda.');
  if(home&&rows.length>4)merchandise=grid(rows.slice(0,4))+$('#hero-template').innerHTML+grid(rows.slice(4));
  $('#view').innerHTML='<section class="container collection"><div class="collection-title"><div><h1>'+e(title)+' <span>('+rows.length+')</span></h1><p class="collection-sub">'+titleNote+'</p></div>'+(!saved?'<div class="tools"><button class="lite" data-act="filtros">'+icon('tune')+' Filtros'+(size?' · '+e(size):'')+'</button></div>':'')+'</div>'+(!saved?'<div class="controls"><div class="categories" aria-label="Categorías">'+['Todas',...categories].map(c=>'<a class="chip '+((category||'Todas')===c?'on':'')+'" href="'+e(shopLink({categoria:c},params))+'">'+e(c)+'</a>').join('')+'</div><select class="order-select" id="order-select" aria-label="Ordenar prendas">'+sortOptions.map(([v,label])=>opt(v,label,params.get('ordenar')||'destacadas')).join('')+'</select></div>':'')+(filteredNow&&!saved?'<div class="wrap-actions"><a class="text-button fine" href="#tienda">Quitar filtros</a></div>':'')+merchandise+'</section>';
  const select=$('#order-select');if(select)select.onchange=()=>location.hash=shopLink({ordenar:select.value},params);
}
function sizeButtons(p,context){
  return '<div class="field-heading"><strong>Selecciona tu talla</strong><button class="text-button fine" data-act="guia" data-id="'+p.id+'" data-source="'+context+'">Guía de talla</button></div><div class="sizes" role="group" aria-label="Tallas de '+e(p.name)+'">'+p.sizes.map(s=>'<button type="button" class="size '+(selectedSize===s?'chosen':'')+'" data-act="talla" data-id="'+p.id+'" data-size="'+s+'" aria-pressed="'+(selectedSize===s)+'">'+s+'</button>').join('')+'</div><p class="error size-error" role="alert"></p>';
}
function purchaseBox(p,quick=false){
  const desc=pricing(p),row=store.stock.get(variantKey(p.id,selectedSize)),ready=row?.unidades>0;
  return '<div class="product-price"><strong>'+e(selectedSize?money(unitFor(p,row)):desc.text)+'</strong><span class="fine">'+(ready?'Precio confirmado':'Referencia por encargo')+'</span></div>'+sizeButtons(p,quick?'rapido':'ficha')+'<div class="buttons"><button class="btn wide" data-act="agregar" data-id="'+p.id+'">'+icon('bag')+' Añadir a la bolsa</button>'+(quick?'':'<button class="outline wide" data-act="ya" data-id="'+p.id+'">Comprar ahora '+icon('right')+'</button>')+'</div>';
}
function product(p){
  $('#view').innerHTML='<section class="container"><div class="crumb"><a href="#tienda">Tienda</a> / <a href="#tienda?categoria='+encodeURIComponent(p.category)+'">'+e(p.category)+'</a> / '+e(p.name)+'</div><div class="product-layout"><div class="product-photo"><img src="'+imagePath(p.id)+'" alt="'+e(p.name+' en '+p.color)+'" width="456" height="570"></div><div class="product-info"><p class="eyebrow">'+e(p.department+' / '+p.category)+'</p><h1>'+e(p.name)+'</h1><p class="product-color"><i class="swatch" style="--color:'+p.swatch+'"></i> Color: '+e(p.color)+'</p><p class="product-desc">'+e(p.description)+'</p><div data-buybox>'+purchaseBox(p)+'</div><div class="product-help"><p><strong>Corte</strong> · '+e(p.cut)+'</p><p class="fine">Imagen de referencia. En un encargo confirmamos prenda, talla y entrega antes del pago.</p><div class="wrap-actions">'+heart(p,true)+'<button class="lite" data-act="asesor" data-id="'+p.id+'">'+icon('chat')+' Consultar esta prenda</button></div></div></div></div><section class="related"><h2>Completa el conjunto</h2><div class="grid">'+p.related.map(id=>store.products.get(id)).filter(Boolean).map(card).join('')+'</div></section></section>';
}
function quick(p,reset=true){
  if(reset)selectedSize='';currentProduct=p;
  modal('Compra rápida','<div class="mini"><img src="'+imagePath(p.id)+'" alt="'+e(p.name)+'"><div><p class="fine">'+e(p.department)+'</p><h3>'+e(p.name)+'</h3><p>'+e(p.color)+'</p></div></div><div data-buybox data-quick>'+purchaseBox(p,true)+'</div><a class="text-button fine" href="#producto/'+p.id+'">Ver ficha completa</a>');
}
function filters(){
  const {params}=route();
  modal('Filtrar y ordenar','<form id="filter-form"><label class="field">Colección<select name="linea">'+['','Mujer','Hombre','Unisex'].map(v=>opt(v,v||'Todas',params.get('linea')||'')).join('')+'</select></label><label class="field">Categoría<select name="categoria">'+['',...categories].map(v=>opt(v,v||'Todas',params.get('categoria')||'')).join('')+'</select></label><label class="field">Talla<select name="talla">'+['','XS','S','M','L','XL','24','26','28','30','32','34','36','38'].map(v=>opt(v,v||'Cualquier talla',params.get('talla')||'')).join('')+'</select></label><label class="field">Ordenar por<select name="ordenar">'+sortOptions.map(([v,label])=>opt(v,label,params.get('ordenar')||'destacadas')).join('')+'</select></label><button class="btn wide" type="submit">Aplicar filtros</button><a class="text-button" href="#tienda">Limpiar todo</a></form>',true);
  $('#filter-form').onsubmit=event=>{event.preventDefault();const next=shopLink(Object.fromEntries(new FormData(event.target)),params);closeModal();if(next===location.hash)routePage(false);else location.hash=next};
}
function productLink(p){
  return '<a class="search-result" href="#producto/'+p.id+'"><img src="'+imagePath(p.id)+'" alt=""><div><b>'+e(p.name)+'</b><span>'+e(p.color)+' · '+pricing(p).text+'</span></div></a>';
}
function searchDialog(){
  modal('Buscar en Tispo','<form class="search-field" id="search-form">'+icon('search')+'<input id="search-input" aria-label="Buscar por prenda, color o corte" placeholder="Prenda, color o corte…" type="search" maxlength="80"><button class="lite" type="submit">Buscar</button></form><div id="search-results" class="search-results"></div>');
  const input=$('#search-input');function update(){const found=filtered(new URLSearchParams({q:input.value}));$('#search-results').innerHTML=found.slice(0,6).map(productLink).join('')||'<p>No hay coincidencias. Prueba otra palabra.</p>'}
  input.oninput=update;$('#search-form').onsubmit=event=>{event.preventDefault();closeModal();location.hash=shopLink({q:input.value.trim()})};update();input.focus();
}
function menu(){modal('Tienda Tispo','<nav class="modal-links"><a href="#tienda">Toda la ropa</a><a href="#tienda?linea=Mujer">Mujer</a><a href="#tienda?linea=Hombre">Hombre</a><a href="#tienda?linea=Unisex">Unisex</a><a href="#guardados">Mis favoritos</a><a href="#pedidos">Mis pedidos</a><button data-act="asesor">Hablar con el asesor</button></nav>',true)}
function chat(id){
  chatContext=id||null;const p=store.products.get(id);
  modal('Asesor de tienda','<p>'+(p?'Consulta sobre '+e(p.name)+' en '+e(p.color.toLowerCase())+'.':'Encuentra prendas por color, talla o presupuesto.')+'</p><div class="wrap-actions"><button class="lite" data-act="sugerir" data-msg="'+(p?'¿Cómo mido mi talla?':'Camisetas hasta $25')+'">'+(p?'Cómo medir mi talla':'Camisetas hasta $25')+'</button><button class="lite" data-act="sugerir" data-msg="¿Cómo combino esta prenda?">Cómo combinarla</button></div><div id="chat-log" aria-live="polite"></div><form class="chat-form" id="chat-form"><input aria-label="Tu consulta" name="message" maxlength="500" placeholder="¿Qué estás buscando?" required><button class="btn" type="submit">Enviar</button></form>',true);
  $('#chat-form').onsubmit=event=>{event.preventDefault();ask(event.target.message.value)};
}
async function ask(message){
  const form=$('#chat-form'),log=$('#chat-log');if(!form||!message.trim()||form.dataset.pending)return;
  form.dataset.pending='1';form.querySelector('button').disabled=true;form.message.value='';
  log.insertAdjacentHTML('beforeend','<p class="chat-turn user">'+e(message)+'</p>');const response=document.createElement('div');response.className='chat-turn';response.textContent='Buscando en la tienda…';log.append(response);
  try{const result=await request('/api/asesor',{method:'POST',data:{message,product:chatContext}});chatContext=result.product;response.innerHTML=e(result.text)+'<div class="chat-products">'+(result.products||[]).map(id=>store.products.get(id)).filter(Boolean).map(productLink).join('')+'</div>'}
  catch(error){response.textContent=error.message}finally{delete form.dataset.pending;form.querySelector('button').disabled=false;if(form.isConnected)form.scrollIntoView({block:'nearest'})}
}
function add(p,now){
  if(!selectedSize||!p.sizes.includes(selectedSize)){const box=$('#overlay').open?$('#modal-body'):$('#view');box.querySelector('.size-error').textContent='Elige una talla para añadir esta prenda.';box.querySelector('.size')?.focus();return}
  const line=store.cart.find(l=>l.id===p.id&&l.size===selectedSize);
  if((line?.qty||0)>=10||store.cart.reduce((n,x)=>n+x.qty,0)>=30){toast('Máximo de 10 unidades por talla y 30 prendas por pedido.');return}
  if(line)line.qty++;else store.cart.push({id:p.id,size:selectedSize,qty:1});
  store.saveCart();if(now){closeModal();location.hash='comprar'}else checkout.bag();
}
function help(id){
  modal(id==='datos'?'Datos del pedido':'Pedidos y entregas',id==='datos'?'<p class="help-text">Guardamos tu pedido y los datos de contacto en la tienda para atenderlo. El comprobante incluye un enlace privado de seguimiento. Tu bolsa y tus favoritos se guardan en este dispositivo.</p>':'<p class="help-text">Elige una prenda y su talla, añádela a la bolsa y finaliza el pedido. En los encargos verás el precio final y el costo de entrega antes de aceptar. Si todas tus tallas tienen stock y tu ciudad tiene cobertura, también podrás comprar contra entrega.</p><a href="#pedidos" class="text-button">Ver mis pedidos</a>');
}
async function action(button){
  const {act,id,size}=button.dataset,p=store.products.get(id);
  if(await checkout.action(act,button))return;
  switch(act){
    case 'cerrar':closeModal();return;
    case 'menu':menu();return;
    case 'buscar':searchDialog();return;
    case 'filtros':filters();return;
    case 'rapido':quick(p);return;
    case 'favorito':
      favorites.has(id)?favorites.delete(id):favorites.add(id);writeLocal('tispo-selection',[...favorites]);
      if(route().path==='guardados'){collection(new URLSearchParams(),true)}else{
        document.querySelectorAll('[data-act="favorito"]').forEach(b=>{if(b.dataset.id===id)b.outerHTML=heart(p,b.classList.contains('outline'))});
      }toast(favorites.has(id)?'Guardado en favoritos.':'Prenda eliminada de favoritos.');return;
    case 'talla':{
      currentProduct=p;selectedSize=size;
      const box=button.closest('[data-buybox]');box.innerHTML=purchaseBox(p,box.hasAttribute('data-quick'));const chosen=box.querySelector('.chosen');chosen?.focus({preventScroll:true});return;
    }
    case 'guia':modal('Guía de talla','<h3>'+e(p.name)+'</h3><p class="help-text">'+e(categoryFit(p.category))+'</p><p class="fine">Tallas de referencia: '+p.sizes.join(' · ')+'.</p><button class="btn wide" data-act="volver-talla" data-id="'+id+'" data-source="'+button.dataset.source+'">Volver a las tallas</button>');return;
    case 'volver-talla':if(button.dataset.source==='rapido')quick(p,false);else closeModal();return;
    case 'agregar':add(p,false);return;
    case 'ya':add(p,true);return;
    case 'asesor':chat(id);return;
    case 'sugerir':await ask(button.dataset.msg);return;
    case 'ayuda':help(id);return;
  }
}
function routePage(scroll=true){
  const {path,params}=route(),home=['','inicio','contenido'].includes(path);
  closeModal();$('#assistant-launch').hidden=path==='comprar'||path.startsWith('pedido/');
  document.querySelectorAll('.primary a').forEach(a=>a.classList.toggle('active',a.hash===location.hash));
  document.title='Tispo — Tienda de ropa americana';
  if(home||path==='tienda'||path==='guardados')collection(params,path==='guardados',home);
  else if(path.startsWith('producto/')){
    const p=store.products.get(path.split('/')[1]);if(p){currentProduct=p;selectedSize='';product(p);document.title=p.name+' · '+p.color+' | Tispo'}else $('#view').innerHTML=empty('Prenda no encontrada','Revisa las referencias que están en la tienda.');
  }else if(path==='comprar')checkout.checkout();
  else if(path==='pedidos')checkout.orders();
  else if(path.startsWith('pedido/')){const [,ref,key]=path.split('/');checkout.receipt(ref,key)}
  else collection(new URLSearchParams());
  if(scroll)window.scrollTo({top:0,behavior:'instant'});
}
async function start(){
  try{
    const result=await fetch('./catalog.json');if(!result.ok)throw Error();list=await result.json();store.products=new Map(list.map(p=>[p.id,p]));categories=['Jeans','Camisetas','Chaquetas','Camisas','Sudaderas','Pantalones','Faldas'];
    const raw=readLocal('tispo-bolsa-v1',[]);store.cart=Array.isArray(raw)?raw.filter(l=>l&&store.products.get(l.id)?.sizes.includes(l.size)&&Number.isInteger(l.qty)&&l.qty>0&&l.qty<=10).slice(0,30):[];
    const saved=readLocal('tispo-selection',[]),legacy={denim:'jean-recto',chaqueta:'chaqueta-denim',camiseta:'camiseta-cruda'};favorites=new Set((Array.isArray(saved)?saved:[]).map(id=>legacy[id]||id).filter(id=>store.products.has(id)));
    document.addEventListener('click',event=>{const button=event.target.closest('[data-act]');if(button){action(button).catch(()=>toast('No se pudo completar la acción. Vuelve a intentarlo.'));return}const anchor=event.target.closest('a[href^="#"]');if(anchor&&$('#overlay').open)closeModal();if(anchor?.hash===location.hash&&anchor.hash.startsWith('#producto/'))routePage()});
    $('#overlay').onclick=event=>{if(event.target===$('#overlay')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal()}};
    store.saveCart();window.addEventListener('hashchange',()=>routePage());routePage(false);
    store.refresh().then(ok=>{if(ok&&!$('#overlay').open){const p=route().path;if(['','inicio','tienda','guardados'].includes(p))collection(route().params,p==='guardados',['','inicio'].includes(p));if(p.startsWith('producto/')&&currentProduct&&store.products.get(p.split('/')[1])===currentProduct)product(currentProduct);if(p==='comprar')checkout.checkout()}});
    checkout.recover();
  }catch{$('#view').innerHTML='<section class="container empty"><h2>No se pudo cargar la tienda</h2><p>Comprueba tu conexión y vuelve a cargar la página.</p><a class="btn" href="./">Reintentar</a></section>'}
}
start();
