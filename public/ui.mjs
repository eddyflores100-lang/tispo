import {API} from './shop.mjs';
export const $=selector=>document.querySelector(selector);
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const icon=id=>'<svg aria-hidden="true"><use href="#i-'+id+'"/></svg>';
export const opt=(value,text,selected)=>'<option value="'+escapeHTML(value)+'"'+(value===selected?' selected':'')+'>'+escapeHTML(text)+'</option>';
export const readLocal=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
export const writeLocal=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
export const randomKey=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
export async function request(path,{method='GET',data,key,admin=false}={}){
  const headers={};if(key)headers.Authorization='Bearer '+key;if(data!==undefined)headers['Content-Type']='application/json';
  let response;
  try{response=await fetch((admin?'':API)+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data),credentials:admin?'same-origin':'omit',cache:'no-store',signal:AbortSignal.timeout(18000)})}
  catch{throw new Error('No se pudo conectar con Tispo. Comprueba tu conexión e inténtalo de nuevo.')}
  const result=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(result.error||'La tienda no pudo completar la operación.');error.status=response.status;throw error}
  return result;
}
export function modal(title,body,drawer=false){
  const panel=$('#overlay');panel.classList.toggle('drawer',drawer);$('#modal-title').textContent=title;$('#modal-body').innerHTML=body;
  if(!panel.open)panel.showModal();panel.scrollTop=0;
}
export function closeModal(){const d=$('#overlay');if(d?.open)d.close()}
let toastTimer;
export function toast(message){
  const node=$('#toast');node.textContent=message;node.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('visible'),2600);
}
export const empty=(title,text,link='#tienda',action='Ver toda la ropa')=>'<div class="empty"><h3>'+escapeHTML(title)+'</h3><p>'+escapeHTML(text)+'</p><a class="btn" href="'+escapeHTML(link)+'">'+escapeHTML(action)+'</a></div>';
export async function copyText(value){try{await navigator.clipboard.writeText(value);toast('Enlace privado copiado.')}catch{modal('Enlace privado','<label class="field">Copia y guarda este enlace<input readonly id="copy-url"></label>');$('#copy-url').value=value;$('#copy-url').select()}}
