/**
 * Enhanced ESP32-CAM Web Server (Standalone: no camera_pins.h required)
 *
 * Features:
 *  - MJPEG streaming (/stream) with dynamic resolution via ?quality=vga|xga|uxga...
 *  - Single frame capture (/capture) returns JPEG
 *  - Health endpoint (/health) JSON: uptime, heap, psram, RSSI, framesize, resolution
 *  - Runtime sensor tuning (/config?framesize=...&quality=...&brightness=... etc.)
 *  - Optional API key protection (X-API-Key)
 *  - Optional flash LED control (/flash?on=1 or /flash?duty=0-255)
 *  - CORS headers for easy integration with dashboards
 *
 * Board: AI Thinker ESP32-CAM (OV2640)
 * FQBN: esp32:esp32:esp32cam
 */

#include "esp_camera.h"
#include <WiFi.h>
#include "esp_timer.h"
#include "esp_system.h"
#include "img_converters.h"
#include "esp_http_server.h"
#include "fb_gfx.h"
#include "driver/rtc_io.h"

/* -------------------------------------------------------------------------- */
/*                       CAMERA MODEL & PIN DEFINITIONS                       */
/* -------------------------------------------------------------------------- */
#define CAMERA_MODEL_AI_THINKER   // Set model (only AI Thinker implemented below)

#if defined(CAMERA_MODEL_AI_THINKER)
// AI Thinker pin mapping (OV2640)
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27

#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

#define LED_GPIO_NUM       4   // Flash LED (white)
#else
#error "Unsupported camera model. Please define pin mappings for your board."
#endif

/* -------------------------------------------------------------------------- */
/*                           WIFI CONFIGURATION                               */
/* -------------------------------------------------------------------------- */
#define WIFI_SSID       "Mekesh"
#define WIFI_PASSWORD   "12345678"

