package net.trackit.companion

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

class PermissionsRationaleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        horizontalAlignment = Alignment.Start,
                    ) {
                        Text(
                            text = "Health Connect privacy",
                            style = MaterialTheme.typography.headlineMedium,
                        )

                        Text(
                            text = "TrackIt Companion reads only the Health Connect data types you choose to share so it can synchronize that information with your paired TrackIt server.",
                        )

                        Text(
                            text = "Supported data can include steps, sleep, weight, heart rate, resting heart rate, and exercise sessions.",
                        )

                        Text(
                            text = "Health data is sent only to the TrackIt server you paired with this device. TrackIt Companion does not request write access to Health Connect.",
                        )

                        Text(
                            text = "Background access is optional. If enabled and granted, TrackIt Companion can periodically synchronize newly added or changed Health Connect data while the app is not open.",
                        )

                        Text(
                            text = "You can change or revoke Health Connect access at any time from Health Connect settings.",
                        )

                        Button(onClick = { finish() }) {
                            Text("Close")
                        }
                    }
                }
            }
        }
    }
}
