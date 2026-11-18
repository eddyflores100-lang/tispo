import catalog from '../public/catalog.json' with { type: 'json' };

const origins = ['https://eddyflores100-lang.github.io','https://tispo.eddyflores100.workers.dev'];
const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export function advise(message, previous) {
  const q = normalize(message);
  const match = catalog.find(p => p.terms.some(term => q.includes(term)));
  const item = match || catalog.find(p => p.id === previous);
  const reply = (text, selected = item) => ({text, product: selected?.id || null});
  if (/precio|cuesta|stock|disponib|comprar|envio|entrega|pago|reserv|devoluc/.test(q))
    return reply('La colección está en presentación. Aún faltan precios, inventario y condiciones de envío confirmados. Puedes guardar tus prendas favoritas mientras se abre la venta.');
  if (/talla|medid|mide|ajust|ancho|largo/.test(q))
    return reply(item ? item.fit + ' La tabla de tallas se publicará con el inventario.' : '¿Qué prenda quieres medir: el jean, la chaqueta o la camiseta?');
  if (/origen|fabric|algodon|composicion|material|tejido/.test(q))
    return reply('Tispo selecciona estilo americano. La composición y el país de fabricación se confirmarán con la etiqueta de cada prenda del inventario.');
  if (item) return reply(item.look);
  if (/combina|look|conjunto|vestir/.test(q)) return reply('Empieza por el jean recto y la camiseta básica. Añade la chaqueta abierta para una segunda capa.', catalog[0]);
  return reply('Puedo ayudarte con el jean recto, la chaqueta o la camiseta básica. ¿Qué prenda quieres combinar o medir?');
}
export default {
 async fetch(request, env) {
  const path = new URL(request.url).pathname;
  if(path !== '/api/asesor') return env.ASSETS.fetch(request);
  const origin=request.headers.get('origin');
  const headers={'Vary':'Origin','Cache-Control':'no-store','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
  if(origin && !origins.includes(origin)) return new Response(null,{status:403});
  if(origin) headers['Access-Control-Allow-Origin']=origin;
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
  if(request.method!=='POST') return new Response(null,{status:405,headers:{...headers,Allow:'POST, OPTIONS'}});
  try {
    const raw=await request.text();
    if(raw.length>4096) return new Response(null,{status:413,headers});
    const {message,product}=JSON.parse(raw);
    if(typeof message!=='string'||!message.trim()||message.length>500) throw Error();
    return Response.json(advise(message,product),{headers});
  } catch {return Response.json({error:'Escribe una consulta de hasta 500 caracteres.'},{status:400,headers});}
 }
};
