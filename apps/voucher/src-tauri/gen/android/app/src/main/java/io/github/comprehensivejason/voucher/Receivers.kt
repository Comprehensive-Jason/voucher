package io.github.comprehensivejason.voucher

import android.app.admin.DeviceAdminReceiver
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** The component Android makes Device Owner (`dpm set-device-owner`). */
class VoucherAdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        // Device Owner can grant its own runtime permissions; notifications are the one Voucher needs.
        runCatching {
            Enforcer.dpm(context).setPermissionGrantState(
                Enforcer.admin(context), context.packageName,
                android.Manifest.permission.POST_NOTIFICATIONS,
                android.app.admin.DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED,
            )
        }
        // Device Owner switches the backup service off; turn it back on.
        runCatching { Enforcer.dpm(context).setBackupServiceEnabled(Enforcer.admin(context), true) }
        EnforcerService.start(context)
    }
}

/** Starts enforcing again after a restart, before the app is ever opened. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            EnforcerService.start(context)
        }
    }
}

/** "Tear one" from the notification, a moment, or a widget. */
class ActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TEAR) return
        val pending = goAsync()
        Thread {
            try { Enforcer.tear(context) } finally { pending.finish() }
        }.start()
    }

    companion object { const val TEAR = "io.github.comprehensivejason.voucher.TEAR" }
}
