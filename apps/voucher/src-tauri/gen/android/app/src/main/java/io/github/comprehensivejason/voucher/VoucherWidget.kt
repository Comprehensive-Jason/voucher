package io.github.comprehensivejason.voucher

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.util.SizeF
import android.widget.RemoteViews
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId

/**
 * The home-screen widget in three sizes (small 2x2, medium 4x2, large 2x3 and
 * up), each in the Today screen's five states: locked, running, Curfew, full,
 * and empty. Android picks the layout from the size the widget is given.
 */
class VoucherWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, manager: AppWidgetManager, ids: IntArray) {
        Surfaces.last?.let { updateAll(ctx, it) } ?: EnforcerService.start(ctx)
    }

    companion object {
        /** Default colours for the sources Voucher ships with; the Ledger sends
         *  each source's name, and its colour once one is chosen. */
        private val DEFAULT_COLORS = mapOf(
            "obsidian" to 0xFFB08CFF, "workout" to 0xFFFF8A5C, "reading" to 0xFFFFD166,
            "anki" to 0xFFFF6FA8, "steps" to 0xFF05AFA5,
        )

        private fun nameOf(s: JSONObject) = s.optString("name").ifEmpty { s.optString("id") }

        private fun colorOf(s: JSONObject): Int {
            val chosen = s.optString("color")
            if (chosen.length == 7 && chosen.startsWith("#")) return (0xFF000000 or chosen.substring(1).toLong(16)).toInt()
            return (DEFAULT_COLORS[s.optString("id")] ?: 0xFFC9CDD1).toInt()
        }

        fun updateAll(ctx: Context, d: Decision) {
            val manager = AppWidgetManager.getInstance(ctx)
            val ids = manager.getAppWidgetIds(ComponentName(ctx, VoucherWidget::class.java))
            if (ids.isEmpty()) return
            val views = RemoteViews(mapOf(
                SizeF(110f, 110f) to build(ctx, d, R.layout.widget_small),
                SizeF(250f, 110f) to build(ctx, d, R.layout.widget_medium),
                SizeF(160f, 250f) to build(ctx, d, R.layout.widget_large),
            ))
            manager.updateAppWidget(ids, views)
        }

        private fun build(ctx: Context, d: Decision, layout: Int): RemoteViews {
            val v = RemoteViews(ctx.packageName, layout)
            val zone = runCatching { ZoneId.of(d.status?.optJSONObject("settings")?.optString("time_zone")) }.getOrElse { ZoneId.systemDefault() }
            fun hm(unix: Long) = Instant.ofEpochSecond(unix).atZone(zone).toLocalTime().toString().take(5)
            val full = d.bankLimit > 0 && d.bank >= d.bankLimit
            var accent = 0xFF3DDC84.toInt()
            var valColor = 0xFFF2F2F0.toInt()
            var labelColor = 0xFFA3A8AD.toInt()
            var button = "Unlock"
            var buttonBg = 0xFF3DDC84.toInt()
            var buttonInk = 0xFF07170D.toInt()
            var tear = true
            var label2 = ""
            v.setTextViewText(R.id.`val`, d.bank.toString())
            v.setTextViewText(R.id.unit, "/${d.bankLimit}")
            val label: String
            when {
                d.status == null -> { label = "Not connected"; button = "Open Voucher"; tear = false }
                d.curfew -> {
                    accent = 0xFF7D8CFF.toInt(); valColor = 0xFFC9CFFF.toInt(); labelColor = 0xFF9AA6FF.toInt()
                    label = "Curfew · open at ${d.curfewEnd.take(5)}"; button = "Sleep well"
                    buttonBg = 0xFF1B2350.toInt(); buttonInk = 0xFFC9CFFF.toInt(); tear = false
                }
                d.unlockEndsAt != null -> {
                    val left = (d.unlockEndsAt - System.currentTimeMillis() / 1000).coerceAtLeast(0)
                    v.setTextViewText(R.id.`val`, "%02d:%02d".format(left / 60, left % 60))
                    v.setTextViewText(R.id.unit, "")
                    valColor = accent
                    label = "left · locks ${hm(d.unlockEndsAt)}"; label2 = "${d.bank} banked"
                    button = "Unlocked until ${hm(d.unlockEndsAt)}"; buttonBg = 0xFF14251B.toInt(); buttonInk = accent; tear = false
                }
                full -> {
                    accent = 0xFFFFB547.toInt(); valColor = accent; labelColor = accent
                    label = "Bank full"; label2 = "new earnings are lost"
                }
                d.bank == 0 -> {
                    valColor = 0xFFA3A8AD.toInt(); label = "Bank empty"
                    label2 = closest(d)?.let { "${it.first}: ${it.second} min to go" } ?: ""
                    button = "No Vouchers"; buttonBg = 0xFF2A2E33.toInt(); buttonInk = 0xFFA3A8AD.toInt(); tear = false
                }
                else -> label = "in the Bank · locked"
            }
            v.setTextColor(R.id.`val`, valColor)
            v.setTextViewText(R.id.label, label)
            v.setTextColor(R.id.label, labelColor)
            v.setTextViewText(R.id.label2, label2)
            // Cells: 24 at most, as on the canvas, filled up to the Bank.
            for (i in 0 until 24) {
                val id = ctx.resources.getIdentifier("cell$i", "id", ctx.packageName)
                if (id == 0) continue
                // Only as many cells as the Bank holds; a limit of 12 leaves one row.
                v.setViewVisibility(id, if (i < d.bankLimit.coerceAtLeast(1)) android.view.View.VISIBLE else android.view.View.GONE)
                v.setColorStateList(id, "setImageTintList", ColorStateList.valueOf(if (i < d.bank) accent else 0xFF2A2E33.toInt()))
            }
            v.setTextViewText(R.id.goal, "Today ${d.earned} of ${d.goal}")
            v.setTextViewText(R.id.streak, if (d.streak > 0) "${d.streak} day streak" else "No streak")
            v.setTextViewText(R.id.week, Week.text(ctx))
            // Next Voucher: minute-based sources, closest first.
            val bars = progress(d)
            for (i in 0 until 4) {
                val row = ctx.resources.getIdentifier("bar$i", "id", ctx.packageName)
                if (row == 0) continue
                val b = bars.getOrNull(i)
                v.setViewVisibility(row, if (b == null) android.view.View.INVISIBLE else android.view.View.VISIBLE)
                if (b == null) continue
                v.setTextViewText(ctx.resources.getIdentifier("bar${i}_name", "id", ctx.packageName), b.name)
                val fill = ctx.resources.getIdentifier("bar${i}_fill", "id", ctx.packageName)
                v.setProgressBar(fill, 100, b.percent, false)
                v.setColorStateList(fill, "setProgressTintList", ColorStateList.valueOf(b.color))
            }
            v.setTextViewText(R.id.button, button)
            v.setTextColor(R.id.button, buttonInk)
            v.setColorStateList(R.id.button, "setBackgroundTintList", ColorStateList.valueOf(buttonBg))
            val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
            v.setOnClickPendingIntent(R.id.root, open)
            v.setOnClickPendingIntent(R.id.button, if (tear) Surfaces.tearIntent(ctx) else open)
            return v
        }

        private data class Bar(val name: String, val percent: Int, val color: Int)

        private fun progress(d: Decision): List<Bar> {
            val sources = d.status?.optJSONObject("today")?.optJSONArray("sources") ?: return emptyList()
            return (0 until sources.length()).map { sources.getJSONObject(it) }
                .filter { it.optBoolean("on") && it.optString("kind") != "tasks" }
                .map { s -> Bar(nameOf(s), 100 * s.optInt("progress") / s.optInt("every").coerceAtLeast(1), colorOf(s)) }
                .sortedByDescending { it.percent }
        }

        /** The minute-based source closest to its next Voucher, and the minutes it still needs. */
        private fun closest(d: Decision): Pair<String, Int>? {
            val sources = d.status?.optJSONObject("today")?.optJSONArray("sources") ?: return null
            return (0 until sources.length()).map { sources.getJSONObject(it) }
                .filter { it.optBoolean("on") && it.optString("kind") != "tasks" && it.optInt("progress") > 0 }
                .minByOrNull { it.optInt("every") - it.optInt("progress") }
                ?.let { nameOf(it) to (it.optInt("every") - it.optInt("progress")) }
        }
    }
}

/** "This week +96 · −71": the last seven Days, fetched at most every 15 minutes. */
object Week {
    private var text = ""
    private var fetchedAt = 0L

    fun text(ctx: Context): String {
        if (System.currentTimeMillis() - fetchedAt > 15 * 60_000) {
            fetchedAt = System.currentTimeMillis()
            Thread {
                val c = Store.connection(ctx) ?: return@Thread
                runCatching {
                    val conn = java.net.URL("${c.url}/history?days=7").openConnection() as java.net.HttpURLConnection
                    conn.connectTimeout = 5000; conn.readTimeout = 5000
                    c.code?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
                    val days = org.json.JSONArray(conn.inputStream.bufferedReader().readText())
                    var earned = 0; var redeemed = 0
                    for (i in 0 until days.length()) {
                        val day: JSONObject = days.getJSONObject(i)
                        earned += day.optInt("earned"); redeemed += day.optInt("redeemed")
                    }
                    text = "+$earned · −$redeemed"
                }
            }.start()
        }
        return text
    }
}
