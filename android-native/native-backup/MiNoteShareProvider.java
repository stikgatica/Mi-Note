package cl.stikgatica.minote.x10;

import androidx.core.content.FileProvider;

/** Proveedor exclusivo de los archivos temporales compartidos de Mi Note.
 *  Usar una subclase evita colisiones con FileProvider de Capacitor y otros plugins. */
public final class MiNoteShareProvider extends FileProvider {
}
