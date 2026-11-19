package cl.stikgatica.minote.x10;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@CapacitorPlugin(name="MiNoteFileExport")
public class MiNoteFileExportPlugin extends Plugin {
  private static final long MAX_BYTES=256L*1024*1024;
  private static final int MAX_PAGES=150;
  private static final String[] TYPES={"video/webm","image/svg+xml","image/png","application/pdf","application/zip"};
  private static final String[] EXT={".webm",".svg",".png",".pdf",".zip"};
  private final Map<String,Entry> files=new HashMap<>();

  private static class Entry {
    File file;
    String filename,mime;
    long bytes;
    int pages;
    PdfDocument pdf;
    Entry(File f,String n,String m){file=f;filename=n;mime=m;}
  }
  private String validName(String input,String mime){
    int i=java.util.Arrays.asList(TYPES).indexOf(mime);
    if(i<0)throw new IllegalArgumentException("Formato de exportación no permitido.");
    String name=(input==null?"":input).replaceAll("[^\\p{L}\\p{N}._ -]","_").trim();
    if(name.length()>100)name=name.substring(0,100);
    if(name.isEmpty())name="MiNote";
    if(!name.toLowerCase(java.util.Locale.ROOT).endsWith(EXT[i]))name+=EXT[i];
    return name;
  }
  private File folder(){
    File f=new File(getContext().getCacheDir(),"shared_documents");
    if(!f.exists()&&!f.mkdirs())throw new IllegalStateException("No se puede crear la carpeta temporal.");
    return f;
  }
  private Entry find(PluginCall c){
    Entry e=files.get(c.getString("id"));
    if(e==null||!e.file.getParentFile().equals(folder()))throw new IllegalArgumentException("Archivo temporal no disponible.");
    return e;
  }
  private void cleanup(){
    long now=System.currentTimeMillis();
    for(File f:folder().listFiles()==null?new File[0]:folder().listFiles())
      if(f.isFile()&&now-f.lastModified()>24L*60*60*1000)f.delete();
  }
  private JSObject token(String id,Entry e){
    JSObject r=new JSObject();r.put("id",id);r.put("name",e.filename);r.put("mime",e.mime);return r;
  }
  private void create(PluginCall call,boolean pdf){
    try{
      String mime=pdf?"application/pdf":call.getString("mime");
      String filename=validName(call.getString("filename"),mime);
      cleanup();
      String id=UUID.randomUUID().toString();
      File target=new File(folder(),id+filename.substring(filename.lastIndexOf('.')));
      if(!target.createNewFile())throw new IllegalStateException("No se pudo crear el archivo temporal.");
      Entry entry=new Entry(target,filename,mime);
      if(pdf)entry.pdf=new PdfDocument();
      files.put(id,entry);
      call.resolve(token(id,entry));
    }catch(Exception e){call.reject("No se pudo preparar el archivo: "+e.getMessage());}
  }
  @PluginMethod public void beginExport(PluginCall call){create(call,false);}
  @PluginMethod public void beginPdf(PluginCall call){create(call,true);}

