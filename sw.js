/* Mi Note PWA 0.2.7: interfaz actualizada al recuperar conexión, cuadernos en IndexedDB intactos. */
const CACHE='mi-note-shell-v0.2.7';
const SHELL=['./','./index.html','./styles.css','./app.js','./x10-ble.js','./x10-android-help.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));
 self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('mi-note-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 const shellFile=request.mode==='navigate'||/\.(?:html|css|js|webmanifest)$/.test(url.pathname);
 if(shellFile){
  // La PWA instalada puede conservar el diseño, pero no debe conservar JavaScript obsoleto.
  event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{
   if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(request,copy)));}
   return response;
  }).catch(async()=>{
   const cached=await caches.match(request);
   if(cached)return cached;
   if(request.mode==='navigate'){
    const fallback=await caches.match('./index.html');
    if(fallback)return fallback;
   }
   return Response.error();
  }));
  return;
 }
 event.respondWith(caches.match(request).then(hit=>hit||fetch(request)));
});
