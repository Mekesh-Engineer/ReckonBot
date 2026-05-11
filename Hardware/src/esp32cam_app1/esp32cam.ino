#include "esp_camera.h"
#include <WiFi.h>

// ===========================
// Select camera model in board_config.h
// ===========================
#include "board_config.h"

// ===========================
// Secure WiFi Credentials
// ===========================
// DO NOT hardcode credentials here. Use secrets.h which is ignored in Git.
#if __has_include("secrets.h")
  #include "secrets.h"
#else
  const char *ssid     = "YOUR_SSID_HERE";
  const char *password = "YOUR_PASSWORD_HERE";
#endif

/*
  ------------------------------------------------------------------
  Bot 1 ESP32-CAM - Enhanced Dashboard Integration Firmware
  ------------------------------------------------------------------
  This version works with the existing app_httpd.cpp file
  
  Features:
  - MJPEG streaming at /stream (optimized for 15-20 FPS)
  - Works with existing camera server implementation
  - VGA resolution default (640x480) for performance
  - Auto-reconnect WiFi capability
  - Comprehensive diagnostics
  
  SETUP STEPS:
  1. Update WiFi credentials below
  2. Enable static IP (recommended for production)
  3. Upload to ESP32-CAM
  4. Note IP address from Serial Monitor (115200 baud)
  5. Update bot1.js with: CAMERA_STREAM_BASE = 'http://<IP>'
  6. Access stream: http://<IP>/stream
*/

// ===========================
// Camera Performance Settings
// ===========================
#define TARGET_FRAME_SIZE    FRAMESIZE_VGA      // 640x480 - good balance
#define TARGET_JPEG_QUALITY  12                 // 10-63, lower=better
#define TARGET_FB_COUNT      2                  // Double buffering

// Forward declarations (functions defined in app_httpd.cpp)
void startCameraServer();
void setupLedFlash();

// Function prototypes
void printNetworkInfo();
void optimizeCameraSensor();

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  Serial.println();
  Serial.println(F("========================================"));
  Serial.println(F("  ESP32-CAM Bot1 v2.0"));
  Serial.println(F("  Dashboard Integration Firmware"));
  Serial.println(F("========================================"));

  // ===========================
  // Camera Configuration
  // ===========================
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.frame_size   = TARGET_FRAME_SIZE;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode    = CAMERA_GRAB_LATEST;  // Always get latest frame
  config.fb_location  = CAMERA_FB_IN_PSRAM;
  config.jpeg_quality = TARGET_JPEG_QUALITY;
  config.fb_count     = TARGET_FB_COUNT;

  // Optimize based on PSRAM availability
  if (psramFound()) {
    Serial.println(F("[Camera] PSRAM detected"));
    config.jpeg_quality = 10;  // High quality
    config.fb_count = 2;       // Double buffering
    Serial.printf("[Camera] Target: %s @ Q%d, %d buffers\n", 
                  "VGA", config.jpeg_quality, config.fb_count);
  } else {
    Serial.println(F("[Camera] WARNING: No PSRAM detected"));
    config.frame_size = FRAMESIZE_SVGA;
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.fb_count = 1;
    Serial.println(F("[Camera] Using reduced settings"));
  }

#if defined(CAMERA_MODEL_ESP_EYE)
  pinMode(13, INPUT_PULLUP);
  pinMode(14, INPUT_PULLUP);
#endif

  // Initialize camera
  Serial.println(F("[Camera] Initializing..."));
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[Camera] INITIALIZATION FAILED! Error: 0x%x\n", err);
    Serial.println(F("[Camera] Check connections and power, then restart"));
    while(1) { delay(1000); }  // Halt on critical failure
  }
  Serial.println(F("[Camera] ✓ Initialized successfully"));

  // ===========================
  // Sensor Optimization
  // ===========================
  optimizeCameraSensor();

#if defined(LED_GPIO_NUM)
  setupLedFlash();
  Serial.println(F("[LED] ✓ Flash initialized"));
