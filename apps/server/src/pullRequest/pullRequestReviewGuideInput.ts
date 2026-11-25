import type { PullRequestActivity, PullRequestDetail } from "@dacre/contracts";
import type { ReviewGuideGenerationInput } from "@dacre/provider-core/server/textGeneration";

const SETTLED_REMARK_CHARS = 200;

function oneLine(text: string): string {
  let uncommented = text;
  let previous;
  // Repeats until stable so removing one comment cannot splice a new `<!--` together.
  do {
    previous = uncommented;
    uncommented = uncommented.replace(/<!--[\s\S]*?-->/g, "");
  } while (uncommented !== previous);
  const flat = uncommented.replace(/\s+/g, " ").trim();
  return flat.length > SETTLED_REMARK_CHARS ? `${flat.slice(0, SETTLED_REMARK_CHARS)}…` : flat;
}

function settledReviewSummary(activity: PullRequestActivity): string {
  return activity.reviewThreads
    .filter((thread) => thread.isResolved || thread.isOutdated)
    .flatMap((thread) => {
      const opener = thread.comments[0];
      if (opener === undefined) return [];
      const who = opener.author?.login ?? "ghost";
      const state = thread.isResolved ? "resolved" : "outdated";
      return [`- ${thread.path} (${state}, ${who}): ${oneLine(opener.body)}`];
    })
    .join("\n");
}

export function reviewGuideInputFromPullRequest(
  detail: PullRequestDetail,
  activity: PullRequestActivity,
  baseCommit: string,
): Omit<ReviewGuideGenerationInput, "cwd" | "projectCwd" | "modelSelection"> {
  return {
    number: detail.number,
    title: detail.title,
    description: detail.body,
    baseBranch: detail.baseBranch,
    baseCommit,
    settledReview: settledReviewSummary(activity),
  };
}
