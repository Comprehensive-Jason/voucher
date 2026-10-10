package io.github.comprehensivejason.voucher

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.service.quicksettings.TileService

/**
 * Everything outside the app that shows the Bank: the persistent
 * notification, the Quick Settings tile, and the home-screen widgets.
 */
object Surfaces {
    const val STATUS = "status"
    const val MOMENTS = "moments"
    const val STATUS_ID = 1
    @Volatile var last: Decision? = null

    fun channels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(STATUS, "Bank and Unlock", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Always shown while Voucher is protecting this device"
            setShowBadge(false)
        })
        nm.createNotificationChannel(NotificationChannel(MOMENTS, "Moments", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Daily goal met, Bank full, and Streak ended"
        })
    }

    fun tearIntent(ctx: Context): PendingIntent = PendingIntent.getBroadcast(
        ctx, 1, Intent(ctx, ActionReceiver::class.java).setAction(ActionReceiver.TEAR), PendingIntent.FLAG_IMMUTABLE,
    )

    private fun openIntent(ctx: Context): PendingIntent =
        PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)

    fun notification(ctx: Context, d: Decision?): Notification {
        channels(ctx)
        val b = Notification.Builder(ctx, STATUS)
            .setSmallIcon(R.drawable.ic_voucher)
            .setContentIntent(openIntent(ctx))
            .setOngoing(true)
            .setColor(if (d?.curfew == true) 0xFF7D8CFF.toInt() else 0xFF3DDC84.toInt())
            .setShowWhen(false)
        if (d?.status == null) {
            return b.setContentTitle("Voucher").setContentText("Connecting to your Ledger").build()
        }
        val tried = Store.attempts(ctx, d.day).values.sum()
        val today = "Today ${d.earned} of ${d.goal}" + if (tried > 0) " · paused apps tried $tried ${if (tried == 1) "time" else "times"}" else ""
        when {
            d.released -> b.setSubText("released").setContentTitle("Not blocking on this device").setContentText("Released in Rules")
            d.curfew -> b.setSubText("Curfew").setContentTitle("Curfew until ${d.curfewEnd.take(5)}").setContentText("Sleep well. ${d.bank} kept for the morning.")
            d.unlockEndsAt != null -> b.setSubText("unlocked")
                .setContentTitle("Unlocked")
                .setContentText(today)
                .setShowWhen(true)
                .setWhen(d.unlockEndsAt * 1000)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
            else -> b.setSubText(if (d.bank >= d.bankLimit && d.bankLimit > 0) "Bank full" else "locked")
                .setContentTitle("${d.bank} ${if (d.bank == 1) "voucher" else "vouchers"} banked")
                .setContentText(today)
        }
        if (d.goal > 0) b.setProgress(d.goal, d.earned.coerceAtMost(d.goal), false)
        if (!d.curfew && !d.released && d.bank > 0) {
            b.addAction(Notification.Action.Builder(null, "Unlock ${d.unlockMinutes} min", tearIntent(ctx)).build())
        }
        b.addAction(Notification.Action.Builder(null, "Open", openIntent(ctx)).build())
        return b.build()
    }

    fun refresh(ctx: Context, d: Decision) {
        last = d
        ctx.getSystemService(NotificationManager::class.java).notify(STATUS_ID, notification(ctx, d))
        runCatching { TileService.requestListeningState(ctx, ComponentName(ctx, TearTileService::class.java)) }
        VoucherWidget.updateAll(ctx, d)
    }
}
