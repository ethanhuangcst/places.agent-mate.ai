import { runProbe } from "./probe-plan-trip";

void runProbe("hongkong").catch((err) => {
  console.error(err);
  process.exit(1);
});
