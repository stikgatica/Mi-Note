import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateReleaseSigning,verifyApkSigner,normalizeCertificateDigest} from '../scripts/signing-guard.mjs';
const a='2f'.repeat(32),b='3b'.repeat(32);
const env={MINOTE_RELEASE_KEYSTORE_BASE64:'QWxhZGRpbjpvcGVuIHNlc2FtZQ=='.repeat(5),
 MINOTE_RELEASE_STORE_PASSWORD:'passphrase-long-stable',
 MINOTE_RELEASE_KEY_PASSWORD:'passphrase-long-stable',
 MINOTE_RELEASE_KEY_ALIAS:'minote-x10',
 MINOTE_RELEASE_CERT_SHA256:a};
test('la firma permanente requiere todos los secretos y la huella fijada',()=>{
 assert.equal(validateReleaseSigning(env),a);
 for(const key of Object.keys(env)){
  assert.throws(()=>validateReleaseSigning({...env,[key]:''}),/Firma permanente SIN configurar/);
 }
});
test('huella de 64 caracteres, también con separadores hexadecimales',()=>{
 assert.equal(normalizeCertificateDigest(a.match(/../g).join(':')),a);
 assert.throws(()=>normalizeCertificateDigest('unknown'),/huella SHA-256/);
});
test('un APK de firma distinta nunca se publica',()=>{
 assert.equal(verifyApkSigner('Signer #1 certificate SHA-256 digest: '+a,a),a);
 assert.throws(()=>verifyApkSigner('Signer #1 certificate SHA-256 digest: '+b,a),/FIRMA DIFERENTE/);
 assert.throws(()=>verifyApkSigner('',a),/único certificado/);
});
test('CI nunca fabrica una keystore temporal ni publica sin verificar huella',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/android-release.yml',import.meta.url),'utf8');
 assert.doesNotMatch(workflow,/keytool\s+-genkeypair/);
 assert.doesNotMatch(workflow,/openssl\s+rand\s+-hex/);
 assert.match(workflow,/MINOTE_RELEASE_KEYSTORE_BASE64/);
 assert.match(workflow,/signing-guard\.mjs check-env/);
 assert.match(workflow,/signing-guard\.mjs verify-apk/);
 assert.match(workflow,/--ks-pass env:MINOTE_RELEASE_STORE_PASSWORD/);
 assert.match(workflow,/--key-pass env:MINOTE_RELEASE_KEY_PASSWORD/);
 const config=JSON.parse(readFileSync(new URL('../capacitor.config.json',import.meta.url),'utf8'));
 assert.equal(config.appId,'cl.stikgatica.minote.x10');
});
