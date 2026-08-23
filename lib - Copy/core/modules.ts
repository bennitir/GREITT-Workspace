export const GLOGGT_MODULES = {
  bokhald: {
    id: "bokhald",
    name: "Bókhald",
    description: "Fylgiskjöl, bókanir, VSK og bókhaldsinnsýn.",
    available: true,
  },

  sala: {
    id: "sala",
    name: "Sala",
    description: "Sölureikningar og viðskiptakröfur.",
    available: false,
  },

  laun: {
    id: "laun",
    name: "Laun",
    description: "Launavinnsla og launatengd skil.",
    available: false,
  },

  birgdir: {
    id: "birgdir",
    name: "Birgðir",
    description: "Birgðahald og vörustýring.",
    available: false,
  },

  vinnustundir: {
    id: "vinnustundir",
    name: "Vinnustundir",
    description: "Tímaskráning og vinnustundastýring.",
    available: false,
  },
} as const;

export type GloggtModuleId = keyof typeof GLOGGT_MODULES;

export const GLOGGT_MODULE_LIST = Object.values(GLOGGT_MODULES);