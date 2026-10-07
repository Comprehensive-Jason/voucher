package io.github.comprehensivejason.voucher

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Voucher is dark only, so the system bars always get light icons.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)
    remember(intent)
    EnforcerService.start(this)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    remember(intent)
  }

  /** A screen asked for by the blocked-app watcher; the interface picks it up when it becomes visible. */
  private fun remember(intent: Intent?) {
    intent?.getStringExtra("route")?.let { Store.setPendingRoute(this, it) }
  }
}
