import catalog from '../public/catalog.json' with {type:'json'};
import {categoryFit, money, normalize, searchable, unitFor, variantKey, variantMap} from '../public/shop.mjs';
export const products = new Map(catalog.map(p=>[p.id,p]));
export const adminHome = 'https://tispo.eddyflores100.workers.dev/gestion.html';
export class ShopError extends Error {
  constructor(status,message) {super(message);this.status=status}
}
export function demand(condition,status,message) {if (!condition) throw new ShopError(status,message)}
export const sha256 = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
export const privateKey = () => crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
function field(value,min,max,label) {
  demand(typeof value==='string',400,'Revisa el campo '+label+'.');
  const clean=value.trim().replace(/\s+/g,' ');
  demand(clean.length>=min && clean.length<=max && !/[\u0000-\u001f\u007f]/.test(clean),400,'Revisa el campo '+label+'.');
  return clean;
}
function integer(value,min,max,label) {
  demand(Number.isInteger(value)&&value>=min&&value<=max,400,'Revisa '+label+'.');return value;
}
export function cleanOrder(data) {
  const name=field(data.name,2,80,'nombre');
  let contact=field(data.contact,6,150,'correo o teléfono');
  const city=field(data.city,2,65,'ciudad');
  if (contact.includes('@')) {
    demand(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact),400,'Escribe un correo válido.');
    contact=contact.toLowerCase();
  } else {
    demand(/^\+?[\d\s()-]+$/.test(contact),400,'Escribe un teléfono válido.');
    contact=contact.replace(/[\s()-]/g,'');
    demand(/^\+?\d{7,15}$/.test(contact),400,'Revisa el número de teléfono.');
  }
  demand(['encargo','directo'].includes(data.mode),400,'Elige una modalidad de pedido.');
  const address=data.mode==='directo'?field(data.address,5,220,'dirección'):'';
  demand(Array.isArray(data.items)&&data.items.length>=1&&data.items.length<=30,400,'Revisa las prendas de la bolsa.');
  const seen=new Set();
  const items=data.items.map(line=>{
    demand(line && typeof line==='object',400,'Revisa la bolsa.');
    const p=products.get(line.id);
    demand(p?.sizes.includes(line.size),400,'Hay una prenda o talla que ya no está en la tienda.');
    const key=variantKey(p.id,line.size);
    demand(!seen.has(key),400,'Hay una talla duplicada en la bolsa.');seen.add(key);
    return {id:p.id,size:line.size,qty:integer(line.qty,1,10,'la cantidad')};
  }).sort((a,b)=>variantKey(a.id,a.size).localeCompare(variantKey(b.id,b.size)));
  demand(items.reduce((n,x)=>n+x.qty,0)<=30,400,'El máximo por pedido es de 30 prendas.');
  return {name,contact,city,address,mode:data.mode,items,expected:integer(data.expected,0,10000000,'el total de tu bolsa')};
}
export async function availability(db) {
  const [stocks,delivery]=await db.batch([db.prepare('SELECT producto,talla,precio,unidades FROM inventario'),db.prepare('SELECT ciudad,tarifa,habilitado FROM entrega WHERE id=1')]);
  return {variants:stocks.results,delivery:delivery.results[0]};
}
export function orderView(row,owner=false) {
  const output={ref:row.referencia,mode:row.tipo,status:row.estado,items:JSON.parse(row.articulos),subtotal:row.subtotal,final:row.precio_final,shipping:row.envio,note:row.nota,version:row.version,created:row.creado};
  if (['confirmado','despachado','entregado'].includes(row.estado)) output.payUrl=row.enlace_pago;
  if (owner) Object.assign(output,{name:row.nombre,contact:row.contacto,city:row.ciudad,address:row.direccion,payUrl:row.enlace_pago});
  return output;
}
export async function placeOrder(db,data,key) {
  demand(/^[a-f0-9]{64}$/.test(key),400,'Actualiza la bolsa e intenta de nuevo.');
  const order=cleanOrder(data);
  const [hash,requestHash]=await Promise.all([sha256(key),sha256(JSON.stringify(order))]);
  const lookup=()=>db.prepare('SELECT * FROM pedidos WHERE llave_hash=?').bind(hash).first();
  function replay(row) {demand(row.solicitud_hash===requestHash,409,'La solicitud ya se registró con otros datos. Revisa Mis pedidos.');return orderView(row)}
  const existing=await lookup();if(existing)return replay(existing);
  const {variants,delivery}=await availability(db);
  const stock=variantMap(variants), direct=order.mode==='directo';
  const items=order.items.map(line=>{
    const p=products.get(line.id), row=stock.get(variantKey(p.id,line.size));
    if(direct)demand(row?.unidades>=line.qty,409,'La disponibilidad cambió. Revisa tu bolsa antes de confirmar.');
    return {...line,name:p.name,color:p.color,unit:unitFor(p,row)};
  });
  const subtotal=items.reduce((n,l)=>n+l.unit*l.qty,0);
  if(direct)demand(delivery?.habilitado && normalize(order.city)===normalize(delivery.ciudad),409,'La entrega directa no está disponible en esa ciudad.');
  const fee=direct?delivery.tarifa:null;
  demand(subtotal+(fee||0)===order.expected,409,'El precio cambió. Revisa la bolsa y vuelve a confirmar.');
  const ref='TP-'+crypto.randomUUID().slice(0,8).toUpperCase()+'-'+crypto.randomUUID().slice(0,4).toUpperCase();
  const recent=await db.prepare('SELECT count(*) AS n FROM pedidos WHERE contacto=? AND creado>unixepoch()-3600').bind(order.contact).first();
  demand(recent.n<6,429,'Ya se han recibido varios pedidos con ese contacto. Intenta más tarde.');
  try{
    await db.prepare(`INSERT INTO pedidos(referencia,llave_hash,solicitud_hash,tipo,estado,nombre,contacto,ciudad,direccion,articulos,subtotal,precio_final,envio)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(ref,hash,requestHash,order.mode,direct?'confirmado':'recibido',order.name,order.contact,direct?delivery.ciudad:order.city,order.address,JSON.stringify(items),subtotal,direct?subtotal:null,fee).run();
  }catch(e){
    const prior=await lookup();if(prior)return replay(prior);
    if(/stock_cambio|entrega_cambio/.test(String(e)))throw new ShopError(409,'Cambió el stock o el envío. Revisa tu bolsa antes de confirmar.');
    throw e;
  }
  return orderView(await lookup());
}
export async function customerOrder(db,ref,key) {
  demand(/^[a-f0-9]{64}$/.test(key),404,'Pedido no encontrado.');
  const row=await db.prepare('SELECT * FROM pedidos WHERE referencia=? AND llave_hash=?').bind(ref,await sha256(key)).first();
  demand(row,404,'Pedido no encontrado. Abre el enlace privado que recibiste.');return row;
}
export async function acceptOffer(db,row,version) {
  if(row.estado==='confirmado' && row.tipo==='encargo' && row.version===version+1)return orderView(row);
  demand(row.estado==='oferta'&&row.version===version,409,'La propuesta cambió. Actualiza el pedido.');
  const next=await db.prepare("UPDATE pedidos SET estado='confirmado',version=version+1 WHERE referencia=? AND estado='oferta' AND version=? RETURNING *").bind(row.referencia,version).first();
  demand(next,409,'El pedido cambió. Actualiza para verlo.');return orderView(next);
}
export async function ownerChange(db,ref,data) {
  const row=await db.prepare('SELECT * FROM pedidos WHERE referencia=?').bind(ref).first();
  demand(row,404,'Pedido no encontrado.');
  demand(row.version===data.version,409,'El pedido cambió. Vuelve a abrirlo.');
  const next=data.status;
  const allowed={recibido:['oferta','cancelado'],oferta:['oferta','cancelado'],confirmado:['despachado','cancelado'],despachado:['entregado']};
  demand(allowed[row.estado]?.includes(next),400,'Cambio de estado no disponible.');
  let total=row.precio_final,shipping=row.envio,payUrl=row.enlace_pago,note=row.nota;
  if(next==='oferta'){
    total=integer(data.final,1,10000000,'el precio final');shipping=integer(data.shipping,0,1000000,'el envío');
    note=field(data.note||'',0,500,'nota');payUrl=field(data.payUrl||'',0,350,'enlace de pago');
    if(payUrl){
      let url;try{url=new URL(payUrl)}catch{}
      demand(url?.protocol==='https:'&&!url.username&&!url.password&&!url.port&&['buy.stripe.com','checkout.stripe.com','paypal.me','www.paypal.com','www.paypal.me','www.payphone.app','payp.page'].includes(url.hostname),400,'Usa un enlace de pago HTTPS de los proveedores admitidos.');
    }
  }
  const saved=await db.prepare('UPDATE pedidos SET estado=?,precio_final=?,envio=?,nota=?,enlace_pago=?,version=version+1 WHERE referencia=? AND version=? RETURNING *').bind(next,total,shipping,note,payUrl,ref,row.version).first();
  demand(saved,409,'El pedido cambió. Actualiza e inténtalo de nuevo.');return orderView(saved,true);
}
export async function updateInventory(db,data) {
  const p=products.get(data.id);
  demand(p?.sizes.includes(data.size),400,'Prenda o talla inválida.');
  const price=integer(data.price,1,1000000,'el precio'),qty=integer(data.qty,0,10000,'las unidades');
  await db.prepare('INSERT INTO inventario(producto,talla,precio,unidades) VALUES(?,?,?,?) ON CONFLICT(producto,talla) DO UPDATE SET precio=excluded.precio, unidades=excluded.unidades').bind(p.id,data.size,price,qty).run();
}
export async function updateDelivery(db,data) {
  demand(typeof data.enabled==='boolean',400,'Revisa la modalidad de entrega.');
  const city=field(data.city,data.enabled?2:0,65,'ciudad'),fee=integer(data.fee,0,100000,'la tarifa');
  await db.prepare('UPDATE entrega SET ciudad=?,tarifa=?,habilitado=? WHERE id=1').bind(city,fee,Number(data.enabled)).run();
}
export function advice(message,previous,rows=[]) {
  const q=normalize(message).replace(/\b(chompas?|cazadoras?)\b/g,'chaqueta').replace(/\b(vaqueros?|mezclilla)\b/g,'jean'),context=products.get(previous) || products.get(({denim:'jean-recto',chaqueta:'chaqueta-denim',camiseta:'camiseta-cruda'})[previous]);
  const group=/mujer|femenin/.test(q)?'Mujer':/hombre|masculin/.test(q)?'Hombre':'';
  const budget=q.match(/(?:menos de|hasta|maximo|debajo de|presupuesto de|\$)\s*\$?\s*(\d+(?:[.,]\d+)?)/);
  const max=budget?Math.round(Number(budget[1].replace(',','.'))*100):Infinity;
  const terms=q.split(/[^a-z0-9]+/).filter(w=>w.length>2&&!['para','talla','precio','ropa','con','una','los','las','del','que','quiero','combinar','como','por','hay','hasta','menos','puedo','hombre','mujer','busco'].includes(w));
  const stock=variantMap(rows);
  const price=p=>Math.min(...p.sizes.map(s=>unitFor(p,stock.get(variantKey(p.id,s)))));
  let candidates=catalog.filter(p=>(!group||p.department===group||p.department==='Unisex')&&price(p)<=max);
  const scored=candidates.map(p=>({p,score:terms.reduce((s,w)=>s+(normalize(p.name+' '+p.category+' '+p.color).includes(w)?3:searchable(p).includes(w)?1:0),0)})).sort((a,b)=>b.score-a.score);
  const hits=scored.filter(x=>x.score>0).map(x=>x.p);
  const item=hits[0]||context;
  const reply=(text,items=[])=>({text,product:items[0]?.id||null,products:items.slice(0,4).map(p=>p.id)});
  if(/seguimiento|mi pedido|numero de pedido|donde esta mi/.test(q))return reply('Abre Mis pedidos al pie de la tienda o usa el enlace privado de tu comprobante para ver el estado.');
  if(/pagar|envio|entrega|comprar|encargo/.test(q))return reply('Elige talla y añade la prenda a tu bolsa. En un encargo, Tispo confirma el importe y la entrega antes del pago. La compra directa aparece cuando hay stock y cobertura en tu ciudad.',item?[item]:[]);
  if(/talla|medir|medidas/.test(q)&&item)return reply(categoryFit(item.category)+' En '+item.name+' puedes seleccionar '+item.sizes.join(', ')+'.',[item]);
  if(/combina|conjunto|look/.test(q)){const p=item||catalog[0];return reply('Para '+p.name+' en '+p.color.toLowerCase()+', prueba estas prendas del mismo catálogo.',[p,...p.related.map(id=>products.get(id))]);}
  if(/fabric|composicion|origen|material/.test(q))return reply('La selección es de estilo americano. En los encargos confirmamos la composición y el origen con la etiqueta de la prenda.',item?[item]:[]);
  if(max!==Infinity||group||hits.length){const choices=hits.length?hits:candidates.sort((a,b)=>price(a)-price(b));return choices.length?reply('Estas opciones encajan con tu búsqueda. '+choices.slice(0,3).map(p=>p.name+' en '+p.color.toLowerCase()+' desde '+money(price(p))).join(' · ')+'.',choices):reply('No encontré referencias con ese presupuesto. Prueba un importe mayor o cambia de categoría.');}
  if(context)return reply(context.name+' viene en '+context.color.toLowerCase()+'. Puedes elegir talla en su ficha o pedirme una combinación.',[context]);
  return reply('Puedo buscar por categoría, color o presupuesto y ayudarte a elegir talla. Por ejemplo: «camisetas hasta $25».',catalog.slice(0,2));
}
