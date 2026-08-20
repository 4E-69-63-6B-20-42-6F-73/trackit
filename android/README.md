# TrackIt Android companion

The companion targets Android 9+ and uses Jetpack Compose plus the Health Connect client. Pairing
requires the HTTPS server URL, the exact server identity shown by TrackIt, a five-minute one-time
code, confirmation in the web UI, and a device-keystore signing key. Uploads are signed, batched,
idempotent, and use one change cursor per Health Connect record type.

Open this directory in Android Studio and use its bundled Gradle/JDK toolchain. This repository does
not commit generated signing keys. Cleartext HTTP is disabled; for a private CA, install the CA on
the device rather than bypassing certificate validation.

Health Connect permissions are requested only for user-selected categories and must be checked
again before every sync. A revoked permission pauses that category without affecting successful
categories. The first import and expired-token recovery both page through the most recent 30 days,
upload in batches, and deduplicate by Health Connect source ID/version before a new cursor is stored.

Health Connect deletion changes hide the matching TrackIt observation immediately. Because the
Health Connect deletion event contains an ID but no modification version, TrackIt assigns a
permanent tombstone version so replayed upserts cannot resurrect it. The soft-deleted row remains
only for deduplication until observation retention applies or the owner deletes the observations
category or all owner data.