// Uncomment to use static IP
// #define USE_STATIC_IP
#ifdef USE_STATIC_IP
IPAddress local_IP(10, 54, 239, 221);
IPAddress gateway(10, 54, 239, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress dns(8, 8, 8, 8);
#endif

/* -------------------------------------------------------------------------- */
/*                       OPTIONAL API KEY PROTECTION                          */
/* -------------------------------------------------------------------------- */
#define REQUIRE_API_KEY 0
#define API_KEY_VALUE   "SECRET_API_KEY_12345"

/* -------------------------------------------------------------------------- */
/*                          SERVER/STREAM SETTINGS                            */
/* -------------------------------------------------------------------------- */
#define STREAM_BOUNDARY "frame"
#define DEFAULT_BOOT_FRAMESIZE FRAMESIZE_QVGA   // Quick initial stream
#define DEFAULT_JPEG_QUALITY   10               // (2=highest quality, larger size)
#define DEFAULT_FB_COUNT       2

/* -------------------------------------------------------------------------- */
/*                        FLASH / LED CONTROL                                 */
/* -------------------------------------------------------------------------- */
#define FLASH_ENABLE 1
#define FLASH_DUTY_MAX 255

/* -------------------------------------------------------------------------- */
/*                               GLOBAL STATE                                 */
/* -------------------------------------------------------------------------- */
static httpd_handle_t httpd_server = NULL;
static sensor_t *g_sensor = nullptr;

/* -------------------------------------------------------------------------- */
/*                             FRAME SIZE TABLE                               */
/* -------------------------------------------------------------------------- */
struct FrameSizeMap {
  const char *name;
  framesize_t fs;
  uint16_t w;
  uint16_t h;
};

static const FrameSizeMap FRAME_SIZES[] = {
  {"qqvga",  FRAMESIZE_QQVGA,   160, 120},
  {"qvga",   FRAMESIZE_QVGA,    320, 240},
  {"vga",    FRAMESIZE_VGA,     640, 480},
  {"svga",   FRAMESIZE_SVGA,    800, 600},
  {"xga",    FRAMESIZE_XGA,    1024, 768},
  {"sxga",   FRAMESIZE_SXGA,   1280,1024},
  {"uxga",   FRAMESIZE_UXGA,   1600,1200},
  {"hd",     FRAMESIZE_HD,     1280, 720},
  {"fhd",    FRAMESIZE_FHD,    1920,1080},
  {"p720",   FRAMESIZE_HD,     1280, 720},
  {"p1080",  FRAMESIZE_FHD,    1920,1080}
};

static const FrameSizeMap* lookupFrameSize(const char *name) {
  if (!name) return nullptr;
  for (auto &fs : FRAME_SIZES) {
    if (strcasecmp(fs.name, name) == 0) return &fs;
  }
  return nullptr;
}

static const FrameSizeMap* infoFor(framesize_t fs) {
  for (auto &f : FRAME_SIZES) {
    if (f.fs == fs) return &f;
  }
  return nullptr;
}

/* -------------------------------------------------------------------------- */
/*                            API KEY VALIDATION                              */
/* -------------------------------------------------------------------------- */
static bool check_api_key(httpd_req_t *req) {
#if REQUIRE_API_KEY
  size_t len = httpd_req_get_hdr_value_len(req, "X-API-Key");
  if (len == 0) return false;
  char *buf = (char *)malloc(len + 1);
  if (!buf) return false;
  if (httpd_req_get_hdr_value_str(req, "X-API-Key", buf, len + 1) != ESP_OK) {
    free(buf);
    return false;
  }
  bool ok = (strcmp(buf, API_KEY_VALUE) == 0);
  free(buf);
  return ok;
#else
  (void)req;
  return true;
#endif
}

/* -------------------------------------------------------------------------- */
/*                         COMMON RESPONSE HELPERS                            */
/* -------------------------------------------------------------------------- */
static void set_cors(httpd_req_t *req) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET,OPTIONS");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "X-Requested-With,Content-Type,Accept,X-API-Key");
  httpd_resp_set_hdr(req, "Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
}

static esp_err_t options_handler(httpd_req_t *req) {
  set_cors(req);
  httpd_resp_sendstr(req, "OK");
  return ESP_OK;
}

/* -------------------------------------------------------------------------- */
/*                           QUERY PARAM HELPERS                              */
/* -------------------------------------------------------------------------- */
static bool get_query_param(httpd_req_t *req, const char *key, char *out, size_t len) {
  size_t qlen = httpd_req_get_url_query_len(req) + 1;
  if (qlen <= 1) return false;
  char *buf = (char *)malloc(qlen);
  if (!buf) return false;
  if (httpd_req_get_url_query_str(req, buf, qlen) != ESP_OK) {
    free(buf);
    return false;
  }
  bool found = (httpd_query_key_value(buf, key, out, len) == ESP_OK);
  free(buf);
  return found;
}

static framesize_t parse_framesize_query(httpd_req_t *req) {
  char val[16];
  if (get_query_param(req, "quality", val, sizeof(val))) {
    const FrameSizeMap *info = lookupFrameSize(val);
    if (info) return info->fs;
  }
  return g_sensor ? g_sensor->status.framesize : DEFAULT_BOOT_FRAMESIZE;
}

/* -------------------------------------------------------------------------- */
/*                               /health HANDLER                              */
/* -------------------------------------------------------------------------- */
static esp_err_t health_handler(httpd_req_t *req) {
  if (!check_api_key(req)) {
    httpd_resp_set_status(req, "401 Unauthorized");
    httpd_resp_sendstr(req, "API key required");
    return ESP_OK;
  }
  set_cors(req);

  framesize_t fs = g_sensor ? g_sensor->status.framesize : FRAMESIZE_QVGA;
  const FrameSizeMap *info = infoFor(fs);

  char json[512];
  snprintf(json, sizeof(json),
           "{"
           "\"uptime_ms\":%llu,"
           "\"free_heap\":%u,"
           "\"free_psram\":%u,"
           "\"framesize\":\"%s\","
           "\"width\":%u,"
           "\"height\":%u,"
           "\"rssi\":%d,"
           "\"ip\":\"%s\""
           "}",
           (unsigned long long)(esp_timer_get_time() / 1000ULL),
           esp_get_free_heap_size(),
           heap_caps_get_free_size(MALLOC_CAP_SPIRAM),
           info ? info->name : "unknown",
           info ? info->w : 0,
           info ? info->h : 0,
           WiFi.RSSI(),
           WiFi.localIP().toString().c_str());

  httpd_resp_set_type(req, "application/json");
  httpd_resp_sendstr(req, json);
  return ESP_OK;
}

/* -------------------------------------------------------------------------- */
/*                              /capture HANDLER                              */
/* -------------------------------------------------------------------------- */
static esp_err_t capture_handler(httpd_req_t *req) {
  if (!check_api_key(req)) {
    httpd_resp_set_status(req, "401 Unauthorized");
    httpd_resp_sendstr(req, "API key required");
    return ESP_OK;
  }
  set_cors(req);

  framesize_t requested = parse_framesize_query(req);
  if (g_sensor && requested != g_sensor->status.framesize) {
    g_sensor->set_framesize(g_sensor, requested);
  }

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    httpd_resp_set_status(req, "500 Internal Server Error");
    httpd_resp_sendstr(req, "Capture failed");
    return ESP_FAIL;
  }

  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
  esp_err_t res = httpd_resp_send(req, (const char *)fb->buf, fb->len);
  esp_camera_fb_return(fb);
  return res;
}

