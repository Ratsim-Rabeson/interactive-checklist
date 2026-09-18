/*
 * Default checklist data.
 * Loaded as a global so the app works when opened directly via file:// on an iPad
 * (avoids fetch/CORS restrictions).
 *
 * Item types:
 *   item     -> challenge / response, checkable (the classic "TASK ...... STATE")
 *   note     -> informational line, not checkable
 *   caution  -> amber advisory, not checkable
 *   warning  -> red advisory, not checkable
 *
 * NOTE: The sample content below is a GENERIC, EDUCATIONAL example. It is NOT a
 * substitute for the approved checklist / POH for any real aircraft.
 */
window.DEFAULT_SETS = [
  {
    id: "c172s",
    name: "Cessna 172S",
    tail: "SAMPLE",
    groups: [
      {
        id: "normal",
        name: "Normal Procedures",
        type: "normal",
        checklists: [
          {
            id: "preflight-cabin",
            name: "Preflight — Cabin",
            items: [
              { type: "note", text: "Sample data for demonstration only." },
              { type: "item", challenge: "Pilot's Operating Handbook", response: "ABOARD" },
              { type: "item", challenge: "Control Wheel Lock", response: "REMOVE" },
              { type: "item", challenge: "Ignition Switch", response: "OFF" },
              { type: "item", challenge: "Avionics Master", response: "OFF" },
              { type: "item", challenge: "Master Switch", response: "ON" },
              { type: "caution", text: "Do not leave Master ON for extended checks." },
              { type: "item", challenge: "Fuel Quantity Indicators", response: "CHECK" },
              { type: "item", challenge: "Flaps", response: "EXTEND (fully)" },
              { type: "item", challenge: "Master Switch", response: "OFF" },
              { type: "item", challenge: "Fuel Selector", response: "BOTH" }
            ]
          },
          {
            id: "before-start",
            name: "Before Starting Engine",
            items: [
              { type: "item", challenge: "Preflight Inspection", response: "COMPLETE" },
              { type: "item", challenge: "Seats / Belts / Harnesses", response: "ADJUST & LOCK" },
              { type: "item", challenge: "Fuel Selector", response: "BOTH" },
              { type: "item", challenge: "Avionics Master", response: "OFF" },
              { type: "item", challenge: "Brakes", response: "TEST & SET" },
              { type: "item", challenge: "Circuit Breakers", response: "CHECK IN" }
            ]
          },
          {
            id: "starting",
            name: "Starting Engine",
            items: [
              { type: "item", challenge: "Mixture", response: "RICH" },
              { type: "item", challenge: "Throttle", response: "OPEN 1/4 INCH" },
              { type: "item", challenge: "Propeller Area", response: "CLEAR" },
              { type: "item", challenge: "Master Switch", response: "ON" },
              { type: "item", challenge: "Beacon", response: "ON" },
              { type: "item", challenge: "Ignition Switch", response: "START" },
              { type: "warning", text: "Release key immediately when engine fires." },
              { type: "item", challenge: "Oil Pressure", response: "CHECK (30 sec)" }
            ]
          },
          {
            id: "before-takeoff",
            name: "Before Takeoff",
            items: [
              { type: "item", challenge: "Parking Brake", response: "SET" },
              { type: "item", challenge: "Flight Controls", response: "FREE & CORRECT" },
              { type: "item", challenge: "Flight Instruments", response: "CHECK & SET" },
              { type: "item", challenge: "Fuel Selector", response: "BOTH" },
              { type: "item", challenge: "Mixture", response: "RICH" },
              { type: "item", challenge: "Throttle", response: "1800 RPM" },
              { type: "note", text: "Magneto drop max 150 RPM, differential max 50 RPM." },
              { type: "item", challenge: "Magnetos", response: "CHECK" },
              { type: "item", challenge: "Engine Instruments", response: "GREEN" },
              { type: "item", challenge: "Throttle", response: "IDLE then 1000 RPM" },
              { type: "item", challenge: "Flaps", response: "SET FOR TAKEOFF" },
              { type: "item", challenge: "Trim", response: "SET FOR TAKEOFF" },
              { type: "item", challenge: "Doors & Windows", response: "CLOSED & LOCKED" },
              { type: "item", challenge: "Flight Controls", response: "FREE & CORRECT" }
            ]
          },
          {
            id: "cruise",
            name: "Cruise",
            items: [
              { type: "item", challenge: "Power", response: "SET (2100–2700 RPM)" },
              { type: "item", challenge: "Elevator Trim", response: "ADJUST" },
              { type: "item", challenge: "Mixture", response: "LEAN" },
              { type: "item", challenge: "Engine Instruments", response: "MONITOR" }
            ]
          },
          {
            id: "before-landing",
            name: "Before Landing",
            items: [
              { type: "item", challenge: "Seats / Belts", response: "SECURE" },
              { type: "item", challenge: "Fuel Selector", response: "BOTH" },
              { type: "item", challenge: "Mixture", response: "RICH" },
              { type: "item", challenge: "Landing Light", response: "ON" },
              { type: "item", challenge: "Autopilot", response: "OFF" }
            ]
          },
          {
            id: "shutdown",
            name: "Securing Aircraft",
            items: [
              { type: "item", challenge: "Parking Brake", response: "SET" },
              { type: "item", challenge: "Throttle", response: "IDLE" },
              { type: "item", challenge: "Avionics Master", response: "OFF" },
              { type: "item", challenge: "Mixture", response: "IDLE CUT-OFF" },
              { type: "item", challenge: "Ignition Switch", response: "OFF" },
              { type: "item", challenge: "Master Switch", response: "OFF" },
              { type: "item", challenge: "Control Lock", response: "INSTALL" }
            ]
          }
        ]
      },
      {
        id: "abnormal",
        name: "Abnormal Procedures",
        type: "abnormal",
        checklists: [
          {
            id: "alternator-fail",
            name: "Alternator Failure",
            items: [
              { type: "caution", text: "Reduce electrical load to essential items." },
              { type: "item", challenge: "Avionics Master", response: "OFF" },
              { type: "item", challenge: "Alternator Circuit Breaker", response: "CHECK IN" },
              { type: "item", challenge: "Master Switch (ALT only)", response: "OFF then ON" },
              { type: "item", challenge: "If No Output", response: "LAND AS SOON AS PRACTICAL" }
            ]
          },
          {
            id: "rough-engine",
            name: "Rough Running Engine",
            items: [
              { type: "item", challenge: "Carburetor Heat", response: "ON" },
              { type: "item", challenge: "Mixture", response: "ADJUST" },
              { type: "item", challenge: "Magnetos", response: "L then R then BOTH" },
              { type: "item", challenge: "Engine Gauges", response: "CHECK" }
            ]
          }
        ]
      },
      {
        id: "emergency",
        name: "Emergency Procedures",
        type: "emergency",
        checklists: [
          {
            id: "engine-fail-takeoff",
            name: "Engine Failure During Takeoff Roll",
            items: [
              { type: "warning", text: "Immediate action — memory items." },
              { type: "item", challenge: "Throttle", response: "IDLE" },
              { type: "item", challenge: "Brakes", response: "APPLY" },
              { type: "item", challenge: "Wing Flaps", response: "RETRACT" },
              { type: "item", challenge: "Mixture", response: "IDLE CUT-OFF" },
              { type: "item", challenge: "Ignition Switch", response: "OFF" },
              { type: "item", challenge: "Master Switch", response: "OFF" }
            ]
          },
          {
            id: "engine-fail-flight",
            name: "Engine Failure In Flight",
            items: [
              { type: "warning", text: "Establish best glide speed first: 68 KIAS." },
              { type: "item", challenge: "Airspeed", response: "68 KIAS (best glide)" },
              { type: "item", challenge: "Fuel Selector", response: "BOTH" },
              { type: "item", challenge: "Mixture", response: "RICH" },
              { type: "item", challenge: "Carburetor Heat", response: "ON" },
              { type: "item", challenge: "Ignition Switch", response: "BOTH (or START)" },
              { type: "item", challenge: "Primer", response: "IN & LOCKED" }
            ]
          },
          {
            id: "forced-landing",
            name: "Emergency Landing Without Power",
            items: [
              { type: "item", challenge: "Airspeed", response: "65 KIAS (flaps up)" },
              { type: "item", challenge: "Mixture", response: "IDLE CUT-OFF" },
              { type: "item", challenge: "Fuel Selector", response: "OFF" },
              { type: "item", challenge: "Ignition Switch", response: "OFF" },
              { type: "item", challenge: "Wing Flaps", response: "AS REQUIRED" },
              { type: "item", challenge: "Master Switch", response: "OFF (when landing assured)" },
              { type: "item", challenge: "Doors", response: "UNLATCH PRIOR TO TOUCHDOWN" },
              { type: "item", challenge: "Touchdown", response: "TAIL-LOW" }
            ]
          },
          {
            id: "engine-fire-start",
            name: "Engine Fire During Start",
            items: [
              { type: "warning", text: "Continue cranking to draw fire into engine." },
              { type: "item", challenge: "Ignition Switch", response: "START (continue)" },
              { type: "item", challenge: "Mixture", response: "IDLE CUT-OFF" },
              { type: "item", challenge: "Throttle", response: "FULL OPEN" },
              { type: "item", challenge: "If Fire Continues", response: "EVACUATE" }
            ]
          }
        ]
      }
    ]
  }
];