  @PluginMethod public void appendExport(PluginCall call){
    try{
      Entry e=find(call);
      if(e.pdf!=null)throw new IllegalArgumentException("El PDF requiere añadir páginas.");
      String base64=call.getString("base64");
      if(base64==null||base64.length()>512*1024)throw new IllegalArgumentException("Fragmento de datos inválido.");
      byte[] block=Base64.decode(base64,Base64.DEFAULT);
      if(block.length==0||e.bytes+block.length>MAX_BYTES)throw new IllegalArgumentException("Archivo vacío o mayor a 256 MB.");
      try(FileOutputStream out=new FileOutputStream(e.file,true)){out.write(block);}
      e.bytes+=block.length;call.resolve();
    }catch(Exception ex){call.reject("Error al escribir archivo: "+ex.getMessage());}
  }
  @PluginMethod public void appendPdfPage(PluginCall call){
    try{
      Entry e=find(call);
      if(e.pdf==null)throw new IllegalArgumentException("No hay documento PDF abierto.");
      if(e.pages>=MAX_PAGES)throw new IllegalArgumentException("Un PDF admite hasta 150 hojas en esta versión.");
      String base64=call.getString("base64");
      if(base64==null||base64.length()>12*1024*1024)throw new IllegalArgumentException("La imagen de la hoja supera el límite.");
      byte[] data=Base64.decode(base64,Base64.DEFAULT);
      Bitmap bitmap=BitmapFactory.decodeByteArray(data,0,data.length);
      if(bitmap==null)throw new IllegalArgumentException("La hoja no es un PNG válido.");
      try{
        boolean landscape=bitmap.getWidth()>bitmap.getHeight();
        int w=landscape?595:420,h=landscape?420:595; // A5 a 72 pt/pulgada
        PdfDocument.PageInfo info=new PdfDocument.PageInfo.Builder(w,h,e.pages+1).create();
        PdfDocument.Page page=e.pdf.startPage(info);
        Canvas canvas=page.getCanvas();
        Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
        canvas.drawColor(android.graphics.Color.WHITE);
        canvas.drawBitmap(bitmap,null,new RectF(0,0,w,h),paint);
        e.pdf.finishPage(page);
        e.pages++;
        call.resolve();
      }finally{bitmap.recycle();}
    }catch(Exception ex){call.reject("No se pudo añadir la hoja al PDF: "+ex.getMessage());}
  }
  @PluginMethod public void finishPdf(PluginCall call){
    try{
      Entry e=find(call);
      if(e.pdf==null||e.pages==0)throw new IllegalArgumentException("El PDF no contiene hojas.");
      try(FileOutputStream out=new FileOutputStream(e.file)){e.pdf.writeTo(out);}
      e.pdf.close();e.pdf=null;e.bytes=e.file.length();
      if(e.bytes<8||e.bytes>MAX_BYTES)throw new IllegalArgumentException("El PDF generado no tiene un tamaño válido.");
      JSObject result=token(call.getString("id"),e);result.put("pages",e.pages);result.put("bytes",e.bytes);call.resolve(result);
    }catch(Exception ex){call.reject("Error al finalizar PDF: "+ex.getMessage());}
  }
  private Entry ready(PluginCall call){
    Entry e=find(call);
    if(e.pdf!=null||e.bytes<1||e.file.length()!=e.bytes)throw new IllegalArgumentException("El archivo todavía no está completo.");
    return e;
  }
  @PluginMethod public void saveExport(PluginCall call){
    try{
      Entry e=ready(call);
      Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
      intent.addCategory(Intent.CATEGORY_OPENABLE);
      intent.setType(e.mime);
      intent.putExtra(Intent.EXTRA_TITLE,e.filename);
      intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
      startActivityForResult(call,intent,"saved");
    }catch(Exception ex){call.reject("No se pudo abrir el selector de archivos: "+ex.getMessage());}
  }
  @ActivityCallback private void saved(PluginCall call,ActivityResult result){
    try{
      if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){
        JSObject res=new JSObject();res.put("cancelled",true);call.resolve(res);return;
      }
      Entry e=ready(call);
      Uri destination=result.getData().getData();
      try(InputStream in=new java.io.FileInputStream(e.file);
          OutputStream out=getContext().getContentResolver().openOutputStream(destination,"w")){
        if(out==null)throw new IllegalStateException("Android no pudo abrir el documento de destino.");
        byte[] buffer=new byte[65536];int n;
        while((n=in.read(buffer))!=-1)out.write(buffer,0,n);
        out.flush();
      }
      JSObject res=new JSObject();
      res.put("saved",true);res.put("cancelled",false);
      res.put("name",e.filename);res.put("bytes",e.bytes);
      call.resolve(res);
    }catch(Exception ex){call.reject("No se pudo guardar el documento: "+ex.getMessage());}
  }
  @PluginMethod public void shareExport(PluginCall call){
    try{
      Entry e=ready(call);
      Uri uri=FileProvider.getUriForFile(getContext(),getContext().getPackageName()+".minote.files",e.file);
      Intent send=new Intent(Intent.ACTION_SEND);
      send.setType(e.mime);
      send.putExtra(Intent.EXTRA_STREAM,uri);
      send.setClipData(ClipData.newUri(getContext().getContentResolver(),e.filename,uri));
      send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      Intent chooser=Intent.createChooser(send,"Compartir "+e.filename);
      chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      getActivity().startActivity(chooser);
      JSObject res=new JSObject();res.put("opened",true);
      res.put("name",e.filename);call.resolve(res);
      // Conservar el archivo 24 horas para que la aplicación receptora pueda leerlo.
    }catch(Exception ex){call.reject("No se pudo abrir Compartir en Android: "+ex.getMessage());}
  }
  @PluginMethod public void discardExport(PluginCall call){
    try{
      String id=call.getString("id");Entry e=files.remove(id);
      if(e!=null){if(e.pdf!=null)e.pdf.close();e.file.delete();}
      call.resolve();
    }catch(Exception ex){call.reject("No se pudo liberar el archivo: "+ex.getMessage());}
  }
}
