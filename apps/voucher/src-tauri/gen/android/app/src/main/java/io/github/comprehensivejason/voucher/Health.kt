package io.github.comprehensivejason.voucher

import android.content.Context
import android.content.Intent
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.runBlocking
import java.time.Instant

/**
 * Workout zone minutes and steps from Health Connect. For zone minutes each
 * minute's heart rate is averaged; a moderate minute (64% of maximum heart
 * rate or more) counts 1, a vigorous one (77% or more) counts 2, as Google
 * Fit's Heart Points do. Each needs only its own permissions.
 */
object Health {
    val PERMISSIONS = setOf(
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND,
    )
    private val HEART = HealthPermission.getReadPermission(HeartRateRecord::class)
    private val STEPS = HealthPermission.getReadPermission(StepsRecord::class)

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
        return PermissionController.createRequestPermissionResultContract().createIntent(ctx, PERMISSIONS)
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
}
