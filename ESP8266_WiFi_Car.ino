/*
  Weryt Solutions - ESP8266 Wi-Fi Car (starter firmware)
  Board: NodeMCU ESP8266 / ESP-12E (select the matching board in your build setup)
  Control: phone/laptop connects to the car's Wi-Fi access point, then opens http://192.168.4.1

  Motor-driver assumption:
  - Two L298N modules, one module per side.
  - On each module, connect the two motors for that side in parallel to OUT1/OUT2.
  - Use only channel A on each module; remove the ENA jumper if using PWM speed control.
  - This is a basic example. Verify each driver's current capacity and your motors' stall current.

  Suggested NodeMCU pins:
  Left driver:  ENA=D1 (GPIO5), IN1=D5 (GPIO14), IN2=D6 (GPIO12)
  Right driver: ENA=D2 (GPIO4), IN1=D7 (GPIO13), IN2=D0 (GPIO16)
  Avoid GPIO 0/2/15 (D3/D4/D8) for motor control because they affect ESP8266 boot mode.

  Power:
  - Do NOT power motors from the ESP8266 3.3V pin.
  - Use a suitable motor battery and common ground between ESP8266 and driver logic.
  - L298N has significant voltage drop; check the motor voltage under load.
  - If using a 3S Li-ion pack, use appropriate regulation for the NodeMCU VIN/USB input
    and ensure motor driver, motors, battery protection, wiring and fuse are appropriately rated.
*/

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>

const char* AP_SSID = "Weryt-Car";
const char* AP_PASSWORD = "weryt123"; // Change this before distribution (8+ characters).

ESP8266WebServer server(80);

// Left-side L298N, channel A
const uint8_t LEFT_EN  = D1; // GPIO5, PWM
const uint8_t LEFT_IN1 = D5; // GPIO14
const uint8_t LEFT_IN2 = D6; // GPIO12

// Right-side L298N, channel A
const uint8_t RIGHT_EN  = D2; // GPIO4, PWM
const uint8_t RIGHT_IN1 = D7; // GPIO13
const uint8_t RIGHT_IN2 = D0; // GPIO16

int motorSpeed = 800; // ESP8266 analogWrite range set below: 0..1023
const int PWM_MAX = 1023;

