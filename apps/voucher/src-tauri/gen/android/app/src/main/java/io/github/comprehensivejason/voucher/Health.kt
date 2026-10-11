package io.github.comprehensivejason.voucher

import android.content.Context
import android.content.Intent
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.runBlocking
import java.time.Instant

/**
 * Workout zone minutes, steps, and sleep from Health Connect. For zone minutes each
 * minute's heart rate is averaged; a moderate minute (64% of maximum heart
 * rate or more) counts 1, a vigorous one (77% or more) counts 2, as Google
 * Fit's Heart Points do. Each needs only its own permissions. Sleep goes to
 * the Ledger as sessions (start, end, minutes asleep, the app that wrote
 * them) for each Day's sleep figure; it earns nothing.
 */
object Health {
    val PERMISSIONS = setOf(
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND,
    )
    /**
     * Asked for alongside, but not needed: without it Health Connect only
     * gives data from 30 days before access was first granted, so the first
     * sleep history reaches back that far instead of half a year.
     */
    private const val HISTORY = HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY
    private val HEART = HealthPermission.getReadPermission(HeartRateRecord::class)
    private val STEPS = HealthPermission.getReadPermission(StepsRecord::class)
    private val SLEEP = HealthPermission.getReadPermission(SleepSessionRecord::class)
    /** Stages that are time awake, taken off a session's minutes asleep. */
    private val AWAKE = setOf(
        SleepSessionRecord.STAGE_TYPE_AWAKE,
        SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
        SleepSessionRecord.STAGE_TYPE_OUT_OF_BED,
    )

    private fun client(ctx: Context): HealthConnectClient? =
        if (HealthConnectClient.getSdkStatus(ctx) == HealthConnectClient.SDK_AVAILABLE) HealthConnectClient.getOrCreate(ctx) else null

    fun granted(ctx: Context): Boolean = has(ctx, PERMISSIONS)

    /** Whether these permissions are granted, so one feature works without the other's. */
    private fun has(ctx: Context, wanted: Set<String>): Boolean {
        val client = client(ctx) ?: return false
        return runCatching { runBlocking { client.permissionController.getGrantedPermissions().containsAll(wanted) } }.getOrDefault(false)
    }

    /** The system screen that asks for Voucher's health permissions, or null without Health Connect. */
    fun requestIntent(ctx: Context): Intent? {
        client(ctx) ?: return null
        return PermissionController.createRequestPermissionResultContract().createIntent(ctx, PERMISSIONS + HISTORY)
    }

    data class Workout(val zoneMinutes: Int, val title: String?)

    /** Zone minutes since `from`, and the name of the latest workout, or null without access. */
    fun since(ctx: Context, from: Instant, maxHeartRate: Int): Workout? {
        val client = client(ctx) ?: return null
        if (!has(ctx, setOf(HEART))) return null
        return runCatching {
            runBlocking {
                val range = TimeRangeFilter.between(from, Instant.now())
                val beats = client.readRecords(ReadRecordsRequest(HeartRateRecord::class, range)).records
                    .flatMap { it.samples }
                val perMinute = beats.groupBy { it.time.epochSecond / 60 }.mapValues { (_, s) -> s.map { it.beatsPerMinute }.average() }
                val zone = perMinute.values.sumOf { bpm ->
                    when {
                        bpm >= 0.77 * maxHeartRate -> 2
                        bpm >= 0.64 * maxHeartRate -> 1
                        else -> 0
                    }.toInt()
                }
                val title = client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, range)).records
                    .maxByOrNull { it.startTime }?.title
                Workout(zone, title)
            }
        }.getOrNull()
    }

    /** Steps since `from`, from every app writing to Health Connect, or null without access. */
    fun stepsSince(ctx: Context, from: Instant): Long? {
        val client = client(ctx) ?: return null
        if (!has(ctx, setOf(STEPS))) return null
        return runCatching {
            runBlocking {
                client.aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), TimeRangeFilter.between(from, Instant.now())))[StepsRecord.COUNT_TOTAL]
            }
        }.getOrNull()
    }

    /** One sleep session: minutes asleep are the session less its awake stages (all of it without stages). */
    data class Night(val start: Instant, val end: Instant, val asleep: Int, val stages: Boolean, val origin: String?)

    /** Sleep sessions from every app writing to Health Connect since `from`, or null without access. */
    fun sleepSince(ctx: Context, from: Instant): List<Night>? {
        val client = client(ctx) ?: return null
        if (!has(ctx, setOf(SLEEP))) return null
        val pm = ctx.packageManager
        val label = { pkg: String -> runCatching { pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() }.getOrDefault(pkg) }
        return runCatching {
            runBlocking {
                val out = mutableListOf<Night>()
                var page: String? = null
                do {
                    val reply = client.readRecords(
                        ReadRecordsRequest(SleepSessionRecord::class, TimeRangeFilter.between(from, Instant.now()), pageToken = page),
                    )
                    for (r in reply.records) {
                        val awake = r.stages.filter { it.stage in AWAKE }.sumOf { it.endTime.toEpochMilli() - it.startTime.toEpochMilli() }
                        val asleep = ((r.endTime.toEpochMilli() - r.startTime.toEpochMilli() - awake) / 60_000).toInt().coerceAtLeast(0)
                        out.add(Night(r.startTime, r.endTime, asleep, r.stages.isNotEmpty(), label(r.metadata.dataOrigin.packageName)))
                    }
                    page = reply.pageToken
                } while (page != null)
                out
            }
        }.getOrNull()
    }
}
