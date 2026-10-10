package io.github.comprehensivejason.voucher

import android.graphics.drawable.Icon
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** The Quick Settings tile: "Unlock · 9 banked". A tap Redeems one Voucher. */
class TearTileService : TileService() {
    override fun onStartListening() {
        val d = Surfaces.last
        val tile = qsTile ?: return
        tile.icon = Icon.createWithResource(this, R.drawable.ic_voucher)
        tile.label = "Voucher"
        when {
            d == null || d.status == null -> { tile.subtitle = "Not connected"; tile.state = Tile.STATE_UNAVAILABLE }
            d.curfew -> { tile.subtitle = "Curfew"; tile.state = Tile.STATE_UNAVAILABLE }
            d.unlockEndsAt != null -> {
                val left = ((d.unlockEndsAt - System.currentTimeMillis() / 1000) / 60).coerceAtLeast(0)
                tile.subtitle = if (d.bank > 0) "+1 · $left min left" else "$left min left"
                tile.state = if (d.bank > 0) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
            }
            d.bank > 0 -> { tile.subtitle = "Unlock · ${d.bank} banked"; tile.state = Tile.STATE_ACTIVE }
            else -> { tile.subtitle = "No Vouchers"; tile.state = Tile.STATE_INACTIVE }
        }
        tile.updateTile()
    }

    override fun onClick() {
        val d = Surfaces.last ?: return
        if (d.curfew || d.bank == 0) return
        Thread {
            Enforcer.tear(this)
            onStartListening()
        }.start()
    }
}