#endif

  // ===========================
  // WiFi Connection
  // ===========================
  Serial.println(F("========================================"));
  Serial.println(F("[WiFi] Initializing connection..."));
  Serial.printf("[WiFi] SSID: %s\n", ssid);

#ifdef BOT1_USE_STATIC_IP
  Serial.println(F("[WiFi] Configuring STATIC IP..."));
  if (!WiFi.config(BOT1_LOCAL_IP, BOT1_GATEWAY, BOT1_SUBNET, BOT1_DNS)) {
    Serial.println(F("[WiFi] ⚠ Static IP config failed, using DHCP"));
  } else {
    Serial.print(F("[WiFi] Static IP set: "));
    Serial.println(BOT1_LOCAL_IP);
  }
#else
  Serial.println(F("[WiFi] Using DHCP (dynamic IP)"));
#endif

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // Critical for streaming performance
  WiFi.begin(ssid, password);

  Serial.print(F("[WiFi] Connecting"));
  uint32_t startAttempt = millis();
  int dots = 0;
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    dots++;
    
    if (dots % 10 == 0) {
      Serial.printf(" %ds", (millis() - startAttempt) / 1000);
    }
    
    if (millis() - startAttempt > 30000) {
      Serial.println(F("\n[WiFi] ✗ CONNECTION TIMEOUT"));
      Serial.println(F("\n[Troubleshooting]"));
      Serial.println(F("  ✓ Verify SSID and password"));
      Serial.println(F("  ✓ Check router is powered and in range"));
      Serial.println(F("  ✓ Ensure 2.4GHz WiFi (not 5GHz)"));
      Serial.println(F("  ✓ Check for MAC filtering on router"));
      Serial.println(F("\n[System] Restarting in 5 seconds..."));
      delay(5000);
      ESP.restart();
    }
  }

  Serial.println();
  printNetworkInfo();

  // ===========================
  // Start Camera Web Server
  // ===========================
  Serial.println(F("========================================"));
  Serial.println(F("[Server] Starting HTTP services..."));
  startCameraServer();

  // Final status report
  Serial.println(F("========================================"));
  Serial.println(F("  ✓ BOT1 CAMERA SYSTEM ONLINE"));
  Serial.println(F("========================================"));
  Serial.println(F("\n📹 STREAM ENDPOINTS:"));
  Serial.print(F("   MJPEG Stream:  http://"));
  Serial.print(WiFi.localIP());
  Serial.println(F("/stream"));
  Serial.print(F("   Single Frame:  http://"));
  Serial.print(WiFi.localIP());
  Serial.println(F("/capture"));
  
  Serial.println(F("\n⚙️  DASHBOARD SETUP:"));
  Serial.println(F("   1. Copy the IP address above"));
  Serial.println(F("   2. Update bot1.js with:"));
  Serial.print(F("      CAMERA_STREAM_BASE = 'http://"));
  Serial.print(WiFi.localIP());
  Serial.println(F("'"));
  Serial.println(F("   3. Switch dashboard to Live Mode"));
  Serial.println(F("   4. Stream should appear automatically"));
  
  Serial.println(F("\n📊 PERFORMANCE:"));
  Serial.printf("   Resolution:    %s (640x480)\n", "VGA");
  Serial.printf("   JPEG Quality:  %d (lower=better)\n", TARGET_JPEG_QUALITY);
  Serial.printf("   Target FPS:    15-20 fps\n");
  Serial.printf("   PSRAM:         %s\n", psramFound() ? "Yes" : "No");
  Serial.printf("   Free Heap:     %d KB\n", ESP.getFreeHeap() / 1024);
  Serial.printf("   PSRAM Free:    %d KB\n", ESP.getFreePsram() / 1024);
  
  Serial.println(F("========================================\n"));
}

