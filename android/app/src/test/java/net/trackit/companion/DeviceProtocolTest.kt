package net.trackit.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class DeviceProtocolTest {
    @Test
    fun `signed request canonical form matches the server contract`() {
        assertEquals(
            "POST\n/api/device/health-records\n1234\nnonce\nbody-hash\ndevice-1",
            canonicalDeviceRequest(
                method = "post",
                path = "/api/device/health-records",
                timestamp = "1234",
                nonce = "nonce",
                bodyHash = "body-hash",
                deviceId = "device-1",
            ),
        )
    }

    @Test
    fun `sync cursors are isolated by paired device`() {
        val first = syncCursorKey("device-1", "StepsRecord")
        val second = syncCursorKey("device-2", "StepsRecord")

        assertEquals("cursor:device-1:StepsRecord", first)
        assertNotEquals(first, second)
    }
}
