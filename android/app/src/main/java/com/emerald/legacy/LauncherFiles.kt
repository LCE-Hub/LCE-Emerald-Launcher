package com.emerald.legacy

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.provider.DocumentsContract
import androidx.annotation.Keep
import java.io.File

@Keep
object LauncherFiles {
    private const val AUTHORITY =
        "dev.lcehub.emerald.core.WinlatorFilesProvider" //neo: DiamondRuntime defines the DocumentsProvider so we gotta use that
    private const val DOCUMENTS_UI_GOOGLE = "com.google.android.documentsui"
    private const val DOCUMENTS_UI_AOSP = "com.android.documentsui"

    @Keep
    @JvmStatic
    fun openDirectory(activity: Activity, path: String): Boolean {
        val rootId = activity.applicationContext.dataDir.absolutePath
        val normalizedPath = File(path).absoluteFile.normalize().absolutePath
        val isRoot = normalizedPath == rootId
        val uri = if (isRoot) {
            DocumentsContract.buildRootUri(AUTHORITY, rootId)
        } else {
            DocumentsContract.buildDocumentUri(AUTHORITY, normalizedPath)
        }
        val mimeType = if (isRoot) {
            DocumentsContract.Root.MIME_TYPE_ITEM
        } else {
            DocumentsContract.Document.MIME_TYPE_DIR
        }
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, mimeType)
            .addCategory(Intent.CATEGORY_DEFAULT)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        for (packageName in arrayOf(DOCUMENTS_UI_GOOGLE, DOCUMENTS_UI_AOSP)) {
            intent.setPackage(packageName)
            try {
                activity.startActivity(intent)
                return true
            } catch (_: ActivityNotFoundException) {
            }
        }
        intent.setPackage(null)
        return try {
            activity.startActivity(intent)
            true
        } catch (_: ActivityNotFoundException) {
            false
        }
    }
}
