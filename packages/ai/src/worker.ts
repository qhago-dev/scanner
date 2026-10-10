// Worker de @qhago/ai: el host de @qhago/scanner + el plugin "ai-detector".
import { startWorkerHost } from "@qhago/scanner/worker-host";
import { createAiDetector } from "./detector";
import { AI_DETECTOR } from "./options";

startWorkerHost({ plugins: { [AI_DETECTOR]: createAiDetector } });
