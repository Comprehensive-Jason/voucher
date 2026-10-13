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
 * The one notification Insights sends: an Experiment's verdict is in. The
 * Enforcer's pass reads the Ledger's open Experiments from /status; one that
 * is judged ("ready", with the words the app's templates gave its verdict)
 * gets a notification once on this device, with Keep it, Go back, and Open.
 * Go back asks the Ledger to undo the change, which for a tightening is a
 * loosening, so it waits for the morning like any other. Nothing else in
 * Insights pushes.
 */
object Verdicts {
    private const val CHANNEL = "experiments"
    /** Notification ids from here up, one per Experiment. */
    private const val BASE_ID = 100
    const val KEEP = "io.github.comprehensivejason.voucher.EXPERIMENT_KEEP"
    const val BACK = "io.github.comprehensivejason.voucher.EXPERIMENT_BACK"

    private fun channel(ctx: Context) {
        ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Experiment verdicts", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "When an Experiment from Insights has its verdict, once each"
            },
        )
    }

    /** Raises a notification for each judged Experiment this device hasn't shown yet. */
    fun check(ctx: Context, d: Decision) {
        val list = d.status?.optJSONArray("experiments") ?: return
        for (i in 0 until list.length()) {
            val e = list.optJSONObject(i) ?: continue
            val verdict = e.optJSONObject("verdict") ?: continue
            if (e.optString("status") != "ready") continue
            val id = e.optInt("id")
            if (!Store.once(ctx, "experiment-verdict-$id")) continue
            post(ctx, id, verdict)
        }
    }

    private fun post(ctx: Context, id: Int, verdict: JSONObject) {
        channel(ctx)
        val text = verdict.optString("text")
        val back = verdict.optString("back").ifEmpty { "Go back" }
        val open = PendingIntent.getActivity(ctx, BASE_ID + id * 3, Intent(ctx, MainActivity::class.java).putExtra("route", "/trends?insight=experiment:$id"),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val b = Notification.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_voucher)
            .setContentTitle(verdict.optString("title"))
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setColor(VoucherColors.VOUCHER)
            .setContentIntent(open)
            .setAutoCancel(true)
        listOf(KEEP to "Keep it", BACK to back).forEachIndexed { k, (action, label) ->
            val intent = Intent(ctx, VerdictReceiver::class.java).setAction(action).putExtra("id", id)
            val pi = PendingIntent.getBroadcast(ctx, BASE_ID + id * 3 + 1 + k, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            b.addAction(Notification.Action.Builder(null, label, pi).build())
        }
        b.addAction(Notification.Action.Builder(null, "Open", open).build())
        ctx.getSystemService(NotificationManager::class.java).notify(BASE_ID + id, b.build())
    }

    /** Keep it or Go back, tapped: tells the Ledger and clears the notification. */
    fun answer(ctx: Context, intent: Intent) {
        val c = Store.connection(ctx) ?: return
        val id = intent.getIntExtra("id", -1).takeIf { it >= 0 } ?: return
        val keep = intent.action == KEEP
        runCatching { LedgerClient.post(c, "/experiment/end", JSONObject().put("id", id).put("keep", keep)) }
        ctx.getSystemService(NotificationManager::class.java).cancel(BASE_ID + id)
    }
}

/** A tap on a verdict's Keep it or Go back. */
class VerdictReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        Thread {
            try { Verdicts.answer(context, intent) } finally { pending.finish() }
        }.start()
    }
}
