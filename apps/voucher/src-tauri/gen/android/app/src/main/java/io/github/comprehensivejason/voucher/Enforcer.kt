package io.github.comprehensivejason.voucher

import android.app.admin.DevicePolicyManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/** What one pass of the Enforcer decided, for the notification, tile, and widgets. */
data class Decision(
    val status: JSONObject?,
    val unlockEndsAt: Long?,
    val curfew: Boolean,
    val released: Boolean,
    val day: String,
    val curfewEnd: String,
) {
    val bank: Int get() = status?.optInt("bank") ?: 0
    val bankLimit: Int get() = status?.optJSONObject("settings")?.optInt("bank_limit") ?: 0
    val unlockMinutes: Int get() = status?.optJSONObject("settings")?.optInt("unlock_minutes") ?: 10
    val earned: Int get() = status?.optJSONObject("today")?.optInt("earned") ?: 0
    val goal: Int get() = status?.optJSONObject("today")?.optInt("goal") ?: 0
    val streak: Int get() = status?.optJSONObject("today")?.optInt("streak") ?: 0
    val unlocked: Boolean get() = released || (unlockEndsAt != null && !curfew)
}

/**
 * One pass of the rules on this device. Distractions are suspended unless a
 * genuine Unlock is running outside Curfew. The Ledger's last answer is kept,
 * so losing the network never unblocks anything: a cached Unlock still runs
 * out on time, and Curfew is worked out from the phone's own clock.
 */
object Enforcer {
    private const val TAG = "VoucherEnforcer"

    fun admin(ctx: Context) = ComponentName(ctx, VoucherAdminReceiver::class.java)
    fun dpm(ctx: Context): DevicePolicyManager = ctx.getSystemService(DevicePolicyManager::class.java)
    fun isOwner(ctx: Context) = dpm(ctx).isDeviceOwnerApp(ctx.packageName)

    @Synchronized
    fun tick(ctx: Context): Decision {
        val connection = Store.connection(ctx)
        val fresh = connection?.let { runCatching { LedgerClient.get(it, "/status") }.getOrNull() }
        fresh?.let { Store.saveStatus(ctx, it) }
        val status = fresh ?: Store.lastStatus(ctx)
        val now = System.currentTimeMillis() / 1000
        val settings = status?.optJSONObject("settings")
        val zone = runCatching { ZoneId.of(settings?.optString("time_zone")) }.getOrElse { ZoneId.systemDefault() }
        val start = time(settings?.optString("curfew_start"), "22:00")
        val end = time(settings?.optString("curfew_end"), "06:00")
        val local = Instant.ofEpochSecond(now).atZone(zone)
        val curfew = inWindow(local.toLocalTime(), start, end)
        val day = (if (local.toLocalTime() < end) local.toLocalDate().minusDays(1) else local.toLocalDate()).toString()
        val wire = status?.optJSONObject("unlock")?.optString("wire")
        val unlockEndsAt = if (connection != null && !wire.isNullOrEmpty()) LedgerClient.verifyUnlock(wire, connection.key, now) else null
        val released = settings?.optJSONArray("released_devices")?.let { arr ->
            (0 until arr.length()).any { arr.getString(it) == Store.deviceId(ctx) }
        } ?: false
        val decision = Decision(status, unlockEndsAt, curfew, released, day, end.toString())

        if (isOwner(ctx)) {
            if (released) release(ctx) else apply(ctx, decision)
        }
        if (connection != null && status != null && fresh != null) {
            report(ctx, connection, status, zone, end, day)
            reportUsage(ctx, connection, status, zone, end, day)
            // Silences between check-ins show in the Log as Gaps.
            runCatching { LedgerClient.post(connection, "/check-in?device=${android.net.Uri.encode(Store.deviceId(ctx))}") }
        }
        Moments.check(ctx, decision)
        Surfaces.refresh(ctx, decision)
        return decision
    }

    private fun time(text: String?, fallback: String): LocalTime =
        runCatching { LocalTime.parse(text!!.take(5)) }.getOrElse { LocalTime.parse(fallback) }

    /** Curfew usually crosses midnight, so it is "after the start or before the end". */
    private fun inWindow(t: LocalTime, start: LocalTime, end: LocalTime) =
        if (start <= end) t >= start && t < end else t >= start || t < end

    private fun strings(arr: JSONArray?): List<String> = arr?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()

