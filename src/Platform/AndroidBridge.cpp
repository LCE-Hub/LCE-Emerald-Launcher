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
  jclass files_class = env->FindClass("com/emerald/legacy/LauncherFiles");
  if (files_class == nullptr) {
    core::error("android: LauncherFiles class not found");
    env->ExceptionClear();
    return false;
  }
  jmethodID open_directory = env->GetStaticMethodID(
      files_class, "openDirectory", "(Landroid/app/Activity;Ljava/lang/String;)Z");
  if (open_directory == nullptr) {
    core::error("android: LauncherFiles.openDirectory not found");
    env->ExceptionClear();
    env->DeleteLocalRef(files_class);
    return false;
  }
  jstring path_value =
      env->NewStringUTF(path.lexically_normal().string().c_str());
  if (path_value == nullptr) {
    core::error("android: directory path could not be created");
    env->ExceptionClear();
    env->DeleteLocalRef(files_class);
    return false;
  }
  jboolean result = env->CallStaticBooleanMethod(files_class, open_directory,
                                                  activity, path_value);
  bool exception = env->ExceptionCheck();
  if (exception) {
    env->ExceptionDescribe();
    env->ExceptionClear();
  }
  env->DeleteLocalRef(path_value);
  env->DeleteLocalRef(files_class);
  if (exception) {
    core::error("android: DocumentsUI could not be started");
    return false;
  }
  if (result != JNI_TRUE) {
    core::error("android: DocumentsUI could not be started");
    return false;
  }
  return true;
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
