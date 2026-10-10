package io.github.comprehensivejason.voucher

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Decorates blocking and measures site time; Device Owner enforces blocking
 * (ADR 0007). When Android shows its "Blocked by work policy" dialog for a
 * paused app, this opens Voucher's own blocked screen over it, naming the app
 * from the last icon tapped. (It doesn't press Back to close the dialog: that
 * Back can land on Voucher's screen instead.) It also reads the address bar
 * of Chrome and Brave and logs each change of host (see Sites), which the
 * Enforcer turns into site minutes. If this service is off, the plain dialog
 * still blocks and site time simply isn't counted.
 */
class VoucherAccessibilityService : AccessibilityService() {
    private var lastTapped: String? = null
    private var lastTappedAt = 0L

    private val main = Handler(Looper.getMainLooper())
    private var lastReadAt = 0L
    private var readPending = false
    private val readLater = Runnable { readPending = false; readAddressBar() }
    /** The host last logged per browser, so only changes are written. */
    private val shown = mutableMapOf<String, String?>()

    override fun onServiceConnected() {
        super.onServiceConnected()
        // What the browsers showed while this was off is unknown.
        endSites()
        readAddressBar()
    }

    override fun onUnbind(intent: Intent?): Boolean {
        main.removeCallbacks(readLater)
        endSites()
        return super.onUnbind(intent)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.packageName?.toString() in Sites.BROWSERS &&
            (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED)
        ) browserChanged()
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

    /**
     * A browser's window changed. Content changes come many times a second
     * while a page loads, so the address bar is read at most once a second,
     * with one read held back for the end of a burst.
     */
    private fun browserChanged() {
        val wait = lastReadAt + 1000 - SystemClock.uptimeMillis()
        if (wait <= 0) return readAddressBar()
        if (!readPending) {
            readPending = true
            main.postDelayed(readLater, wait)
        }
    }

    /** Logs the host in the address bar of the browser in front, if one is. */
    private fun readAddressBar() {
        lastReadAt = SystemClock.uptimeMillis()
        val root = rootInActiveWindow ?: return
        val pkg = root.packageName?.toString() ?: return
        if (pkg !in Sites.BROWSERS) return
        // No bar, as in full-screen video: the page, and so the host, is unchanged.
        val bar = addressBar(root, pkg) ?: return
        // While it is being typed in, the bar shows the typing, not the page.
        if (bar.isFocused) return
        val host = if (bar.isShowingHintText) null else Sites.host(bar.text?.toString())
        // A blocked page still shows its address; time on it isn't time on the site.
        log(pkg, host?.takeIf { Sites.match(it, Store.enforcedSites(this)) == null })
    }

    /**
     * Chromium's address bar, which Brave keeps: `<pkg>:id/url_bar`. Failing
     * that, a field named like an address bar near the top of the window,
     * looked for among the first few hundred nodes so a long page costs little.
     */
    private fun addressBar(root: AccessibilityNodeInfo, pkg: String): AccessibilityNodeInfo? {
        root.findAccessibilityNodeInfosByViewId("$pkg:id/url_bar").firstOrNull()?.let { return it }
        val queue = ArrayDeque(listOf(root))
        var seen = 0
        while (queue.isNotEmpty() && seen++ < 300) {
            val node = queue.removeFirst()
            val id = node.viewIdResourceName?.substringAfter(":id/") ?: ""
            if (ADDRESS_BAR_IDS.any { id.contains(it) } && node.text != null) return node
            for (i in 0 until node.childCount) node.getChild(i)?.let { queue.addLast(it) }
        }
        return null
    }

    private fun log(pkg: String, host: String?) {
        if (pkg in shown && shown[pkg] == host) return
        shown[pkg] = host
        Store.addSiteMark(this, pkg, System.currentTimeMillis(), host)
    }

    /** Closes every browser's site span, for when this service starts or stops. */
    private fun endSites() {
        val now = System.currentTimeMillis()
        for (pkg in Sites.BROWSERS) {
            Store.addSiteMark(this, pkg, now, null)
            shown[pkg] = null
        }
    }

    /** The blocked app whose name appears in what was tapped ("Instagram", "Disabled Instagram"). */
    private fun blockedApp(tapped: String): Pair<String, String>? {
        val apps = Enforcer.blockedPackages(this, Store.lastStatus(this))
        val pm = packageManager
        for (pkg in apps) {
            val label = runCatching { pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() }.getOrNull() ?: continue
            if (tapped.contains(label, ignoreCase = true)) return pkg to label
        }
        return null
    }

    override fun onInterrupt() {}

    companion object {
        /** Parts of the view ids Chromium forks give their address bar. */
        private val ADDRESS_BAR_IDS = listOf("url_bar", "location_bar", "omnibox")
    }
}