    /**
     * The installed packages the blocklists cover. "category:game" stands for
     * every app Android marks as a game.
     */
    fun blockedPackages(ctx: Context, status: JSONObject?): Set<String> {
        val entries = strings(status?.optJSONObject("blocked")?.optJSONArray("apps"))
        val out = entries.filter { !it.startsWith("category:") && installed(ctx, it) }.toMutableSet()
        if ("category:game" in entries) {
            val pm = ctx.packageManager
            pm.getInstalledApplications(PackageManager.ApplicationInfoFlags.of(0))
                .filter { it.category == android.content.pm.ApplicationInfo.CATEGORY_GAME }
                .forEach { out.add(it.packageName) }
        }
        out.remove(ctx.packageName)
        return out
    }

    private fun installed(ctx: Context, pkg: String) =
        runCatching { ctx.packageManager.getApplicationInfo(pkg, 0); true }.getOrDefault(false)

    private fun apply(ctx: Context, d: Decision) {
        val dpm = dpm(ctx)
        val admin = admin(ctx)
        val blocked = d.status?.optJSONObject("blocked")
        val apps = blockedPackages(ctx, d.status)
        val block = !d.unlocked
        // Release anything suspended earlier that no blocklist covers any more.
        val stale = Store.suspended(ctx) - apps
        if (stale.isNotEmpty()) dpm.setPackagesSuspended(admin, stale.toTypedArray(), false)
        if (apps.isNotEmpty()) {
            val failed = dpm.setPackagesSuspended(admin, apps.toTypedArray(), block)
            if (failed.isNotEmpty()) Log.w(TAG, "could not suspend ${failed.joinToString()}")
        }
        Store.setSuspended(ctx, if (block) apps else emptySet())
        // The one line of Android's own "Blocked by work policy" dialog that is ours.
        dpm.setShortSupportMessage(admin, if (d.curfew) {
            "It's Curfew. Time to sleep: everything opens again at ${d.curfewEnd}."
        } else {
            "Paused by Voucher. ${d.bank} vouchers banked: tear one from the Voucher notification, widget, or tile."
        })
        // Sites: Chromium browsers read a URLBlocklist from managed configuration.
        val sites = strings(blocked?.optJSONArray("sites")).filterNot { it.startsWith("list:") }
        for (browser in BROWSERS) {
            if (!installed(ctx, browser)) continue
            val restrictions = Bundle()
            if (block) restrictions.putStringArray("URLBlocklist", sites.toTypedArray())
            runCatching { dpm.setApplicationRestrictions(admin, browser, restrictions) }
        }
        // Voucher's own guard rails: it can't be force-stopped or have its data cleared.
        runCatching { dpm.setUserControlDisabledPackages(admin, listOf(ctx.packageName)) }
    }

    /** This device was released: lift every block and give up Device Owner. */
    private fun release(ctx: Context) {
        val dpm = dpm(ctx)
        val admin = admin(ctx)
        val suspended = Store.suspended(ctx)
        if (suspended.isNotEmpty()) dpm.setPackagesSuspended(admin, suspended.toTypedArray(), false)
        Store.setSuspended(ctx, emptySet())
        for (browser in BROWSERS) runCatching { dpm.setApplicationRestrictions(admin, browser, Bundle()) }
        runCatching { dpm.setUserControlDisabledPackages(admin, emptyList()) }
        runCatching { dpm.setShortSupportMessage(admin, null) }
        Log.i(TAG, "released: clearing Device Owner")
        runCatching { dpm.clearDeviceOwnerApp(ctx.packageName) }
    }

