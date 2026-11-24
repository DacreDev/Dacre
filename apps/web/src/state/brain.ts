import { createBrainEnvironmentAtoms } from "@dacre/client-runtime/state/brain";

import { connectionAtomRuntime } from "../connection/runtime";

export const brainEnvironment = createBrainEnvironmentAtoms(connectionAtomRuntime);
