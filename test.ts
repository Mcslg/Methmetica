import { generateDiffSteps } from "./src/utils/CalculusSolver.js";
try {
  const steps = generateDiffSteps("x^2", "x");
  console.log("SUCCESS:", steps?.length || "null steps");
} catch(e) {
  console.log("ERROR:", e);
}
