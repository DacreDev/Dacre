import type { PullRequestChangeBreakdown } from "@dacre/contracts";
import { summarizeChangedFiles } from "@dacre/shared/changedFileKind";
import type { ProviderFileStats } from "@dacre/source-control-core/server/PullRequestProvider";

export function toChangeBreakdown(stats: ProviderFileStats): PullRequestChangeBreakdown {
  if (stats.truncated) return null;
  return summarizeChangedFiles(stats.files);
}
