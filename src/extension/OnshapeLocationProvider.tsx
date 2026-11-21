import type { ReactNode } from "react";
import type { OnshapeLocation } from "./onshapeTab";
import { LocationContext } from "./onshapeHostShim";

/** Gives the BOM page the Onshape location it shows (read by useOnshapeContext). */
export default function OnshapeLocationProvider({
  location,
  children,
}: {
  location: OnshapeLocation | null;
  children: ReactNode;
}) {
  return <LocationContext.Provider value={location}>{children}</LocationContext.Provider>;
}
