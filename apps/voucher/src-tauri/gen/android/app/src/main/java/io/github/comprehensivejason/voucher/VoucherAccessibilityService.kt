package io.github.comprehensivejason.voucher

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.net.Uri
import android.view.accessibility.AccessibilityEvent

/**
 * Decorates blocking; Device Owner enforces it (ADR 0007). When Android shows
 * its "Blocked by work policy" dialog for a paused app, this opens Voucher's
 * own blocked screen over it, naming the app from the last icon tapped. (It
 * doesn't press Back to close the dialog: that Back can land on Voucher's
 * screen instead.) If this service is off, the plain dialog still blocks.
 */
class VoucherAccessibilityService : AccessibilityService() {
    private var lastTapped: String? = null
    private var lastTappedAt = 0L

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        when (event.eventType) {
            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                val label = event.contentDescription?.toString() ?: event.text.joinToString(" ")
                if (label.isNotBlank()) {
                    lastTapped = label
                    lastTappedAt = event.eventTime
                }
            }
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                val cls = event.className?.toString() ?: return
                if (!cls.contains("ActionDisabledByAdmin")) return
                val recent = event.eventTime - lastTappedAt < 3000
                val app = if (recent) lastTapped?.let { blockedApp(it) } else null
                val status = Store.lastStatus(this)
                val day = Enforcer.tickless(this, status)
                Store.countAttempt(this, day, app?.first ?: "unknown")
                val query = if (app != null) "?pkg=${Uri.encode(app.first)}&label=${Uri.encode(app.second)}" else ""
                Store.setPendingRoute(this, "/blocked$query")
                startActivity(Intent(this, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    .putExtra("route", "/blocked$query"))
            }
        }
    }

    /** The blocked app whose name appears in what was tapped ("Instagram", "Disabled Instagram"). */
    private fun blockedApp(tapped: String): Pair<String, String>? {
        val apps = Store.lastStatus(this)?.optJSONObject("blocked")?.optJSONArray("apps") ?: return null
        val pm = packageManager
        for (i in 0 until apps.length()) {
            val pkg = apps.getString(i)
            val label = runCatching { pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() }.getOrNull() ?: continue
            if (tapped.contains(label, ignoreCase = true)) return pkg to label
        }
        return null
    }

    override fun onInterrupt() {}
}
