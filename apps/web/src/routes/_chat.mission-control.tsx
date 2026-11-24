import { createFileRoute } from "@tanstack/react-router";

import { MissionControlPage } from "../components/mission/MissionControlPage";

export const Route = createFileRoute("/_chat/mission-control")({
  component: MissionControlPage,
});
