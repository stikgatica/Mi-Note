package cl.stikgatica.minote.x10;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.CalendarContract;
import android.provider.CalendarContract.Events;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognition;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModel;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModelIdentifier;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizer;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizerOptions;
import com.google.mlkit.vision.digitalink.recognition.Ink;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Calendar;
import java.util.TimeZone;
import java.util.Date;

@CapacitorPlugin(name="MiNoteCalendar")
public class MiNoteCalendarPlugin extends Plugin {
 private final String LANGUAGE="es";
 private DigitalInkRecognitionModel model() throws Exception {
  DigitalInkRecognitionModelIdentifier id=DigitalInkRecognitionModelIdentifier.fromLanguageTag(LANGUAGE);
  if(id==null)throw new IllegalStateException("No se encontró el modelo de español.");
  return DigitalInkRecognitionModel.builder(id).build();
 }
 @PluginMethod public void modelStatus(PluginCall call) {
  try{
   RemoteModelManager.getInstance().isModelDownloaded(model())
    .addOnSuccessListener(downloaded->{
     JSObject ret=new JSObject();
     ret.put("downloaded",downloaded);
     ret.put("language",LANGUAGE);
     call.resolve(ret);
    }).addOnFailureListener(e->call.reject("No se pudo consultar el modelo: "+e.getMessage()));
  }catch(Exception e){call.reject(e.getMessage());}
 }
 @PluginMethod public void downloadModel(PluginCall call){
  try{
   RemoteModelManager mgr=RemoteModelManager.getInstance();
   DigitalInkRecognitionModel m=model();
   mgr.isModelDownloaded(m).addOnSuccessListener(downloaded->{
    if(downloaded){JSObject o=new JSObject();o.put("downloaded",true);call.resolve(o);return;}
    mgr.download(m,new DownloadConditions.Builder().build())
     .addOnSuccessListener(v->{JSObject o=new JSObject();o.put("downloaded",true);call.resolve(o);})
     .addOnFailureListener(e->call.reject("Descarga del modelo español fallida: "+e.getMessage()));
   }).addOnFailureListener(e->call.reject("No se pudo consultar el modelo: "+e.getMessage()));
  }catch(Exception e){call.reject(e.getMessage());}
 }
 @PluginMethod public void recognize(PluginCall call){
  try{
   JSArray strokes=call.getArray("strokes");
   if(strokes==null||strokes.length()<1||strokes.length()>250)
    throw new IllegalArgumentException("Seleccione entre 1 y 250 trazos.");
   Ink.Builder builder=Ink.builder();
   int total=0;
   for(int i=0;i<strokes.length();i++){
    JSONArray points=strokes.getJSONArray(i);
    if(points.length()<2||points.length()>4000)continue;
    Ink.Stroke.Builder stroke=Ink.Stroke.builder();
    for(int j=0;j<points.length();j++){
     JSONArray point=points.getJSONArray(j);
     double x=point.getDouble(0),y=point.getDouble(1);
     if(!Double.isFinite(x)||!Double.isFinite(y)||x<0||y<0||x>1000||y>1400)continue;
     stroke.addPoint(Ink.Point.create((float)x,(float)y));
     total++;
     if(total>14000)throw new IllegalArgumentException("Demasiados puntos para esta lectura.");
    }
    builder.addStroke(stroke.build());
   }
   if(total<4)throw new IllegalArgumentException("No hay escritura suficiente.");
   DigitalInkRecognitionModel m=model();
   RemoteModelManager.getInstance().isModelDownloaded(m).addOnSuccessListener(downloaded->{
    if(!downloaded){call.reject("Primero descargue el modelo español una vez.");return;}
    DigitalInkRecognizer recognizer=DigitalInkRecognition.getClient(
     DigitalInkRecognizerOptions.builder(m).build());
    recognizer.recognize(builder.build()).addOnSuccessListener(result->{
     JSObject response=new JSObject();
     JSArray choices=new JSArray();
     for(int k=0;k<Math.min(4,result.getCandidates().size());k++)
      choices.put(result.getCandidates().get(k).getText());
     response.put("candidates",choices);
     response.put("text",result.getCandidates().isEmpty()?"":result.getCandidates().get(0).getText());
     call.resolve(response);
     recognizer.close();
    }).addOnFailureListener(err->{recognizer.close();call.reject("No se pudo reconocer la escritura: "+err.getMessage());});
   }).addOnFailureListener(e->call.reject("No se pudo consultar el modelo: "+e.getMessage()));
  }catch(Exception e){call.reject("Lectura manuscrita no disponible: "+e.getMessage());}
 }
 @PluginMethod public void openCalendar(PluginCall call){
  try{
   String title=call.getString("title","");
   String date=call.getString("date","");
   String time=call.getString("time","");
   String endTime=call.getString("endTime","");
   String description=call.getString("description","");
   boolean allDay=Boolean.TRUE.equals(call.getBoolean("allDay",false));
   if(title.trim().length()==0||title.length()>160||description.length()>3000)
    throw new IllegalArgumentException("Título o descripción inválidos.");
   if(!date.matches("20[2-9][0-9]-[0-1][0-9]-[0-3][0-9]"))
    throw new IllegalArgumentException("Fecha inválida.");
   String[] parts=date.split("-");
   int y=Integer.parseInt(parts[0]),mo=Integer.parseInt(parts[1]),d=Integer.parseInt(parts[2]);
   Calendar dateCheck=Calendar.getInstance();
   dateCheck.setLenient(false);
   dateCheck.clear();
   dateCheck.set(y,mo-1,d);
   dateCheck.getTimeInMillis();
   if(!allDay&&!time.matches("([01][0-9]|2[0-3]):[0-5][0-9]"))
    throw new IllegalArgumentException("La hora debe ser HH:MM.");
   Intent intent=new Intent(Intent.ACTION_INSERT);
   intent.setData(Events.CONTENT_URI);
   intent.putExtra(Events.TITLE,title.trim());
   intent.putExtra(Events.DESCRIPTION,description);
   if(allDay){
    Calendar start=Calendar.getInstance(TimeZone.getTimeZone("UTC"));
    start.clear();start.set(y,mo-1,d,0,0);
    Calendar end=(Calendar)start.clone();end.add(Calendar.DATE,1);
    intent.putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY,true);
    intent.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME,start.getTimeInMillis());
    intent.putExtra(CalendarContract.EXTRA_EVENT_END_TIME,end.getTimeInMillis());
   } else {
    Calendar start=Calendar.getInstance();start.setLenient(false);
    start.clear();start.set(y,mo-1,d,Integer.parseInt(time.substring(0,2)),Integer.parseInt(time.substring(3)),0);
    Calendar end=(Calendar)start.clone();
    if(endTime.matches("([01][0-9]|2[0-3]):[0-5][0-9]")){
     end.set(Calendar.HOUR_OF_DAY,Integer.parseInt(endTime.substring(0,2)));
     end.set(Calendar.MINUTE,Integer.parseInt(endTime.substring(3)));
    }else end.add(Calendar.HOUR_OF_DAY,1);
    if(end.getTimeInMillis()<=start.getTimeInMillis())throw new IllegalArgumentException("La hora de término debe ser posterior.");
    intent.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME,start.getTimeInMillis());
    intent.putExtra(CalendarContract.EXTRA_EVENT_END_TIME,end.getTimeInMillis());
   }
   // Android 11+ puede ocultar paquetes en resolveActivity aunque haya un
   // calendario instalado. Intentar abrir directamente y capturar el error.
   getActivity().startActivity(intent);
   JSObject o=new JSObject();o.put("opened",true);
   call.resolve(o);
  }catch(Exception e){call.reject("No se pudo abrir Calendar: "+e.getMessage());}
 }
}
