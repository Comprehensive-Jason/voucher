package io.github.comprehensivejason.voucher

/**
 * The app's color tokens for the parts that don't read CSS: the widget, the
 * live wallpaper, and the notifications. Each mirrors a token in
 * packages/core/src/theme.css (named in its comment), and the swatch defaults and
 * LEGACY mirror packages/core/src/palette.ts, so change them together.
 */
object VoucherColors {
    // Neutrals
    const val GROUND = 0xFF0E0F11.toInt()        // --ground
    const val SURFACE = 0xFF16181B.toInt()       // --surface
    const val LINE = 0xFF2A2E33.toInt()          // --line
    const val FAINT = 0xFF7B8187.toInt()         // --faint
    const val MUTED = 0xFFA3A8AD.toInt()         // --muted
    const val INK_SOFT = 0xFFC9CDD1.toInt()      // --ink-soft
    const val INK = 0xFFF2F2F0.toInt()           // --ink

    // Voucher green and gold
    const val VOUCHER = 0xFF3DDC84.toInt()       // --voucher
    const val VOUCHER_ON = 0xFF07170D.toInt()    // --voucher-on
    const val VOUCHER_WASH = 0xFF192821.toInt()  // --voucher-wash, resolved
    const val GOAL = 0xFFFFB547.toInt()          // --goal

    // Curfew (night)
    const val NIGHT = 0xFF7D8CFF.toInt()         // --night
    const val NIGHT_BG = 0xFF151935.toInt()      // --night-bg
    const val NIGHT_STACK_2 = 0xFF1B2350.toInt() // --night-stack-2
    const val NIGHT_VOUCHER = 0xFF2E3A78.toInt() // --night-voucher
    const val NIGHT_MUTED = 0xFFB8BDE6.toInt()   // --night-muted
    const val NIGHT_INK = 0xFFC9CFFF.toInt()     // --night-ink

    /** Default colors for the sources Voucher ships with (sources.ts SOURCES). */
    val SOURCE_DEFAULTS: Map<String, Int> = mapOf(
        "tasks" to 0xFF289FFB.toInt(),    // Blue
        "obsidian" to 0xFFB57AE2.toInt(), // Violet
        "workout" to 0xFFE2781F.toInt(),  // Orange
        "reading" to 0xFFC1D58A.toInt(),  // Light olive
        "anki" to 0xFFF4B3EC.toInt(),     // Light purple
        "steps" to 0xFF05AFA5.toInt(),    // Teal
    )

    /** Old colors a Ledger may still hold, and the swatch each became (palette.ts LEGACY). */
    private val LEGACY: Map<String, String> = mapOf(
        "#aeccfe" to "#acd6ff", "#9890d0" to "#f698fe",
        "#05736c" to "#088988", "#086e8a" to "#1284a0", "#015189" to "#3c7cb5", "#7a5589" to "#8169a9", "#8e4381" to "#9b6090",
        "#874c69" to "#966973", "#984b00" to "#a5663a", "#5a6c04" to "#737f34", "#616467" to "#75787b",
        "#e5609b" to "#e6688d", "#5bc8ff" to "#7dd9fb", "#9be36d" to "#c1d58a", "#c3a6ff" to "#b57ae2",
        "#7d8cff" to "#d26ec1",
    )

    /** A saved "#rrggbb" as an opaque color, through LEGACY; null when it isn't one. */
    fun parse(hex: String): Int? {
        if (hex.length != 7 || !hex.startsWith("#")) return null
        val now = LEGACY[hex.lowercase()] ?: hex
        return now.substring(1).toLongOrNull(16)?.let { (0xFF000000 or it).toInt() }
    }
}
