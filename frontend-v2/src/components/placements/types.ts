export type PlacementStatus = "draft" | "published" | "archived";
export type DocumentCategory =
  "job-description" | "company-profile" | "learning-resource";
export interface PlacementDocument {
  id: string;
  name: string;
  size: number;
  category: DocumentCategory;
}
export interface ResourceLink {
  title: string;
  url: string;
}
export interface Placement {
  id: string;
  companyName: string;
  companyProfile: string;
  logoImage?: string | null;
  package: string;
  jobTitle: string;
  visitDate: string | null;
  status: PlacementStatus;
  documents: PlacementDocument[];
  learningResources: ResourceLink[];
  createdAt: string;
  updatedAt: string;
}
export type PlacementInput = Pick<
  Placement,
  | "companyName"
  | "companyProfile"
  | "logoImage"
  | "package"
  | "jobTitle"
  | "visitDate"
  | "status"
  | "learningResources"
>;
