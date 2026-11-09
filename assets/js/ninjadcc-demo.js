(() => {
  const devices = [
    { gate: true, run: false, gateState: "closed", pending: false, rev: 0 },
    { gate: true, run: false, gateState: "closed", pending: false, rev: 0 },
    { gate: true, run: false, gateState: "closed", pending: false, rev: 0 },
    { gate: false, run: false, gateState: "closed", pending: false, rev: 0 }
  ];
  const byId = (id) => document.getElementById(id);
  const stateButton = byId("sceneState");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let collector = false;
  let autoplay = !prefersReducedMotion;
  let loopToken = 0;

  const wait = (milliseconds, token) => new Promise((resolve) => {
    window.setTimeout(() => resolve(autoplay && token === loopToken), milliseconds);
  });

  function setLight(id, mode) {
    const light = byId(id);
    if (!light) return;
    light.classList.toggle("on", mode === "on");
    light.classList.toggle("flash", mode === "flash");
  }

  function renderHardware() {
    devices.forEach((device, index) => {
      const gateMoving = device.gate && (device.gateState === "opening" || device.gateState === "closing");
      const gateOpen = device.gate && device.gateState === "open";
      const rfMode = device.pending ? "flash" : device.run ? "on" : "off";
      setLight(`hwT${index}P`, "on");
      setLight(`hwT${index}R`, rfMode);
      setLight(`hwT${index}S`, device.pending ? "flash" : device.run ? "on" : "off");
      setLight(`hwG${index}L`, gateMoving ? "flash" : gateOpen ? "on" : "off");
      const ring = byId(`hwG${index}Ring`);
      const motion = byId(`hwG${index}Motion`);
      if (ring) {
        ring.classList.toggle("on", gateOpen);
        ring.classList.toggle("busy", gateMoving);
      }
      if (motion) {
        motion.classList.toggle("visible", device.gate);
        const rotor = motion.querySelector(".dcc-rotor");
        rotor.classList.toggle("open", device.gateState === "open" || device.gateState === "opening");
        rotor.classList.toggle("moving", gateMoving);
      }
    });
    const switching = devices.some((device) => device.pending);
    setLight("hwCP", "on");
    setLight("hwCR", switching ? "flash" : collector ? "on" : "off");
    setLight("hwCS", collector ? "on" : "off");
    byId("hwCG").classList.toggle("on", collector);
  }

  function renderState() {
    stateButton.classList.remove("running", "switching", "paused");
    if (!autoplay) {
      stateButton.textContent = "DEMO PAUSED";
      stateButton.classList.add("paused");
    } else if (collector) {
      stateButton.textContent = "COLLECTOR RUNNING";
      stateButton.classList.add("running");
    } else if (devices.some((device) => device.pending)) {
      stateButton.textContent = "SYSTEM SWITCHING";
      stateButton.classList.add("switching");
    } else {
      stateButton.textContent = "SYSTEM IDLE";
    }
  }

  function render() {
    const carrying = devices.map((device) => collector && device.run && (!device.gate || device.gateState === "open"));
    devices.forEach((device, index) => {
      const zone = byId(`zone${index}`);
      zone.classList.toggle("pending", device.pending);
      zone.classList.toggle("run", device.run && !device.pending);
      byId(`flow${index}`).classList.toggle("active", carrying[index]);
    });
    for (let index = 0; index < 4; index += 1) {
      byId(`trunk${index}`).classList.toggle("active", carrying.slice(0, index + 1).some(Boolean));
    }
    document.querySelectorAll(".dcc-direction-arrow").forEach((arrow) => {
      const duct = byId(arrow.dataset.duct);
      arrow.classList.toggle("airflow-on", Boolean(duct && duct.classList.contains("active")));
    });
    renderHardware();
    renderState();
  }

  async function startDevice(index, token) {
    const device = devices[index];
    const revision = ++device.rev;
    device.pending = device.gate && device.gateState !== "open";
    render();
    if (device.pending) {
      device.gateState = "opening";
      render();
      if (!await wait(900, token) || revision !== device.rev || !device.run) return false;
      device.gateState = "open";
    }
    device.pending = false;
    collector = true;
    render();
    return true;
  }

  async function stopDevice(index, token) {
    const device = devices[index];
    const revision = ++device.rev;
    device.pending = true;
    render();
    if (!devices.some((item) => item.run)) {
      collector = false;
      render();
      if (!await wait(400, token) || revision !== device.rev) return false;
    }
    if (device.gate && device.gateState !== "closed") {
      device.gateState = "closing";
      render();
      if (!await wait(800, token) || revision !== device.rev) return false;
      device.gateState = "closed";
    }
    device.pending = false;
    render();
    return true;
  }

  async function setMachine(index, running, token) {
    devices[index].run = running;
    render();
    return running ? startDevice(index, token) : stopDevice(index, token);
  }

  function resetDemo() {
    devices.forEach((device) => {
      device.rev += 1;
      device.run = false;
      device.pending = false;
      device.gateState = "closed";
    });
    collector = false;
    render();
  }

  async function runAutoplay() {
    const token = ++loopToken;
    const sequence = [0, 1, 2, 3];
    while (autoplay && token === loopToken) {
      resetDemo();
      if (!await wait(400, token)) break;
      for (const index of sequence) {
        if (!await setMachine(index, true, token)) return;
        if (!await wait(1350, token)) return;
      }
      if (!await wait(1600, token)) return;
      for (const index of sequence) {
        if (!await setMachine(index, false, token)) return;
        if (!await wait(1250, token)) return;
      }
      if (!await wait(1200, token)) return;
    }
  }

  function createDuctDirectionArrows() {
    const holder = byId("directionArrows");
    const namespace = "http://www.w3.org/2000/svg";
    const arrowPositions = { flow0: [.40], flow1: [.30], flow2: [.33], flow3: [.36], trunk0: [.66], trunk1: [.50], trunk2: [.48], trunk3: [.56] };
    Object.entries(arrowPositions).forEach(([id, fractions]) => {
      const duct = byId(id);
      const length = duct.getTotalLength();
      fractions.forEach((fraction) => {
        const distance = fraction * length;
        const position = duct.getPointAtLength(distance);
        const before = duct.getPointAtLength(Math.max(0, distance - 3));
        const after = duct.getPointAtLength(Math.min(length, distance + 3));
        const angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
        const arrow = document.createElementNS(namespace, "use");
        arrow.setAttribute("href", "#ductArrowSymbol");
        arrow.setAttribute("transform", `translate(${position.x.toFixed(2)} ${position.y.toFixed(2)}) rotate(${angle.toFixed(2)}) scale(.90)`);
        arrow.classList.add("dcc-direction-arrow");
        arrow.dataset.duct = id;
        holder.append(arrow);
      });
    });
  }

  stateButton.addEventListener("click", () => {
    autoplay = !autoplay;
    stateButton.setAttribute("aria-pressed", String(!autoplay));
    stateButton.setAttribute("aria-label", autoplay ? "Pause automatic demo" : "Resume automatic demo");
    loopToken += 1;
    if (autoplay) runAutoplay();
    else render();
  });

  createDuctDirectionArrows();
  stateButton.setAttribute("aria-pressed", String(!autoplay));
  stateButton.setAttribute("aria-label", autoplay ? "Pause automatic demo" : "Resume automatic demo");
  render();
  if (autoplay) runAutoplay();
})();