    /** Sends Workout zone minutes, Steps, and each Focused time source's minutes so far this Day, when they have grown. */
    private fun report(ctx: Context, c: Connection, status: JSONObject, zone: ZoneId, end: LocalTime, day: String) {
        val sources = status.optJSONObject("settings")?.optJSONObject("sources") ?: return
        val dayStart = LocalDate.parse(day).atTime(end).atZone(zone).toInstant().toEpochMilli()
        val workout = sources.optJSONObject("workout")
        if (workout != null && workout.optBoolean("on")) {
            val maxHeartRate = workout.optInt("max_heart_rate").takeIf { it > 0 } ?: DEFAULT_MAX_HEART_RATE
            Health.since(ctx, java.time.Instant.ofEpochMilli(dayStart), maxHeartRate)?.let { w ->
                if (w.zoneMinutes > Store.reported(ctx, "workout", day)) {
                    val body = JSONObject().put("source", "workout").put("day", day).put("minutes", w.zoneMinutes)
                        .put("device", Store.deviceId(ctx))
                    w.title?.let { body.put("title", it) }
                    if (runCatching { LedgerClient.post(c, "/report", body) }.getOrNull() == 200) Store.setReported(ctx, "workout", day, w.zoneMinutes)
                }
            }
        }
        // Steps walked this Day, as a running total like zone minutes.
        val steps = sources.optJSONObject("steps")
        if (steps != null && steps.optBoolean("on")) {
            Health.stepsSince(ctx, java.time.Instant.ofEpochMilli(dayStart))?.toInt()?.let { n ->
                if (n > Store.reported(ctx, "steps", day)) {
                    val body = JSONObject().put("source", "steps").put("day", day).put("minutes", n)
                        .put("device", Store.deviceId(ctx))
                    if (runCatching { LedgerClient.post(c, "/report", body) }.getOrNull() == 200) Store.setReported(ctx, "steps", day, n)
                }
            }
        }
        val wanted = mutableMapOf<String, List<String>>()
        for (id in sources.keys()) {
            val s = sources.getJSONObject(id)
            if (s.optString("kind") == "focus" && s.optBoolean("on")) wanted[id] = strings(s.optJSONArray("packages"))
        }
        if (wanted.isEmpty()) return
        val minutes = foregroundMinutes(ctx, wanted.values.flatten().toSet(), dayStart) ?: return
        for ((id, packages) in wanted) {
            val total = packages.sumOf { minutes[it] ?: 0 }
            if (total <= Store.reported(ctx, id, day)) continue
            val body = JSONObject().put("source", id).put("day", day).put("minutes", total)
                .put("device", Store.deviceId(ctx))
            if (runCatching { LedgerClient.post(c, "/report", body) }.getOrNull() == 200) Store.setReported(ctx, id, day, total)
        }
    }

    /**
     * Minutes each package spent in the foreground with the screen on since
     * `fromMillis`. Null without usage access.
     */
    fun foregroundMinutes(ctx: Context, packages: Set<String>, fromMillis: Long): Map<String, Int>? {
        val millis = mutableMapOf<String, Long>()
        foregroundSpans(ctx, packages, fromMillis) { pkg, start, end -> millis[pkg] = (millis[pkg] ?: 0) + (end - start) } ?: return null
        return millis.mapValues { (it.value / 60_000).toInt() }
    }

    /**
     * As foregroundMinutes, split into clock hours: per package, 24 numbers,
     * midnight first, each at most 60. Null without usage access.
     */
    fun foregroundByHour(ctx: Context, packages: Set<String>, fromMillis: Long, toMillis: Long, zone: ZoneId): Map<String, IntArray>? {
        val millis = mutableMapOf<String, LongArray>()
        foregroundSpans(ctx, packages, fromMillis, toMillis) { pkg, start, end ->
            val hours = millis.getOrPut(pkg) { LongArray(24) }
            var at = start
            while (at < end) {
                val local = Instant.ofEpochMilli(at).atZone(zone)
                val nextHour = local.truncatedTo(java.time.temporal.ChronoUnit.HOURS).plusHours(1).toInstant().toEpochMilli()
                val until = minOf(end, nextHour)
                hours[local.hour] += until - at
                at = until
            }
        } ?: return null
        return millis.mapValues { (_, ms) -> IntArray(24) { minOf(60, Math.round(ms[it] / 60_000.0).toInt()) } }
    }

