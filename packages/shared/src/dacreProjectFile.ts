import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { DacreProjectFile } from "@dacre/contracts";

import { fromLenientJson } from "./schemaJson.ts";

export const DacreProjectFileFromJson = fromLenientJson(DacreProjectFile);

const decodeDacreProjectFile = Schema.decodeExit(DacreProjectFileFromJson);

export function parseDacreProjectFile(contents: string): DacreProjectFile | null {
  const decoded = decodeDacreProjectFile(contents);
  return Exit.isSuccess(decoded) ? decoded.value : null;
}
