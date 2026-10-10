package io.github.comprehensivejason.voucher

import android.util.Base64
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * The Android side's own small Ledger client. The Enforcer runs in a service
 * without the interface, so it can't borrow the Rust client.
 */
object LedgerClient {
    private fun open(c: Connection, path: String, method: String): HttpURLConnection =
        (URL(c.url + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 5000
            readTimeout = 5000
            c.code?.let { setRequestProperty("Authorization", "Bearer $it") }
        }

    fun get(c: Connection, path: String): JSONObject {
        val conn = open(c, path, "GET")
        try {
            if (conn.responseCode != 200) throw IllegalStateException("Ledger answered ${conn.responseCode}")
            return JSONObject(conn.inputStream.bufferedReader().readText())
        } finally {
            conn.disconnect()
        }
    }

    /** A GET whose reply is a JSON array, such as `/history`. */
    fun getArray(c: Connection, path: String): org.json.JSONArray {
        val conn = open(c, path, "GET")
        try {
            if (conn.responseCode != 200) throw IllegalStateException("Ledger answered ${conn.responseCode}")
            return org.json.JSONArray(conn.inputStream.bufferedReader().readText())
        } finally {
            conn.disconnect()
        }
    }

    /** POSTs and returns the status code, so refusals (409) can be told apart. */
    fun post(c: Connection, path: String, body: JSONObject? = null): Int {
        val conn = open(c, path, "POST")
        try {
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val code = conn.responseCode
            runCatching { (if (code < 400) conn.inputStream else conn.errorStream)?.close() }
            return code
        } finally {
            conn.disconnect()
        }
    }

    private fun b64url(s: String): ByteArray = Base64.decode(s, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

    /**
     * Checks an Unlock's `<payload>.<signature>` against the Ledger's public
     * key, as voucher-protocol does, and returns its end in Unix seconds if
     * it is genuine and still running. Anything doubtful returns null, which
     * means blocked.
     */
    fun verifyUnlock(wire: String, publicKey: String, nowSeconds: Long): Long? = try {
        val (payload, signature) = wire.split('.').let { it[0] to it[1] }
        val key = b64url(publicKey)
        val payloadBytes = b64url(payload)
        val sig = b64url(signature)
        // BouncyCastle's plain Ed25519, not the platform's: on Android the
        // platform hands Ed25519 keys to the hardware Keystore, which refuses
        // to import a raw public key.
        val ok = key.size == 32 && sig.size == 64 &&
            org.bouncycastle.math.ec.rfc8032.Ed25519.verify(sig, 0, key, 0, payloadBytes, 0, payloadBytes.size)
        val endsAt = JSONObject(String(payloadBytes)).getLong("ends_at")
        if (ok && nowSeconds < endsAt) endsAt else null
    } catch (e: Exception) {
        android.util.Log.w("VoucherLedger", "Unlock not accepted: $e")
        null
    }
}
