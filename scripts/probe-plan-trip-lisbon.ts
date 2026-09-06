import { runProbe } from "./probe-plan-trip";

void runProbe("lisbon").catch((err) => {
  console.error(err);
  process.exit(1);
});
