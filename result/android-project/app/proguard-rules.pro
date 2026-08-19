# Capacitor's bridge finds plugins by reflection, so R8 must not rename or
# remove them. Without these the release build launches to a blank WebView —
# the classic "works in debug, broken in release" failure.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
  @com.getcapacitor.PluginMethod public <methods>;
}
-keep public class * extends com.getcapacitor.Plugin { *; }

# Plugin classes are named as strings in capacitor.plugins.json.
-keep class com.capacitorjs.plugins.** { *; }

# The JavaScript interface is called from the WebView by name.
-keepclassmembers class * {
  @android.webkit.JavascriptInterface <methods>;
}

# Cordova compatibility layer, present because Capacitor ships it.
-keep class org.apache.cordova.** { *; }

# Keep source file and line numbers in stack traces we might be sent, while
# still obfuscating names.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
