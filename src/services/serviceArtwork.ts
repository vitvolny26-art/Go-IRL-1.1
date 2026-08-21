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
const isBarber = (serviceName: string) => /barber|barbershop|men(?:'s)? haircut|fade|beard trim|мужск.*стриж|барбер|бород|чоловіч.*стриж|pánsk.*střih/i.test(serviceName);

export const getServiceArtwork = (serviceName: string) => {
  if (isManicure(serviceName)) return manicureArtwork;
  if (isBarber(serviceName)) return barberArtwork;
  return null;
};
