package com.emerald.legacy

import android.app.Activity
import android.content.Intent
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@TauriPlugin
class LceAuthPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun startAuth(invoke: Invoke) {
        val intent = Intent(activity, LceAuthActivity::class.java)
        intent.putExtra(
            "authUrl",
            "https://mclegacyedition.xyz/internal/auth?appId=emerald_launcher"
        )
        startActivityForResult(invoke, intent, "authResult")
    }

    @ActivityCallback
    fun authResult(invoke: Invoke, result: ActivityResult) {
        val token = if (result.resultCode == Activity.RESULT_OK) {
            result.data?.getStringExtra("lceAuthToken")
        } else {
            null
        }
        if (!token.isNullOrEmpty()) {
            invoke.resolveObject(token)
        } else {
            invoke.reject("Authentication cancelled or failed")
        }
    }
}
