package net.trackit.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HealthRecordAdapterRegistryTest {
    @Test
    fun `every supported Health Connect record type has exactly one adapter`() {
        val adapterTypes = HealthRecordAdapterRegistry.adapters.map { it.type }
        val supportedTypes = HealthRecordAdapterRegistry.supportedRecordTypes

        assertEquals(adapterTypes.toSet(), supportedTypes.toSet())
        assertEquals(adapterTypes.size, adapterTypes.distinct().size)
        assertTrue(adapterTypes.all { !it.simpleName.isNullOrBlank() })
    }
}
