pub enum BridgeAction {
    Play,
    OpenContainer,
    OpenSettings,
    SwitchProton,
    InstallDriver,
    SetAudioBackend,
}

pub fn launch_bridge(
    instance_path: String,
    action: BridgeAction,
    extra_args: Vec<String>,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        use jni::objects::{JObject, JValue};
        use jni::sys::jint;
        use jni::JNIEnv;
        use wry::prelude::{dispatch, find_class};
        fn start_bridge(
            env: &mut JNIEnv,
            activity: &JObject,
            action: &str,
            instance_path: &str,
            extra_args: &[String],
        ) -> jni::errors::Result<()> {
            let bridge_class =
                find_class(env, activity, "dev.lcehub.emerald.LauncherBridgeActivity".to_string())?;
            let intent_class = env.find_class("android/content/Intent")?;
            let intent = env.new_object(
                intent_class,
                "(Landroid/content/Context;Ljava/lang/Class;)V", //neo: i hate smali so much
                &[(&activity).into(), (&bridge_class).into()],
            )?;

            let extra_action = env.new_string("launcher_action")?;
            let action_str = env.new_string(action)?;
            env.call_method(
                &intent,
                "putExtra",
                "(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;",
                &[(&extra_action).into(), (&action_str).into()],
            )?;

            let extra_path = env.new_string("instance_path")?;
            let path_str = env.new_string(instance_path)?;
            env.call_method(
                &intent,
                "putExtra",
                "(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;",
                &[(&extra_path).into(), (&path_str).into()],
            )?;

            let extra_args_key = env.new_string("extra_args")?;
            let extra_args_json =
                env.new_string(&serde_json::to_string(extra_args).unwrap_or_else(|_| "[]".into()))?;
            env.call_method(
                &intent,
                "putExtra",
                "(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;",
                &[(&extra_args_key).into(), (&extra_args_json).into()],
            )?;

            env.call_method(
                &intent,
                "addFlags",
                "(I)Landroid/content/Intent;",
                &[JValue::Int(0x10000000 as jint)], //neo: FLAG_ACTIVITY_NEW_TASK
            )?;

            env.call_method(
                activity,
                "startActivity",
                "(Landroid/content/Intent;)V",
                &[(&intent).into()],
            )?;

            Ok(())
        }

        let action_str = match action {
            BridgeAction::Play => "play",
            BridgeAction::OpenContainer => "open",
            BridgeAction::OpenSettings => "settings",
            BridgeAction::SwitchProton => "switch_proton",
            BridgeAction::InstallDriver => "install_driver",
            BridgeAction::SetAudioBackend => "set_audio_backend",
        }
        .to_string();
        dispatch(move |env, activity, _webview| {
            if let Err(e) = start_bridge(env, activity, &action_str, &instance_path, &extra_args) {
                eprintln!("[android_bridge] failed to start activity: {e}");
            }
        });

        Ok(())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (instance_path, action, extra_args);
        Err("Only supported on Android".into())
    }
}
