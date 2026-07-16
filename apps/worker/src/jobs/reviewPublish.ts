import { prisma } from "@probook/db";
import { REVIEW_PUBLISH_AFTER } from "@probook/domain";

export interface ReviewPublishResult {
  published: number;
}

/**
 * REV-03: reviews publish when both parties submit OR after 7 days. The "both
 * submit" case is handled synchronously on review creation; this sweep publishes
 * the stragglers — unpublished reviews created more than 7 days ago (the other
 * party never reviewed).
 */
export async function reviewPublishSweep(now: number): Promise<ReviewPublishResult> {
  const cutoff = new Date(now - REVIEW_PUBLISH_AFTER);
  const res = await prisma.review.updateMany({
    where: { publishedAt: null, createdAt: { lte: cutoff } },
    data: { publishedAt: new Date(now) },
  });
  return { published: res.count };
}
