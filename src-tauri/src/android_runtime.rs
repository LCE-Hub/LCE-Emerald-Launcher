pub enum BridgeAction {
    Play,
    OpenContainer,
    OpenSettings,
}

pub fn launch_bridge(instance_path: String, action: BridgeAction) -> Result<(), String> {
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
        ) -> jni::errors::Result<()> {
            let bridge_class =
                find_class(env, activity, "dev.lcehub.emerald.LauncherBridgeActivity".to_string())?;
            let intent_class = env.find_class("android/content/Intent")?;
            let intent = env.new_object(
                intent_class,
                "(Landroid/content/Context;Ljava/lang/Class;)V",
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

            env.call_method(
                &intent,
                "addFlags",
                "(I)Landroid/content/Intent;",
                &[JValue::Int(0x10000000 as jint)],
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
        }
        .to_string();
        dispatch(move |env, activity, _webview| {
            if let Err(e) = start_bridge(env, activity, &action_str, &instance_path) {
                eprintln!("[android_bridge] failed to start activity: {e}");
            }
        });

        Ok(())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (instance_path, action);
        Err("Only supported on Android".into())
    }
}
