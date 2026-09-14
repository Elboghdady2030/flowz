const motionLayer = document.querySelector(".motion-layer");
const reducedBackgroundMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const mobileBackgroundLayout = window.matchMedia("(max-width: 760px)");
const tabletBackgroundLayout = window.matchMedia("(max-width: 1100px)");

const backgroundGroups = {
  heritage: [...document.querySelectorAll(".theme-art")],
  partner: [...document.querySelectorAll(".partner-logo")],
  featured: [...document.querySelectorAll(".featured-pattern")],
};
const groupCursors = { heritage: 0, partner: 0, featured: 0 };
const typeSequence = ["heritage", "partner", "featured", "partner", "heritage", "partner", "featured"];
const laneTimers = new Map();
let typeCursor = 0;
let resizeTimer;

function backgroundLaneCount() {
  if (mobileBackgroundLayout.matches) return 2;
  if (tabletBackgroundLayout.matches) return 3;
  return 4;
}

function clearBackgroundClasses(item) {
  item.onanimationend = null;
  item.classList.remove(
    "background-item--active",
    "background-lane--1",
    "background-lane--2",
    "background-lane--3",
    "background-lane--4",
    "background-scale--small",
    "background-scale--medium",
    "background-scale--large",
    "background-speed--quick",
    "background-speed--steady",
    "background-speed--slow",
    "background-turn--left",
    "background-turn--right",
  );
}

function nextBackgroundItem() {
  for (let attempt = 0; attempt < typeSequence.length; attempt += 1) {
    const type = typeSequence[typeCursor % typeSequence.length];
    typeCursor += 1;
    const group = backgroundGroups[type];

    for (let index = 0; index < group.length; index += 1) {
      const cursor = groupCursors[type] % group.length;
      groupCursors[type] += 1;
      const item = group[cursor];
      if (!item.classList.contains("background-item--active")) return item;
    }
  }
  return null;
}

function scheduleLane(laneIndex, delay) {
  window.clearTimeout(laneTimers.get(laneIndex));
  laneTimers.set(laneIndex, window.setTimeout(() => spawnInLane(laneIndex), delay));
}

function spawnInLane(laneIndex) {
  if (document.hidden || reducedBackgroundMotion.matches) {
    scheduleLane(laneIndex, 1200);
    return;
  }

  const item = nextBackgroundItem();
  if (!item) {
    scheduleLane(laneIndex, 900);
    return;
  }

  const variation = (typeCursor + laneIndex) % 3;
  const scaleClass = ["background-scale--small", "background-scale--medium", "background-scale--large"][variation];
  const speedClass = ["background-speed--quick", "background-speed--steady", "background-speed--slow"][(variation + laneIndex) % 3];
  const turnClass = (typeCursor + laneIndex) % 2 ? "background-turn--left" : "background-turn--right";

  clearBackgroundClasses(item);
  item.classList.add(
    "background-item--active",
    `background-lane--${laneIndex + 1}`,
    scaleClass,
    speedClass,
    turnClass,
  );

  item.onanimationend = () => {
    clearBackgroundClasses(item);
    scheduleLane(laneIndex, 700 + ((typeCursor + laneIndex) % 4) * 280);
  };
}

function restartBackgroundFlow() {
  for (const timer of laneTimers.values()) window.clearTimeout(timer);
  laneTimers.clear();
  document.querySelectorAll(".background-item--active").forEach(clearBackgroundClasses);
  typeCursor = 0;

  const lanes = backgroundLaneCount();
  for (let laneIndex = 0; laneIndex < lanes; laneIndex += 1) {
    scheduleLane(laneIndex, laneIndex * 1500);
  }
}

reducedBackgroundMotion.addEventListener("change", restartBackgroundFlow);
mobileBackgroundLayout.addEventListener("change", restartBackgroundFlow);
tabletBackgroundLayout.addEventListener("change", restartBackgroundFlow);
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(restartBackgroundFlow, 180);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && motionLayer && !motionLayer.querySelector(".background-item--active")) {
    restartBackgroundFlow();
  }
});

if (motionLayer) restartBackgroundFlow();
