package io.github.comprehensivejason.voucher

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

/** Why Voucher reads health data, as Health Connect requires every reader to say. */
class HealthRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(TextView(this).apply {
            setPadding(48, 96, 48, 48)
            textSize = 16f
            text = "Voucher reads your heart rate and workout names to count zone minutes toward the Workout source, " +
                "and your sleep sessions to show how you slept beside each Day in Trends. " +
                "It sends only the day's zone-minute total, the latest workout's name, and each night's start, end, " +
                "minutes asleep, and the app that recorded it to your own Ledger, never the readings."
        })
    }
}
