package io.github.comprehensivejason.voucher

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/**
 * Calendar load for Trends: when the chosen calendars' timed events start
 * and end, nothing else (no titles, people, or places). All-day events,
 * events marked free, declined ones, and cancelled ones are left out.
 *
 * Calendars are chosen in the app (Rules, Sources, Calendars) and kept on the
 * Ledger as account plus display name, the same on every device that syncs
 * them. Only the device the choice was saved on reports, so an event never
 * counts twice. It sends the last three Days on every pass when they change,
 * and once a Day (or at once after a new choice) everything back as far as
 * the Ledger keeps hourly data.
 */
object Calendars {
    /** How many Days back the Ledger keeps hourly data (its LOG_DAYS). */
    private const val BACKFILL_DAYS = 183L

    fun granted(ctx: Context): Boolean =
        ctx.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED

    private data class Calendar(val id: Long, val account: String, val name: String, val color: Int)

    private fun all(ctx: Context): List<Calendar> {
        if (!granted(ctx)) return emptyList()
        val out = mutableListOf<Calendar>()
        val projection = arrayOf(
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.ACCOUNT_NAME,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.CALENDAR_COLOR,
        )
        runCatching {
            ctx.contentResolver.query(CalendarContract.Calendars.CONTENT_URI, projection, null, null, null)?.use { c ->
                while (c.moveToNext()) {
                    out.add(Calendar(c.getLong(0), c.getString(1) ?: "", c.getString(2) ?: "", c.getInt(3)))
                }
            }
        }
        return out.sortedWith(compareBy({ it.account.lowercase() }, { it.name != it.account }, { it.name.lowercase() }))
    }

    private fun hex(color: Int) = "#%06x".format(color and 0xFFFFFF)

    /** This device's calendars for the app's sheet: {granted, calendars: [{account, name, color}]}. */
    fun list(ctx: Context): JSONObject {
        val calendars = JSONArray()
        for (c in all(ctx)) calendars.put(JSONObject().put("account", c.account).put("name", c.name).put("color", hex(c.color)))
        return JSONObject().put("granted", granted(ctx)).put("calendars", calendars)
    }

    /** Timed, busy, not-declined event instances in `ids` between two moments, as [start, end] in milliseconds. */
    private fun busy(ctx: Context, ids: Set<Long>, from: Long, to: Long): List<Pair<Long, Long>> {
        val uri = CalendarContract.Instances.CONTENT_URI.buildUpon().also {
            ContentUris.appendId(it, from)
            ContentUris.appendId(it, to)
        }.build()
        val projection = arrayOf(
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.AVAILABILITY,
            CalendarContract.Instances.SELF_ATTENDEE_STATUS,
            CalendarContract.Instances.STATUS,
            CalendarContract.Instances.CALENDAR_ID,
        )
        val out = mutableListOf<Pair<Long, Long>>()
        ctx.contentResolver.query(uri, projection, null, null, CalendarContract.Instances.BEGIN)?.use { c ->
            while (c.moveToNext()) {
                if (c.getLong(6) !in ids) continue
                if (c.getInt(2) == 1) continue
                if (c.getInt(3) == CalendarContract.Events.AVAILABILITY_FREE) continue
                if (c.getInt(4) == CalendarContract.Attendees.ATTENDEE_STATUS_DECLINED) continue
                if (!c.isNull(5) && c.getInt(5) == CalendarContract.Events.STATUS_CANCELED) continue
                val (begin, end) = c.getLong(0) to c.getLong(1)
                if (end > begin) out.add(begin to end)
            }
        }
        return out
    }

    /** Sends the chosen calendars' events, when this device is the one that reports them. */
    fun report(ctx: Context, conn: Connection, status: JSONObject, zone: ZoneId, end: LocalTime, day: String) {
        val choice = status.optJSONObject("calendars") ?: return
        if (choice.isNull("device") || choice.optString("device") != Store.deviceId(ctx) || !granted(ctx)) return
        val chosen = choice.optJSONArray("calendars")?.let { arr ->
            (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }.map { it.optString("account") to it.optString("name") }.toSet()
        } ?: emptySet()
        if (chosen.isEmpty()) return
        val ids = all(ctx).filter { (it.account to it.name) in chosen }.map { it.id }.toSet()
        // A new choice is backfilled at once; otherwise once a Day.
        val flag = "calendar_backfill_${day}_${chosen.sortedBy { it.toString() }.hashCode()}"
        val backfill = !Store.flag(ctx, flag)
        val today = LocalDate.parse(day)
        val first = today.minusDays(if (backfill) BACKFILL_DAYS else 2)
        val from = first.atTime(end).atZone(zone).toInstant().toEpochMilli()
        val to = today.plusDays(1).atTime(end).atZone(zone).toInstant().toEpochMilli()
        val events = runCatching { busy(ctx, ids, from, to) }.getOrNull() ?: return
        val list = JSONArray()
        for ((a, b) in events) list.put(JSONArray().put(Instant.ofEpochMilli(a).toString()).put(Instant.ofEpochMilli(b).toString()))
        val text = "$first|$list"
        if (!backfill && text == Store.sent(ctx, "calendar")) return
        val body = JSONObject().put("device", Store.deviceId(ctx)).put("from", first.toString()).put("to", day).put("events", list)
        if (runCatching { LedgerClient.post(conn, "/calendar", body) }.getOrNull() == 200) {
            if (backfill) Store.setFlag(ctx, flag)
            Store.setSent(ctx, "calendar", text)
        }
    }
}
