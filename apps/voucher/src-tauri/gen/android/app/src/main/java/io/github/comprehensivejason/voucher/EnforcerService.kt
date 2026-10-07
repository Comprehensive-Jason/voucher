package io.github.comprehensivejason.voucher

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder

/**
 * Keeps the Enforcer running while the app is closed: a pass every 30
 * seconds, and one the moment an Unlock ends. It owns the persistent
 * notification, which Android requires of a long-running service.
 */
class EnforcerService : Service() {
    private lateinit var thread: HandlerThread
    private lateinit var handler: Handler

    private val loop = object : Runnable {
        override fun run() {
            val d = runCatching { Enforcer.tick(this@EnforcerService) }.getOrNull()
            handler.removeCallbacks(this)
            // Next pass in 30 s, or just after the Unlock ends if that is sooner.
            val untilEnd = d?.unlockEndsAt?.let { it * 1000 - System.currentTimeMillis() + 1000 }
            handler.postDelayed(this, listOfNotNull(30_000L, untilEnd?.takeIf { it > 0 }).min())
        }
    }

    override fun onCreate() {
        super.onCreate()
        startForeground(Surfaces.STATUS_ID, Surfaces.notification(this, Surfaces.last), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        thread = HandlerThread("voucher-enforcer").also { it.start() }
        handler = Handler(thread.looper)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Every start asks for a pass now: after a tear, a boot, or opening the app.
        handler.post(loop)
        return START_STICKY
    }

    override fun onDestroy() {
        thread.quitSafely()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        fun start(ctx: Context) {
            ctx.startForegroundService(Intent(ctx, EnforcerService::class.java))
        }
    }
}
