#ifndef SECRETS_H
#define SECRETS_H

// Replace these with your actual WiFi credentials
const char *ssid     = "Mekesh";
const char *password = "12345678";

// ===========================
// Static IP Configuration (RECOMMENDED)
// ===========================
#define BOT1_USE_STATIC_IP  // Comment out to use DHCP

#ifdef BOT1_USE_STATIC_IP
  IPAddress BOT1_LOCAL_IP(10, 54, 239, 150);  
  IPAddress BOT1_GATEWAY(10, 54, 239, 239);   
  IPAddress BOT1_SUBNET(255, 255, 255, 0);    
  IPAddress BOT1_DNS(10, 54, 239, 239);       
#endif

#endif // SECRETS_H