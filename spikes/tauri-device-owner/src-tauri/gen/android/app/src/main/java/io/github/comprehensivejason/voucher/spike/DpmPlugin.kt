package io.github.comprehensivejason.voucher.spike

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class SuspendArgs {
    lateinit var pkg: String
    var suspended: Boolean = true
}

// SPIKE: the Kotlin side of the Enforcer. Reached from Rust with run_mobile_plugin.
@TauriPlugin
class DpmPlugin(private val activity: Activity) : Plugin(activity) {
    private val dpm = activity.getSystemService(DevicePolicyManager::class.java)
    private val admin = ComponentName(activity, VoucherAdminReceiver::class.java)

    @Command
    fun status(invoke: Invoke) {
        val result = JSObject()
        result.put("deviceOwner", dpm.isDeviceOwnerApp(activity.packageName))
        result.put("package", activity.packageName)
        invoke.resolve(result)
    }

    // Does the Device Owner's short support message replace "contact your IT admin" in the blocked dialog?
    @Command
    fun supportMessage(invoke: Invoke) {
        dpm.setShortSupportMessage(admin, "Paused by Voucher. Open Voucher to tear a ticket.")
        invoke.resolve(JSObject().put("set", true))
    }

    @Command
    fun suspend(invoke: Invoke) {
        val args = invoke.parseArgs(SuspendArgs::class.java)
        try {
            val failed = dpm.setPackagesSuspended(admin, arrayOf(args.pkg), args.suspended)
            val result = JSObject()
            result.put("failed", JSArray(failed.toList()))
            result.put("suspended", dpm.isPackageSuspended(admin, args.pkg))
            invoke.resolve(result)
        } catch (e: Exception) {
            invoke.reject(e.toString())
        }
    }
}
