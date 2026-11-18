import {imagePath,labels,money,normalize,unitFor,variantKey} from './shop.mjs';
import {$,closeModal,copyText,empty,escapeHTML as e,icon,modal,randomKey,readLocal,request,toast,writeLocal} from './ui.mjs';
export function checkoutUI(store){
  let formDraft={name:'',contact:'',city:'',address:'',mode:'encargo'};
  let currentlyViewing=null;
  const receipts=()=>{const rows=readLocal('tispo-pedidos-v1',[]);return Array.isArray(rows)?rows.filter(r=>/^TP-[A-F0-9]{8}-[A-F0-9]{4}$/.test(r.ref)&&/^[a-f0-9]{64}$/.test(r.key)).slice(0,40):[]};
  function remember(ref,key){writeLocal('tispo-pedidos-v1',[{ref,key},...receipts().filter(r=>r.ref!==ref)].slice(0,40))}
  const lines=()=>store.cart.map(line=>{const p=store.products.get(line.id),row=store.stock.get(variantKey(line.id,line.size));return {...line,name:p.name,color:p.color,unit:unitFor(p,row),available:row?.unidades||0}});
  const subtotal=cart=>cart.reduce((n,x)=>n+x.unit*x.qty,0);
  function list(cart,editable){
    return cart.map(x=>'<div class="line-item"><a href="#producto/'+e(x.id)+'"><img src="'+imagePath(x.id)+'" alt="'+e(x.name)+'"></a><div><strong>'+e(x.name)+'</strong><p>'+e(x.color)+' · Talla '+e(x.size)+'</p>'+(editable?'<div class="stepper"><button data-act="cantidad" data-id="'+e(x.id)+'" data-size="'+e(x.size)+'" data-step="-1" aria-label="Restar una unidad">'+icon('minus')+'</button><output>'+x.qty+'</output><button data-act="cantidad" data-id="'+e(x.id)+'" data-size="'+e(x.size)+'" data-step="1" aria-label="Sumar una unidad" '+(x.qty>=10?'disabled':'')+'>'+icon('plus')+'</button></div><button class="remove text-button" data-act="quitar" data-id="'+e(x.id)+'" data-size="'+e(x.size)+'">Quitar</button>':'<p>Cantidad '+x.qty+'</p>')+'</div><strong>'+money(x.unit*x.qty)+'</strong></div>').join('');
  }
  function bag(){
    const cart=lines();modal('Mi bolsa ('+cart.reduce((n,x)=>n+x.qty,0)+')',cart.length?list(cart,true)+'<div class="totals"><div class="total"><span>Subtotal</span><span>'+money(subtotal(cart))+'</span></div></div><a href="#comprar" class="btn wide">Finalizar pedido '+icon('right')+'</a><button class="wide text-button" data-act="cerrar">Seguir comprando</button>':empty('Tu bolsa está vacía','Elige una prenda y su talla para empezar.'),true);
  }
  function directPossible(city){
    const d=store.delivery,cart=lines();return Boolean(d?.habilitado&&cart.length&&cart.every(x=>x.available>=x.qty)&&normalize(city)===normalize(d.ciudad));
  }
  const summary=(cart,direct)=>'<h2>Resumen del pedido</h2>'+list(cart,false)+'<div class="totals"><div><span>Prendas</span><strong>'+money(subtotal(cart))+'</strong></div><div><span>Entrega</span><span>'+(direct?money(store.delivery.tarifa):'Por confirmar')+'</span></div><div class="total"><span>'+(direct?'Total a pagar':'Subtotal estimado')+'</span><span>'+money(subtotal(cart)+(direct?store.delivery.tarifa:0))+'</span></div></div>';
  function refreshModes(){
    const form=$('#checkout-form');if(!form)return;
    const direct=directPossible(form.city.value);
    if(!direct)formDraft.mode='encargo';
    const chosen=direct&&formDraft.mode==='directo';
    $('#mode-box').innerHTML='<label class="radio-option"><input type="radio" name="mode" value="encargo" '+(!chosen?'checked':'')+'><span><b>Por encargo</b><small>Recibe la confirmación de disponibilidad, precio y entrega antes de pagar.</small></span></label>'+(direct?'<label class="radio-option"><input type="radio" name="mode" value="directo" '+(chosen?'checked':'')+'><span><b>Comprar contra entrega</b><small>Stock confirmado. Envío a '+e(store.delivery.ciudad)+' por '+money(store.delivery.tarifa)+'.</small></span></label>':'');
    $('#address-field').hidden=!chosen;form.address.required=chosen;$('#summary').innerHTML=summary(lines(),chosen);
    $('#place').textContent=chosen?'Confirmar compra contra entrega':'Enviar pedido por encargo';
  }
  function checkout(){
    closeModal();const cart=lines(),container=$('#view');
    if(!cart.length){container.innerHTML='<section class="container">'+empty('Tu bolsa está vacía','Añade una prenda para finalizar el pedido.')+'</section>';return}
    container.innerHTML='<section class="container checkout"><div class="crumb"><a href="#tienda">Tienda</a> / Finalizar pedido</div><h1>Finalizar pedido</h1><div class="checkout-cols"><form id="checkout-form"><h2>Tus datos</h2><label class="field">Nombre<input name="name" autocomplete="name" minlength="2" maxlength="80" required value="'+e(formDraft.name)+'"></label><label class="field">Correo electrónico o teléfono<input name="contact" autocomplete="off" maxlength="150" required value="'+e(formDraft.contact)+'"><small>La tienda usará este contacto para coordinar tu pedido.</small></label><label class="field">Ciudad en Ecuador<input name="city" autocomplete="address-level2" minlength="2" maxlength="65" required value="'+e(formDraft.city)+'"></label><h2>Modalidad de compra</h2><div id="mode-box"></div><label class="field" id="address-field" hidden>Dirección de entrega<input name="address" autocomplete="street-address" minlength="5" maxlength="220" value="'+e(formDraft.address)+'"></label><p class="error" id="checkout-error" role="alert"></p><button type="submit" class="btn wide" id="place">Enviar pedido</button></form><aside class="summary-box" id="summary"></aside></div></section>';
    refreshModes();
    const form=$('#checkout-form');form.oninput=event=>{const t=event.target;if(t.name in formDraft)formDraft[t.name]=t.value;if(t.name==='city'||t.name==='mode')refreshModes()};
    form.onsubmit=async event=>{
      event.preventDefault();const btn=$('#place'),err=$('#checkout-error');if(btn.disabled)return;
      const direct=formDraft.mode==='directo'&&directPossible(form.city.value);
      const data={name:form.elements.namedItem('name').value,contact:form.contact.value,city:form.city.value,address:direct?form.address.value:'',mode:direct?'directo':'encargo',items:store.cart.map(({id,size,qty})=>({id,size,qty})),expected:subtotal(lines())+(direct?store.delivery.tarifa:0)};
      const pending=readLocal('tispo-pendiente-v1',null),key=pending?.key||randomKey();
      writeLocal('tispo-pendiente-v1',{key});err.textContent='';btn.textContent='Registrando pedido…';btn.disabled=true;
      try{
        const result=await request('/api/pedidos',{method:'POST',key,data});
        finish(result.ref,key);
      }catch(error){
        // A dropped response can follow a successful insert. Recover before offering a retry.
        let recovered=false;
        try{const receipt=await request('/api/pedidos/reciente',{key});finish(receipt.ref,key);recovered=true}catch(lookup){if(lookup.status===404&&[400,409,429].includes(error.status))writeLocal('tispo-pendiente-v1',null)}
        if(!recovered){if(error.status===409){await store.refresh();refreshModes()}err.textContent=error.message;btn.disabled=false;btn.textContent=direct?'Confirmar compra contra entrega':'Enviar pedido por encargo'}
      }
    };
  }
  function finish(ref,key){
    remember(ref,key);writeLocal('tispo-pendiente-v1',null);store.cart=[];store.saveCart();formDraft={name:'',contact:'',city:'',address:'',mode:'encargo'};location.hash='pedido/'+ref+'/'+key;
  }
  async function recover(){
    const pending=readLocal('tispo-pendiente-v1',null);if(!pending?.key)return;
    try{const receipt=await request('/api/pedidos/reciente',{key:pending.key});remember(receipt.ref,pending.key);store.cart=[];store.saveCart();writeLocal('tispo-pendiente-v1',null);if(!location.hash||location.hash==='#comprar')location.hash='pedido/'+receipt.ref+'/'+pending.key}catch{}
  }
  function orders(){
    const all=receipts();$('#view').innerHTML='<section class="container orders-page"><h1 class="page-heading">Mis pedidos</h1>'+(all.length?'<p class="muted">Pedidos guardados en este dispositivo.</p>'+all.map(r=>'<a class="order-row" href="#pedido/'+r.ref+'/'+r.key+'"><b>'+r.ref+'</b><span>Ver seguimiento '+icon('chevron')+'</span></a>').join(''):empty('Aún no tienes pedidos en este dispositivo','También puedes abrir el enlace privado de un pedido anterior.'))+'</section>';
  }
  async function receipt(ref,key){
    const route=location.hash,node=$('#view');node.innerHTML='<section class="container receipt"><h1>Seguimiento del pedido</h1><p>Cargando pedido…</p></section>';
    try{
      const row=await request('/api/pedidos/'+encodeURIComponent(ref),{key});if(location.hash!==route)return;
      currentlyViewing={ref,key,version:row.version};remember(ref,key);
      let hint={recibido:'Tispo recibió tus tallas y cantidades. Aquí podrás ver y aceptar el importe final cuando la tienda confirme la disponibilidad.',oferta:'Revisa las condiciones de la tienda. Acepta solo si estás de acuerdo con el precio final y la entrega.',confirmado:row.mode==='directo'?'Tu compra está registrada. Pagarás el total al recibirla.':'Aceptaste el importe final del encargo. La tienda coordinará la entrega contigo.',despachado:'La tienda marcó tu pedido como despachado.',entregado:'La tienda registró la entrega de tus prendas.',cancelado:'La tienda canceló este pedido.'}[row.status];
      node.innerHTML='<section class="container receipt"><div class="crumb"><a href="#pedidos">Mis pedidos</a> / Seguimiento</div><p class="eyebrow ref">'+e(row.ref)+'</p><h1>'+e(labels[row.status])+'</h1><div class="surface"><p>'+e(hint)+'</p>'+(row.note?'<p class="shop-msg">'+e(row.note)+'</p>':'')+list(row.items,false)+'<div class="totals"><div><span>'+(row.final==null?'Subtotal estimado':'Prendas')+'</span><b>'+money(row.final??row.subtotal)+'</b></div><div><span>Entrega</span><span>'+(row.shipping==null?'Por confirmar':money(row.shipping))+'</span></div>'+(row.final!=null?'<div class="total"><span>Total final</span><b>'+money(row.final+row.shipping)+'</b></div>':'')+'</div>'+(row.status==='oferta'?'<button class="btn wide" data-act="aceptar">Aceptar pedido por '+money(row.final+row.shipping)+'</button>':'')+(row.payUrl?'<a class="btn wide" rel="noopener noreferrer" target="_blank" href="'+e(row.payUrl)+'">Ir al enlace de pago de la tienda</a>':'')+'<p id="order-error" class="error" role="alert"></p></div><div class="wrap-actions"><button class="lite" data-act="copiar">Copiar enlace privado</button><button class="lite" data-act="actualizar-pedido">Actualizar estado</button><a class="lite" href="#tienda">Seguir comprando</a></div><p class="fine">Guarda el enlace privado para consultar el pedido desde otro dispositivo.</p></section>';
    }catch(error){if(location.hash===route)node.innerHTML='<section class="container receipt">'+empty('No pudimos abrir el pedido',error.message,'#pedidos','Volver a Mis pedidos')+'</section>'}
  }
  async function action(name,button){
    if(name==='bolsa'){bag();return true}
    if(name==='cantidad'||name==='quitar'){
      const line=store.cart.find(l=>l.id===button.dataset.id&&l.size===button.dataset.size);if(!line)return true;
      const sum=store.cart.reduce((n,x)=>n+x.qty,0);
      if(name==='cantidad'&&Number(button.dataset.step)>0&&sum>=30){toast('Máximo de 30 prendas por pedido.');return true}
      line.qty=name==='quitar'?0:Math.min(10,line.qty+Number(button.dataset.step));store.cart=store.cart.filter(l=>l.qty>0);store.saveCart();bag();if(location.hash==='#comprar'){checkout();bag()}return true;
    }
    if(name==='copiar'){await copyText(location.href);return true}
    if(name==='actualizar-pedido'&&currentlyViewing){await receipt(currentlyViewing.ref,currentlyViewing.key);return true}
    if(name==='aceptar'&&currentlyViewing){
      const {ref,key,version}=currentlyViewing;button.disabled=true;
      try{await request('/api/pedidos/'+ref+'/aceptar',{method:'POST',key,data:{version}});await receipt(ref,key)}
      catch(error){$('#order-error').textContent=error.message;button.disabled=false}return true;
    }
    return false;
  }
  return {checkout,bag,orders,receipt,action,recover};
}
