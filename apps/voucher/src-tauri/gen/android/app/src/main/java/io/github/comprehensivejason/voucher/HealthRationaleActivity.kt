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
            text = "Voucher reads your heart rate and workout names to count zone minutes toward the Workout source. " +
                "It sends only the day's zone-minute total and the latest workout's name to your own Ledger, never the readings."
        })
    }
}
