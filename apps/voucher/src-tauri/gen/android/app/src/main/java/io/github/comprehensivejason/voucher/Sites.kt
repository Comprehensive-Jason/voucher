package io.github.comprehensivejason.voucher

/**
 * Site time: which site a browser showed, and when. The accessibility
 * service logs each change of host in a browser's address bar as a Mark; the
 * Enforcer lays the Marks over that browser's foreground spans from
 * UsageStats, so leaving the browser or turning the screen off ends site time
 * exactly as it ends app time. Only hosts are kept, never whole addresses.
 */
object Sites {
    /** How a source group names a site among its members: "site:youtube.com". */
    const val PREFIX = "site:"

    /** Browsers whose address bar is read: every Chrome and Brave release channel. */
    val BROWSERS = setOf(
        "com.android.chrome", "com.chrome.beta", "com.chrome.dev", "com.chrome.canary",
        "com.brave.browser", "com.brave.browser_beta", "com.brave.browser_nightly",
    )

    /** From `at` on, one browser showed `host`; null means no site (a search, a new tab, or unknown). */
    data class Mark(val at: Long, val host: String?)

    private val HOST = Regex("""^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$""")

    /**
     * The host in an address bar's text, lowercase and without "www.". The
     * bar often drops the scheme ("youtube.com/watch?v=…"). Null for a search,
     * a hint, or a browser page such as chrome://newtab or about:blank.
     */
    fun host(text: String?): String? {
        var t = text?.trim()?.lowercase() ?: return null
        if (t.isEmpty() || t.any { it.isWhitespace() }) return null
        val scheme = t.indexOf("://")
        if (scheme >= 0) {
            if (t.substring(0, scheme) !in setOf("http", "https")) return null
            t = t.substring(scheme + 3)
        }
        var authority = t.substringBefore('/').substringBefore('?').substringBefore('#').substringAfterLast('@')
        // A port goes; any other colon means a scheme without slashes ("about:blank").
        if (':' in authority) {
            val port = authority.substringAfter(':')
            if (port.any { !it.isDigit() }) return null
            authority = authority.substringBefore(':')
        }
        val host = authority.trimEnd('.').removePrefix("www.")
        return host.takeIf { HOST.matches(it) }
    }

    /** The domain a group member names, or null for an app. */
    fun domain(member: String): String? = if (member.startsWith(PREFIX)) member.removePrefix(PREFIX) else null

    /** A domain covers itself and every subdomain. */
    fun matches(host: String, domain: String) = host == domain || host.endsWith(".$domain")

    /** The most specific of `domains` covering `host`, or null if none does. */
    fun match(host: String, domains: Collection<String>): String? =
        domains.filter { matches(host, it) }.maxByOrNull { it.length }

    /**
     * Calls `span` for each part of [start, end) one browser spent on a site,
     * given that browser's Marks, oldest first. The Mark before `start` says
     * what the browser showed when it came to the front.
     */
    fun split(marks: List<Mark>, start: Long, end: Long, span: (String, Long, Long) -> Unit) {
        var host: String? = null
        var since = start
        for (m in marks) {
            if (m.at <= start) { host = m.host; continue }
            if (m.at >= end) break
            host?.let { if (m.at > since) span(it, since, m.at) }
            host = m.host
            since = m.at
        }
        host?.let { if (end > since) span(it, since, end) }
    }
}
