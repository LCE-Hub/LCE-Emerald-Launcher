#include "Platform/AndroidBridge.hpp"
#include "Core/Log.hpp"
#include "Core/Paths.hpp"
#include <SDL3/SDL_error.h>
#include <SDL3/SDL_filesystem.h>
#include <SDL3/SDL_iostream.h>
#include <SDL3/SDL_system.h>
#include <nlohmann/json.hpp>
#if defined(__ANDROID__)
#include <jni.h>
#endif
#include <array>
#include <cstddef>
#include <string>
#include <utility>
namespace emerald::platform {
namespace {
std::string_view bridge_action_name(BridgeAction action) {
  switch (action) {
  case BridgeAction::Play:
    return "play";
  case BridgeAction::OpenContainer:
    return "open";
  case BridgeAction::OpenSettings:
    return "settings";
  case BridgeAction::SwitchProton:
    return "switch_proton";
  case BridgeAction::InstallDriver:
    return "install_driver";
  case BridgeAction::SetAudioBackend:
    return "set_audio_backend";
  }
  return "play";
}
} // namespace

#if !defined(__ANDROID__)
bool android_bridge_start(const std::filesystem::path &instance_path,
                          BridgeAction action,
                          const std::vector<std::string> &extra_args) {
  (void)instance_path;
  (void)action;
  (void)extra_args;
  return false;
}

bool android_open_directory(const std::filesystem::path &path) {
  (void)path;
  return false;
}

void android_prepare_runtime_files() {}
#else
bool android_bridge_start(const std::filesystem::path &instance_path,
                          BridgeAction action,
                          const std::vector<std::string> &extra_args) {
  JNIEnv *env = static_cast<JNIEnv *>(SDL_GetAndroidJNIEnv());
  if (env == nullptr) {
    core::error("android: no JNI environment");
    return false;
  }
  jobject activity = static_cast<jobject>(SDL_GetAndroidActivity());
  if (activity == nullptr) {
    core::error("android: no activity");
    return false;
  }
  jclass intent_class = env->FindClass("android/content/Intent");
  if (intent_class == nullptr) {
    core::error("android: Intent class not found");
    env->ExceptionClear();
    return false;
  }
  jclass bridge_class = env->FindClass("dev/lcehub/emerald/LauncherBridgeActivity");
  if (bridge_class == nullptr) {
    core::error("android: LauncherBridgeActivity not found");
    env->ExceptionClear();
    env->DeleteLocalRef(intent_class);
    return false;
  }
  jmethodID constructor =
      env->GetMethodID(intent_class, "<init>",
                       "(Landroid/content/Context;Ljava/lang/Class;)V");
  if (constructor == nullptr) {
    core::error("android: Intent constructor not found");
    env->ExceptionClear();
    env->DeleteLocalRef(bridge_class);
    env->DeleteLocalRef(intent_class);
    return false;
  }
  jmethodID put_extra = env->GetMethodID(
      intent_class, "putExtra",
      "(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;");
  jmethodID add_flags =
      env->GetMethodID(intent_class, "addFlags", "(I)Landroid/content/Intent;");
  jobject intent =
      env->NewObject(intent_class, constructor, activity, bridge_class);
  env->DeleteLocalRef(bridge_class);
  env->DeleteLocalRef(intent_class);
  if (intent == nullptr) {
    core::error("android: failed to create launch intent");
    env->ExceptionClear();
    return false;
  }
  const std::array<std::pair<std::string, std::string>, 3> extras = {
      {{"launcher_action", std::string(bridge_action_name(action))},
       {"instance_path", instance_path.string()},
       {"extra_args", nlohmann::json(extra_args).dump()}}};
  for (const auto &extra : extras) {
    jstring key = env->NewStringUTF(extra.first.c_str());
    jstring value = env->NewStringUTF(extra.second.c_str());
    env->CallObjectMethod(intent, put_extra, key, value);
    env->DeleteLocalRef(key);
    env->DeleteLocalRef(value);
  }
  env->CallObjectMethod(intent, add_flags, static_cast<jint>(0x10000000));
  jmethodID start_activity = env->GetMethodID(
      env->GetObjectClass(activity), "startActivity",
      "(Landroid/content/Intent;)V");
  env->CallVoidMethod(activity, start_activity, intent);
  env->DeleteLocalRef(intent);
  if (env->ExceptionCheck()) {
    core::error("android: failed to start bridge activity");
    env->ExceptionDescribe();
    env->ExceptionClear();
    return false;
  }
  return true;
}

bool android_open_directory(const std::filesystem::path &path) {
  JNIEnv *env = static_cast<JNIEnv *>(SDL_GetAndroidJNIEnv());
  if (env == nullptr) {
    core::error("android: no JNI environment");
    return false;
  }
  jobject activity = static_cast<jobject>(SDL_GetAndroidActivity());
  if (activity == nullptr) {
    core::error("android: no activity");
    return false;
  }
  jclass context_class = env->FindClass("android/content/Context");
  jclass file_class = env->FindClass("java/io/File");
  jclass provider_class = env->FindClass("androidx/core/content/FileProvider");
  jclass intent_class = env->FindClass("android/content/Intent");
  if (context_class == nullptr || file_class == nullptr ||
      provider_class == nullptr || intent_class == nullptr) {
    if (env->ExceptionCheck()) {
      env->ExceptionDescribe();
      env->ExceptionClear();
    }
    return false;
  }
  jmethodID get_package =
      env->GetMethodID(context_class, "getPackageName", "()Ljava/lang/String;");
  jmethodID file_ctor =
      env->GetMethodID(file_class, "<init>", "(Ljava/lang/String;)V");
  jmethodID get_uri = env->GetStaticMethodID(
      provider_class, "getUriForFile",
      "(Landroid/content/Context;Ljava/lang/String;Ljava/io/File;)Landroid/net/Uri;");
  jmethodID intent_ctor =
      env->GetMethodID(intent_class, "<init>", "(Ljava/lang/String;)V");
  jmethodID set_data_and_type = env->GetMethodID(
      intent_class, "setDataAndType",
      "(Landroid/net/Uri;Ljava/lang/String;)Landroid/content/Intent;");
  jmethodID set_package = env->GetMethodID(
      intent_class, "setPackage", "(Ljava/lang/String;)Landroid/content/Intent;");
  jmethodID add_flags =
      env->GetMethodID(intent_class, "addFlags", "(I)Landroid/content/Intent;");
  jmethodID start_activity = env->GetMethodID(
      env->GetObjectClass(activity), "startActivity", "(Landroid/content/Intent;)V");
  if (get_package == nullptr || file_ctor == nullptr || get_uri == nullptr ||
      intent_ctor == nullptr || set_data_and_type == nullptr ||
      set_package == nullptr || add_flags == nullptr ||
      start_activity == nullptr) {
    if (env->ExceptionCheck()) {
      env->ExceptionDescribe();
      env->ExceptionClear();
    }
    return false;
  }
  jstring package_name =
      static_cast<jstring>(env->CallObjectMethod(activity, get_package));
  const char *package_chars = package_name != nullptr
                                  ? env->GetStringUTFChars(package_name, nullptr)
                                  : nullptr;
  const std::string authority =
      package_chars != nullptr ? std::string(package_chars) + ".fileprovider"
                               : std::string();
  if (package_chars != nullptr) {
    env->ReleaseStringUTFChars(package_name, package_chars);
  }
  if (package_name != nullptr) {
    env->DeleteLocalRef(package_name);
  }
  if (authority.empty()) {
    return false;
  }
  jstring path_string = env->NewStringUTF(path.string().c_str());
  jstring authority_string = env->NewStringUTF(authority.c_str());
  jobject file = env->NewObject(file_class, file_ctor, path_string);
  jobject uri = env->CallStaticObjectMethod(provider_class, get_uri, activity,
                                             authority_string, file);
  if (env->ExceptionCheck()) {
    env->ExceptionDescribe();
    env->ExceptionClear();
  }
  jstring action = env->NewStringUTF("android.intent.action.VIEW");
  jstring mime = env->NewStringUTF("vnd.android.document/directory");
  const auto start = [&](const char *target_package) {
    jobject intent = env->NewObject(intent_class, intent_ctor, action);
    env->CallObjectMethod(intent, set_data_and_type, uri, mime);
    if (target_package != nullptr) {
      jstring package = env->NewStringUTF(target_package);
      env->CallObjectMethod(intent, set_package, package);
      env->DeleteLocalRef(package);
    }
    env->CallObjectMethod(intent, add_flags, static_cast<jint>(0x10000003));
    env->CallVoidMethod(activity, start_activity, intent);
    env->DeleteLocalRef(intent);
    if (env->ExceptionCheck()) {
      env->ExceptionDescribe();
      env->ExceptionClear();
      return false;
    }
    return true;
  };
  bool started = uri != nullptr && start("com.android.documentsui");
  if (!started && uri != nullptr) {
    started = start(nullptr);
  }
  env->DeleteLocalRef(mime);
  env->DeleteLocalRef(action);
  if (uri != nullptr) {
    env->DeleteLocalRef(uri);
  }
  env->DeleteLocalRef(file);
  env->DeleteLocalRef(authority_string);
  env->DeleteLocalRef(path_string);
  env->DeleteLocalRef(intent_class);
  env->DeleteLocalRef(provider_class);
  env->DeleteLocalRef(file_class);
  env->DeleteLocalRef(context_class);
  return started;
}

void android_prepare_runtime_files() {
  const std::array<std::string, 1> asset_files = {"cacert.pem"};
  for (const std::string &name : asset_files) {
    const std::filesystem::path target =
        core::app_data_dir() / name;
    std::error_code error;
    if (std::filesystem::exists(target, error) &&
        std::filesystem::file_size(target, error) > 0) {
      continue;
    }
    SDL_IOStream *stream = SDL_IOFromFile(name.c_str(), "rb");
    if (stream == nullptr) {
      continue;
    }
    std::filesystem::create_directories(target.parent_path(), error);
    std::FILE *file = std::fopen(target.string().c_str(), "wb");
    if (file == nullptr) {
      SDL_CloseIO(stream);
      continue;
    }
    std::array<unsigned char, 65536> buffer{};
    for (;;) {
      const std::size_t read = SDL_ReadIO(stream, buffer.data(), buffer.size());
      if (read == 0) {
        break;
      }
      std::fwrite(buffer.data(), 1, read, file);
    }
    std::fclose(file);
    SDL_CloseIO(stream);
    core::info("android: extracted " + name);
  }
}
#endif
} // namespace emerald::platform
