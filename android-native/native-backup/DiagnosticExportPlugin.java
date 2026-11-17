package cl.stikgatica.minote.x10;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

/** Guarda únicamente el diagnóstico generado por el usuario mediante ACTION_CREATE_DOCUMENT.
 * No requiere acceso general al almacenamiento ni permiso INTERNET.
 */
@CapacitorPlugin(name = "DiagnosticExport")
public class DiagnosticExportPlugin extends Plugin {
  private static final int MAX_BYTES = 2 * 1024 * 1024;
  private static final String NAME = "MiNote_X10_diagnostico_local.json";

  @PluginMethod
  public void save(PluginCall call) {
    String content = call.getString("content");
    if (content == null || !content.contains("\"MiNoteX10OfflineDiagnostic\"")
        || content.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
      call.reject("Diagnóstico X10 ausente o demasiado grande (límite 2 MB).");
      return;
    }
    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("application/json");
    intent.putExtra(Intent.EXTRA_TITLE, NAME);
    intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
    startActivityForResult(call, intent, "fileChosen");
  }

  @ActivityCallback
  private void fileChosen(PluginCall call, ActivityResult result) {
    Intent data = result.getData();
    if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
      JSObject response = new JSObject();
      response.put("cancelled", true);
      call.resolve(response);
      return;
    }
    Uri uri = data.getData();
    String content = call.getString("content");
    if (content == null) {
      call.reject("No están disponibles los datos del diagnóstico.");
      return;
    }
    byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
    if (bytes.length > MAX_BYTES) {
      call.reject("El diagnóstico excede el límite seguro.");
      return;
    }
    try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
      if (out == null) throw new IllegalStateException("El almacenamiento seleccionado no permite escribir.");
      out.write(bytes);
      out.flush();
      JSObject response = new JSObject();
      response.put("saved", true);
      response.put("bytes", bytes.length);
      response.put("name", NAME);
      call.resolve(response);
    } catch (Exception e) {
      call.reject("Android no pudo guardar el diagnóstico: " + e.getMessage());
    }
  }
}
