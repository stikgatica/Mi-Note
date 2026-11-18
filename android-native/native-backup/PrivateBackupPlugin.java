package cl.stikgatica.minote.x10;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.provider.OpenableColumns;
import android.database.Cursor;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.KeyStore;
import java.security.MessageDigest;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import androidx.activity.result.ActivityResult;

@CapacitorPlugin(name = "PrivateBackup")
public class PrivateBackupPlugin extends Plugin {
  private static final int LIMIT = 32 * 1024 * 1024;
  private static final String PREF = "minote_personal_backup";
  private static final String KEY_ALIAS = "minote_personal_backup_wrapping";
  private static final String EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  private SharedPreferences prefs(){return getContext().getSharedPreferences(PREF,0);}
  private Uri linked(){String value=prefs().getString("uri",null);return value==null?null:Uri.parse(value);}
  private static String digest(byte[] bytes) throws Exception {
    byte[] value=MessageDigest.getInstance("SHA-256").digest(bytes);
    StringBuilder out=new StringBuilder();
    for(byte b:value)out.append(String.format(java.util.Locale.ROOT,"%02x",b&0xff));
    return out.toString();
  }
  private byte[] readBytes(Uri uri) throws Exception {
    try(InputStream in=getContext().getContentResolver().openInputStream(uri)){
      if(in==null)throw new IllegalStateException("El proveedor no permite leer el archivo.");
      ByteArrayOutputStream out=new ByteArrayOutputStream();
      byte[] buffer=new byte[16384];int n;
      while((n=in.read(buffer))!=-1){
        if(out.size()+n>LIMIT)throw new IllegalStateException("Respaldo demasiado grande (máximo 32 MB).");
        out.write(buffer,0,n);
      }
      return out.toByteArray();
    }
  }
  private String label(Uri uri) {
    try(Cursor cursor=getContext().getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){
      if(cursor!=null&&cursor.moveToFirst())return cursor.getString(0);
    }catch(Exception ignored){}
    return "Respaldo seleccionado";
  }
  @PluginMethod public void status(PluginCall call) {
    JSObject result=new JSObject();
    Uri uri=linked();
    result.put("linked",uri!=null);
    if(uri!=null){
      result.put("name",label(uri));
      try{result.put("fingerprint",digest(uri.toString().getBytes(StandardCharsets.UTF_8)));}catch(Exception ignored){}
      result.put("canRead",getContext().getContentResolver().getPersistedUriPermissions().stream().anyMatch(p->p.getUri().equals(uri)&&p.isReadPermission()));
      result.put("canWrite",getContext().getContentResolver().getPersistedUriPermissions().stream().anyMatch(p->p.getUri().equals(uri)&&p.isWritePermission()));
    }
    result.put("remembered",prefs().contains("wrappedKey"));
    call.resolve(result);
  }
  @PluginMethod public void create(PluginCall call) {
    Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);
    i.addCategory(Intent.CATEGORY_OPENABLE);
    i.setType("application/json");
    i.putExtra(Intent.EXTRA_TITLE,"MiNote_X10_copia_cifrada.json");
    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
    startActivityForResult(call,i,"chosen");
  }
  @PluginMethod public void select(PluginCall call) {
    Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);
    i.addCategory(Intent.CATEGORY_OPENABLE);
    i.setType("*/*");
    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
    startActivityForResult(call,i,"chosen");
  }
  @ActivityCallback private void chosen(PluginCall call, ActivityResult response) {
    Intent data=response.getData();
    if(response.getResultCode()!=Activity.RESULT_OK||data==null||data.getData()==null){
      JSObject v=new JSObject();v.put("cancelled",true);call.resolve(v);return;
    }
    Uri uri=data.getData();
    int flags=data.getFlags()&(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
    if((flags&Intent.FLAG_GRANT_WRITE_URI_PERMISSION)==0||(flags&Intent.FLAG_GRANT_READ_URI_PERMISSION)==0){
      call.reject("Este proveedor no concede lectura y escritura. Elija un archivo de Drive que pueda editar.");return;
    }
    try{
      getContext().getContentResolver().takePersistableUriPermission(uri,flags);
      prefs().edit().putString("uri",uri.toString()).remove("wrappedKey").apply();
      JSObject v=new JSObject();v.put("cancelled",false);v.put("name",label(uri));call.resolve(v);
    }catch(Exception e){call.reject("No se pudo conservar el permiso de archivo: "+e.getMessage());}
  }
  // Diagnóstico local X10: el usuario selecciona un documento mediante Android SAF.
  // No reutiliza ni modifica el respaldo cifrado de Mi Note.
  @PluginMethod public void saveDiagnostic(PluginCall call) {
    String content=call.getString("content");
    if(content==null||content.isEmpty()||content.getBytes(StandardCharsets.UTF_8).length>2*1024*1024){
      call.reject("El diagnóstico está vacío o supera el límite local de 2 MB.");return;
    }
    Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("application/json");
    intent.putExtra(Intent.EXTRA_TITLE,"MiNote_X10_diagnostico_local.json");
    intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
    startActivityForResult(call,intent,"diagnosticChosen");
  }
  @ActivityCallback private void diagnosticChosen(PluginCall call,ActivityResult response){
    Intent data=response.getData();
    if(response.getResultCode()!=Activity.RESULT_OK||data==null||data.getData()==null){
      JSObject result=new JSObject();result.put("cancelled",true);call.resolve(result);return;
    }
    String content=call.getString("content");
    if(content==null){call.reject("No están disponibles los datos de diagnóstico.");return;}
    byte[] bytes=content.getBytes(StandardCharsets.UTF_8);
    if(bytes.length>2*1024*1024){call.reject("Diagnóstico demasiado grande.");return;}
    try(OutputStream out=getContext().getContentResolver().openOutputStream(data.getData(),"w")){
      if(out==null)throw new IllegalStateException("Android no pudo abrir el destino para escritura.");
      out.write(bytes);out.flush();
      JSObject result=new JSObject();
      result.put("cancelled",false);
      result.put("saved",true);
      result.put("name",label(data.getData()));
      result.put("bytes",bytes.length);
      call.resolve(result);
    }catch(Exception e){call.reject("No se pudo guardar el diagnóstico: "+e.getMessage());}
  }

  // Huion import: temporary, read-only Android SAF selection.
  // Does not access encryption keys, Drive, or write back to the Huion source.
  @PluginMethod public void openHuionArchive(PluginCall call){
    Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("*/*");
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    startActivityForResult(call,intent,"huionArchiveChosen");
  }
  @ActivityCallback private void huionArchiveChosen(PluginCall call,ActivityResult response){
    Intent data=response.getData();
    if(response.getResultCode()!=Activity.RESULT_OK||data==null||data.getData()==null){
      JSObject result=new JSObject();result.put("cancelled",true);call.resolve(result);return;
    }
    Uri uri=data.getData();String name=label(uri);
    try{
      // Algunos proveedores Android devuelven "documento", un UUID o un
      // nombre sin extension. Validar los bytes, NO la etiqueta del selector.
      byte[] bytes=readBytes(uri);
      if(bytes.length==0||bytes.length>16*1024*1024)
        throw new IllegalStateException("Archivo Huion vacío o mayor a 16 MB.");
      // .ahn y .ahns son ZIP, a veces ZIP anidado. Comprobar el encabezado
      // es solo una validacion inicial: JavaScript verifica el contenido Huion.
      boolean zip=bytes.length>=4&&bytes[0]==0x50&&bytes[1]==0x4b&&
        bytes[2]==0x03&&bytes[3]==0x04;
      if(!zip)
        throw new IllegalArgumentException("El archivo seleccionado ("+name+
          ") no es un documento Huion .ahn/.ahns. Si es JSON, use Importar archivo de Mi Note; si es ZIP, seleccione el .ahns original.");
      JSObject result=new JSObject();
      result.put("cancelled",false);result.put("name",name);
      result.put("base64",Base64.encodeToString(bytes,Base64.NO_WRAP));
      result.put("bytes",bytes.length);
      call.resolve(result);
    }catch(Exception e){call.reject("No se pudo abrir el archivo Huion: "+e.getMessage());}
  }

  @PluginMethod public void read(PluginCall call){
    Uri uri=linked();if(uri==null){call.reject("Debe seleccionar un respaldo.");return;}
    try{
      byte[] bytes=readBytes(uri);
      JSObject response=new JSObject();
      response.put("content",new String(bytes,StandardCharsets.UTF_8));
      response.put("sha",digest(bytes));
      response.put("empty",bytes.length==0);
      call.resolve(response);
    }catch(Exception e){call.reject("No se pudo leer el respaldo: "+e.getMessage());}
  }
  @PluginMethod public void write(PluginCall call){
    Uri uri=linked();if(uri==null){call.reject("Seleccione un archivo de respaldo.");return;}
    String content=call.getString("content"), expected=call.getString("expectedSha");
    if(content==null||expected==null||!expected.matches("[0-9a-f]{64}")){call.reject("Datos de escritura incompletos.");return;}
    byte[] bytes=content.getBytes(StandardCharsets.UTF_8);
    if(bytes.length>LIMIT){call.reject("El respaldo supera el límite de 32 MB.");return;}
    try{
      byte[] current=readBytes(uri);
      String actual=digest(current);
      if(!actual.equals(expected)){call.reject("REMOTE_CHANGED: El archivo cambió desde la última lectura. No se ha sobrescrito.");return;}
      try(OutputStream out=getContext().getContentResolver().openOutputStream(uri,"wt")){
        if(out==null)throw new IllegalStateException("No se pudo abrir el archivo para escribir.");
        out.write(bytes);out.flush();
      }
      JSObject response=new JSObject();
      response.put("sha",digest(bytes));
      response.put("bytes",bytes.length);
      call.resolve(response);
    }catch(Exception e){call.reject("No se escribió el respaldo: "+e.getMessage());}
  }
  private SecretKey wrappingKey() throws Exception {
    KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
    if(!ks.containsAlias(KEY_ALIAS)){
      KeyGenerator kg=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
      kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
      kg.generateKey();
    }
    return ((KeyStore.SecretKeyEntry)ks.getEntry(KEY_ALIAS,null)).getSecretKey();
  }
  @PluginMethod public void rememberKey(PluginCall call){
    String encoded=call.getString("key");
    if(encoded==null){call.reject("Falta la clave cifrada.");return;}
    try{
      byte[] raw=Base64.decode(encoded,Base64.NO_WRAP);
      if(raw.length!=32)throw new IllegalStateException("Clave inválida.");
      Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE,wrappingKey());
      byte[] iv=cipher.getIV(),encrypted=cipher.doFinal(raw);
      prefs().edit().putString("wrappedKey",Base64.encodeToString(iv,Base64.NO_WRAP)+":"+
        Base64.encodeToString(encrypted,Base64.NO_WRAP)).apply();
      java.util.Arrays.fill(raw,(byte)0);
      call.resolve();
    }catch(Exception e){call.reject("No se pudo proteger la clave en Android: "+e.getMessage());}
  }
  @PluginMethod public void recallKey(PluginCall call){
    String value=prefs().getString("wrappedKey",null);
    if(value==null){call.reject("No hay clave guardada.");return;}
    try{
      String[] parts=value.split(":");
      if(parts.length!=2)throw new IllegalStateException("Clave guardada inválida.");
      Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE,wrappingKey(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
      byte[] raw=cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP));
      JSObject result=new JSObject();result.put("key",Base64.encodeToString(raw,Base64.NO_WRAP));
      java.util.Arrays.fill(raw,(byte)0);
      call.resolve(result);
    }catch(Exception e){call.reject("No se pudo desbloquear la copia: "+e.getMessage());}
  }
  @PluginMethod public void forgetKey(PluginCall call){
    prefs().edit().remove("wrappedKey").apply();call.resolve();
  }
  @PluginMethod public void unlink(PluginCall call){
    Uri uri=linked();
    if(uri!=null){
      try{getContext().getContentResolver().releasePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);}catch(Exception ignored){}
    }
    prefs().edit().remove("uri").remove("wrappedKey").apply();
    call.resolve();
  }
}