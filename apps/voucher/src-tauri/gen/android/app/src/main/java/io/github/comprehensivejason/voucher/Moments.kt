package io.github.comprehensivejason.voucher

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/**
 * The moment notifications: the Daily goal met, the Bank full, and a Streak
 * that ended. Each fires once per Day, and only the newest is kept: a later
 * one replaces whichever is still showing.
 */
object Moments {
    private const val ID = 2

    fun check(ctx: Context, d: Decision) {
        if (d.status == null) return
        if (d.goal > 0 && d.earned >= d.goal && Store.once(ctx, "goal-${d.day}")) {
            post(ctx, "Daily goal met", "${d.earned} of ${d.goal} today. Your streak is now ${d.streak} ${if (d.streak == 1) "day" else "days"}.", tear = false)
        } else if (d.bankLimit > 0 && d.bank >= d.bankLimit && !d.curfew && Store.once(ctx, "full-${d.day}")) {
            post(ctx, "Bank full", "Anything you earn now is lost. A good moment for a break.", tear = true, unlockMinutes = d.unlockMinutes)
        }
        // A Streak ended if yesterday missed its goal while the day before met it.
        if (d.streak == 0 && Store.once(ctx, "lost-check-${d.day}")) {
            val c = Store.connection(ctx) ?: return
            Thread {
                runCatching {
                    val day = java.time.LocalDate.parse(d.day)
                    val yesterday = LedgerClient.get(c, "/day?date=${day.minusDays(1)}")
                    val before = LedgerClient.get(c, "/day?date=${day.minusDays(2)}")
                    val ended = before.optInt("streak")
                    if (!yesterday.optBoolean("goal_met") && before.optBoolean("goal_met") && ended > 0) {
                        post(ctx, "Streak ended at $ended ${if (ended == 1) "day" else "days"}",
                            "Yesterday: ${yesterday.optInt("earned")} of ${yesterday.optInt("goal")}. Today starts a new one.", tear = false)
                    }
                }
            }.start()
        }
    }

    private fun post(ctx: Context, title: String, text: String, tear: Boolean, unlockMinutes: Int = 10) {
        val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val builder = Notification.Builder(ctx, Surfaces.MOMENTS)
            .setSmallIcon(R.drawable.ic_voucher)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setContentIntent(open)
            .setAutoCancel(true)
            .setColor(0xFF3DDC84.toInt())
        if (tear) builder.addAction(Notification.Action.Builder(null, "Tear one, $unlockMinutes min", Surfaces.tearIntent(ctx)).build())
        builder.addAction(Notification.Action.Builder(null, "Open", open).build())
        ctx.getSystemService(NotificationManager::class.java).notify(ID, builder.build())
    }
}
