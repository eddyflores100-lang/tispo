import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import worker from './index.mjs';
import {advice,adminHome,availability,placeOrder,ownerChange,customerOrder,acceptOffer,updateInventory,updateDelivery,privateKey} from './shop.mjs';
import catalog from '../public/catalog.json' with {type:'json'};
const pages='https://eddyflores100-lang.github.io',service='https://tispo.eddyflores100.workers.dev';
const schema=readFileSync(new URL('./migrations/0001_tienda.sql',import.meta.url),'utf8');
function database(){
  const sql=new DatabaseSync(':memory:');sql.exec(schema);
  function prepare(query,params=[]){
    const stmt=sql.prepare(query);
    return {bind:(...args)=>prepare(query,args),first:()=>stmt.get(...params)||null,run:()=>({meta:stmt.run(...params)}),all:()=>({results:stmt.all(...params)}),batch:()=>stmt.columns().length?{results:stmt.all(...params)}:{meta:stmt.run(...params)}};
  }
  return {prepare,batch:async statements=>{sql.exec('BEGIN');try{const results=statements.map(s=>s.batch());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
}
const buyer=(extras={})=>({name:'Prueba interna',contact:'qa@example.invalid',city:'Quito',mode:'encargo',items:[{id:'camiseta-cruda',size:'M',qty:2}],expected:3600,...extras});
const send=(db,path,headers={},data,method)=>worker.fetch(new Request(service+path,{method:method||(data?'POST':'GET'),headers:{...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined}),{DB:db});
test('las doce fichas, ambos encuadres de portada y las recomendaciones tienen archivo',()=>{
  assert.equal(new Set(catalog.map(p=>p.id)).size,12);
  for(const p of catalog){assert.ok(existsSync(new URL('../public/img/productos/'+p.id+'.webp',import.meta.url)));assert.ok(p.related.every(id=>catalog.some(x=>x.id===id)))}
  for(const f of ['hero','mobile'])assert.ok(existsSync(new URL('../public/img/campana/'+f+'.webp',import.meta.url)));
});
test('recomendación por presupuesto y continuidad al preguntar por talla',()=>{
  assert.ok(advice('camisetas hasta $25').products.includes('camiseta-cruda'));
  const jacket=advice('quiero una chompa');assert.equal(jacket.product,'chaqueta-denim');
  assert.match(advice('¿Cómo mido mi talla?',jacket.product).text,/axila/);
  assert.equal(advice('menos de $3').products.length,0);
});
test('encargo real, repetición concurrente, importe recalculado y recibo privado',async()=>{
  const db=database(),key=privateKey(),data=buyer();
  const [a,b]=await Promise.all([placeOrder(db,data,key),placeOrder(db,data,key)]);
  assert.equal(a.ref,b.ref);assert.equal(a.status,'recibido');assert.equal(a.subtotal,3600);assert.equal(a.shipping,null);assert.equal('contact' in a,false);
  assert.equal(db.prepare('SELECT count(*) AS n FROM pedidos').first().n,1);
  await assert.rejects(placeOrder(db,buyer({expected:1}),privateKey()),{status:409});
  await assert.rejects(placeOrder(db,buyer({name:'Otro cliente'}),key),{status:409});
  await assert.rejects(customerOrder(db,a.ref,privateKey()),{status:404});
});
test('talla inexistente, cantidad negativa y contacto inválido se rechazan',async()=>{
  const db=database();
  for(const override of [{items:[{id:'camiseta-cruda',size:'100',qty:1}]},{items:[{id:'camiseta-cruda',size:'M',qty:-1}]},{contact:'correo falso'}])
    await assert.rejects(placeOrder(db,buyer(override),privateKey()),{status:400});
});
test('el comercio publica el precio completo y el comprador acepta la versión vigente',async()=>{
  const db=database(),key=privateKey(),o=await placeOrder(db,buyer(),key);
  const offer=await ownerChange(db,o.ref,{status:'oferta',version:1,final:3500,shipping:250,note:'Entrega coordinada',payUrl:'https://buy.stripe.com/example'});
  assert.equal(offer.status,'oferta');await assert.rejects(acceptOffer(db,await customerOrder(db,o.ref,key),1),{status:409});
  const accepted=await acceptOffer(db,await customerOrder(db,o.ref,key),2);assert.equal(accepted.final+accepted.shipping,3750);assert.equal(accepted.status,'confirmado');
  assert.equal((await acceptOffer(db,await customerOrder(db,o.ref,key),2)).version,3);
});
test('stock, ciudad, tarifa, pago contra entrega y reposición al cancelar',async()=>{
  const db=database();
  await updateInventory(db,{id:'camiseta-cruda',size:'M',price:1500,qty:2});
  await updateDelivery(db,{enabled:true,city:'Quito',fee:300});
  const direct=buyer({mode:'directo',expected:3300,address:'Dirección de prueba'});
  await assert.rejects(placeOrder(db,{...direct,city:'Loja'},privateKey()),{status:409});
  const both=await Promise.allSettled([placeOrder(db,direct,privateKey()),placeOrder(db,direct,privateKey())]);
  assert.equal(both.filter(x=>x.status==='fulfilled').length,1);
  const order=both.find(x=>x.status==='fulfilled').value;assert.equal(order.status,'confirmado');
  assert.equal((await availability(db)).variants[0].unidades,0);
  await ownerChange(db,order.ref,{version:1,status:'cancelado'});
  assert.equal((await availability(db)).variants[0].unidades,2);
});
test('una cuenta sin sesión no lee gestión; el enlace de gestión es de un solo uso',async()=>{
  const db=database(),code='a'.repeat(48);
  assert.equal((await send(db,'/api/gestion/pedidos')).status,401);
  db.prepare('INSERT INTO accesos_de_gestion VALUES(?,unixepoch()+60)').bind(adminHome+'#acceso='+code).run();
  const authorized=await send(db,'/api/gestion/activar',{Origin:service},{key:code});
  assert.equal(authorized.status,200);assert.match(authorized.headers.get('Set-Cookie'),/HttpOnly/);
  assert.equal((await send(db,'/api/gestion/activar',{Origin:service},{key:code})).status,403);
  const cookie=authorized.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await send(db,'/api/gestion/pedidos',{Cookie:cookie})).status,200);
  assert.equal((await send(db,'/api/gestion/salir',{Cookie:cookie,Origin:service},{})).status,200);
  assert.equal((await send(db,'/api/gestion/pedidos',{Cookie:cookie})).status,401);
});
test('GitHub Pages puede pedir, recuperar un recibo, consultar seguimiento y hablar con el asesor',async()=>{
  const db=database(),key=privateKey(),headers={Origin:pages,Authorization:'Bearer '+key};
  const first=await send(db,'/api/pedidos',headers,buyer());assert.equal(first.status,201);assert.equal(first.headers.get('Access-Control-Allow-Origin'),pages);
  const {ref}=await first.json();assert.equal((await (await send(db,'/api/pedidos/reciente',headers)).json()).ref,ref);
  assert.equal((await (await send(db,'/api/pedidos/'+ref,headers)).json()).status,'recibido');
  assert.equal((await send(db,'/api/asesor',{Origin:pages},{message:'jeans'})).status,200);
  assert.equal((await send(db,'/api/asesor',{Origin:pages},{})).status,400);
  assert.equal((await send(db,'/api/inventario',{Origin:'https://otro.example'})).status,403);
});