/* -------------------------------------------------------------------------- */
/*                               /stream HANDLER                              */
/* -------------------------------------------------------------------------- */
static esp_err_t stream_handler(httpd_req_t *req) {
  if (!check_api_key(req)) {
    httpd_resp_set_status(req, "401 Unauthorized");
    httpd_resp_sendstr(req, "API key required");
    return ESP_OK;
  }
  set_cors(req);

  framesize_t requested = parse_framesize_query(req);
  if (g_sensor && requested != g_sensor->status.framesize) {
    g_sensor->set_framesize(g_sensor, requested);
  }

  char part[64];
  snprintf(part, sizeof(part), "--%s\r\n", STREAM_BOUNDARY);
  httpd_resp_set_type(req, "multipart/x-mixed-replace;boundary=" STREAM_BOUNDARY);

  while (true) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("[STREAM] Frame capture failed");
      continue;
    }

    if (fb->format != PIXFORMAT_JPEG) {
      uint8_t *jpeg_buf = nullptr;
      size_t jpeg_len = 0;
      bool ok = frame2jpg(fb, 80, &jpeg_buf, &jpeg_len);
      esp_camera_fb_return(fb);
      if (!ok) {
        Serial.println("[STREAM] JPEG conversion failed");
        continue;
      }
      char hdr[128];
      int hlen = snprintf(hdr, sizeof(hdr),
                          "Content-Type: image/jpeg\r\n"
                          "Content-Length: %u\r\n\r\n",
                          (unsigned)jpeg_len);
      httpd_resp_send_chunk(req, part, strlen(part));
      httpd_resp_send_chunk(req, hdr, hlen);
      httpd_resp_send_chunk(req, (const char *)jpeg_buf, jpeg_len);
      httpd_resp_send_chunk(req, "\r\n", 2);
      free(jpeg_buf);
    } else {
      char hdr[128];
      int hlen = snprintf(hdr, sizeof(hdr),
                          "Content-Type: image/jpeg\r\n"
                          "Content-Length: %u\r\n\r\n",
                          (unsigned)fb->len);
      httpd_resp_send_chunk(req, part, strlen(part));
      httpd_resp_send_chunk(req, hdr, hlen);
      httpd_resp_send_chunk(req, (const char *)fb->buf, fb->len);
      httpd_resp_send_chunk(req, "\r\n", 2);
      esp_camera_fb_return(fb);
    }

    // Optional throttle
    // vTaskDelay(1);
  }

  return ESP_OK; // Unreachable
}

/* -------------------------------------------------------------------------- */
/*                         /config (runtime tuning)                           */
/* -------------------------------------------------------------------------- */
static void apply_sensor_param(sensor_t *s, const char *key, const char *val) {
  if (!s || !key || !val) return;
  int ival = atoi(val);
  if (strcmp(key, "framesize") == 0) {
    const FrameSizeMap *fs = lookupFrameSize(val);
    if (fs) s->set_framesize(s, fs->fs);
  } else if (strcmp(key, "quality") == 0) {
    s->set_quality(s, ival);
  } else if (strcmp(key, "brightness") == 0) {
    s->set_brightness(s, ival);
  } else if (strcmp(key, "contrast") == 0) {
    s->set_contrast(s, ival);
  } else if (strcmp(key, "saturation") == 0) {
    s->set_saturation(s, ival);
  } else if (strcmp(key, "hmirror") == 0) {
    s->set_hmirror(s, ival);
  } else if (strcmp(key, "vflip") == 0) {
    s->set_vflip(s, ival);
  } else if (strcmp(key, "awb") == 0) {
    s->set_whitebal(s, ival);
  } else if (strcmp(key, "agc") == 0) {
    s->set_gain_ctrl(s, ival);
  } else if (strcmp(key, "aec") == 0) {
    s->set_aec2(s, ival);
  }
}