const char PAGE[] PROGMEM = R"HTML(
<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">
<meta charset="utf-8"><title>Weryt Wi-Fi Car</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eef3f9;color:#14243b;font-family:system-ui,Arial,sans-serif}
main{max-width:480px;margin:0 auto;padding:22px}.panel{background:#fff;border:1px solid #dce5ef;border-radius:22px;padding:22px;box-shadow:0 10px 30px #15395d10}
.brand{font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#1769ff;font-weight:900}
h1{margin:8px 0 4px;font-size:29px}p{color:#607086;font-size:14px;line-height:1.5}.speed{margin:22px 0}.speed label{display:flex;justify-content:space-between;font-weight:750;font-size:14px}.speed input{width:100%;margin-top:14px;accent-color:#1769ff}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:20px}.btn{border:0;border-radius:15px;background:#1769ff;color:white;min-height:70px;font-size:22px;font-weight:850;box-shadow:0 5px 0 #0d4ac0;touch-action:manipulation}.btn:active{transform:translateY(3px);box-shadow:0 2px 0 #0d4ac0}.stop{background:#d92d45;box-shadow:0 5px 0 #a61e31}.empty{visibility:hidden}.status{background:#e8f8f4;border-radius:12px;padding:12px;margin-top:18px;color:#176453;font-size:13px;text-align:center}
</style></head><body><main><section class="panel">
<div class="brand">Weryt Solutions</div><h1>Wi-Fi Car Control</h1><p>Connect to the car's Wi-Fi network, then hold a direction button to move. Release to stop.</p>
<div class="speed"><label for="speed">Motor speed <span id="speedValue">78%</span></label><input id="speed" type="range" min="0" max="100" value="78"></div>
<div class="pad">
<button class="btn empty" tabindex="-1"> </button><button class="btn" data-move="forward">▲</button><button class="btn empty" tabindex="-1"> </button>
<button class="btn" data-move="left">◀</button><button class="btn stop" data-move="stop">■</button><button class="btn" data-move="right">▶</button>
<button class="btn empty" tabindex="-1"> </button><button class="btn" data-move="backward">▼</button><button class="btn empty" tabindex="-1"> </button>
</div><div class="status" id="status">Ready · Weryt-Car</div>
</section></main>
<script>
const statusEl=document.getElementById('status'), speed=document.getElementById('speed'), speedValue=document.getElementById('speedValue');
function send(path){fetch(path,{cache:'no-store'}).then(r=>r.text()).then(t=>statusEl.textContent=t).catch(()=>statusEl.textContent='Connection lost. Reconnect to Weryt-Car.');}
function stop(){send('/move?dir=stop');}
document.querySelectorAll('[data-move]').forEach(b=>{
 const dir=b.dataset.move;
 const start=e=>{e.preventDefault();send('/move?dir='+dir);};
 b.addEventListener('pointerdown',start);
 b.addEventListener('pointerup',e=>{if(dir!=='stop')stop();});
 b.addEventListener('pointerleave',e=>{if(dir!=='stop')stop();});
 b.addEventListener('pointercancel',stop);
 b.addEventListener('contextmenu',e=>e.preventDefault());
});
speed.addEventListener('input',()=>{speedValue.textContent=speed.value+'%';send('/speed?value='+speed.value);});
window.addEventListener('blur',stop);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
</script></body></html>
)HTML";

void stopMotors() {
  digitalWrite(LEFT_IN1, LOW); digitalWrite(LEFT_IN2, LOW);
  digitalWrite(RIGHT_IN1, LOW); digitalWrite(RIGHT_IN2, LOW);
  analogWrite(LEFT_EN, 0); analogWrite(RIGHT_EN, 0);
}

void setSide(uint8_t en, uint8_t in1, uint8_t in2, int direction, int speedValue) {
  if (direction > 0) { digitalWrite(in1, HIGH); digitalWrite(in2, LOW); }
  else if (direction < 0) { digitalWrite(in1, LOW); digitalWrite(in2, HIGH); }
  else { digitalWrite(in1, LOW); digitalWrite(in2, LOW); }
  analogWrite(en, direction == 0 ? 0 : constrain(speedValue, 0, PWM_MAX));
}

void moveCar(String dir) {
  int leftDir = 0, rightDir = 0;
  if (dir == "forward")      { leftDir = 1;  rightDir = 1; }
  else if (dir == "backward"){ leftDir = -1; rightDir = -1; }
  else if (dir == "left")    { leftDir = -1; rightDir = 1; }
  else if (dir == "right")   { leftDir = 1;  rightDir = -1; }
  else                       { leftDir = 0;  rightDir = 0; dir = "stop"; }

  setSide(LEFT_EN, LEFT_IN1, LEFT_IN2, leftDir, motorSpeed);
  setSide(RIGHT_EN, RIGHT_IN1, RIGHT_IN2, rightDir, motorSpeed);
  server.send(200, "text/plain", "Command: " + dir);
}

void handleRoot() {
  server.send_P(200, "text/html", PAGE);
}

void handleMove() {
  String dir = server.arg("dir");
  moveCar(dir);
}

void handleSpeed() {
  if (server.hasArg("value")) {
    int percent = constrain(server.arg("value").toInt(), 0, 100);
    motorSpeed = map(percent, 0, 100, 0, PWM_MAX);
  }
  server.send(200, "text/plain", "Speed set to " + String(map(motorSpeed, 0, PWM_MAX, 0, 100)) + "%");
}

void setup() {
  pinMode(LEFT_EN, OUTPUT); pinMode(LEFT_IN1, OUTPUT); pinMode(LEFT_IN2, OUTPUT);
  pinMode(RIGHT_EN, OUTPUT); pinMode(RIGHT_IN1, OUTPUT); pinMode(RIGHT_IN2, OUTPUT);
  analogWriteRange(PWM_MAX);
  analogWriteFreq(1000);
  stopMotors();

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  delay(200);

  server.on("/", HTTP_GET, handleRoot);
  server.on("/move", HTTP_GET, handleMove);
  server.on("/speed", HTTP_GET, handleSpeed);
  server.onNotFound([](){ server.send(404, "text/plain", "Not found"); });
  server.begin();
}

void loop() {
  server.handleClient();
}
