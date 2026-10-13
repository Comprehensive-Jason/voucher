package io.github.comprehensivejason.voucher

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject

/**
 * The two one-tap questions Voucher asks outside the app: at Curfew, "Did
 * today go the way you wanted?", and just after an Unlock from the
 * notification, tile, or widget, "Why now?". Both are skippable: ignoring
 * one records nothing, and neither earns or costs anything. An answer to the
 * Curfew question turns its notification into the optional "Anything new
 * today?", whose "Add a Marker" opens the app on the Curfew sheet's Marker
 * chips (it doesn't fit beside the three answers). Swiping it away skips it.
 */
object Questions {
    private const val CHANNEL = "questions"
    private const val VERDICT_ID = 3
    private const val REASON_ID = 4
    const val VERDICT = "io.github.comprehensivejason.voucher.VERDICT"
    const val REASON = "io.github.comprehensivejason.voucher.REASON"
    /** Curfew indigo (--night). */
    private val NIGHT = VoucherColors.NIGHT

    /** The reasons offered on the notification; the app offers more. */
    private val REASONS = listOf("Bored", "Avoiding a task", "Tired")

    private fun channel(ctx: Context) {
        ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Questions", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "The Curfew question and Why now?, each one tap and skippable"
            },
        )
    }

    /** Asks the Curfew question once a Day, when Curfew starts, unless the app already has an answer. */
    fun check(ctx: Context, d: Decision) {
        if (d.status == null || !d.curfew || d.released) return
        if (!Store.once(ctx, "verdict-${d.day}")) return
        val c = Store.connection(ctx) ?: return
        Thread {
            runCatching {
                val answered = LedgerClient.getArray(c, "/history?days=1").optJSONObject(0)?.let { !it.isNull("verdict") } ?: false
                if (!answered) postVerdict(ctx, d.day)
            }
        }.start()
    }

    private fun postVerdict(ctx: Context, day: String) {
        channel(ctx)
        val b = Notification.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_voucher)
            .setContentTitle("Did today go the way you wanted?")
            .setContentText("One tap, or let it go.")
            .setColor(NIGHT)
            .setContentIntent(openSheet(ctx, "verdict", 13))
            .setAutoCancel(true)
            .setTimeoutAfter(6 * 60 * 60 * 1000L)
        listOf("yes" to "Yes", "mostly" to "Mostly", "no" to "No").forEachIndexed { i, (value, label) ->
            val intent = Intent(ctx, QuestionReceiver::class.java).setAction(VERDICT)
                .putExtra("day", day).putExtra("answer", value)
            val pi = PendingIntent.getBroadcast(ctx, 10 + i, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            b.addAction(Notification.Action.Builder(null, label, pi).build())
        }
        ctx.getSystemService(NotificationManager::class.java).notify(VERDICT_ID, b.build())
    }

    /**
     * After an answer: anything new today? "Add a Marker" (and a tap) opens
     * the app's Marker chips, the step that follows the answer there too.
     */
    private fun askMarker(ctx: Context) {
        val marker = openSheet(ctx, "marker", 14)
        val text = "Optional: add a Marker for anything new today, such as a new dose or an exam."
        val b = Notification.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_voucher)
            .setContentTitle("Kept. Anything new today?")
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setColor(NIGHT)
            .setContentIntent(marker)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setTimeoutAfter(60 * 60 * 1000L)
            .addAction(Notification.Action.Builder(null, "Add a Marker", marker).build())
        ctx.getSystemService(NotificationManager::class.java).notify(VERDICT_ID, b.build())
    }

    /** Opens the app on the Curfew sheet: "verdict" asks the question, "marker" goes to the Marker chips. */
    private fun openSheet(ctx: Context, ask: String, code: Int): PendingIntent =
        PendingIntent.getActivity(ctx, code, Intent(ctx, MainActivity::class.java).putExtra("route", "/?ask=$ask"),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    /** After an Unlock from outside the app: why now? Gone after three minutes if ignored. */
    fun askReason(ctx: Context) {
        channel(ctx)
        val b = Notification.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_voucher)
            .setContentTitle("Unlocked. Why now?")
            .setContentText("Optional: one tap helps Trends show what pulls you.")
            .setAutoCancel(true)
            .setTimeoutAfter(3 * 60 * 1000L)
        REASONS.forEachIndexed { i, reason ->
            val intent = Intent(ctx, QuestionReceiver::class.java).setAction(REASON).putExtra("answer", reason)
            val pi = PendingIntent.getBroadcast(ctx, 20 + i, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            b.addAction(Notification.Action.Builder(null, reason, pi).build())
        }
        ctx.getSystemService(NotificationManager::class.java).notify(REASON_ID, b.build())
    }

    /** Sends a tapped answer to the Ledger and clears the question. */
    fun answer(ctx: Context, intent: Intent) {
        val c = Store.connection(ctx) ?: return
        val answer = intent.getStringExtra("answer") ?: return
        when (intent.action) {
            VERDICT -> {
                runCatching { LedgerClient.post(c, "/verdict", JSONObject().put("day", intent.getStringExtra("day")).put("verdict", answer)) }
                askMarker(ctx)
            }
            REASON -> {
                runCatching { LedgerClient.post(c, "/reason", JSONObject().put("reason", answer.lowercase())) }
                ctx.getSystemService(NotificationManager::class.java).cancel(REASON_ID)
            }
        }
    }
}

/** A tap on one of the questions' answers. */
class QuestionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        Thread {
            try { Questions.answer(context, intent) } finally { pending.finish() }
        }.start()
    }
}
