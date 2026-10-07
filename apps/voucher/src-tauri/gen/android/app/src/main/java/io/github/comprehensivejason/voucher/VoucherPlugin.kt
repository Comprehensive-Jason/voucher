package io.github.comprehensivejason.voucher

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject

@InvokeArg
class PartArgs { var part: String = "" }

@InvokeArg
class PackageArgs { var pkg: String = "" }

@InvokeArg
class HomeArgs { var closed: Boolean = false }

/**
 * What the interface asks of the phone itself. Reached from Rust's `device`
 * command; everything slow runs off the main thread.
 */
@TauriPlugin
class VoucherPlugin(private val activity: Activity) : Plugin(activity) {
    private fun background(invoke: Invoke, work: () -> Any?) {
        Thread {
            try {
                when (val result = work()) {
                    is JSObject -> invoke.resolve(result)
                    is JSONObject -> invoke.resolve(JSObject(result.toString()))
                    null -> invoke.resolve(JSObject().put("value", JSONObject.NULL))
                    else -> invoke.resolve(JSObject().put("value", result))
                }
            } catch (e: Exception) {
                invoke.reject(e.toString())
            }
        }.start()
    }

    @Command
    fun protection(invoke: Invoke) {
        invoke.resolve(JSObject()
            .put("deviceOwner", Enforcer.isOwner(activity))
            .put("usageAccess", Permissions.usageAccess(activity))
            .put("overlay", Permissions.overlay(activity)))
    }

    @Command
    fun openSettings(invoke: Invoke) {
        val part = invoke.parseArgs(PartArgs::class.java).part
        val action = when (part) {
            "usageAccess" -> Settings.ACTION_USAGE_ACCESS_SETTINGS
            "overlay" -> Settings.ACTION_ACCESSIBILITY_SETTINGS
            else -> Settings.ACTION_SETTINGS
        }
        activity.startActivity(Intent(action))
        invoke.resolve()
    }

    /** Apps with a launcher icon, for adding Focused time sources and blocklist entries. */
    @Command
    fun apps(invoke: Invoke) = background(invoke) {
        val pm = activity.packageManager
        val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val list = JSArray()
        pm.queryIntentActivities(launcher, PackageManager.ResolveInfoFlags.of(0))
            .map { it.activityInfo.packageName to it.loadLabel(pm).toString() }
            .distinctBy { it.first }
            .filter { it.first != activity.packageName }
            .sortedBy { it.second.lowercase() }
            .forEach { (pkg, label) -> list.put(JSObject().put("package", pkg).put("label", label)) }
        JSObject().put("value", list)
    }

    @Command
    fun usage(invoke: Invoke) = background(invoke) { Enforcer.usage(activity) }

    /** An app's launcher icon as a PNG data URL, for the blocked screen. */
    @Command
    fun appIcon(invoke: Invoke) = background(invoke) {
        val pkg = invoke.parseArgs(PackageArgs::class.java).pkg
        val drawable = activity.packageManager.getApplicationIcon(pkg)
        val bitmap = android.graphics.Bitmap.createBitmap(152, 152, android.graphics.Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(bitmap)
        drawable.setBounds(0, 0, 152, 152)
        drawable.draw(canvas)
        val out = java.io.ByteArrayOutputStream()
        bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out)
        "data:image/png;base64," + android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP)
    }

    /** Asks for Health Connect access; resolves false if Health Connect isn't on this device. */
    @Command
    fun requestHealth(invoke: Invoke) {
        if (Health.granted(activity)) return invoke.resolve(JSObject().put("value", true))
        val intent = Health.requestIntent(activity) ?: return invoke.resolve(JSObject().put("value", false))
        activity.startActivity(intent)
        // The answer arrives later; the interface checks again when it is visible.
        invoke.resolve(JSObject().put("value", false))
    }

    @Command
    fun healthGranted(invoke: Invoke) = background(invoke) { Health.granted(activity) }

    @Command
    fun deviceId(invoke: Invoke) = invoke.resolve(JSObject().put("value", Store.deviceId(activity)))

    @Command
    fun pendingRoute(invoke: Invoke) = invoke.resolve(JSObject().put("value", Store.takePendingRoute(activity) ?: JSONObject.NULL))

    /** Applies the latest Ledger answer right away, then opens the app that was blocked. */
    @Command
    fun openApp(invoke: Invoke) = background(invoke) {
        val pkg = invoke.parseArgs(PackageArgs::class.java).pkg
        val d = Enforcer.tick(activity)
        if (!d.unlocked) throw IllegalStateException("Still locked")
        activity.packageManager.getLaunchIntentForPackage(pkg)?.let {
            activity.startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        true
    }

    /** "Close Instagram" or "Good night": back to the home screen. */
    @Command
    fun goHome(invoke: Invoke) {
        if (invoke.parseArgs(HomeArgs::class.java).closed) {
            Store.countClosed(activity, Enforcer.tickless(activity, Store.lastStatus(activity)))
        }
        activity.startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        invoke.resolve()
    }

    /** A pass of the Enforcer now, after the interface changed something. */
    @Command
    fun refresh(invoke: Invoke) = background(invoke) {
        EnforcerService.start(activity)
        true
    }
}
