export const manicureArtwork = {
  card: "/services/cards-3x4/s-01-manicure.webp",
  sheet: "/services/sheets-9x16/s-01-manicure.webp",
  share: "/services/share-6x5/s-01-manicure.webp",
  icon: "/services/icons/s-01-manicure.webp",
  portfolio: "/services/portfolio-3x4/s-01-manicure.webp",
} as const;

export const barberArtwork = {
  card: "/services/cards-3x4/s-02-barber.webp",
  sheet: "/services/sheets-9x16/s-02-barber.webp",
  share: "/services/share-6x5/s-02-barber.webp",
  icon: "/services/icons/s-02-barber.webp",
  portfolio: "/services/cards-3x4/s-02-barber.webp",
} as const;

const isManicure = (serviceName: string) => /manicure|маникюр|манікюр|manik[uú]ra|strengthen(?:ing)? natural nails|укреплен.*натуральн.*ногт|зміцнен.*натуральн.*нігт|zpevněn.*přírodn.*neht|minimalist(?:ic)? design|минималистич.*дизайн|мінімалістич.*дизайн|minimalistick.*design/i.test(serviceName);
const isBarber = (serviceName: string) => /barber|barbershop|haircut|fade|beard trim|мужск.*стриж|стрижк|барбер|бород|чоловіч.*стриж|střih/i.test(serviceName);

export type ServiceArtworkProfession = "nails" | "barber";
export type ServiceArtwork = { readonly card: string; readonly sheet: string; readonly share: string; readonly icon: string; readonly portfolio: string };
export const serviceArtworkByProfession = { nails: manicureArtwork, barber: barberArtwork } satisfies Record<ServiceArtworkProfession, ServiceArtwork>;
export const resolveServiceArtwork = (profession: string | undefined, serviceName: string) => {
  if (profession === "nails" || profession === "barber") return serviceArtworkByProfession[profession];
  // Compatibility only for directory rows created before public RPC exposes service_specialization.
  return getServiceArtwork(serviceName);
};

export const getServiceArtwork = (serviceName: string) => {
  if (isManicure(serviceName)) return manicureArtwork;
  if (isBarber(serviceName)) return barberArtwork;
  return null;
};
