export const timelineGapRecorderEnabled = (() => {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem("dacre:timeline-gap-recorder") === "1";
  } catch {
    return false;
  }
})();
