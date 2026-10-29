# Weryt Programming Portal v0.2

This is a static website prototype for local testing, Vercel preview, and later hosting on your own domain.

## Files
- `index.html` — Weryt Programming Portal website.
- `arduino/ESP8266_WiFi_Car.ino` — starter firmware for a NodeMCU ESP8266 car with two L298N modules.
- `firmware/*.json` — example ESP Web Tools manifests. These are placeholders and do not install until real firmware binaries are configured.

## 1) Preview website locally
For a quick visual preview, double-click `index.html`.
For testing browser USB APIs, serve it on localhost (for example with VS Code Live Server or `python -m http.server 8000` from this folder and open `http://localhost:8000`). The ESP Web Tools installer still won't work until manifests and firmware binaries are configured.

## 2) Deploy to Vercel
Create a new project in Vercel and deploy this folder as a static site, or connect a Git repository containing these files. No build command is needed for the static prototype. The site will get an HTTPS URL automatically.
Before giving customers the link, replace all placeholder firmware URLs and test the exact boards.

## 3) Configure firmware installer
1. Compile and test firmware for the exact ESP8266/ESP32 board.
2. Put the required binary files at HTTPS URLs.
3. Edit the corresponding JSON manifest so `path` points to the correct binary and the flash offset matches the build output.
4. For ESP32, use a correctly merged image if the chosen build workflow requires multiple flash parts; don't assume a plain application `.bin` at offset 0 is sufficient.
5. Test on each hardware revision and USB-to-serial chip before release.

## 4) ESP8266 Wi-Fi car starter firmware
Open `arduino/ESP8266_WiFi_Car.ino` in Arduino IDE or your preferred ESP8266 build tool once, select the matching NodeMCU board and upload it to the car. After that, the customer controls the car from a webpage hosted on the ESP8266 itself:
1. Power the car.
2. On the laptop, connect to Wi-Fi `Weryt-Car` (password: `weryt123`).
3. Open `http://192.168.4.1`.
4. Use the direction buttons and speed slider.

This code assumes two L298N modules, one module for the left side and one for the right side. For each module, connect both motors for that side in parallel to OUT1/OUT2 and use channel A only. Remove the ENA jumper to allow PWM speed control. If your wiring differs, change the pin map and motor logic accordingly.

### Pin map
- Left L298N: ENA=D1/GPIO5, IN1=D5/GPIO14, IN2=D6/GPIO12.
- Right L298N: ENA=D2/GPIO4, IN1=D7/GPIO13, IN2=D0/GPIO16.

### Safety notes
- This is starter code and must be bench-tested with wheels raised before floor testing.
- Do not power motors from the ESP8266 3.3V output.
- Share a common ground between the ESP8266 and driver logic.
- Verify battery voltage, regulator, motor stall current, driver thermal limits, wire gauge and fuse. L298N modules can lose substantial voltage and overheat with high-current motors.
- Change the example Wi-Fi password before distributing units.
- Browser control is intended for the same local Wi-Fi network. This code creates its own Wi-Fi AP and does not require internet.
- A customer who only needs to drive the car does not need this programming portal; the control page is hosted by the ESP8266 after firmware is uploaded once.

## Key distinction
The portal is for uploading firmware. The `.ino` file is the code for the car's control page. The car-control page is served by the ESP8266 after the firmware is installed.
