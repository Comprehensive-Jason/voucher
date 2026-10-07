package io.github.comprehensivejason.voucher.spike

import android.accessibilityservice.AccessibilityService
import android.graphics.Color
import android.graphics.PixelFormat
import android.util.Log
import android.view.Gravity
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

// SPIKE (ADR 0007, option C on top of A): Device Owner still enforces; this only decorates.
// 1. Remember the label of the last launcher icon tapped.
// 2. When Android's "disabled by admin" dialog appears, cover it with our own screen naming that app.
class VoucherAccessibilityService : AccessibilityService() {
    private var lastTapped: String? = null
    private var lastTappedAt = 0L
    private var attempts = 0
    private var overlay: LinearLayout? = null

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        when (event.eventType) {
            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                val label = event.contentDescription?.toString() ?: event.text.joinToString(" ")
                if (label.isNotBlank()) {
                    lastTapped = label
                    lastTappedAt = event.eventTime
                }
                Log.i(TAG, "click pkg=${event.packageName} label=$label")
            }
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                val cls = event.className?.toString() ?: ""
                Log.i(TAG, "window pkg=${event.packageName} class=$cls")
                if (cls.endsWith("ActionDisabledByAdminDialog")) {
                    attempts += 1
                    val fresh = event.eventTime - lastTappedAt < 3000
                    showOverlay(if (fresh) lastTapped ?: "This app" else "This app")
                }
            }
        }
    }

    private fun showOverlay(app: String) {
        if (overlay != null) return
        Log.i(TAG, "overlay for app=$app attempts=$attempts")
        val wm = getSystemService(WindowManager::class.java)
        val view = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0E0F11"))
            setPadding(64, 64, 64, 64)
            addView(TextView(context).apply {
                text = "$app is paused"
                textSize = 30f
                setTextColor(Color.parseColor("#F2F2F0"))
                gravity = Gravity.CENTER
            })
            addView(TextView(context).apply {
                text = "Tried $attempts times while locked. Tear a ticket in Voucher for 10 minutes."
                textSize = 16f
                setTextColor(Color.parseColor("#A3A8AD"))
                gravity = Gravity.CENTER
                setPadding(0, 32, 0, 48)
            })
            addView(Button(context).apply {
                text = "Close"
                setOnClickListener { removeOverlay(); performGlobalAction(GLOBAL_ACTION_HOME) }
            })
        }
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.OPAQUE,
        )
        wm.addView(view, params)
        overlay = view
    }

    private fun removeOverlay() {
        overlay?.let { getSystemService(WindowManager::class.java).removeView(it) }
        overlay = null
    }

    override fun onInterrupt() {}

    companion object { const val TAG = "VoucherA11y" }
}
