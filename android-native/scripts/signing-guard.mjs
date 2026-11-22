/* Mi Note: política de firma Android permanente.
 * No almacena secretos ni genera claves; valida configuración y certificado.
 * Acciones: node scripts/signing-guard.mjs check-env
 *           apksigner verify --print-certs APK | node scripts/signing-guard.mjs verify-apk
 */
import {readFileSync} from 'node:fs';
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
 const found=[...String(output||'').matchAll(/Signer\s+#\d+\s+certificate\s+SHA-256\s+digest:\s*([a-fA-F0-9:\s]{64,95})/gi)];
 if(found.length!==1)throw Error('No se pudo confirmar un único certificado de firma en apksigner.');
 const actual=normalizeCertificateDigest(found[0][1]);
 if(actual!==normalizedExpected)throw Error('FIRMA DIFERENTE: el certificado del APK no coincide con la firma permanente registrada. Publicación bloqueada.');
 return actual;
}
const executed=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(executed){
 try{
  if(process.argv[2]==='check-env'){
   validateReleaseSigning(process.env);
   process.stdout.write('Firma permanente configurada; se comprobará el certificado antes de publicar.\n');
  }else if(process.argv[2]==='verify-apk'){
   const digest=verifyApkSigner(readFileSync(0,'utf8'),process.env.MINOTE_RELEASE_CERT_SHA256);
   process.stdout.write('Certificado de firma permanente verificado: '+digest+'\n');
  }else throw Error('Acción inválida: check-env o verify-apk.');
 }catch(error){console.error('ERROR de firma permanente: '+error.message);process.exitCode=1;}
}
