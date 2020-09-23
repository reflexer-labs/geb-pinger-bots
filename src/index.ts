import dotenv from "dotenv";
import path from "path";
import { updateChainlinkETHMedianizer } from "./handlers/medianizer";

const dotenvPath = path.join(
  __dirname,
  "../",
  `config/.env.${process.env.NODE_ENV}`
);
dotenv.config({
  path: dotenvPath,
});

export { updateChainlinkETHMedianizer };