static esp_err_t config_handler(httpd_req_t *req) {
  if (!check_api_key(req)) {
    httpd_resp_set_status(req, "401 Unauthorized");
    httpd_resp_sendstr(req, "API key required");
    return ESP_OK;
  }
  set_cors(req);

  if (!g_sensor) {
    httpd_resp_set_status(req, "500 Internal Server Error");
    httpd_resp_sendstr(req, "Sensor not ready");
    return ESP_OK;
  }

  size_t qlen = httpd_req_get_url_query_len(req) + 1;
  if (qlen > 1) {
    char *buf = (char *)malloc(qlen);
    if (buf && httpd_req_get_url_query_str(req, buf, qlen) == ESP_OK) {
      // parse potential keys
      char val[16];
      const char *keys[] = {
        "framesize","quality","brightness","contrast","saturation",
        "hmirror","vflip","awb","agc","aec"
      };
      for (auto &k : keys) {
        if (httpd_query_key_value(buf, k, val, sizeof(val)) == ESP_OK) {
          apply_sensor_param(g_sensor, k, val);
        }
      }
    }
    if (buf) free(buf);
  }

  framesize_t fs = g_sensor->status.framesize;
  const FrameSizeMap *info = infoFor(fs);
  char resp[256];
  snprintf(resp, sizeof(resp),
           "{"
           "\"framesize\":\"%s\","
           "\"quality\":%d,"
           "\"brightness\":%d,"
           "\"contrast\":%d,"
           "\"saturation\":%d,"
           "\"hmirror\":%d,"
           "\"vflip\":%d"
           "}",
           info ? info->name : "unknown",
           g_sensor->status.quality,
           g_sensor->status.brightness,
           g_sensor->status.contrast,
           g_sensor->status.saturation,
           g_sensor->status.hmirror,
           g_sensor->status.vflip);

  httpd_resp_set_type(req, "application/json");
  httpd_resp_sendstr(req, resp);
  return ESP_OK;
}

/* -------------------------------------------------------------------------- */
/*                               /flash HANDLER                               */
/* -------------------------------------------------------------------------- */
static esp_err_t flash_handler(httpd_req_t *req) {
#if !FLASH_ENABLE
  httpd_resp_set_status(req, "404 Not Found");
  httpd_resp_sendstr(req, "Flash not available");
  return ESP_OK;
#else
  if (!check_api_key(req)) {
    httpd_resp_set_status(req, "401 Unauthorized");
    httpd_resp_sendstr(req, "API key required");
    return ESP_OK;
  }
  set_cors(req);

  char onVal[8];
  char dutyVal[8];
  bool updated = false;

  if (get_query_param(req, "on", onVal, sizeof(onVal))) {
    int on = atoi(onVal);
    digitalWrite(LED_GPIO_NUM, on ? HIGH : LOW);
    updated = true;
  }
  if (get_query_param(req, "duty", dutyVal, sizeof(dutyVal))) {
    int duty = atoi(dutyVal);
    duty = constrain(duty, 0, FLASH_DUTY_MAX);
    digitalWrite(LED_GPIO_NUM, duty > 0 ? HIGH : LOW);
    updated = true;
  }

  char resp[64];
  snprintf(resp, sizeof(resp),
           "{ \"flash\":\"%s\", \"updated\":%s }",
           digitalRead(LED_GPIO_NUM) ? "on" : "off",
           updated ? "true" : "false");
  httpd_resp_set_type(req, "application/json");
  httpd_resp_sendstr(req, resp);
  return ESP_OK;
#endif
}

