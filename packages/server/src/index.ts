import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp(config);

app.listen(config.PORT, () => {
  console.log(
    JSON.stringify({
      level: "info",
      message: `Ate What, Exactly listening on ${config.PORT}`,
      baseUrl: config.PUBLIC_BASE_URL,
      visionModel: config.VISION_MODEL,
    }),
  );
});
