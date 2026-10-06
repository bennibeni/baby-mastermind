// L'esperimento gira qui, fuori dal thread della pagina: l'interfaccia resta reattiva anche con 10.000 posizioni.
import { run } from "./experiment.js";

self.onmessage = ({ data }) => {
  try {
    const result = run(data, (message) =>
      self.postMessage({ type: "progress", message }),
    );
    self.postMessage({ type: "done", result });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
};
