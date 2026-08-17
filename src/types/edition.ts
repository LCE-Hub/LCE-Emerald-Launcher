export const HIDDEN_INSTANCE_URL = "emerald://PLEASE_IM_TIRED_OF_ALL_THIS";
export interface Edition {
  id: string;
  name: string;
  desc: string;
  url: string;
  titleImage?: string;
  supportsSlimSkins?: boolean;
  logo?: string;
  panorama?: string;
  branches?: string[];
  selectedBranch?: string;
  instanceId: string;
  comingSoon?: boolean;
  category?: string[];
  officialDLC?: string;
  lceOnline?: boolean;
  hideOnAndroid?: boolean;
}

export interface CustomEditionInput {
  name: string;
  desc: string;
  url: string;
  path?: string;
  category?: string[];
  logo?: string;
  id?: string;
}

export interface EditionUpdate {
  name: string;
  desc: string;
  url: string;
  path?: string;
}
