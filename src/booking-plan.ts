import {
  listExactFitTargets,
  type ArrivalShortlist,
  type BookingTarget,
} from './arrival-shortlists';

export type GuidedBookingPlan = {
  shortlistPath: string;
  sourceSnapshotPath?: string;
  targetDate: string;
  stayLength: string;
  loop: string;
  exactTargets: BookingTarget[];
  siteIds: string[];
};

export function buildGuidedBookingPlan(shortlistPath: string, shortlist: ArrivalShortlist): GuidedBookingPlan {
  const exactTargets = listExactFitTargets(shortlist);

  return {
    shortlistPath,
    ...(shortlist.sourceSnapshotPath ? { sourceSnapshotPath: shortlist.sourceSnapshotPath } : {}),
    targetDate: shortlist.targetDate,
    stayLength: shortlist.stayLength,
    loop: shortlist.loop,
    exactTargets,
    siteIds: exactTargets.map((target) => target.site),
  };
}
