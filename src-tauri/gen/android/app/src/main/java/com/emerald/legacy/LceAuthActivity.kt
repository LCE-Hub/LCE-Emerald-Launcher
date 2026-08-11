package com.emerald.legacy

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import androidx.appcompat.app.AppCompatActivity

class LceAuthActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val authUrl = intent.getStringExtra("authUrl")
            ?: "https://mclegacyedition.xyz/internal/auth?appId=emerald_launcher"

        progressBar = ProgressBar(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            settings.setSupportMultipleWindows(true)
            settings.javaScriptCanOpenWindowsAutomatically = true
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = handleAuthUrl(url)
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest
                ): Boolean = handleAuthUrl(request.url.toString())

                override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                    handleAuthUrl(url)
                }

                override fun onPageFinished(view: WebView, url: String) {
                    progressBar.visibility = View.GONE
                }
            }
            webChromeClient = object : android.webkit.WebChromeClient() {
                override fun onCreateWindow(
                    view: WebView,
                    isDialog: Boolean,
                    isUserGesture: Boolean,
                    resultMsg: Message
                ): Boolean {
                    val transport = resultMsg.obj as WebView.WebViewTransport
                    transport.webView = webView
                    resultMsg.sendToTarget()
                    return true
                }
            }
        }

        val root = FrameLayout(this)
        root.addView(
            webView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        val progressFrame = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
        progressFrame.gravity = Gravity.CENTER
        root.addView(progressBar, progressFrame)
        setContentView(root)
        webView.loadUrl(authUrl)
    }

    private fun handleAuthUrl(url: String): Boolean {
        val uri = try {
            Uri.parse(url)
        } catch (e: Exception) {
            return false
        }
        if (uri.scheme == "emerald" && uri.host == "lceonline") {
            val token = uri.getQueryParameter("token")
            if (token != null) {
                setResult(RESULT_OK, Intent().putExtra("lceAuthToken", token))
            } else {
                setResult(RESULT_CANCELED)
            }
            finish()
            return true
        }
        return false
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            setResult(RESULT_CANCELED)
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
}
