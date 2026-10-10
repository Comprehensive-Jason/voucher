package io.github.comprehensivejason.voucher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SitesTest {
    @Test
    fun hostFromAddressBarText() {
        assertEquals("youtube.com", Sites.host("youtube.com/watch?v=abc"))
        assertEquals("youtube.com", Sites.host("https://www.youtube.com/"))
        assertEquals("m.youtube.com", Sites.host("HTTPS://M.YouTube.com"))
        assertEquals("example.com", Sites.host("http://user@example.com:8080/a#b"))
        assertEquals("example.com", Sites.host(" example.com. "))
        assertEquals("192.168.1.1", Sites.host("192.168.1.1/admin"))
    }

    @Test
    fun noHostForSearchesAndBrowserPages() {
        assertNull(Sites.host(null))
        assertNull(Sites.host(""))
        assertNull(Sites.host("Search or type web address"))
        assertNull(Sites.host("cats"))
        assertNull(Sites.host("chrome://newtab"))
        assertNull(Sites.host("brave://settings"))
        assertNull(Sites.host("about:blank"))
        assertNull(Sites.host("file:///sdcard/a.html"))
    }

    @Test
    fun domainCoversSubdomainsOnly() {
        assertEquals("youtube.com", Sites.match("m.youtube.com", listOf("youtube.com")))
        assertEquals("youtube.com", Sites.match("youtube.com", listOf("youtube.com")))
        assertNull(Sites.match("notyoutube.com", listOf("youtube.com")))
        assertEquals("docs.google.com", Sites.match("docs.google.com", listOf("google.com", "docs.google.com")))
        assertEquals("youtube.com", Sites.domain("site:youtube.com"))
        assertNull(Sites.domain("com.android.chrome"))
    }

    private fun spans(marks: List<Sites.Mark>, start: Long, end: Long): List<Triple<String, Long, Long>> {
        val out = mutableListOf<Triple<String, Long, Long>>()
        Sites.split(marks, start, end) { h, a, b -> out.add(Triple(h, a, b)) }
        return out
    }

    @Test
    fun splitCarriesTheHostInAndCutsAtChanges() {
        val marks = listOf(Sites.Mark(0, "a.com"), Sites.Mark(150, "b.com"), Sites.Mark(170, null), Sites.Mark(300, "c.com"))
        assertEquals(listOf(Triple("a.com", 100L, 150L), Triple("b.com", 150L, 170L)), spans(marks, 100, 200))
        assertEquals(listOf(Triple("c.com", 310L, 400L)), spans(marks, 310, 400))
        assertEquals(emptyList<Triple<String, Long, Long>>(), spans(marks, 180, 290))
        assertEquals(emptyList<Triple<String, Long, Long>>(), spans(emptyList(), 0, 100))
    }
}
