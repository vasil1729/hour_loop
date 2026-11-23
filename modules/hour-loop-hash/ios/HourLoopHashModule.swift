import CryptoKit
import ExpoModulesCore
import Foundation

public class HourLoopHashModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HourLoopHash")

    AsyncFunction("sha256File") { (uriString: String) -> String in
      let path = URL(string: uriString)?.path ?? uriString
      let handle = try FileHandle(forReadingFrom: URL(fileURLWithPath: path))
      defer { try? handle.close() }
      var hasher = SHA256()
      while let chunk = try handle.read(upToCount: 1024 * 1024), !chunk.isEmpty {
        hasher.update(data: chunk)
      }
      return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
  }
}
