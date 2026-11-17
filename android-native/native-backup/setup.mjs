// Android Storage Access Framework: instalar plugin en el proyecto generado por Capacitor.
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const javaRoot=path.join(root,'android','app','src','main','java');
const pkg=path.join(javaRoot,'cl','stikgatica','minote','x10');
await fs.mkdir(pkg,{recursive:true});
await fs.copyFile(path.join(root,'native-backup','PrivateBackupPlugin.java'),path.join(pkg,'PrivateBackupPlugin.java'));
const activity=path.join(pkg,'MainActivity.java');
const content=`package cl.stikgatica.minote.x10;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle savedInstanceState) {
    registerPlugin(PrivateBackupPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
`;
await fs.writeFile(activity,content);
console.log('Plugin nativo de respaldo personal registrado sin añadir permisos globales Drive.');