/* -------------------------------------------------------------------------- */
/*                             SERVER REGISTRATION                            */
/* -------------------------------------------------------------------------- */
void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  config.max_uri_handlers = 16;
  config.recv_wait_timeout = 10;
  config.send_wait_timeout = 10;

  if (httpd_start(&httpd_server, &config) == ESP_OK) {
    httpd_uri_t health_uri = {
      .uri = "/health",
      .method = HTTP_GET,
      .handler = health_handler,
      .user_ctx = NULL
    };
    httpd_uri_t capture_uri = {
      .uri = "/capture",
      .method = HTTP_GET,
      .handler = capture_handler,
      .user_ctx = NULL
    };
    httpd_uri_t stream_uri = {
      .uri = "/stream",
      .method = HTTP_GET,
      .handler = stream_handler,
      .user_ctx = NULL
    };
    httpd_uri_t config_uri = {
      .uri = "/config",
      .method = HTTP_GET,
      .handler = config_handler,
      .user_ctx = NULL
    };
    httpd_uri_t flash_uri = {
      .uri = "/flash",
      .method = HTTP_GET,
      .handler = flash_handler,
      .user_ctx = NULL
    };
    httpd_uri_t options_uri = {
      .uri = "/*",
      .method = HTTP_OPTIONS,
      .handler = options_handler,
      .user_ctx = NULL
    };

    httpd_register_uri_handler(httpd_server, &health_uri);
    httpd_register_uri_handler(httpd_server, &capture_uri);
    httpd_register_uri_handler(httpd_server, &stream_uri);
    httpd_register_uri_handler(httpd_server, &config_uri);
    httpd_register_uri_handler(httpd_server, &flash_uri);
    httpd_register_uri_handler(httpd_server, &options_uri);

    Serial.println("[HTTPD] Server started on port 80");
  } else {
    Serial.println("[HTTPD] Failed to start server");
  }
}

/* -------------------------------------------------------------------------- */
/*                                   SETUP                                    */
/* -------------------------------------------------------------------------- */
void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("ESP32-CAM Initializing...");

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
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size   = FRAMESIZE_UXGA;
  config.jpeg_quality = DEFAULT_JPEG_QUALITY;
  config.fb_count     = DEFAULT_FB_COUNT;
  config.grab_mode    = CAMERA_GRAB_WHEN_EMPTY;
  config.fb_location  = CAMERA_FB_IN_PSRAM;

  if (psramFound()) {
    Serial.println("PSRAM detected: enabling double buffers.");
    config.fb_count  = 2;
    config.grab_mode = CAMERA_GRAB_LATEST;
  } else {
    Serial.println("No PSRAM: reducing frame size and buffers.");
    config.frame_size  = FRAMESIZE_SVGA;
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.fb_count    = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed 0x%x\n", err);
    return;
  }

  g_sensor = esp_camera_sensor_get();
  if (g_sensor && g_sensor->id.PID == OV3660_PID) {
    g_sensor->set_vflip(g_sensor, 1);
    g_sensor->set_brightness(g_sensor, 1);
    g_sensor->set_saturation(g_sensor, -2);
  }

  if (g_sensor) {
    g_sensor->set_framesize(g_sensor, DEFAULT_BOOT_FRAMESIZE);
  }

#if FLASH_ENABLE
  pinMode(LED_GPIO_NUM, OUTPUT);
  digitalWrite(LED_GPIO_NUM, LOW);
#endif

  Serial.println("Connecting WiFi...");
#ifdef USE_STATIC_IP
  if (!WiFi.config(local_IP, gateway, subnet, dns, dns)) {
    Serial.println("Static IP config failed, falling back to DHCP...");
  }
#endif
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  WiFi.setSleep(false);

  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (millis() - t0 > 30000) {
      Serial.println("\nWiFi timeout, restarting...");
      ESP.restart();
    }
  }

  Serial.printf("\nWiFi connected: %s (RSSI %d dBm)\n",
                WiFi.localIP().toString().c_str(), WiFi.RSSI());

  startCameraServer();
  Serial.println("Camera Ready!");
  Serial.printf("Stream:  http://%s/stream\n",  WiFi.localIP().toString().c_str());
  Serial.printf("Capture: http://%s/capture\n", WiFi.localIP().toString().c_str());
  Serial.printf("Health:  http://%s/health\n",  WiFi.localIP().toString().c_str());
  Serial.printf("Config:  http://%s/config\n",  WiFi.localIP().toString().c_str());
#if FLASH_ENABLE
  Serial.printf("Flash:   http://%s/flash?on=1\n", WiFi.localIP().toString().c_str());
#endif
}

/* -------------------------------------------------------------------------- */
/*                                    LOOP                                    */
/* -------------------------------------------------------------------------- */
void loop() {
  delay(10000); // Server handles everything asynchronously
}