package expo.modules.hourloophash

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

class HourLoopHashModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HourLoopHash")

    AsyncFunction("sha256File") { uriString: String ->
      val uri = Uri.parse(uriString)
      val path = uri.path ?: uriString
      val digest = MessageDigest.getInstance("SHA-256")
      val buffer = ByteArray(1024 * 1024)
      FileInputStream(File(path)).use { input ->
        while (true) {
          val read = input.read(buffer)
          if (read < 0) break
          digest.update(buffer, 0, read)
        }
      }
      digest.digest().joinToString("") { byte -> "%02x".format(byte) }
    }
  }
}
