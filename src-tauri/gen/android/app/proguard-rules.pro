-keep class dev.lcehub.emerald.** { *; }
-keepclassmembers class dev.lcehub.emerald.** { *; }
-dontwarn dev.lcehub.emerald.**
-keep class com.github.luben.zstd.** { *; }
-keepclassmembers class com.github.luben.zstd.** { *; }
-dontwarn com.github.luben.zstd.**
-keep class com.emerald.legacy.TauriActivity {
  public <methods>;
  public <fields>;
}
-keep class com.emerald.legacy.MainActivity {
  public <methods>;
}

-dontwarn com.android.org.conscrypt.SSLParametersImpl
-dontwarn org.apache.harmony.xnet.provider.jsse.SSLParametersImpl
-dontwarn org.bouncycastle.jsse.BCSSLParameters
-dontwarn org.bouncycastle.jsse.BCSSLSocket
-dontwarn org.bouncycastle.jsse.provider.BouncyCastleJsseProvider
