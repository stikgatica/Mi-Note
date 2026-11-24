/* Mi Note: política de firma Android permanente.
 * No almacena secretos ni genera claves; valida configuración y certificado.
 * Acciones: node scripts/signing-guard.mjs check-env
 *           apksigner verify --print-certs APK | node scripts/signing-guard.mjs verify-apk
 */
import {pathToFileURL} from 'node:url';

export const SIGNING_FIELDS=Object.freeze([
 'MINOTE_RELEASE_KEYSTORE_BASE64',
 'MINOTE_RELEASE_STORE_PASSWORD',
 'MINOTE_RELEASE_KEY_PASSWORD',
 'MINOTE_RELEASE_KEY_ALIAS',
 'MINOTE_RELEASE_CERT_SHA256'
]);
export function normalizeCertificateDigest(value){
 const normalized=String(value||'').replace(/[:\s]/g,'').toLowerCase();
 if(!/^[a-f0-9]{64}$/.test(normalized))throw Error('La huella SHA-256 de firma debe contener 64 caracteres hexadecimales.');
 return normalized;
}
export function validateReleaseSigning(env={}){
 const missing=SIGNING_FIELDS.filter(field=>typeof env[field]!=='string'||!env[field].trim());
 if(missing.length)throw Error('Firma permanente SIN configurar. Configure GitHub Secrets/Variables: '+missing.join(', ')+
  '. No se publicará ningún APK firmado con una clave temporal.');
 const base64=env.MINOTE_RELEASE_KEYSTORE_BASE64.replace(/\s+/g,'');
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)||base64.length<100)
  throw Error('El secreto MINOTE_RELEASE_KEYSTORE_BASE64 no contiene un archivo PKCS12 válido en base64.');
 if(env.MINOTE_RELEASE_STORE_PASSWORD.length<8||env.MINOTE_RELEASE_KEY_PASSWORD.length<8)
  throw Error('Las contraseñas de la firma permanente deben tener al menos 8 caracteres.');
 if(!/^[a-zA-Z0-9_.-]{1,80}$/.test(env.MINOTE_RELEASE_KEY_ALIAS))
  throw Error('El alias de firma es inválido.');
 return normalizeCertificateDigest(env.MINOTE_RELEASE_CERT_SHA256);
}
export function verifyApkSigner(output,expected){
 const normalizedExpected=normalizeCertificateDigest(expected);
 const text=String(output||'');
 let found=[...text.matchAll(/Signer\s+#(\d+)(?:\s*\([^)]*\))?\s+certificate\s+SHA-256\s+digest:\s*([a-fA-F0-9:]{64,95})/gi)];
 if(!found.length){
  found=[...text.matchAll(/certificate\s+SHA-256\s+digest:\s*([a-fA-F0-9:]{64,95})/gi)].map(m=>[m[0],'1',m[1]]);
 }
 const signers=new Set(found.map(m=>m[1]));
 const digests=new Set(found.map(m=>normalizeCertificateDigest(m[2])));
 if(signers.size!==1||digests.size!==1){
  const preview=text.replace(/\s+/g,' ').trim().slice(0,220);
  throw Error('No se pudo confirmar un único certificado de firma en apksigner (coincidencias: '+found.length+', bytes: '+text.length+(preview?', salida: '+preview:'')+').');
 }
 const [actual]=[...digests];
 if(actual!==normalizedExpected)throw Error('FIRMA DIFERENTE: el certificado del APK no coincide con la firma permanente registrada. Publicación bloqueada.');
 return actual;
}
async function readStdin(){
 const chunks=[];
 for await(const chunk of process.stdin)chunks.push(typeof chunk==='string'?Buffer.from(chunk,'utf8'):chunk);
 return Buffer.concat(chunks).toString('utf8');
}
const executed=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(executed){
 (async()=>{
  try{
   if(process.argv[2]==='check-env'){
    validateReleaseSigning(process.env);
    process.stdout.write('Firma permanente configurada; se comprobará el certificado antes de publicar.\n');
   }else if(process.argv[2]==='verify-apk'){
    const stdinText=await readStdin();
    const digest=verifyApkSigner(stdinText,process.env.MINOTE_RELEASE_CERT_SHA256);
    process.stdout.write('Certificado de firma permanente verificado: '+digest+'\n');
   }else throw Error('Acción inválida: check-env o verify-apk.');
  }catch(error){console.error('ERROR de firma permanente: '+error.message);process.exitCode=1;}
 })();
}
