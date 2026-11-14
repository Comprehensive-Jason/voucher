package io.github.comprehensivejason.voucher

import android.app.Activity
import android.content.Context
import com.samsung.android.sdk.health.data.HealthDataService
import com.samsung.android.sdk.health.data.error.ResolvablePlatformException
import com.samsung.android.sdk.health.data.permission.AccessType
import com.samsung.android.sdk.health.data.permission.Permission
import com.samsung.android.sdk.health.data.request.DataType
import com.samsung.android.sdk.health.data.request.DataTypes
import com.samsung.android.sdk.health.data.request.LocalDateFilter
import kotlinx.coroutines.runBlocking
import java.time.Duration
import java.time.LocalDate
import java.time.LocalTime

/**
 * Samsung Health's own goals, through the Samsung Health Data SDK. Built only
 * when the SDK's AAR is in app/libs: Samsung's license doesn't allow passing
 * the SDK on, so the repository never holds it (README, "Samsung Health
 * goals"). Without it, src/nosamsung's stub takes this file's place.
 *
 * Every goal type is Aggregate only: the SDK reads a goal as the LAST value
 * saved in Samsung Health over a range of dates, never writes one. The sleep
 * target is two goals, a bedtime and a wake-up time (LocalTime), and has no
 * duration of its own. Without partner approval the SDK reads only while
 * Samsung Health's developer mode is on.
 */
object SamsungHealthSdk {
    const val COMPILED = true

    private val PERMISSIONS = setOf(
        DataTypes.SLEEP_GOAL,
        DataTypes.STEPS_GOAL,
        DataTypes.ACTIVE_TIME_GOAL,
        DataTypes.ACTIVE_CALORIES_BURNED_GOAL,
        DataTypes.WATER_INTAKE_GOAL,
    ).map { Permission.of(it, AccessType.READ) }.toSet()

    /** Whether Voucher may read at least one of the goals. */
    fun granted(ctx: Context): Boolean = runCatching {
        runBlocking { HealthDataService.getStore(ctx.applicationContext).getGrantedPermissions(PERMISSIONS).isNotEmpty() }
    }.getOrDefault(false)

    /**
     * Shows Samsung Health's permission popup over `activity`, unless every
     * goal may be read already; true once at least one may. When Samsung
     * Health can fix what stops it (not set up yet, too old), it shows how.
     */
    fun request(activity: Activity): Boolean = try {
        runBlocking {
            val store = HealthDataService.getStore(activity.applicationContext)
            val have = store.getGrantedPermissions(PERMISSIONS)
            (if (have.containsAll(PERMISSIONS)) have else store.requestPermissions(PERMISSIONS, activity)).isNotEmpty()
        }
    } catch (e: ResolvablePlatformException) {
        if (e.hasResolution) runCatching { e.resolve(activity) }
        false
    } catch (e: Exception) {
        false
    }

    /**
     * Each goal set in Samsung Health that Voucher may read, by the Ledger's
     * kinds: bedtime and wake (minutes after midnight), steps, active_time
     * (minutes), active_calories (kcal), and water (ml). A goal never set is
     * left out. Null when Samsung Health can't be read at all.
     */
    fun read(ctx: Context): Map<String, Double>? = runCatching {
        runBlocking {
            val store = HealthDataService.getStore(ctx.applicationContext)
            if (store.getGrantedPermissions(PERMISSIONS).isEmpty()) return@runBlocking null
            val out = linkedMapOf<String, Double>()
            val clock = { v: Any? -> (v as? LocalTime)?.let { (it.hour * 60 + it.minute).toDouble() } }
            val number = { v: Any? -> (v as? Number)?.toDouble() }
            lastIn { f -> store.aggregateData(DataType.SleepGoalType.LAST_BED_TIME.requestBuilder.setLocalDateFilter(f).build()).dataList.lastOrNull()?.value }
                ?.let(clock)?.let { out["bedtime"] = it }
            lastIn { f -> store.aggregateData(DataType.SleepGoalType.LAST_WAKE_UP_TIME.requestBuilder.setLocalDateFilter(f).build()).dataList.lastOrNull()?.value }
                ?.let(clock)?.let { out["wake"] = it }
            lastIn { f -> store.aggregateData(DataType.StepsGoalType.LAST.requestBuilder.setLocalDateFilter(f).build()).dataList.lastOrNull()?.value }
                ?.let(number)?.let { out["steps"] = it }
            lastIn { f -> store.aggregateData(DataType.ActiveTimeGoalType.LAST.requestBuilder.setLocalDateFilter(f).build()).dataList.lastOrNull()?.value }
                ?.let { (it as? Duration)?.toMinutes()?.toDouble() }?.let { out["active_time"] = it }
            lastIn { f -> store.aggregateData(DataType.ActiveCaloriesBurnedGoalType.LAST.requestBuilder.setLocalDateFilter(f).build()).dataList.lastOrNull()?.value }
                ?.let(number)?.let { out["active_calories"] = it }
            lastIn { f -> store.aggregateData(DataType.WaterIntakeGoalType.LAST.requestBuilder.setLocalDateFilter(f).build()).dataList.lastOrNull()?.value }
                ?.let(number)?.let { out["water"] = it }
            out
        }
    }.getOrNull()

    /**
     * A goal's last value: today's, or failing that the last saved in ten
     * years. Which range the SDK needs to find a goal set long ago isn't
     * documented, so both are asked. A type without permission throws and
     * reads as unset.
     */
    private suspend fun <V> lastIn(read: suspend (LocalDateFilter) -> V?): V? {
        val today = LocalDate.now()
        for (from in listOf(today, today.minusYears(10))) {
            runCatching { read(LocalDateFilter.of(from, today)) }.getOrNull()?.let { return it }
        }
        return null
    }
}
