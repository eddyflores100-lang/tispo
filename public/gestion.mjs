import {API,labels,money,variantKey,variantMap} from './shop.mjs';
import {$,escapeHTML as e,opt,request} from './ui.mjs';
const status=$('#status'),workspace=$('#workspace');
const prefix='/api/gestion/';
const manage=(path,data)=>request(prefix+path,{admin:true,method:data===undefined?'GET':'POST',data});
let products=[],stocks=new Map(),delivery={},orders=[],next=null;
function message(s){status.textContent=s}
function login(){
  message('Acceso privado para la persona que administra Tispo.');
  workspace.innerHTML='<p>Abre el enlace de un solo uso de la tabla <b>accesos_de_gestion</b> en tu cuenta de Cloudflare. Al activarlo, este navegador mantiene la sesión durante 30 días.</p><p class="wrap-actions"><a class="btn" href="https://dash.cloudflare.com/faf93cd2a0d373573de0859b1cc95328/workers/d1/databases/d255c755-5e10-47f2-a7d0-2f3403b45346" target="_blank" rel="noopener noreferrer">Abrir base de Tispo en Cloudflare</a></p>';
}
function detail(o){
  const person='<p><strong>'+e(o.name)+'</strong> · '+e(o.city)+'</p><p>Contacto: '+e(o.contact)+'</p>'+(o.address?'<p>Dirección: '+e(o.address)+'</p>':'');
  const items='<ul>'+o.items.map(i=>'<li>'+i.qty+' × '+e(i.name)+' · '+e(i.color)+' · '+e(i.size)+' · '+money(i.qty*i.unit)+'</li>').join('')+'</ul>';
  const amounts='<p>Subtotal original: '+money(o.subtotal)+'</p>'+(o.final!=null?'<p>Total final: '+money(o.final+o.shipping)+' (entrega: '+money(o.shipping)+')</p>':'');
  let actions='';
  if(['recibido','oferta'].includes(o.status))actions='<form data-offer="'+o.ref+'"><label class="field">Importe final de las prendas (USD)<input type="number" min=".01" step=".01" max="100000" name="final" required value="'+((o.final??o.subtotal)/100).toFixed(2)+'"></label><label class="field">Entrega (USD)<input type="number" min="0" step=".01" name="shipping" max="10000" required value="'+(o.shipping==null?'':(o.shipping/100).toFixed(2))+'"></label><label class="field">Condiciones para el cliente<textarea name="note" maxlength="500" placeholder="Prendas confirmadas, plazo y forma de entrega">'+e(o.note)+'</textarea></label><label class="field">Enlace de pago de tu comercio (opcional)<input type="url" name="payUrl" value="'+e(o.payUrl)+'"><small>Stripe o PayPal. Aparece cuando el cliente acepta el total.</small></label><button class="btn">Publicar propuesta para el cliente</button></form>';
  const nextStage={confirmado:['despachado','Marcar como despachado'],despachado:['entregado','Marcar como entregado']}[o.status];
  if(nextStage)actions+='<button class="lite" data-ref="'+o.ref+'" data-state="'+nextStage[0]+'">'+nextStage[1]+'</button>';
  if(['recibido','oferta','confirmado'].includes(o.status))actions+='<button class="text-button" data-ref="'+o.ref+'" data-state="cancelado">Cancelar pedido</button>';
  return '<details><summary>'+e(o.ref)+' · '+e(labels[o.status])+' · '+money(o.final!=null?o.final+o.shipping:o.subtotal)+'</summary>'+person+items+amounts+'<p class="fine">Actualización visible desde el enlace privado del cliente. Puedes avisarle por su contacto.</p><div class="wrap-actions">'+actions+'</div></details>';
}
function formStock(){
  const f=$('#inventory');if(!f)return;
  const p=products.find(p=>p.id===f.product.value);if(!p)return;
  const s=f.size.value;f.size.innerHTML=p.sizes.map(v=>opt(v,v,s)).join('');
  const row=stocks.get(variantKey(p.id,f.size.value));
  f.price.value=((row?.precio??p.base)/100).toFixed(2);f.qty.value=row?.unidades||0;
}
function render(){
  message('Sesión de gestión activa.');
  workspace.innerHTML='<div class="wrap-actions"><button class="lite" id="reload">Actualizar pedidos</button><button class="text-button" id="exit">Cerrar sesión</button></div><h2>Pedidos</h2><div id="orders">'+(orders.length?orders.map(detail).join(''):'<p>No hay pedidos de clientes registrados todavía.</p>')+'</div>'+(next!==null?'<button id="more" class="lite">Ver más pedidos</button>':'')+'<h2>Inventario confirmado</h2><p class="fine">Registra únicamente unidades que puedes entregar. El stock se descuenta al confirmar una compra directa.</p><form id="inventory"><label class="field">Prenda<select name="product">'+products.map(p=>opt(p.id,p.name+' · '+p.color)).join('')+'</select></label><label class="field">Talla<select name="size"></select></label><label class="field">Unidades disponibles<input name="qty" type="number" min="0" max="10000" step="1" required></label><label class="field">Precio de venta por unidad (USD)<input name="price" type="number" min=".01" step=".01" max="10000" required></label><button class="btn">Guardar inventario de esta talla</button></form><h2>Compra contra entrega</h2><p class="fine">Al activarla, los clientes de la ciudad indicada podrán confirmar compras con stock y total de entrega conocidos.</p><form id="delivery"><label class="field">Ciudad de cobertura<input name="city" maxlength="65" value="'+e(delivery.ciudad)+'"></label><label class="field">Tarifa por pedido (USD)<input type="number" name="fee" min="0" step=".01" max="1000" required value="'+(delivery.tarifa/100).toFixed(2)+'"></label><label><input name="enabled" type="checkbox" '+(delivery.habilitado?'checked':'')+'> Habilitar pago contra entrega en esta ciudad</label><div class="wrap-actions"><button class="btn">Guardar modalidad</button></div></form>';
  $('#inventory').product.onchange=formStock;$('#inventory').size.onchange=formStock;formStock();
}
const cents=v=>Math.round(Number(v)*100);
async function refresh(){
  const [data,stock]=await Promise.all([manage('pedidos'),request('/api/inventario')]);orders=data.orders;next=data.next;stocks=variantMap(stock.variants);delivery=stock.delivery;render();
}
workspace.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  try{
    if(b.id==='reload')await refresh();
    if(b.id==='exit'){await manage('salir',{});orders=[];login()}
    if(b.id==='more'){const data=await manage('pedidos?offset='+next);orders.push(...data.orders);next=data.next;render()}
    if(b.dataset.state){
      const row=orders.find(o=>o.ref===b.dataset.ref);
      if(b.dataset.state==='cancelado'&&!confirm('¿Cancelar '+row.ref+'? Esta operación se mostrará al cliente.'))return;
      b.disabled=true;await manage('pedidos/'+row.ref,{status:b.dataset.state,version:row.version});await refresh();
    }
  }catch(err){message(err.message);b.disabled=false}
});
workspace.addEventListener('submit',async event=>{
  event.preventDefault();const f=event.target,b=f.querySelector('button');b.disabled=true;
  try{
    if(f.id==='inventory')await manage('inventario',{id:f.product.value,size:f.size.value,qty:Number(f.qty.value),price:cents(f.price.value)});
    else if(f.id==='delivery')await manage('entrega',{city:f.city.value,fee:cents(f.fee.value),enabled:f.enabled.checked});
    else if(f.dataset.offer){const row=orders.find(o=>o.ref===f.dataset.offer);await manage('pedidos/'+row.ref,{status:'oferta',version:row.version,final:cents(f.final.value),shipping:cents(f.shipping.value),note:f.note.value,payUrl:f.payUrl.value})}
    await refresh();message('Cambios guardados en la tienda.');
  }catch(err){message(err.message);b.disabled=false}
});
async function start(){
  if(location.origin!==API){location.replace(API+'/gestion.html'+location.hash);return}
  const key=new URLSearchParams(location.hash.slice(1)).get('acceso');
  if(key){
    history.replaceState(null,'',location.pathname);
    try{await manage('activar',{key})}catch(err){login();message(err.message);return}
  }
  try{products=await fetch('./catalog.json').then(r=>r.json());await refresh()}catch(err){login();if(err.status!==401)message(err.message)}
}
start();