void loop() {
  // Monitor WiFi connection and auto-reconnect if needed
  static unsigned long lastCheck = 0;
  unsigned long now = millis();
  
  if (now - lastCheck > 10000) {  // Check every 10 seconds
    lastCheck = now;
    
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println(F("[WiFi] Connection lost! Reconnecting..."));
      WiFi.disconnect();
      WiFi.reconnect();
      
      int attempts = 0;
      while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
      }
      
      if (WiFi.status() == WL_CONNECTED) {
        Serial.println(F("\n[WiFi] ✓ Reconnected"));
        Serial.print(F("[WiFi] IP: "));
        Serial.println(WiFi.localIP());
      } else {
        Serial.println(F("\n[WiFi] ✗ Reconnection failed, restarting..."));
        delay(1000);
        ESP.restart();
      }
    }
  }
  
  delay(100);  // Minimal delay, server handles everything
}

// ===========================
// Helper Functions
// ===========================

void optimizeCameraSensor() {
  sensor_t *s = esp_camera_sensor_get();
  if (s == NULL) {
    Serial.println(F("[Camera] ERROR: Failed to get sensor"));
    return;
  }

  Serial.println(F("[Camera] Applying optimizations..."));
  
  // Set target frame size (VGA for dashboard)
  s->set_framesize(s, TARGET_FRAME_SIZE);
  s->set_quality(s, TARGET_JPEG_QUALITY);
  
  // Model-specific adjustments
  if (s->id.PID == OV3660_PID) {
    s->set_vflip(s, 1);
    s->set_brightness(s, 1);
    s->set_saturation(s, 0);
    Serial.println(F("[Camera] OV3660 sensor configured"));
  } else if (s->id.PID == OV2640_PID) {
    // OV2640 - most common in AI Thinker
    s->set_brightness(s, 0);     // -2 to 2
    s->set_contrast(s, 0);       // -2 to 2
    s->set_saturation(s, 0);     // -2 to 2
    s->set_special_effect(s, 0); // 0=None
    s->set_whitebal(s, 1);       // Enable white balance
    s->set_awb_gain(s, 1);       // Enable auto white balance gain
    s->set_wb_mode(s, 0);        // 0=Auto
    s->set_exposure_ctrl(s, 1);  // Enable AEC
    s->set_aec2(s, 0);           // Disable AEC DSP
    s->set_ae_level(s, 0);       // -2 to 2
    s->set_aec_value(s, 300);    // 0 to 1200
    s->set_gain_ctrl(s, 1);      // Enable AGC
    s->set_agc_gain(s, 0);       // 0 to 30
    s->set_gainceiling(s, (gainceiling_t)0); // 0 to 6
    s->set_bpc(s, 0);            // Disable black pixel correction
    s->set_wpc(s, 1);            // Enable white pixel correction
    s->set_raw_gma(s, 1);        // Enable gamma correction
    s->set_lenc(s, 1);           // Enable lens correction
    s->set_hmirror(s, 0);        // Horizontal mirror
    s->set_vflip(s, 0);          // Vertical flip
    s->set_dcw(s, 1);            // Enable downsize
    s->set_colorbar(s, 0);       // Disable color bar test pattern
    Serial.println(F("[Camera] OV2640 sensor optimized for streaming"));
  }

#if defined(CAMERA_MODEL_M5STACK_WIDE) || defined(CAMERA_MODEL_M5STACK_ESP32CAM)
  s->set_vflip(s, 1);
  s->set_hmirror(s, 1);
#endif
#if defined(CAMERA_MODEL_ESP32S3_EYE)
  s->set_vflip(s, 1);
#endif

  Serial.println(F("[Camera] ✓ All optimizations applied"));
}

void printNetworkInfo() {
  Serial.println(F("[WiFi] ✓ Connected successfully!"));
  Serial.println(F("========================================"));
  Serial.print(F("[Network] IP Address:    "));
  Serial.println(WiFi.localIP());
  Serial.print(F("[Network] Gateway:       "));
  Serial.println(WiFi.gatewayIP());
  Serial.print(F("[Network] Subnet:        "));
  Serial.println(WiFi.subnetMask());
  Serial.print(F("[Network] DNS:           "));
  Serial.println(WiFi.dnsIP());
  Serial.print(F("[Network] MAC Address:   "));
  Serial.println(WiFi.macAddress());
  Serial.print(F("[Network] Signal (RSSI): "));
  Serial.print(WiFi.RSSI());
  Serial.println(F(" dBm"));
  Serial.println(F("========================================"));
}