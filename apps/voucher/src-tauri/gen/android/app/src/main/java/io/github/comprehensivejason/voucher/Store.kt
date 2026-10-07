package io.github.comprehensivejason.voucher

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import org.json.JSONObject
import java.io.File

/** Which Ledger this device uses: written by the app's Rust side during setup. */
data class Connection(val url: String, val key: String)

/**
 * What the Android side remembers between runs: the Ledger connection, the
 * Ledger's last answer (so blocking keeps working offline), counts of blocked
 * opens, and the last minutes reported per source.
 */
object Store {
    private fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences("voucher", Context.MODE_PRIVATE)

    /** Tauri's app_data_dir on Android is the app's data folder itself (checked on a device). */
    fun connection(ctx: Context): Connection? {
        val file = File(ctx.dataDir, "ledger.json")
        return try {
            val json = JSONObject(file.readText())
            Connection(json.getString("url").trimEnd('/'), json.getString("key"))
        } catch (e: Exception) {
            null
        }
    }

    /** A stable name for this device, shown in Rules and used to release it. */
    fun deviceId(ctx: Context): String {
        val p = prefs(ctx)
        p.getString("device_id", null)?.let { return it }
        val id = "${Build.MODEL}-${(0..0xffff).random().toString(16).padStart(4, '0')}"
            .replace(Regex("[^A-Za-z0-9-]"), "")
        p.edit().putString("device_id", id).apply()
        return id
    }

    fun saveStatus(ctx: Context, status: JSONObject) {
        prefs(ctx).edit().putString("status", status.toString())
            .putLong("status_at", System.currentTimeMillis()).apply()
    }

    fun lastStatus(ctx: Context): JSONObject? =
        prefs(ctx).getString("status", null)?.let { runCatching { JSONObject(it) }.getOrNull() }

    /** Packages this device has suspended, so they can be released when removed from every blocklist. */
    fun suspended(ctx: Context): Set<String> = prefs(ctx).getStringSet("suspended", emptySet())!!.toSet()
    fun setSuspended(ctx: Context, packages: Set<String>) =
        prefs(ctx).edit().putStringSet("suspended", packages).apply()

    // Blocked opens, counted per app per Day by the accessibility service.
    fun attempts(ctx: Context, day: String): Map<String, Int> {
        val json = prefs(ctx).getString("attempts_$day", null) ?: return emptyMap()
        val obj = JSONObject(json)
        return obj.keys().asSequence().associateWith { obj.getInt(it) }
    }

    fun countAttempt(ctx: Context, day: String, pkg: String) {
        val counts = attempts(ctx, day).toMutableMap()
        counts[pkg] = (counts[pkg] ?: 0) + 1
        prefs(ctx).edit().putString("attempts_$day", JSONObject(counts as Map<*, *>).toString()).apply()
    }

    fun closedWithoutTearing(ctx: Context, day: String): Int = prefs(ctx).getInt("closed_$day", 0)
    fun countClosed(ctx: Context, day: String) =
        prefs(ctx).edit().putInt("closed_$day", closedWithoutTearing(ctx, day) + 1).apply()

    /** The last running total of minutes sent to the Ledger, per source and Day. */
    fun reported(ctx: Context, source: String, day: String): Int = prefs(ctx).getInt("reported_${source}_$day", -1)
    fun setReported(ctx: Context, source: String, day: String, minutes: Int) =
        prefs(ctx).edit().putInt("reported_${source}_$day", minutes).apply()

    /** One-shot markers, such as which moment notifications were already sent. */
    fun once(ctx: Context, key: String): Boolean {
        val p = prefs(ctx)
        if (p.getBoolean("once_$key", false)) return false
        p.edit().putBoolean("once_$key", true).apply()
        return true
    }

    /** A route the blocked-app screen asked the interface to show. */
    fun setPendingRoute(ctx: Context, route: String?) = prefs(ctx).edit().putString("route", route).apply()
    fun takePendingRoute(ctx: Context): String? {
        val route = prefs(ctx).getString("route", null)
        setPendingRoute(ctx, null)
        return route
    }
}
