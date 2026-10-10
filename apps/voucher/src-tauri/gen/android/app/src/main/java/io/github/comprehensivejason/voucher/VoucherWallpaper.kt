package io.github.comprehensivejason.voucher

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.service.wallpaper.WallpaperService
import android.view.SurfaceHolder
import org.json.JSONObject

/**
 * Voucher's live wallpaper. The screen fills from the bottom as high as the
 * Bank is full, in bands of the colours of the sources earned from today
 * (toned down so icons stay readable), and drains as Vouchers are unlocked;
 * a line at the fill's top edge gives the Bank, today against the Daily goal,
 * and the streak. During Curfew everything turns to the night colour.
 * It draws from the status the app already keeps, so it costs no Ledger calls,
 * and redraws every 30 seconds while it's showing.
 */
class VoucherWallpaper : WallpaperService() {
    override fun onCreateEngine(): Engine = VoucherEngine()

    inner class VoucherEngine : Engine() {
        private val handler = Handler(Looper.getMainLooper())
        private val tick = object : Runnable {
            override fun run() { draw(); handler.postDelayed(this, 30_000) }
        }
        private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
        private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xCCF2F2F0.toInt(); typeface = Typeface.create("monospace", Typeface.BOLD)
        }

        override fun onVisibilityChanged(visible: Boolean) {
            handler.removeCallbacks(tick)
            if (visible) handler.post(tick)
        }
        override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) { draw() }
        override fun onDestroy() { handler.removeCallbacks(tick) }

        private fun draw() {
            val holder = surfaceHolder
            val canvas = runCatching { holder.lockCanvas() }.getOrNull() ?: return
            try { paint(canvas, Store.lastStatus(this@VoucherWallpaper)) } finally { holder.unlockCanvasAndPost(canvas) }
        }

        private fun paint(c: Canvas, status: JSONObject?) {
            val w = c.width.toFloat(); val h = c.height.toFloat()
            val curfew = status?.optBoolean("curfew_active") == true
            c.drawColor(if (curfew) 0xFF151935.toInt() else 0xFF0E0F11.toInt())
            if (status == null) return
            val bank = status.optInt("bank"); val limit = status.optJSONObject("settings")?.optInt("bank_limit")?.takeIf { it > 0 } ?: 24
            val today = status.optJSONObject("today")
            val top = h - h * (bank.toFloat() / limit).coerceIn(0f, 1f) * 0.62f
            // Bands for today's sources, by share of what each earned; grey when nothing was earned yet.
            val parts = mutableListOf<Pair<Int, Int>>()
            today?.optJSONArray("sources")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val s = arr.getJSONObject(i)
                    if (s.optInt("earned") > 0) parts.add(VoucherWidget.colorOf(s) to s.optInt("earned"))
                }
            }
            if (parts.isEmpty()) parts.add(0xFF6C7177.toInt() to 1)
            val total = parts.sumOf { it.second }.toFloat()
            var x = 0f
            for ((color, n) in parts) {
                val bw = w * n / total
                fill.color = if (curfew) 0xFF2E3A78.toInt() else color
                fill.alpha = if (curfew) 110 else 95
                c.drawRect(RectF(x, top, x + bw, h), fill)
                x += bw
            }
            // The fill's top edge, a little brighter, and the line of numbers above it.
            fill.color = if (curfew) 0xFF7D8CFF.toInt() else Color.WHITE; fill.alpha = 70
            c.drawRect(RectF(0f, top, w, top + h * 0.003f), fill)
            text.textSize = w * 0.035f
            val goal = today?.optInt("goal") ?: 0; val earned = today?.optInt("earned") ?: 0; val streak = today?.optInt("streak") ?: 0
            val line = buildString {
                append("$bank of $limit in the Bank")
                if (goal > 0) append("  ·  today $earned of $goal")
                if (streak > 0) append("  ·  $streak day streak")
                if (curfew) append("  ·  Curfew")
            }
            c.drawText(line, w * 0.06f, top - h * 0.015f, text)
        }
    }
}
