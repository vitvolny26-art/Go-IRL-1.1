import { BeautyHomeEntryPortal } from "../beauty/BeautyHomeEntryPortal";
import { BeautyProfessionalProfilePortal } from "../beauty/BeautyProfessionalProfilePortal";
import { BeautyShareCardStaffStatusPortal } from "../beauty/BeautyShareCardStaffStatusPortal";
import { ServicesBottomNavigationPortal } from "../beauty/ServicesBottomNavigationPortal";
import { ServicesBookingsPortal } from "./ServicesBookingsPortal";

export function ServicesExperiencePortals() {
  return (
    <>
      <BeautyHomeEntryPortal />
      <ServicesBottomNavigationPortal />
      <ServicesBookingsPortal />
      <BeautyProfessionalProfilePortal />
      <BeautyShareCardStaffStatusPortal />
    </>
  );
}
