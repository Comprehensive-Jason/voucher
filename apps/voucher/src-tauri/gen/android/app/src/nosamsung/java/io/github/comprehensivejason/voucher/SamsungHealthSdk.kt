package io.github.comprehensivejason.voucher

import android.app.Activity
import android.content.Context

/**
 * Stands in for src/samsung's SamsungHealthSdk in a build without the
 * Samsung Health Data SDK's AAR (it isn't redistributable, so the repository
 * never holds it). Nothing is available, so Voucher hides the "Samsung
 * Health goals" switch and never reads them.
 */
object SamsungHealthSdk {
    const val COMPILED = false

    fun granted(ctx: Context): Boolean = false

    fun request(activity: Activity): Boolean = false

    fun read(ctx: Context): Map<String, Double>? = null
}
