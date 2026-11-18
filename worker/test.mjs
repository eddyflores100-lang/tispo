import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{advise} from './index.mjs';
test('recomienda y conserva la prenda al preguntar por talla',()=>{
 const first=advise('Busco una chompa');
 assert.equal(first.product,'chaqueta');
 assert.match(advise('¿Cómo mido mi talla?', first.product).text,/axila/);
});
test('comunica el estado de venta',()=>assert.match(advise('¿cuánto cuesta el jean?').text,/presentación/));
test('permite consultas desde Pages y valida entradas',async()=>{
 const req=body=>new Request('https://example.org/api/asesor',{method:'POST',headers:{Origin:'https://eddyflores100-lang.github.io'},body});
 assert.equal((await worker.fetch(req('{}'))).status,400);
 const response=await worker.fetch(req(JSON.stringify({message:'camiseta'})));
 assert.equal(response.headers.get('access-control-allow-origin'),'https://eddyflores100-lang.github.io');
 assert.equal((await response.json()).product,'camiseta');
});
