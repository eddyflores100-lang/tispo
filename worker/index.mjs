import {adminHome, acceptOffer, advice, availability, customerOrder, demand, orderView, ownerChange, placeOrder, privateKey, sha256, ShopError, updateDelivery, updateInventory} from './shop.mjs';

const workerOrigin='https://tispo.eddyflores100.workers.dev';
const pagesOrigin='https://eddyflores100-lang.github.io';
const checkoutOrigins=new Set([workerOrigin,pagesOrigin]);
const cookieName='__Host-tispo-gestion';
async function readJSON(request){
  demand(request.headers.get('Content-Type')?.split(';')[0].trim()==='application/json',415,'Envía los datos como JSON.');
  demand(Number(request.headers.get('Content-Length')||0)<=24000,413,'Solicitud demasiado extensa.');
  const reader=request.body?.getReader();demand(reader,400,'Faltan datos.');
  const decoder=new TextDecoder();let raw='',length=0;
  for(;;){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>24000){await reader.cancel();throw new ShopError(413,'Solicitud demasiado extensa.')}raw+=decoder.decode(chunk.value,{stream:true});}
  let data;try{data=JSON.parse(raw+decoder.decode())}catch{}
  demand(data && typeof data==='object' && !Array.isArray(data),400,'Revisa los datos enviados.');return data;
}
const secretFrom=request=>(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
const sessionFrom=request=>(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
function returnJSON(data,status=200,extra={}){return Response.json(data,{status,headers:extra})}
async function management(request,env,path){
  const origin=request.headers.get('Origin');
  demand(!origin || origin===workerOrigin,403,'Abre el panel de Tispo en Cloudflare.');
  if(request.method==='POST'&&path==='/api/gestion/activar'){
    const {key}=await readJSON(request);
    demand(typeof key==='string'&&/^[a-f0-9]{48}$/.test(key),403,'El acceso privado es inválido o ha caducado.');
    const link=adminHome+'#acceso='+key;
    const secret=privateKey();
    const [created]=await env.DB.batch([
      env.DB.prepare('INSERT INTO sesiones_de_gestion(llave_hash,caduca) SELECT ?,unixepoch()+2592000 FROM accesos_de_gestion WHERE enlace_privado=? AND caduca>unixepoch()').bind(await sha256(secret),link),
      env.DB.prepare('DELETE FROM accesos_de_gestion WHERE enlace_privado=?').bind(link)
    ]);
    demand(created.meta.changes===1,403,'El acceso privado ya se usó o ha caducado.');
    return returnJSON({ok:true},200,{'Set-Cookie':cookieName+'='+secret+'; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Strict'});
  }
  const session=sessionFrom(request);demand(/^[a-f0-9]{64}$/.test(session),401,'Accede desde tu enlace privado de gestión.');
  const hashed=await sha256(session);
  demand(await env.DB.prepare('SELECT 1 FROM sesiones_de_gestion WHERE llave_hash=? AND caduca>unixepoch()').bind(hashed).first(),401,'La sesión de gestión ha caducado.');
  if(path==='/api/gestion/salir' && request.method==='POST'){
    await env.DB.prepare('DELETE FROM sesiones_de_gestion WHERE llave_hash=?').bind(hashed).run();
    return returnJSON({ok:true},200,{'Set-Cookie':cookieName+'=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict'});
  }
  const record=path.match(/^\/api\/gestion\/pedidos\/(TP-[A-F0-9]{8}-[A-F0-9]{4})$/);
  if(request.method==='GET'&&path==='/api/gestion/pedidos'){
    const url=new URL(request.url), raw=Number(url.searchParams.get('offset')||0);
    demand(Number.isSafeInteger(raw)&&raw>=0&&raw<=1000000,400,'Página inválida.');
    const rows=await env.DB.prepare('SELECT * FROM pedidos WHERE prueba=0 ORDER BY creado DESC,rowid DESC LIMIT 41 OFFSET ?').bind(raw).all();
    return returnJSON({orders:rows.results.slice(0,40).map(row=>orderView(row,true)),next:rows.results.length>40?raw+40:null});
  }
  if(record&&request.method==='POST')return returnJSON(await ownerChange(env.DB,record[1],await readJSON(request)));
  if(path==='/api/gestion/inventario'&&request.method==='POST'){await updateInventory(env.DB,await readJSON(request));return returnJSON({ok:true})}
  if(path==='/api/gestion/entrega'&&request.method==='POST'){await updateDelivery(env.DB,await readJSON(request));return returnJSON({ok:true})}
  throw new ShopError(404,'Operación no disponible.');
}
async function api(request,env,path){
  const method=request.method;
  if(method==='OPTIONS')return new Response(null,{status:204});
  if(method==='POST'&&env.LIMIT){
    const {success}=await env.LIMIT.limit({key:path.split('/').slice(0,3).join('/')+':'+(request.headers.get('CF-Connecting-IP')||'local')});
    demand(success,429,'Demasiadas solicitudes. Espera un minuto y vuelve a intentarlo.');
  }
  if(path.startsWith('/api/gestion/')) return management(request,env,path);
  if(path==='/api/inventario'&&method==='GET')return returnJSON(await availability(env.DB));
  if(path==='/api/asesor'&&method==='POST'){
    const {message,product}=await readJSON(request);
    demand(typeof message==='string'&&message.trim()&&message.length<=500,400,'Escribe una consulta de hasta 500 caracteres.');
    const {variants}=await availability(env.DB);
    return returnJSON(advice(message,product,variants));
  }
  if(path==='/api/pedidos'&&method==='POST')return returnJSON(await placeOrder(env.DB,await readJSON(request),secretFrom(request)),201);
  if(path==='/api/pedidos/reciente'&&method==='GET'){
    const key=secretFrom(request);
    demand(/^[a-f0-9]{64}$/.test(key),404,'Pedido no encontrado.');
    const row=await env.DB.prepare('SELECT referencia FROM pedidos WHERE llave_hash=?').bind(await sha256(key)).first();
    demand(row,404,'Pedido no encontrado.');return returnJSON({ref:row.referencia});
  }
  const match=path.match(/^\/api\/pedidos\/(TP-[A-F0-9]{8}-[A-F0-9]{4})(\/aceptar)?$/);
  if(match){
    const row=await customerOrder(env.DB,match[1],secretFrom(request));
    if(method==='GET'&&!match[2])return returnJSON(orderView(row));
    if(method==='POST'&&match[2])return returnJSON(await acceptOffer(env.DB,row,(await readJSON(request)).version));
  }
  throw new ShopError(404,'Operación no disponible.');
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url),path=url.pathname;
    if(!path.startsWith('/api/')){
      if(!['HEAD','GET'].includes(request.method))return new Response(null,{status:405});
      const assetURL=new URL(request.url);
      if(path==='/')assetURL.pathname='/index.html';
      const asset=await env.ASSETS.fetch(new Request(assetURL,request));
      const headers=new Headers(asset.headers);headers.set('Referrer-Policy','no-referrer');headers.set('X-Content-Type-Options','nosniff');
      return new Response(asset.body,{status:asset.status,headers});
    }
    const origin=request.headers.get('Origin');
    if(origin&&!checkoutOrigins.has(origin))return returnJSON({error:'Origen no permitido.'},403);
    let response;
    try{response=await api(request,env,path)}
    catch(e){response=e instanceof ShopError?returnJSON({error:e.message},e.status):returnJSON({error:'No pudimos completar la operación. Inténtalo de nuevo.'},503)}
    response.headers.set('Cache-Control','no-store');
    response.headers.set('Vary','Origin');
    response.headers.set('X-Content-Type-Options','nosniff');
    if(origin && (!path.startsWith('/api/gestion/')||origin===workerOrigin)){
      response.headers.set('Access-Control-Allow-Origin',origin);
      response.headers.set('Access-Control-Allow-Headers','Content-Type, Authorization');
      response.headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    }
    return response;
  }
};