    /**
     * Calls `span` for each stretch one of `packages` spent in the foreground
     * with the screen on since `fromMillis`. Null without usage access.
     */
    private fun foregroundSpans(
        ctx: Context, packages: Set<String>, fromMillis: Long, toMillis: Long = System.currentTimeMillis(), span: (String, Long, Long) -> Unit,
    ): Unit? {
        if (!Permissions.usageAccess(ctx)) return null
        val usm = ctx.getSystemService(UsageStatsManager::class.java)
        val events = usm.queryEvents(fromMillis, toMillis)
        var current: String? = null
        var since = 0L
        fun close(at: Long) {
            current?.let { if (at > since) span(it, since, at) }
            current = null
        }
        val e = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(e)
            when (e.eventType) {
                UsageEvents.Event.ACTIVITY_RESUMED -> {
                    close(e.timeStamp)
                    if (e.packageName in packages) { current = e.packageName; since = e.timeStamp }
                }
                UsageEvents.Event.ACTIVITY_PAUSED -> if (e.packageName == current) close(e.timeStamp)
                UsageEvents.Event.SCREEN_NON_INTERACTIVE -> close(e.timeStamp)
            }
        }
        close(minOf(toMillis, System.currentTimeMillis()))
        return Unit
    }

    /**
     * Sends this Day's Distraction minutes per app and clock hour, for Trends,
     * when they have changed; once the Day turns, yesterday's last minutes too.
     * Apps are named by their label, as "In Distractions today" shows them.
     */
    private fun reportUsage(ctx: Context, c: Connection, status: JSONObject, zone: ZoneId, end: LocalTime, day: String) {
        val packages = blockedPackages(ctx, status)
        if (packages.isEmpty()) return
        val yesterday = LocalDate.parse(day).minusDays(1).toString()
        for (d in listOf(yesterday, day)) {
            if (d == yesterday && Store.flag(ctx, "usage_final_$d")) continue
            // Each Day runs from Curfew's end to the next; yesterday's report stops where it did.
            val from = LocalDate.parse(d).atTime(end).atZone(zone).toInstant().toEpochMilli()
            val to = LocalDate.parse(d).plusDays(1).atTime(end).atZone(zone).toInstant().toEpochMilli()
            val hours = foregroundByHour(ctx, packages, from, to, zone) ?: return
            val pm = ctx.packageManager
            val apps = JSONObject()
            for ((pkg, h) in hours.toSortedMap()) {
                if (h.all { it == 0 }) continue
                val label = runCatching { pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() }.getOrDefault(pkg)
                apps.put(label, JSONArray(h.toList()))
            }
            val body = JSONObject().put("device", Store.deviceId(ctx)).put("day", d).put("apps", apps)
            val text = apps.toString()
            if (d == day && text == Store.usageSent(ctx, d)) continue
            if (runCatching { LedgerClient.post(c, "/usage", body) }.getOrNull() == 200) {
                if (d == yesterday) Store.setFlag(ctx, "usage_final_$d") else Store.setUsageSent(ctx, d, text)
            }
        }
    }

    /** The day's Distraction minutes and blocked opens, for Trends. */
    fun usage(ctx: Context): JSONObject? {
        val status = Store.lastStatus(ctx) ?: return null
        val decision = tickless(ctx, status)
        val apps = blockedPackages(ctx, status)
        val zone = runCatching { ZoneId.of(status.optJSONObject("settings")?.optString("time_zone")) }.getOrElse { ZoneId.systemDefault() }
        val end = time(status.optJSONObject("settings")?.optString("curfew_end"), "06:00")
        val from = LocalDate.parse(decision).atTime(end).atZone(zone).toInstant().toEpochMilli()
        // Without usage access the minutes are unknown, but opens are still counted.
        val minutes = foregroundMinutes(ctx, apps, from) ?: emptyMap()
        val pm = ctx.packageManager
        val list = JSONArray()
        minutes.filterValues { it > 0 }.entries.sortedByDescending { it.value }.forEach { (pkg, m) ->
            val label = runCatching { pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() }.getOrDefault(pkg)
            list.put(JSONObject().put("label", label).put("minutes", m))
        }
        val attempts = Store.attempts(ctx, decision)
        val opened = JSONArray()
        attempts.filterKeys { it != "unknown" }.entries.sortedByDescending { it.value }.forEach { (pkg, n) ->
            val label = runCatching { pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() }.getOrDefault(pkg)
            opened.put(JSONObject().put("label", label).put("count", n))
        }
        return JSONObject()
            .put("measured", Permissions.usageAccess(ctx))
            .put("attempts", opened)
            .put("apps", list)
            .put("blockedOpens", attempts.values.sum())
            .put("closedWithoutTearing", Store.closedWithoutTearing(ctx, decision))
    }

    /** Today's Day from a cached status, without contacting the Ledger. */
    fun tickless(ctx: Context, status: JSONObject?): String {
        val settings = status?.optJSONObject("settings")
        val zone = runCatching { ZoneId.of(settings?.optString("time_zone")) }.getOrElse { ZoneId.systemDefault() }
        val end = time(settings?.optString("curfew_end"), "06:00")
        val local = Instant.now().atZone(zone)
        return (if (local.toLocalTime() < end) local.toLocalDate().minusDays(1) else local.toLocalDate()).toString()
    }

    /** Asks the Ledger to Redeem `count` Vouchers, then applies the result at once. */
    fun tear(ctx: Context, count: Int = 1): Boolean {
        val c = Store.connection(ctx) ?: return false
        val code = runCatching { LedgerClient.post(c, "/redeem?count=$count") }.getOrNull()
        tick(ctx)
        return code == 200
    }

    /** Used until the Workout source carries your own maximum heart rate. */
    private const val DEFAULT_MAX_HEART_RATE = 195

    /** Chromium browsers that read a managed URLBlocklist, every release channel. */
    private val BROWSERS = listOf(
        "com.android.chrome", "com.chrome.beta", "com.chrome.dev", "com.chrome.canary", "org.chromium.chrome",
        "com.brave.browser", "com.brave.browser_beta", "com.brave.browser_nightly",
    )
}
