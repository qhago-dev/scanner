// Worker de prueba: host de @qhago/scanner + un plugin "fake" que propone el frame entero.
import { startWorkerHost } from "../../src/worker/host";

startWorkerHost({
  plugins: {
    fake: () => ({
      name: "fake",
      when: "always",
      async onFrame(r) {
        return [
          {
            quad: [
              { x: 0, y: 0 },
              { x: r.width, y: 0 },
              { x: r.width, y: r.height },
              { x: 0, y: r.height },
            ],
            formats: ["ean_13"],
            score: 0.9,
          },
        ];
      },
    }),
  },
});
