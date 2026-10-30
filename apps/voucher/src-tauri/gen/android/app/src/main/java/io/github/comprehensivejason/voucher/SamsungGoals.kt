package io.github.comprehensivejason.voucher

import android.app.Activity
import android.content.Context
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/**
 * Samsung Health's own goals, sent to the Ledger so they're set in one place:
 * its sleep target (a bedtime and a wake-up time), steps, active time, active
 * calories, and water. The Ledger keeps them read-only (POST /goals/external);
 * Counterfoil shows them tagged "Samsung Health" and counts the ones it has a
 * measure for.
 *
 * Behind the "Samsung Health goals" switch in Sources, which shows only on a
 * Samsung device with Samsung Health, in a build with the SDK (see
 * SamsungHealthSdk). Read on app start and then about once an hour in the
 * Enforcer's loop, and sent only when they change. One device reports them,
 * as with calendars: turning the switch on claims them for this device, and
 * turning it off clears them once.
 */
object SamsungGoals {
    private const val PACKAGE = "com.sec.android.app.shealth"
    private const val EVERY_MS = 3_600_000L
    private const val ON = "samsung_goals_on"
    private const val CLAIM = "samsung_goals_claim"
    private const val CLEAR = "samsung_goals_clear"

    /** When they were last read; 0 reads on the next pass (app start). */
    @Volatile
    private var lastRead = 0L

    /** Whether this device can offer the switch. */
    fun available(ctx: Context): Boolean =
        SamsungHealthSdk.COMPILED && Build.MANUFACTURER.equals("samsung", ignoreCase = true) &&
            runCatching { ctx.packageManager.getApplicationInfo(PACKAGE, 0); true }.getOrDefault(false)

    /** For the switch: {available, on, granted}. */
    fun state(ctx: Context): JSONObject {
        val available = available(ctx)
        return JSONObject().put("available", available).put("on", available && Store.bool(ctx, ON))
            .put("granted", available && SamsungHealthSdk.granted(ctx))
    }

    /** Read on the next pass: the app was just opened. */
    fun soon() {
        lastRead = 0
    }

    /**
     * The switch. On asks Samsung Health for read access to the goals, then
     * claims them for this device; off clears them from the Ledger once.
     */
    fun set(activity: Activity, on: Boolean): JSONObject {
        if (!available(activity)) return state(activity)
        if (on) SamsungHealthSdk.request(activity)
        Store.setBool(activity, ON, on)
        Store.setBool(activity, CLAIM, on)
        Store.setBool(activity, CLEAR, !on)
        Store.setSent(activity, "samsung_goals", "")
        soon()
        return state(activity)
    }

    /** Sends Samsung Health's goals when they changed, about once an hour. */
    fun report(ctx: Context, c: Connection) {
        if (!available(ctx)) return
        val clear = Store.bool(ctx, CLEAR)
        val now = System.currentTimeMillis()
        if (!clear && (!Store.bool(ctx, ON) || now - lastRead < EVERY_MS)) return
        lastRead = now
        val goals = if (clear) emptyMap() else SamsungHealthSdk.read(ctx) ?: return
        val list = JSONArray()
        for ((kind, target) in goals) list.put(JSONObject().put("kind", kind).put("target", target))
        val text = list.toString()
        val claim = !clear && Store.bool(ctx, CLAIM)
        if (!clear && !claim && text == Store.sent(ctx, "samsung_goals")) return
        val body = JSONObject().put("device", Store.deviceId(ctx)).put("source", "samsung_health")
            .put("goals", list).put("claim", claim)
        val code = runCatching { LedgerClient.post(c, "/goals/external", body) }.getOrNull()
        // 409: another device reports them; this one waits for the next change.
        if (code == 200 || code == 409) {
            Store.setSent(ctx, "samsung_goals", if (clear) "" else text)
            Store.setBool(ctx, CLAIM, false)
            Store.setBool(ctx, CLEAR, false)
        }
    }
}
