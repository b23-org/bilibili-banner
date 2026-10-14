import type { LogoAnalysis } from "../grab/core/logo-matcher";

export interface CleanLogoOptions {
  action: "scan" | "apply";
  targetYear?: string;
}

export interface CandidateLogoItem {
  year: string;
  fileName: string;
  relativePublicPath: string;
  absolutePath: string;
  representativeBannerId: string | null;
  analysis: LogoAnalysis;
  similarityToStandard: number;
  isCentered: boolean;
  centerTag: string;
  bboxStr: string;
}

export interface ClusterGroup {
  groupId: number;
  members: CandidateLogoItem[];
}

export interface YearScanResult {
  year: string;
  standardSrc: string | null;
  standardFileName: string | null;
  totalLogos: number;
  whiteLogos: number;
  candidates: CandidateLogoItem[];
  clusterGroups?: ClusterGroup[];
}
